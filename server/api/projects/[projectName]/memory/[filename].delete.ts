import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { resolveClaudePath } from '../../../../utils/claudeDir'

export default defineEventHandler(async (event) => {
  const projectName = getRouterParam(event, 'projectName')
  const filename = getRouterParam(event, 'filename')

  if (!projectName || projectName.includes("..") || projectName.includes("/")) {
    throw createError({ statusCode: 400, message: 'Missing projectName' })
  }
  if (!filename || !filename.endsWith('.md') || filename.includes('/') || filename.includes('..')) {
    throw createError({ statusCode: 400, message: 'Invalid filename' })
  }

  const filePath = join(resolveClaudePath('projects', projectName, 'memory'), filename)
  try {
    await fs.unlink(filePath)
    return { success: true }
  } catch {
    throw createError({ statusCode: 404, message: `File not found: ${filename}` })
  }
})
