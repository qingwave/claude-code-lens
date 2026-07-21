// Terminal color/format helpers (no external deps)
export const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
}

export const bold = (s: string) => `${c.bold}${s}${c.reset}`
export const dim = (s: string) => `${c.dim}${s}${c.reset}`
export const cyan = (s: string) => `${c.cyan}${s}${c.reset}`
export const green = (s: string) => `${c.green}${s}${c.reset}`
export const yellow = (s: string) => `${c.yellow}${s}${c.reset}`
export const red = (s: string) => `${c.red}${s}${c.reset}`
export const gray = (s: string) => `${c.gray}${s}${c.reset}`
export const magenta = (s: string) => `${c.magenta}${s}${c.reset}`

export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`
  return String(n)
}

export function formatCost(usd: number): string {
  return `$${usd.toFixed(3)}`
}

export async function confirm(message: string): Promise<boolean> {
  if (!process.stdin.isTTY) return true
  process.stdout.write(`  ${message} ${dim('(y/N)')} `)
  return new Promise((resolve) => {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    process.stdin.once('data', (key: string) => {
      process.stdin.setRawMode(false)
      process.stdin.pause()
      process.stdout.write('\n')
      resolve(key.toLowerCase() === 'y')
    })
  })
}
export async function pick<T>(
  items: T[],
  render: (item: T, selected: boolean, idx: number) => string,
  pageSize = 10,
): Promise<T | null> {
  if (items.length === 0) return null
  if (!process.stdin.isTTY) return items[0]

  let idx = 0
  let page = 0
  const totalPages = Math.ceil(items.length / pageSize)
  const { stdin } = process
  stdin.setRawMode(true)
  stdin.resume()
  stdin.setEncoding('utf8')

  const draw = () => {
    process.stdout.write('\x1b[?25l')
    if ((draw as any)._lines) {
      process.stdout.write(`\x1b[${(draw as any)._lines}A\x1b[0J`)
    }
    const start = page * pageSize
    const pageItems = items.slice(start, start + pageSize)
    const rendered = pageItems.map((item, i) => render(item, i === idx, start + i))
    if (totalPages > 1) {
      rendered.push(`\x1b[2m  page ${page + 1}/${totalPages}  ↑↓ navigate  →/← page  ↵ select  q quit\x1b[0m`)
    } else {
      rendered.push(`\x1b[2m  ↑↓ navigate  ↵ select  q quit\x1b[0m`)
    }
    const output = rendered.join('\n') + '\n'
    process.stdout.write(output)
    // count actual lines rendered (entries may be multi-line)
    ;(draw as any)._lines = output.split('\n').length - 1
  }

  draw()

  return new Promise((resolve) => {
    const onKey = (key: string) => {
      const pageItems = items.slice(page * pageSize, (page + 1) * pageSize)
      if (key === '\x1b[A' || key === 'k') {
        if (idx > 0) { idx--; draw() }
        else if (page > 0) { page--; idx = pageSize - 1; draw() }
      } else if (key === '\x1b[B' || key === 'j') {
        if (idx < pageItems.length - 1) { idx++; draw() }
        else if (page < totalPages - 1) { page++; idx = 0; draw() }
      } else if (key === '\x1b[C' || key === 'l') {
        // next page
        if (page < totalPages - 1) { page++; idx = 0; draw() }
      } else if (key === '\x1b[D' || key === 'h') {
        // prev page
        if (page > 0) { page--; idx = 0; draw() }
      } else if (key === '\r' || key === '\n') {
        cleanup()
        resolve(items[page * pageSize + idx])
      } else if (key === '\x03' || key === 'q') {
        cleanup()
        resolve(null)
      }
    }
    const cleanup = () => {
      stdin.removeListener('data', onKey)
      stdin.setRawMode(false)
      stdin.pause()
      process.stdout.write('\x1b[?25h')
    }
    stdin.on('data', onKey)
  })
}
