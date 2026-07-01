import { promises as fs, createReadStream } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createInterface } from 'node:readline'

export interface AgentUsageStat {
  sessionCount: number
  lastUsed: string
}

export default defineEventHandler(async (): Promise<Record<string, AgentUsageStat>> => {
  const projectsDir = join(homedir(), '.claude', 'projects')

  try {
    await fs.access(projectsDir)
  } catch {
    return {}
  }

  const entries = await fs.readdir(projectsDir, { withFileTypes: true })
  const projectDirs = entries.filter(e => e.isDirectory())

  // agentName -> { sessions: Set<sessionId>, lastUsed: string }
  const usage = new Map<string, { sessions: Set<string>; lastUsed: string }>()

  for (const dir of projectDirs) {
    const dirPath = join(projectsDir, dir.name)
    let files: string[]
    try {
      files = await fs.readdir(dirPath)
    } catch {
      continue
    }

    const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))

    for (const file of jsonlFiles) {
      const filePath = join(dirPath, file)
      let firstTimestamp = ''
      // agentName -> sessionId seen in this file (one session per file)
      const seenInFile = new Map<string, string>()

      const rl = createInterface({
        input: createReadStream(filePath),
        crlfDelay: Infinity,
      })

      for await (const line of rl) {
        if (!line.trim()) continue
        let obj: Record<string, unknown>
        try {
          obj = JSON.parse(line)
        } catch {
          continue
        }

        if (!firstTimestamp && typeof obj.timestamp === 'string') {
          firstTimestamp = obj.timestamp
        }

        if (obj.type === 'agent-name') {
          const name = obj.agentName as string | undefined
          const sid = obj.sessionId as string | undefined
          if (name && sid) seenInFile.set(name, sid)
        }
      }

      for (const [name, sid] of seenInFile) {
        if (!usage.has(name)) {
          usage.set(name, { sessions: new Set(), lastUsed: '' })
        }
        const entry = usage.get(name)!
        entry.sessions.add(sid)
        if (firstTimestamp && firstTimestamp > entry.lastUsed) {
          entry.lastUsed = firstTimestamp
        }
      }
    }
  }

  const result: Record<string, AgentUsageStat> = {}
  for (const [name, { sessions, lastUsed }] of usage) {
    result[name] = { sessionCount: sessions.size, lastUsed }
  }
  return result
})
