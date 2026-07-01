import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { resolveClaudePath } from '../../utils/claudeDir'
import { parseFrontmatter } from '../../utils/frontmatter'

export interface MemoryFileMeta {
  filename: string
  name: string
  description: string
  type: 'user' | 'feedback' | 'project' | 'reference' | string
  size: number
  mtime: string
}

export default defineEventHandler(async (): Promise<MemoryFileMeta[]> => {
  const memoryDir = resolveClaudePath('memory')

  try {
    await fs.access(memoryDir)
  } catch {
    return []
  }

  const entries = await fs.readdir(memoryDir, { withFileTypes: true })
  const mdFiles = entries.filter(e => e.isFile() && e.name.endsWith('.md'))

  const results: MemoryFileMeta[] = []

  for (const entry of mdFiles) {
    const filePath = join(memoryDir, entry.name)
    try {
      const [content, stat] = await Promise.all([
        fs.readFile(filePath, 'utf-8'),
        fs.stat(filePath),
      ])
      const { frontmatter } = parseFrontmatter<{
        name?: string
        description?: string
        type?: string
      }>(content)

      results.push({
        filename: entry.name,
        name: frontmatter.name || entry.name.replace(/\.md$/, ''),
        description: frontmatter.description || '',
        type: frontmatter.type || 'user',
        size: stat.size,
        mtime: stat.mtime.toISOString(),
      })
    } catch {
      // skip unreadable files
    }
  }

  results.sort((a, b) => b.mtime.localeCompare(a.mtime))
  return results
})
