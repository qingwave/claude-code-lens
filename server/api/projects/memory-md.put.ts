import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resolveHome } from '../../utils/path'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { path, content } = body

  if (!path) {
    throw createError({ statusCode: 400, message: 'Path is required' })
  }

  if (typeof content !== 'string') {
    throw createError({ statusCode: 400, message: 'Content is required' })
  }

  const expandedPath = resolveHome(path)
  const memoryMdPath = join(expandedPath, 'MEMORY.md')

  try {
    await writeFile(memoryMdPath, content, 'utf-8')
    return { success: true, path: memoryMdPath }
  } catch (e: any) {
    console.error(`Failed to write project MEMORY.md for ${path}:`, e)
    throw createError({ statusCode: 500, message: `Failed to save MEMORY.md: ${e.message}` })
  }
})

