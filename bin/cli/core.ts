import { promises as fs, createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { parse as parseYaml } from 'yaml'

const claudeDir = () => process.env.CLAUDE_DIR || join(homedir(), '.claude')
const projectsDir = () => join(claudeDir(), 'projects')

export interface Project {
  name: string        // encoded dir name
  displayName: string // last segment of decoded path
  path: string        // decoded full path
  sessionsCount: number
  lastActivity?: string
}

export interface Session {
  id: string
  summary: string
  lastActivity: string
  messageCount: number
  projectName: string
  projectDisplayName: string
  cwd?: string
}

export interface SearchMatch {
  sessionId: string
  summary: string
  matchedText: string
  lastActivity: string
  projectName: string
  projectDisplayName: string
  cwd?: string
}

export interface TokenStats {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  estimatedCost: number
  sessionCount: number
  projectCount: number
}

function decodePath(encoded: string): string {
  // encoded: leading - removed, then - → /
  return ('/' + encoded.replace(/^-+/, '')).replace(/-/g, '/')
}

function displayName(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] || path
}

export async function listProjects(): Promise<Project[]> {
  try {
    const entries = await fs.readdir(projectsDir(), { withFileTypes: true })
    const projects = await Promise.all(
      entries.filter(e => e.isDirectory()).map(async (e) => {
        const dir = join(projectsDir(), e.name)
        const files = await fs.readdir(dir).catch(() => [] as string[])
        const sessions = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))
        const mtimes = await Promise.all(
          sessions.map(f => fs.stat(join(dir, f)).then(s => s.mtime).catch(() => null))
        )
        const lastActivity = mtimes
          .filter((t): t is Date => t !== null)
          .sort((a, b) => b.getTime() - a.getTime())[0]?.toISOString()
        const decoded = decodePath(e.name)
        return {
          name: e.name,
          displayName: displayName(decoded),
          path: decoded,
          sessionsCount: sessions.length,
          lastActivity,
        }
      })
    )
    return projects
      .filter(p => p.sessionsCount > 0)
      .sort((a, b) => (b.lastActivity ?? '').localeCompare(a.lastActivity ?? ''))
  } catch {
    return []
  }
}

export async function listSessions(projectName?: string): Promise<Session[]> {
  const projects = projectName
    ? (await listProjects()).filter(p => p.name === projectName || p.displayName === projectName)
    : await listProjects()

  const all: Session[] = []

  for (const project of projects) {
    const dir = join(projectsDir(), project.name)
    const files = await fs.readdir(dir).catch(() => [] as string[])
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))

    for (const file of jsonlFiles) {
      const sessionId = file.replace('.jsonl', '')
      const rl = createInterface({ input: createReadStream(join(dir, file)), crlfDelay: Infinity })
      let summary = 'New Session'
      let lastActivity = ''
      let messageCount = 0
      let cwd: string | undefined

      for await (const line of rl) {
        if (!line.trim()) continue
        try {
          const entry = JSON.parse(line)
          if (entry.timestamp > lastActivity) lastActivity = entry.timestamp
          if (entry.type === 'summary' && entry.summary) summary = entry.summary
          if (entry.type === 'ai-title' && entry.aiTitle) summary = entry.aiTitle
          if (!cwd && entry.cwd) cwd = entry.cwd
          if (entry.message?.role === 'user') messageCount++
        } catch { /* skip */ }
      }

      if (lastActivity) {
        all.push({ id: sessionId, summary, lastActivity, messageCount, cwd, projectName: project.name, projectDisplayName: project.displayName })
      }
    }
  }

  return all.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity))
}

export async function searchSessions(query: string): Promise<SearchMatch[]> {
  const q = query.toLowerCase()
  const projects = await listProjects()
  const results: SearchMatch[] = []
  const systemPrefixes = ['<command-name>', '<command-message>', '<command-args>', '<local-command', '<system-reminder>', 'Caveat:']

  for (const project of projects) {
    const dir = join(projectsDir(), project.name)
    const files = await fs.readdir(dir).catch(() => [] as string[])
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))
    const sessionMatches = new Map<string, SearchMatch>()
    const meta = new Map<string, { summary: string; lastActivity: string; cwd?: string }>()

    for (const file of jsonlFiles) {
      const rl = createInterface({ input: createReadStream(join(dir, file)), crlfDelay: Infinity })

      for await (const line of rl) {
        if (!line.trim()) continue
        try {
          const entry = JSON.parse(line)
          const sessionId: string = entry.sessionId
          if (!sessionId) continue

          if (!meta.has(sessionId)) meta.set(sessionId, { summary: 'New Session', lastActivity: '' })
          const m = meta.get(sessionId)!
          if (entry.timestamp > m.lastActivity) m.lastActivity = entry.timestamp
          if (entry.type === 'summary' && entry.summary) m.summary = entry.summary
          if (entry.type === 'ai-title' && entry.aiTitle) m.summary = entry.aiTitle
          if (!m.cwd && entry.cwd) m.cwd = entry.cwd

          if (entry.message?.role !== 'user') continue

          // Extract clean text
          const content = entry.message.content
          let text = ''
          if (typeof content === 'string') {
            text = content
          } else if (Array.isArray(content)) {
            const textPart = content.find((c: any) =>
              c.type === 'text' && c.text && !systemPrefixes.some(p => (c.text as string).trimStart().startsWith(p))
            )
            text = textPart?.text || content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join(' ')
          }
          if (systemPrefixes.some(p => text.trimStart().startsWith(p))) text = ''

          // Use first clean message as fallback title
          if (m.summary === 'New Session' && text) {
            m.summary = text.length > 100 ? text.slice(0, 100).trim() + '...' : text.trim()
          }

          if (sessionMatches.has(sessionId)) continue

          const summaryMatch = m.summary.toLowerCase().includes(q)
          const contentMatch = text && text.toLowerCase().includes(q)
          if (!summaryMatch && !contentMatch) continue

          let matchedText = ''
          if (contentMatch) {
            const idx = text.toLowerCase().indexOf(q)
            const start = Math.max(0, idx - 40)
            const end = Math.min(text.length, idx + q.length + 40)
            matchedText = (start > 0 ? '...' : '') + text.slice(start, end) + (end < text.length ? '...' : '')
          }

          sessionMatches.set(sessionId, {
            sessionId,
            summary: m.summary,
            matchedText,
            lastActivity: m.lastActivity,
            cwd: m.cwd,
            projectName: project.name,
            projectDisplayName: project.displayName,
          })
        } catch { /* skip */ }
      }
    }

    // Sync final summary/lastActivity (may have been updated after first match)
    for (const [sessionId, match] of sessionMatches) {
      const m = meta.get(sessionId)
      if (m) {
        match.summary = m.summary
        match.lastActivity = m.lastActivity
        if (m.cwd) match.cwd = m.cwd
      }
      results.push(match)
    }
  }

  return results.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
}

export async function getTokenStats(): Promise<TokenStats> {
  const projects = await listProjects()
  const stats: TokenStats = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, estimatedCost: 0, sessionCount: 0, projectCount: projects.length }

  for (const project of projects) {
    const dir = join(projectsDir(), project.name)
    const files = await fs.readdir(dir).catch(() => [] as string[])
    const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))
    const sessionIds = new Set<string>()

    for (const file of jsonlFiles) {
      const rl = createInterface({ input: createReadStream(join(dir, file)), crlfDelay: Infinity })
      for await (const line of rl) {
        if (!line.trim()) continue
        try {
          const entry = JSON.parse(line)
          if (entry.sessionId) sessionIds.add(entry.sessionId)
          if (entry.usage) {
            stats.inputTokens += entry.usage.input_tokens ?? 0
            stats.outputTokens += entry.usage.output_tokens ?? 0
            stats.cacheReadTokens += entry.usage.cache_read_input_tokens ?? 0
            stats.cacheCreationTokens += entry.usage.cache_creation_input_tokens ?? 0
          }
        } catch { /* skip */ }
      }
    }
    stats.sessionCount += sessionIds.size
  }

  // Approximate cost: sonnet pricing
  stats.estimatedCost =
    (stats.inputTokens / 1_000_000) * 3 +
    (stats.outputTokens / 1_000_000) * 15 +
    (stats.cacheReadTokens / 1_000_000) * 0.3 +
    (stats.cacheCreationTokens / 1_000_000) * 3.75

  return stats
}

// ── Agents ────────────────────────────────────────────────────────────────

export interface Agent {
  slug: string
  name: string
  description?: string
  model?: string
  color?: string
  body: string
}

function parseFrontmatter(raw: string): { fm: Record<string, any>; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { fm: {}, body: raw }
  try {
    return { fm: parseYaml(match[1]!) ?? {}, body: match[2]!.replace(/^\n/, '') }
  } catch {
    return { fm: {}, body: raw }
  }
}

export async function listAgents(): Promise<Agent[]> {
  const dir = join(claudeDir(), 'agents')
  const files = await fs.readdir(dir).catch(() => [] as string[])
  const agents: Agent[] = []
  for (const file of files.filter(f => f.endsWith('.md'))) {
    const raw = await fs.readFile(join(dir, file), 'utf8').catch(() => '')
    const { fm, body } = parseFrontmatter(raw)
    agents.push({
      slug: file.replace('.md', ''),
      name: fm.name ?? file.replace('.md', ''),
      description: fm.description,
      model: fm.model,
      color: fm.color,
      body,
    })
  }
  return agents.sort((a, b) => a.name.localeCompare(b.name))
}

// ── Memory ────────────────────────────────────────────────────────────────

export interface MemoryFile {
  filename: string
  name: string
  description: string
  type: string
  size: number
  mtime: string
}

export async function listMemory(projectName?: string): Promise<(MemoryFile & { scope: string })[]> {
  const result: (MemoryFile & { scope: string })[] = []

  async function readDir(dir: string, scope: string) {
    const files = await fs.readdir(dir).catch(() => [] as string[])
    for (const file of files.filter(f => f.endsWith('.md') && f !== 'MEMORY.md')) {
      const filePath = join(dir, file)
      const [raw, stat] = await Promise.all([
        fs.readFile(filePath, 'utf8').catch(() => ''),
        fs.stat(filePath).catch(() => null),
      ])
      const { fm } = parseFrontmatter(raw)
      result.push({
        filename: file,
        name: fm.name ?? file.replace('.md', ''),
        description: fm.description ?? '',
        type: fm.metadata?.type ?? fm.type ?? 'unknown',
        size: stat?.size ?? 0,
        mtime: stat?.mtime.toISOString() ?? '',
        scope,
      })
    }
  }

  if (projectName) {
    // single project
    await readDir(join(claudeDir(), 'projects', projectName, 'memory'), projectName)
  } else {
    // global memory
    await readDir(join(claudeDir(), 'memory'), 'global')
    // all project memories
    const projectsPath = projectsDir()
    const entries = await fs.readdir(projectsPath, { withFileTypes: true }).catch(() => [] as any[])
    for (const entry of entries.filter((e: any) => e.isDirectory())) {
      const memDir = join(projectsPath, entry.name, 'memory')
      const decoded = ('/' + entry.name.replace(/^-+/, '')).replace(/-/g, '/')
      const label = decoded.split('/').filter(Boolean).pop() ?? entry.name
      await readDir(memDir, label)
    }
  }

  return result.sort((a, b) => a.scope.localeCompare(b.scope) || a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
}

// ── MCP ───────────────────────────────────────────────────────────────────

export interface McpServer {
  name: string
  type: string
  command?: string
  url?: string
  scope: 'global' | 'project'
}

export async function listMcp(): Promise<McpServer[]> {
  const settingsPath = join(claudeDir(), 'settings.json')
  const raw = await fs.readFile(settingsPath, 'utf8').catch(() => '{}')
  let settings: any = {}
  try { settings = JSON.parse(raw) } catch { /* skip */ }

  const servers: McpServer[] = []
  const mcpServers = settings.mcpServers ?? {}
  for (const [name, cfg] of Object.entries(mcpServers) as [string, any][]) {
    servers.push({
      name,
      type: cfg.type ?? (cfg.command ? 'stdio' : cfg.url ? 'sse' : 'unknown'),
      command: cfg.command ?? (Array.isArray(cfg.args) ? [cfg.command, ...cfg.args].filter(Boolean).join(' ') : undefined),
      url: cfg.url,
      scope: 'global',
    })
  }
  return servers.sort((a, b) => a.name.localeCompare(b.name))
}

// ── Recent sessions & agent usage (for enhanced stats) ───────────────────

export interface RecentSession {
  sessionId: string
  projectDisplayName: string
  summary: string
  lastActivity: string
  messageCount: number
}

export interface AgentUsage {
  name: string
  sessionCount: number
  lastUsed: string
}

export async function getRecentSessions(limit = 8): Promise<RecentSession[]> {
  const sessions = await listSessions()
  return sessions.slice(0, limit).map(s => ({
    sessionId: s.id,
    projectDisplayName: s.projectDisplayName,
    summary: s.summary,
    lastActivity: s.lastActivity,
    messageCount: s.messageCount,
  }))
}

export async function getAgentUsage(): Promise<AgentUsage[]> {
  const projects = await listProjects()
  const usage = new Map<string, { count: number; lastUsed: string }>()

  for (const project of projects) {
    const dir = join(projectsDir(), project.name)
    const files = await fs.readdir(dir).catch(() => [] as string[])
    for (const file of files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))) {
      const rl = createInterface({ input: createReadStream(join(dir, file)), crlfDelay: Infinity })
      for await (const line of rl) {
        if (!line.trim()) continue
        try {
          const entry = JSON.parse(line)
          const agent = entry.agentId ?? entry.agent
          if (!agent || typeof agent !== 'string') continue
          const cur = usage.get(agent) ?? { count: 0, lastUsed: '' }
          cur.count++
          if ((entry.timestamp ?? '') > cur.lastUsed) cur.lastUsed = entry.timestamp ?? ''
          usage.set(agent, cur)
        } catch { /* skip */ }
      }
    }
  }

  return Array.from(usage.entries())
    .map(([name, { count, lastUsed }]) => ({ name, sessionCount: count, lastUsed }))
    .sort((a, b) => b.sessionCount - a.sessionCount)
}

// ── Commands ──────────────────────────────────────────────────────────────

export interface SlashCommand {
  slug: string
  name: string
  description?: string
  argumentHint?: string
  allowedTools?: string[]
  agent?: string
}

export async function listCommands(): Promise<SlashCommand[]> {
  const dir = join(claudeDir(), 'commands')
  const result: SlashCommand[] = []

  async function scanDir(d: string, prefix = '') {
    const entries = await fs.readdir(d, { withFileTypes: true }).catch(() => [] as any[])
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await scanDir(join(d, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name)
      } else if (entry.name.endsWith('.md')) {
        const raw = await fs.readFile(join(d, entry.name), 'utf8').catch(() => '')
        const { fm } = parseFrontmatter(raw)
        const base = entry.name.replace('.md', '')
        result.push({
          slug: prefix ? `${prefix}/${base}` : base,
          name: fm.name ?? base,
          description: fm.description,
          argumentHint: fm['argument-hint'],
          allowedTools: fm['allowed-tools'],
          agent: fm.agent,
        })
      }
    }
  }

  await scanDir(dir)
  return result.sort((a, b) => a.name.localeCompare(b.name))
}

// ── Skills ────────────────────────────────────────────────────────────────

export interface Skill {
  slug: string
  name: string
  description?: string
  context?: string
  agent?: string
}

export async function listSkills(): Promise<Skill[]> {
  const dir = join(claudeDir(), 'skills')
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [] as any[])
  const skills: Skill[] = []
  for (const entry of entries.filter((e: any) => e.isDirectory())) {
    const skillFile = join(dir, entry.name, 'SKILL.md')
    const raw = await fs.readFile(skillFile, 'utf8').catch(() => '')
    if (!raw) continue
    const { fm } = parseFrontmatter(raw)
    skills.push({
      slug: entry.name,
      name: fm.name ?? entry.name,
      description: fm.description,
      context: fm.context,
      agent: fm.agent,
    })
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name))
}

// ── Workflows ─────────────────────────────────────────────────────────────

export interface Workflow {
  slug: string
  name: string
  description?: string
  steps: { id: string; agentSlug: string; label: string }[]
  createdAt?: string
}

export async function listWorkflows(): Promise<Workflow[]> {
  const dir = join(claudeDir(), 'workflows')
  const files = await fs.readdir(dir).catch(() => [] as string[])
  const workflows: Workflow[] = []
  for (const file of files.filter(f => f.endsWith('.json'))) {
    const raw = await fs.readFile(join(dir, file), 'utf8').catch(() => '')
    try {
      const data = JSON.parse(raw)
      workflows.push({
        slug: file.replace('.json', ''),
        name: data.name ?? file.replace('.json', ''),
        description: data.description,
        steps: data.steps ?? [],
        createdAt: data.createdAt,
      })
    } catch { /* skip */ }
  }
  return workflows.sort((a, b) => a.name.localeCompare(b.name))
}

// ── Plugins ───────────────────────────────────────────────────────────────

export interface Plugin {
  id: string
  name: string
  version: string
  scope: string
  installedAt: string
}

export async function listPlugins(): Promise<Plugin[]> {
  const filePath = join(claudeDir(), 'plugins', 'installed_plugins.json')
  const raw = await fs.readFile(filePath, 'utf8').catch(() => '{}')
  let data: any = {}
  try { data = JSON.parse(raw) } catch { /* skip */ }

  const plugins: Plugin[] = []
  for (const [id, installs] of Object.entries(data.plugins ?? {}) as [string, any][]) {
    for (const inst of (Array.isArray(installs) ? installs : [installs])) {
      plugins.push({
        id,
        name: id.split('@')[0] ?? id,
        version: inst.version ?? 'unknown',
        scope: inst.scope ?? 'user',
        installedAt: inst.installedAt ?? '',
      })
    }
  }
  return plugins.sort((a, b) => a.name.localeCompare(b.name))
}

// ── Session export ────────────────────────────────────────────────────────

export interface SessionMessage {
  role: 'user' | 'assistant'
  text: string
  timestamp: string
}

export async function getSessionMessages(sessionId: string): Promise<SessionMessage[]> {
  const projects = await listProjects()
  for (const project of projects) {
    const filePath = join(projectsDir(), project.name, `${sessionId}.jsonl`)
    const exists = await fs.access(filePath).then(() => true).catch(() => false)
    if (!exists) continue

    const messages: SessionMessage[] = []
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
    for await (const line of rl) {
      if (!line.trim()) continue
      try {
        const entry = JSON.parse(line)
        if (!entry.message?.role || !entry.message?.content) continue
        const content = entry.message.content
        const text = typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
            : ''
        if (!text.trim()) continue
        messages.push({ role: entry.message.role, text, timestamp: entry.timestamp ?? '' })
      } catch { /* skip */ }
    }
    return messages
  }
  return []
}

// ── Project rename ────────────────────────────────────────────────────────

export function encodePath(absPath: string): string {
  return absPath.replace(/\//g, '-')
}

export async function renameProject(oldPath: string, newPath: string): Promise<{ moved: boolean; warnings: string[] }> {
  const warnings: string[] = []
  const oldEncoded = encodePath(oldPath)
  const newEncoded = encodePath(newPath)
  const pDir = projectsDir()
  const oldDir = join(pDir, oldEncoded)
  const newDir = join(pDir, newEncoded)

  // Verify old project dir exists
  await fs.access(oldDir)

  // Verify target doesn't already exist
  const newExists = await fs.access(newDir).then(() => true).catch(() => false)
  if (newExists) throw new Error(`Target already exists: ${newDir}`)

  // Rename the projects dir
  await fs.rename(oldDir, newDir)

  // Update custom-project-names.json
  const projectNamesPath = join(claudeDir(), 'custom-project-names.json')
  try {
    const raw = await fs.readFile(projectNamesPath, 'utf8')
    const data = JSON.parse(raw)
    if (data[oldEncoded]) {
      data[newEncoded] = data[oldEncoded]
      delete data[oldEncoded]
      await fs.writeFile(projectNamesPath, JSON.stringify(data, null, 2))
    }
  } catch { /* file may not exist */ }

  // Update manual-projects.json if registered
  const manualPath = join(claudeDir(), 'manual-projects.json')
  try {
    const raw = await fs.readFile(manualPath, 'utf8')
    const data = JSON.parse(raw)
    if (data[oldEncoded]) {
      data[newEncoded] = { ...data[oldEncoded], path: newPath }
      delete data[oldEncoded]
      await fs.writeFile(manualPath, JSON.stringify(data, null, 2))
    }
  } catch { /* skip */ }

  warnings.push('Session history (cwd fields in JSONL) still references the old path — this is read-only and expected.')
  warnings.push('Make sure you also moved the actual project directory to: ' + newPath)

  return { moved: true, warnings }
}
