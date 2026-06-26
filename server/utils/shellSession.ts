import { spawn as ptySpawn, type IPty } from 'node-pty'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import fs from 'node:fs/promises'

export interface ShellSessionData {
  id: string
  pty: IPty
  workingDir: string
  shell: string
  createdAt: string
  idleTimer?: NodeJS.Timeout
}

const sessions = new Map<string, ShellSessionData>()

const IDLE_TIMEOUT = 30 * 60 * 1000

function detectShell(): string {
  // Prefer the user's login shell
  if (process.env.SHELL) return process.env.SHELL
  // Common macOS/Linux shells
  const candidates = ['/bin/zsh', '/bin/bash', '/bin/sh']
  for (const s of candidates) {
    try {
      require('node:fs').accessSync(s, require('node:fs').constants.X_OK)
      return s
    } catch { /* try next */ }
  }
  return '/bin/sh'
}

export async function createShellSession(options: {
  workingDir?: string
  cols?: number
  rows?: number
}): Promise<ShellSessionData> {
  const id = randomUUID()
  const shell = detectShell()
  const cwd = options.workingDir || os.homedir()

  // Validate working directory
  try {
    const stat = await fs.stat(cwd)
    if (!stat.isDirectory()) throw new Error(`Not a directory: ${cwd}`)
  } catch (e: any) {
    throw new Error(`Invalid working directory: ${e.message}`)
  }

  const pty = ptySpawn(shell, ['-l'], {
    name: 'xterm-256color',
    cols: options.cols || 80,
    rows: options.rows || 24,
    cwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      HOME: os.homedir(),
      PWD: cwd,
    },
  })

  const session: ShellSessionData = {
    id,
    pty,
    workingDir: cwd,
    shell,
    createdAt: new Date().toISOString(),
  }

  session.idleTimer = setTimeout(() => terminateShellSession(id), IDLE_TIMEOUT)

  pty.onData(() => resetIdle(id))

  sessions.set(id, session)
  return session
}

export function getShellSession(id: string): ShellSessionData | undefined {
  return sessions.get(id)
}

export function writeToShellSession(id: string, data: string): void {
  const s = sessions.get(id)
  if (!s) return
  // Intercept Ctrl+C: send SIGINT to the process group
  if (data.includes('\x03')) {
    try { process.kill(-(s.pty.pid), 'SIGINT') } catch { s.pty.write(data) }
    return
  }
  s.pty.write(data)
  resetIdle(id)
}

export function resizeShellSession(id: string, cols: number, rows: number): void {
  sessions.get(id)?.pty.resize(cols, rows)
}

export async function terminateShellSession(id: string): Promise<void> {
  const s = sessions.get(id)
  if (!s) return
  if (s.idleTimer) clearTimeout(s.idleTimer)
  try { s.pty.kill() } catch { /* already dead */ }
  sessions.delete(id)
}

function resetIdle(id: string): void {
  const s = sessions.get(id)
  if (!s) return
  if (s.idleTimer) clearTimeout(s.idleTimer)
  s.idleTimer = setTimeout(() => terminateShellSession(id), IDLE_TIMEOUT)
}
