import type { Peer } from 'crossws'
import {
  createShellSession,
  getShellSession,
  writeToShellSession,
  resizeShellSession,
  terminateShellSession,
} from '../../utils/shellSession'

// Simple protocol — same shape as CliWebSocketMessage/Event so the client composable is minimal
type ShellIn =
  | { type: 'create'; workingDir?: string; cols?: number; rows?: number }
  | { type: 'input'; sessionId: string; data: string }
  | { type: 'resize'; sessionId: string; cols: number; rows: number }
  | { type: 'kill'; sessionId: string }

type ShellOut =
  | { type: 'session'; sessionId: string; shell: string }
  | { type: 'output'; data: string }
  | { type: 'exit'; exitCode: number }
  | { type: 'error'; error: string }

function send(peer: Peer, msg: ShellOut) {
  try {
    peer.send(JSON.stringify(msg))
  } catch { /* peer already closed */ }
}

const peerSessions = new Map<string, string>()

export default defineWebSocketHandler({
  open(peer: Peer) {
    console.log('[Shell WS] connected', peer.id)
  },

  async message(peer: Peer, raw) {
    let msg: ShellIn
    try {
      msg = JSON.parse(raw.text())
    } catch {
      send(peer, { type: 'error', error: 'Invalid JSON' })
      return
    }

    try {
      switch (msg.type) {
        case 'create': {
          const session = await createShellSession({
            workingDir: msg.workingDir,
            cols: msg.cols,
            rows: msg.rows,
          })

          peerSessions.set(peer.id, session.id)
          send(peer, { type: 'session', sessionId: session.id, shell: session.shell })

          session.pty.onData((data) => {
            send(peer, { type: 'output', data })
          })

          session.pty.onExit(({ exitCode }) => {
            peerSessions.delete(peer.id)
            send(peer, { type: 'exit', exitCode: exitCode ?? 0 })
          })

          break
        }

        case 'input':
          writeToShellSession(msg.sessionId, msg.data)
          break

        case 'resize':
          resizeShellSession(msg.sessionId, msg.cols, msg.rows)
          break

        case 'kill':
          await terminateShellSession(msg.sessionId)
          peerSessions.delete(peer.id)
          send(peer, { type: 'exit', exitCode: 0 })
          break

        default:
          send(peer, { type: 'error', error: `Unknown type: ${(msg as any).type}` })
      }
    } catch (e: any) {
      send(peer, { type: 'error', error: e.message || String(e) })
    }
  },

  async close(peer: Peer) {
    console.log('[Shell WS] disconnected', peer.id)
    const sessionId = peerSessions.get(peer.id)
    if (sessionId) {
      peerSessions.delete(peer.id)
      await terminateShellSession(sessionId)
    }
  },
})
