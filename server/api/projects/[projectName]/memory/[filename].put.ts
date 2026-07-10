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

  const body = await readBody(event)
  const { content } = body as { content: string }
  if (typeof content !== 'string') {
    throw createError({ statusCode: 400, message: 'content is required' })
  }

  const memoryDir = resolveClaudePath('projects', projectName, 'memory')
  await fs.mkdir(memoryDir, { recursive: true })
  const filePath = join(memoryDir, filename)
  await fs.writeFile(filePath, content, 'utf-8')
  return { filename, path: filePath }
})
