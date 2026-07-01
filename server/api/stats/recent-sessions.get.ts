import { promises as fs, createReadStream } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createInterface } from 'node:readline'

export interface RecentSession {
  sessionId: string
  projectName: string
  projectDisplayName: string
  title: string
  timestamp: string
  messageCount: number
  toolCallCount: number
}

function toProjectDisplayName(projectName: string): string {
  // Convert -Users-foo-work-myapp → myapp
  const parts = projectName.split('-').filter(Boolean)
  return parts[parts.length - 1] || projectName
}

export default defineEventHandler(async (): Promise<RecentSession[]> => {
  const projectsDir = join(homedir(), '.claude', 'projects')

  try {
    await fs.access(projectsDir)
  } catch {
    return []
  }

  const entries = await fs.readdir(projectsDir, { withFileTypes: true })
  const projectDirs = entries.filter(e => e.isDirectory())

  // Each item: { sessionId, projectName, mtime, filePath }
  const candidates: { sessionId: string; projectName: string; mtime: Date; filePath: string }[] = []

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
      try {
        const stat = await fs.stat(filePath)
        candidates.push({
          sessionId: file.replace('.jsonl', ''),
          projectName: dir.name,
          mtime: stat.mtime,
          filePath,
        })
      } catch {
        // skip
      }
    }
  }

  // Sort by mtime descending, take top 30 candidates to parse
  candidates.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
  const top = candidates.slice(0, 30)

  const results: RecentSession[] = []

  for (const c of top) {
    let title = ''
    let firstUserMessage = ''
    let firstTimestamp = ''
    let messageCount = 0
    let toolCallCount = 0
    let cwd = ''

    const rl = createInterface({
      input: createReadStream(c.filePath),
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

      // Capture first timestamp
      if (!firstTimestamp && typeof obj.timestamp === 'string') {
        firstTimestamp = obj.timestamp
      }

      // Capture cwd for display name
      if (!cwd && typeof obj.cwd === 'string') {
        cwd = obj.cwd
      }

      // summary entry (highest priority)
      if (obj.type === 'summary' && typeof (obj as any).summary === 'string') {
        title = (obj as any).summary as string
      }

      // AI-generated title
      if (obj.type === 'ai-title' && typeof (obj as any).aiTitle === 'string') {
        title = (obj as any).aiTitle as string
      }

      // Count user/assistant messages, capture first user message as fallback
      const role = (obj as any).message?.role
      if (role === 'user' || role === 'assistant') {
        messageCount++
      }
      if (!firstUserMessage && role === 'user') {
        const content = (obj as any).message?.content
        if (typeof content === 'string') {
          firstUserMessage = content.slice(0, 100).trim()
        } else if (Array.isArray(content)) {
          const textBlock = content.find((b: any) => b?.type === 'text' && typeof b.text === 'string')
          if (textBlock) firstUserMessage = (textBlock.text as string).slice(0, 100).trim()
        }
      }

      // Count tool calls in assistant content
      const content = (obj as any).message?.content
      if (Array.isArray(content)) {
        for (const item of content) {
          if (item?.type === 'tool_use') toolCallCount++
        }
      }
    }

    // Skip empty sessions
    if (messageCount === 0) continue

    // Fallback to first user message if no ai-title/summary
    if (!title && firstUserMessage) {
      title = firstUserMessage.length > 100 ? firstUserMessage.slice(0, 100) + '...' : firstUserMessage
    }

    // Derive display name from actual cwd, falling back to project dir name
    const displayName = cwd
      ? cwd.split('/').filter(Boolean).pop() || c.projectName
      : toProjectDisplayName(c.projectName)

    results.push({
      sessionId: c.sessionId,
      projectName: c.projectName,
      projectDisplayName: displayName,
      title: title || '',
      timestamp: firstTimestamp || c.mtime.toISOString(),
      messageCount,
      toolCallCount,
    })
  }

  // Final sort by timestamp descending, return top 10
  results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  return results.slice(0, 10)
})
