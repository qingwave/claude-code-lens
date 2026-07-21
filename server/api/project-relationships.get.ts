import { readdir, readFile, access } from 'node:fs/promises'
import { join, basename, resolve } from 'node:path'
import { homedir } from 'node:os'
import { createReadStream } from 'node:fs'
import readline from 'node:readline'

export interface ProjectNode {
  id: string
  displayName: string
}

export interface ProjectEdge {
  source: string  // project that referenced the other
  target: string  // project that was referenced
  type: 'referenced'
  bidirectional?: boolean
  sessionId?: string
  timestamp?: number
}

export interface ProjectRelationshipsResult {
  nodes: ProjectNode[]
  edges: ProjectEdge[]
}

function getProjectsDir(): string {
  return join(homedir(), '.claude', 'projects')
}

function encodeProjectPath(p: string): string {
  return p.replace(/\//g, '-')
}

function slugDisplayName(slug: string): string {
  const bare = slug.replace(/^-/, '')
  const parts = bare.split('-')
  const skipWords = new Set(['users', 'home', 'work', 'tmp', 'data', 'opt', 'usr', 'var'])
  let start = 0
  for (let i = 0; i < parts.length; i++) {
    const p = (parts[i] ?? '').toLowerCase()
    if (skipWords.has(p) || /^[A-Z]\d+$/.test(parts[i] ?? '') || /^i\d+$/i.test(parts[i] ?? '')) {
      start = i + 1
    }
  }
  const meaningful = parts.slice(start)
  return meaningful.length === 0 ? bare : meaningful.join('-')
}

async function exists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}

// .session-aliases: each line records a project that referenced THIS project
// i.e. source=line, target=slug (reversed: the file owner was referenced)
async function loadSessionAliasEdges(
  projectsDir: string,
  slug: string,
  knownSlugs: Set<string>,
): Promise<ProjectEdge[]> {
  const aliasFile = join(projectsDir, slug, '.session-aliases')
  if (!(await exists(aliasFile))) return []

  const raw = await readFile(aliasFile, 'utf-8')
  const edges: ProjectEdge[] = []

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // Each line is the path of a project that referenced this one (slug)
    const sourceSlug = basename(trimmed)
    if (!sourceSlug || sourceSlug === slug) continue
    if (!knownSlugs.has(sourceSlug)) continue
    // source referenced target (slug)
    edges.push({ source: sourceSlug, target: slug, type: 'referenced' })
  }

  return edges
}

// history.jsonl /add-dir: source project referenced target project
async function loadAddDirEdges(knownSlugs: Set<string>): Promise<ProjectEdge[]> {
  const historyPath = join(homedir(), '.claude', 'history.jsonl')
  if (!(await exists(historyPath))) return []

  const edges: ProjectEdge[] = []
  const rl = readline.createInterface({
    input: createReadStream(historyPath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    if (!line.includes('add-dir')) continue
    try {
      const entry = JSON.parse(line) as {
        display?: string
        project?: string
        sessionId?: string
        timestamp?: number
      }
      if (!entry.display?.startsWith('/add-dir') || !entry.project) continue

      const arg = entry.display.slice('/add-dir'.length).trim()
      if (!arg) continue

      const sourceSlug = encodeProjectPath(entry.project)
      const targetPath = resolve(entry.project, arg)
      const targetSlug = encodeProjectPath(targetPath)

      if (!knownSlugs.has(sourceSlug) || !knownSlugs.has(targetSlug)) continue

      edges.push({
        source: sourceSlug,
        target: targetSlug,
        type: 'referenced',
        sessionId: entry.sessionId,
        timestamp: entry.timestamp,
      })
    } catch {
      // skip malformed lines
    }
  }

  return edges
}

export default defineEventHandler(async (): Promise<ProjectRelationshipsResult> => {
  const projectsDir = getProjectsDir()
  if (!(await exists(projectsDir))) return { nodes: [], edges: [] }

  const entries = await readdir(projectsDir, { withFileTypes: true })
  const slugs = entries.filter(e => e.isDirectory()).map(e => e.name)
  const knownSlugs = new Set(slugs)

  const [aliasEdgeGroups, addDirEdges] = await Promise.all([
    Promise.all(slugs.map(s => loadSessionAliasEdges(projectsDir, s, knownSlugs))),
    loadAddDirEdges(knownSlugs),
  ])

  // Merge all edges, deduplicate same source→target pair (keep earliest timestamp)
  const edgeKeys = new Set<string>()
  const edges: ProjectEdge[] = []
  for (const edge of [...addDirEdges, ...aliasEdgeGroups.flat()]) {
    const key = `${edge.source}::${edge.target}`
    if (!edgeKeys.has(key)) {
      edgeKeys.add(key)
      edges.push(edge)
    }
  }

  // Mark bidirectional edges: if A→B and B→A both exist, collapse into one bidirectional edge
  const finalEdges: ProjectEdge[] = []
  const consumed = new Set<string>()
  for (const edge of edges) {
    const key = `${edge.source}::${edge.target}`
    if (consumed.has(key)) continue
    const reverseKey = `${edge.target}::${edge.source}`
    if (edgeKeys.has(reverseKey)) {
      // Bidirectional: keep one edge (canonical: smaller id first) marked as bidirectional
      finalEdges.push({ ...edge, bidirectional: true })
      consumed.add(key)
      consumed.add(reverseKey)
    } else {
      finalEdges.push(edge)
      consumed.add(key)
    }
  }

  const usedSlugs = new Set<string>()
  for (const e of finalEdges) { usedSlugs.add(e.source); usedSlugs.add(e.target) }

  const nodes: ProjectNode[] = Array.from(usedSlugs).map(slug => ({
    id: slug,
    displayName: slugDisplayName(slug),
  }))

  return { nodes, edges: finalEdges }
})
