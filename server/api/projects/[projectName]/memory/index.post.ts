import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { resolveClaudePath } from '../../../../utils/claudeDir'
import { serializeFrontmatter } from '../../../../utils/frontmatter'

export default defineEventHandler(async (event) => {
  const projectName = getRouterParam(event, 'projectName')
  if (!projectName || projectName.includes("..") || projectName.includes("/")) {
    throw createError({ statusCode: 400, message: 'Missing projectName' })
  }

  const body = await readBody(event)
  const { name, type, description, content } = body as {
    name: string
    type: string
    description?: string
    content?: string
  }

  if (!name || typeof name !== 'string') {
    throw createError({ statusCode: 400, message: 'name is required' })
  }

  const filename = name.replace(/[^a-z0-9_-]/gi, '-').replace(/-+/g, '-').toLowerCase() + '.md'
  const memoryDir = resolveClaudePath('projects', projectName, 'memory')
  const filePath = join(memoryDir, filename)

  try {
    await fs.access(filePath)
    throw createError({ statusCode: 409, message: `Memory file already exists: ${filename}` })
  } catch (e: any) {
    if (e.statusCode === 409) throw e
  }

  await fs.mkdir(memoryDir, { recursive: true })

  const frontmatter = {
    name,
    description: description || '',
    ...(type ? { type } : {}),
  }

  const fileContent = serializeFrontmatter(frontmatter, content || '')
  await fs.writeFile(filePath, fileContent, 'utf-8')
  return { filename, path: filePath }
})
