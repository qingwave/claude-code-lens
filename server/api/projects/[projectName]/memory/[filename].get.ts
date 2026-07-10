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
    const content = await fs.readFile(filePath, 'utf-8')
    const stat = await fs.stat(filePath)
    return { filename, content, mtime: stat.mtime.toISOString(), path: filePath }
  } catch {
    throw createError({ statusCode: 404, message: `File not found: ${filename}` })
  }
})
