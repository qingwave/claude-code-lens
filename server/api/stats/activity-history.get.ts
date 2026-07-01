import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface DayActivity {
  date: string // YYYY-MM-DD
  sessions: number
  messages: number
  outputTokens: number
  cacheReadTokens: number
}

export interface ActivityHistory {
  days: DayActivity[]
  range: { start: string; end: string }
}

function toDateStr(ts: string): string | null {
  try {
    const d = new Date(ts)
    if (isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10)
  } catch {
    return null
  }
}

export default defineEventHandler(async (): Promise<ActivityHistory> => {
  const projectsDir = join(homedir(), '.claude', 'projects')

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const cutoff = new Date(today)
  cutoff.setDate(cutoff.getDate() - 364)

  const dayMap = new Map<string, { sessions: number; messages: number; outputTokens: number; cacheReadTokens: number }>()
  for (let d = new Date(cutoff); d <= today; d.setDate(d.getDate() + 1)) {
    dayMap.set(d.toISOString().slice(0, 10), { sessions: 0, messages: 0, outputTokens: 0, cacheReadTokens: 0 })
  }

  try {
    await fs.access(projectsDir)
  } catch {
    return buildResponse(dayMap, cutoff, today)
  }

  const projectDirs = await fs.readdir(projectsDir, { withFileTypes: true })

  for (const dir of projectDirs) {
    if (!dir.isDirectory()) continue
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
      let sessionDate: string | null = null
      let sessionCounted = false

      let content: string
      try {
        content = await fs.readFile(filePath, 'utf-8')
      } catch {
        continue
      }

      const lines = content.trim().split('\n').filter(l => l.trim())
      for (const line of lines) {
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(line)
        } catch {
          continue
        }

        const ts = msg.timestamp as string | undefined
        if (ts && !sessionDate) {
          sessionDate = toDateStr(ts)
        }

        const msgDate = ts ? toDateStr(ts) : sessionDate

        const role = (msg as any).message?.role
        if (role === 'user' || role === 'assistant') {
          if (msgDate && dayMap.has(msgDate)) {
            dayMap.get(msgDate)!.messages++
          }
        }

        // Accumulate token usage per day
        const usage = (msg as any).message?.usage
        if (usage && msgDate && dayMap.has(msgDate)) {
          const entry = dayMap.get(msgDate)!
          entry.outputTokens += (usage.output_tokens as number) || 0
          entry.cacheReadTokens += (usage.cache_read_input_tokens as number) || 0
        }
      }

      if (sessionDate && dayMap.has(sessionDate) && !sessionCounted) {
        dayMap.get(sessionDate)!.sessions++
        sessionCounted = true
      }
    }
  }

  return buildResponse(dayMap, cutoff, today)
})

function buildResponse(
  dayMap: Map<string, { sessions: number; messages: number; outputTokens: number; cacheReadTokens: number }>,
  cutoff: Date,
  today: Date,
): ActivityHistory {
  const days: DayActivity[] = []
  for (const [date, counts] of dayMap) {
    days.push({ date, ...counts })
  }
  days.sort((a, b) => a.date.localeCompare(b.date))
  return {
    days,
    range: {
      start: cutoff.toISOString().slice(0, 10),
      end: today.toISOString().slice(0, 10),
    },
  }
}
