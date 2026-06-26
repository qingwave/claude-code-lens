import { Terminal, type ITheme } from '@xterm/xterm'
import { SerializeAddon } from '@xterm/addon-serialize'
import { WebLinksAddon } from '@xterm/addon-web-links'

const THEME_DARK: ITheme = {
  foreground: '#f8fafc',
  background: 'transparent',
  cursor: '#ffffff',
  cursorAccent: '#000000',
  selectionBackground: 'rgba(248,250,252,0.28)',
  selectionInactiveBackground: 'rgba(248,250,252,0.18)',
  black: '#0f172a', red: '#f87171', green: '#4ade80', yellow: '#facc15',
  blue: '#60a5fa', magenta: '#c084fc', cyan: '#22d3ee', white: '#cbd5e1',
  brightBlack: '#64748b', brightRed: '#fca5a5', brightGreen: '#86efac',
  brightYellow: '#fde047', brightBlue: '#93c5fd', brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9', brightWhite: '#f8fafc',
}

const THEME_LIGHT: ITheme = {
  foreground: '#0f172a',
  background: 'transparent',
  cursor: '#000000',
  cursorAccent: '#ffffff',
  selectionBackground: 'rgba(221,228,236,0.55)',
  selectionInactiveBackground: 'rgba(221,228,236,0.38)',
  black: '#0f172a', red: '#dc2626', green: '#16a34a', yellow: '#ca8a04',
  blue: '#2563eb', magenta: '#9333ea', cyan: '#0891b2', white: '#94a3b8',
  brightBlack: '#475569', brightRed: '#ef4444', brightGreen: '#22c55e',
  brightYellow: '#eab308', brightBlue: '#3b82f6', brightMagenta: '#a855f7',
  brightCyan: '#06b6d4', brightWhite: '#e2e8f0',
}

function isMac() {
  return typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)
}

// Measure actual cell dimensions for precise cols/rows (kanna pattern)
function getMeasuredSize(t: Terminal, el: HTMLElement): { cols: number; rows: number } | null {
  const cell = (t as any)._core?._renderService?.dimensions?.css?.cell
  const cw: number = cell?.width ?? 0
  const ch: number = cell?.height ?? 0
  if (!t.element || cw <= 0 || ch <= 0) return null

  const cr = el.getBoundingClientRect()
  const cs = window.getComputedStyle(el)
  const xs = window.getComputedStyle(t.element)
  const ruler = t.options.scrollback === 0 ? 0 : 14
  const wp = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)
    + parseFloat(xs.paddingLeft) + parseFloat(xs.paddingRight)
  const hp = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
    + parseFloat(xs.paddingTop) + parseFloat(xs.paddingBottom)

  return {
    cols: Math.max(2, Math.floor((cr.width - wp - ruler - 1) / cw)),
    rows: Math.max(1, Math.floor((cr.height - hp) / ch)),
  }
}

// Mac Option/Meta key sequences
function macOptionSeq(e: KeyboardEvent): string | null {
  if (e.ctrlKey) return null
  if (!e.altKey && !e.metaKey) {
    switch (e.key) {
      case 'ArrowUp': return '\x1b[A'
      case 'ArrowDown': return '\x1b[B'
      case 'ArrowLeft': return '\x1b[D'
      case 'ArrowRight': return '\x1b[C'
    }
    return null
  }
  if (e.metaKey && !e.altKey) {
    if (e.key === 'Backspace') return '\x15'
    if (e.key === 'Delete') return '\x0b'
    return null
  }
  if (!isMac() || !e.altKey) return null
  switch (e.key) {
    case 'ArrowLeft': return '\x1bb'
    case 'ArrowRight': return '\x1bf'
    case 'Backspace': return '\x1b\x7f'
    case 'Delete': return '\x1bd'
  }
  return null
}

export function useShellTerminal() {
  const isConnected = ref(false)
  const sessionId = ref<string | null>(null)
  const shellName = ref<string>('')
  const error = ref<string | null>(null)

  let ws: WebSocket | null = null
  let term: Terminal | null = null
  let serialize: SerializeAddon | null = null
  let ro: ResizeObserver | null = null
  let replayState: string | null = null
  let lastSize: { cols: number; rows: number } | null = null

  function sendWs(msg: object) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
  }

  function syncSize(container: HTMLElement, notify = true) {
    if (!term) return
    const next = getMeasuredSize(term, container) ?? { cols: term.cols || 80, rows: term.rows || 24 }
    if (lastSize?.cols === next.cols && lastSize?.rows === next.rows) return
    term.resize(next.cols, next.rows)
    lastSize = next
    if (notify && sessionId.value) {
      sendWs({ type: 'resize', sessionId: sessionId.value, cols: next.cols, rows: next.rows })
    }
  }

  function mount(container: HTMLElement, dark = true) {
    const theme = dark ? THEME_DARK : THEME_LIGHT
    term = new Terminal({
      scrollback: 3000,
      cursorBlink: true,
      cursorStyle: 'bar',
      cursorWidth: 1,
      lineHeight: 1,
      convertEol: false,
      allowTransparency: true,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      fontSize: 13,
      theme,
      macOptionIsMeta: isMac(),
    })

    serialize = new SerializeAddon()
    term.loadAddon(serialize)
    term.loadAddon(new WebLinksAddon())
    term.open(container)

    if (replayState) term.write(replayState)

    syncSize(container, false)
    requestAnimationFrame(() => syncSize(container, false))

    term.onData((data) => {
      if (!sessionId.value) return
      // Ctrl+C: server handles SIGINT, still forward the byte
      sendWs({ type: 'input', sessionId: sessionId.value, data })
    })

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      const seq = macOptionSeq(e)
      if (!seq) return true
      e.preventDefault()
      if (sessionId.value) sendWs({ type: 'input', sessionId: sessionId.value, data: seq })
      return false
    })

    term.onResize(({ cols, rows }) => {
      lastSize = { cols, rows }
      if (sessionId.value) sendWs({ type: 'resize', sessionId: sessionId.value, cols, rows })
    })

    ro = new ResizeObserver(() => syncSize(container))
    ro.observe(container)
  }

  function unmount() {
    ro?.disconnect(); ro = null
    if (term && serialize) replayState = serialize.serialize()
    term?.dispose(); term = null
    serialize = null
    lastSize = null
  }

  function connect(options?: { workingDir?: string }) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    ws = new WebSocket(`${proto}//${location.host}/api/shell/ws`)

    ws.onopen = () => {
      isConnected.value = true
      error.value = null
      sendWs({
        type: 'create',
        workingDir: options?.workingDir,
        cols: term?.cols || 80,
        rows: term?.rows || 24,
      })
    }

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        switch (msg.type) {
          case 'session':
            sessionId.value = msg.sessionId
            shellName.value = msg.shell?.split('/').at(-1) ?? ''
            break
          case 'output':
            term?.write(msg.data)
            break
          case 'exit':
            isConnected.value = false
            sessionId.value = null
            break
          case 'error':
            error.value = msg.error
            break
        }
      } catch { /* ignore */ }
    }

    ws.onerror = () => { error.value = 'WebSocket error'; isConnected.value = false }
    ws.onclose = () => { isConnected.value = false; sessionId.value = null }
  }

  function disconnect() {
    if (sessionId.value) sendWs({ type: 'kill', sessionId: sessionId.value })
    ws?.close(); ws = null
    isConnected.value = false
    sessionId.value = null
  }

  function focus() { term?.focus() }
  function clear() { term?.clear(); replayState = null }

  onUnmounted(() => { disconnect(); unmount() })

  return { isConnected, sessionId, shellName, error, mount, unmount, connect, disconnect, focus, clear, syncSize }
}
