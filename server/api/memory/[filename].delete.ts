import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { resolveClaudePath } from '../../utils/claudeDir'

export default defineEventHandler(async (event) => {
  const filename = getRouterParam(event, 'filename')
  if (!filename || !filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    throw createError({ statusCode: 400, message: 'Invalid filename' })
  }

  const filePath = join(resolveClaudePath('memory'), filename)
  try {
    await fs.unlink(filePath)
    return { success: true }
  } catch {
    throw createError({ statusCode: 404, message: `File not found: ${filename}` })
  }
})
