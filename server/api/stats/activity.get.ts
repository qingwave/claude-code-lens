import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { resolveClaudePath } from '../../utils/claudeDir'

export interface ActivityStats {
  projects: number
  sessions: number
  totalMessages: number
  memoryFiles: number
}

async function countProjectsAndSessions(): Promise<{ projects: number; sessions: number; totalMessages: number }> {
  const projectsDir = join(homedir(), '.claude', 'projects')
  try {
    await fs.access(projectsDir)
  } catch {
    return { projects: 0, sessions: 0, totalMessages: 0 }
  }

  const entries = await fs.readdir(projectsDir, { withFileTypes: true })
  const dirs = entries.filter(e => e.isDirectory())

  let sessions = 0
  let totalMessages = 0

  for (const dir of dirs) {
    const dirPath = join(projectsDir, dir.name)
    try {
      const files = await fs.readdir(dirPath)
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))
      sessions += jsonlFiles.length

      for (const file of jsonlFiles) {
        try {
          const content = await fs.readFile(join(dirPath, file), 'utf-8')
          const lines = content.trim().split('\n').filter(l => l.trim())
          for (const line of lines) {
            try {
              const msg = JSON.parse(line)
              if (msg?.message?.role === 'user' || msg?.message?.role === 'assistant') {
                totalMessages++
              }
            } catch {
              // skip malformed lines
            }
          }
        } catch {
          // skip unreadable files
        }
      }
    } catch {
      // skip unreadable dirs
    }
  }

  return { projects: dirs.length, sessions, totalMessages }
}

async function countMemoryFiles(): Promise<number> {
  const memoryDir = resolveClaudePath('memory')
  try {
    await fs.access(memoryDir)
    const files = await fs.readdir(memoryDir)
    return files.filter(f => f.endsWith('.md')).length
  } catch {
    return 0
  }
}

export default defineEventHandler(async (): Promise<ActivityStats> => {
  const [projectStats, memoryFiles] = await Promise.all([
    countProjectsAndSessions(),
    countMemoryFiles(),
  ])

  return {
    projects: projectStats.projects,
    sessions: projectStats.sessions,
    totalMessages: projectStats.totalMessages,
    memoryFiles,
  }
})
