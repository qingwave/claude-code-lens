import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import readline from 'node:readline'
import { createReadStream } from 'node:fs'

export interface ClaudeProject {
  name: string
  displayName: string
  path: string
  sessionsCount: number
  lastActivity?: string
}

export interface ClaudeSession {
  id: string
  summary: string
  lastActivity: string
  messageCount: number
}

function getProjectsDir(): string {
  return path.join(os.homedir(), '.claude', 'projects')
}

function decodeProjectName(encodedName: string): string {
  return encodedName.replace(/^-/, '/').replace(/-/g, '/')
}

function getDisplayName(projectPath: string): string {
  const parts = projectPath.split('/')
  return parts[parts.length - 1] || projectPath
}

export async function listProjects(): Promise<ClaudeProject[]> {
  try {
    const projectsDir = getProjectsDir()
    try {
      await fs.access(projectsDir)
    } catch {
      return []
    }

    const entries = await fs.readdir(projectsDir, { withFileTypes: true })

    const projects = await Promise.all(
      entries
        .filter(e => e.isDirectory())
        .map(async (entry) => {
          const projectPath = decodeProjectName(entry.name)
          const projectDir = path.join(projectsDir, entry.name)

          const files = await fs.readdir(projectDir)
          const sessionFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))

          // Find lastActivity from the most recently modified non-empty session file
          let lastActivity: string | undefined
          if (sessionFiles.length > 0) {
            const mtimes = (await Promise.all(
              sessionFiles.map(async (file) => {
                const stat = await fs.stat(path.join(projectDir, file))
                return stat.size > 0 ? stat.mtime : null
              })
            )).filter((t): t is Date => t !== null)

            if (mtimes.length > 0) {
              lastActivity = mtimes.reduce((a, b) => (a > b ? a : b)).toISOString()
            }
          }

          return {
            name: entry.name,
            displayName: getDisplayName(projectPath),
            path: projectPath,
            sessionsCount: sessionFiles.length,
            lastActivity,
          }
        })
    )

    return projects
  } catch (error) {
    console.error('[Claude Projects] Error listing projects:', error)
    return []
  }
}

export async function listSessions(projectName: string): Promise<ClaudeSession[]> {
  try {
    const projectDir = path.join(getProjectsDir(), projectName)

    const files = await fs.readdir(projectDir)
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))

    if (jsonlFiles.length === 0) return []

    // Get stats, skip empty files, sort newest first
    const filesWithStats = (await Promise.all(
      jsonlFiles.map(async (file) => {
        const stat = await fs.stat(path.join(projectDir, file))
        return stat.size > 0 ? { file, mtime: stat.mtime } : null
      })
    ))
      .filter((f): f is { file: string; mtime: Date } => f !== null)
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime())

    const sessions: ClaudeSession[] = []

    for (const { file, mtime } of filesWithStats) {
      const sessionId = file.replace('.jsonl', '')
      const filePath = path.join(projectDir, file)

      let summary = 'New Session'
      let messageCount = 0
      let lastTimestamp = mtime // fallback to mtime if no parseable timestamp

      try {
        const rl = readline.createInterface({
          input: createReadStream(filePath),
          crlfDelay: Infinity,
        })

        for await (const line of rl) {
          if (!line.trim()) continue
          messageCount++

          try {
            const entry = JSON.parse(line)

            if (entry.timestamp) {
              lastTimestamp = new Date(entry.timestamp)
            }

            if (summary === 'New Session' && entry.message?.role === 'user') {
              const content = Array.isArray(entry.message.content)
                ? entry.message.content.find((c: any) => c.type === 'text')?.text
                : entry.message.content
              if (content && typeof content === 'string') {
                summary = content.length > 50 ? content.substring(0, 50) + '...' : content
              }
            }
          } catch { /* skip malformed lines */ }
        }

        rl.close()
      } catch (error) {
        console.error(`Error reading session ${sessionId}:`, error)
      }

      sessions.push({
        id: sessionId,
        summary,
        lastActivity: lastTimestamp.toISOString(),
        messageCount,
      })
    }

    return sessions
  } catch (error) {
    console.error('[Claude Projects] Error listing sessions:', error)
    return []
  }
}

export function getProjectName(projectPath: string): string {
  return projectPath.replace(/\//g, '-').replace(/^-/, '-')
}
