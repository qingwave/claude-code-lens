import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { resolveHome } from '../../utils/path'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const path = query.path as string

  if (!path) {
    throw createError({ statusCode: 400, message: 'Path is required' })
  }

  const expandedPath = resolveHome(path)
  const memoryMdPath = join(expandedPath, 'MEMORY.md')

  if (!existsSync(memoryMdPath)) {
    return { exists: false, content: '', path: memoryMdPath }
  }

  try {
    const content = await readFile(memoryMdPath, 'utf-8')
    return { exists: true, content, path: memoryMdPath }
  } catch (e) {
    console.error(`Failed to read project MEMORY.md for ${path}:`, e)
    return { exists: false, content: '', path: memoryMdPath }
  }
})
