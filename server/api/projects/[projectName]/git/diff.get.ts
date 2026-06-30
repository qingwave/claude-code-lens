import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { validateGitRepository, spawnAsync } from '../../../../utils/gitUtils'
import { resolveProjectPath } from '../../../../utils/resolveProjectPath'

export interface DiffLine {
  type: 'add' | 'remove' | 'context'
  content: string
  oldLine: number | null
  newLine: number | null
}

export interface DiffHunk {
  header: string
  oldStart: number
  newStart: number
  lines: DiffLine[]
}

export interface DiffResult {
  file: string
  hunks: DiffHunk[]
  addCount: number
  removeCount: number
  error?: string
}

function parseUnifiedDiff(stdout: string): DiffHunk[] {
  const hunks: DiffHunk[] = []
  let currentHunk: DiffHunk | null = null
  let oldLine = 0
  let newLine = 0

  const hunkRe = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/

  for (const raw of stdout.split('\n')) {
    const hunkMatch = raw.match(hunkRe)
    if (hunkMatch) {
      currentHunk = {
        header: raw,
        oldStart: parseInt(hunkMatch[1], 10),
        newStart: parseInt(hunkMatch[2], 10),
        lines: [],
      }
      oldLine = currentHunk.oldStart
      newLine = currentHunk.newStart
      hunks.push(currentHunk)
      continue
    }

    if (!currentHunk) continue

    // Skip diff file headers (--- a/... and +++ b/...)
    if (raw.startsWith('--- ') || raw.startsWith('+++ ')) continue
    // Skip binary/no newline notices
    if (raw.startsWith('\\ No newline')) continue

    if (raw.startsWith('+')) {
      currentHunk.lines.push({ type: 'add', content: raw.slice(1), oldLine: null, newLine: newLine++ })
    } else if (raw.startsWith('-')) {
      currentHunk.lines.push({ type: 'remove', content: raw.slice(1), oldLine: oldLine++, newLine: null })
    } else if (raw.startsWith(' ') || raw === '') {
      currentHunk.lines.push({ type: 'context', content: raw.slice(1), oldLine: oldLine++, newLine: newLine++ })
    }
  }

  return hunks
}

function buildUntrackedHunks(content: string): DiffHunk[] {
  const lines = content.split('\n')
  // Remove trailing empty line that split adds
  if (lines[lines.length - 1] === '') lines.pop()

  const diffLines: DiffLine[] = lines.map((text, i) => ({
    type: 'add' as const,
    content: text,
    oldLine: null,
    newLine: i + 1,
  }))

  return [{
    header: `@@ -0,0 +1,${lines.length} @@`,
    oldStart: 0,
    newStart: 1,
    lines: diffLines,
  }]
}

export default defineEventHandler(async (event) => {
  const projectName = getRouterParam(event, 'projectName')
  if (!projectName) {
    throw createError({ statusCode: 400, message: 'Project name is required' })
  }

  const query = getQuery(event)
  const file = query.file as string
  const staged = query.staged === 'true'

  if (!file) {
    throw createError({ statusCode: 400, message: 'file query param is required' })
  }

  const projectPath = await resolveProjectPath(projectName)

  try {
    await validateGitRepository(projectPath)

    // Check if this is an untracked file (no git history → show as full add)
    const { stdout: statusOut } = await spawnAsync(
      'git', ['status', '--porcelain=v1', '--', file], { cwd: projectPath }
    )
    const isUntracked = statusOut.trimStart().startsWith('??')

    let hunks: DiffHunk[]

    if (isUntracked) {
      let content = ''
      try {
        content = await readFile(join(projectPath, file), 'utf-8')
      } catch {
        content = ''
      }
      hunks = buildUntrackedHunks(content)
    } else {
      const args = staged
        ? ['diff', '--cached', '--unified=5', '--', file]
        : ['diff', '--unified=5', '--', file]

      const { stdout } = await spawnAsync('git', args, { cwd: projectPath })
      hunks = parseUnifiedDiff(stdout)
    }

    let addCount = 0
    let removeCount = 0
    for (const hunk of hunks) {
      for (const line of hunk.lines) {
        if (line.type === 'add') addCount++
        else if (line.type === 'remove') removeCount++
      }
    }

    return { file, hunks, addCount, removeCount } satisfies DiffResult
  } catch (error: any) {
    return { file, hunks: [], addCount: 0, removeCount: 0, error: error.message } satisfies DiffResult
  }
})
