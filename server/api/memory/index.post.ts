import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { resolveClaudePath } from '../../utils/claudeDir'
import { serializeFrontmatter } from '../../utils/frontmatter'

export default defineEventHandler(async (event) => {
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

  // Sanitize filename
  const filename = name.replace(/[^a-z0-9_-]/gi, '-').replace(/-+/g, '-').toLowerCase() + '.md'
  const filePath = join(resolveClaudePath('memory'), filename)

  // Don't overwrite existing
  try {
    await fs.access(filePath)
    throw createError({ statusCode: 409, message: `Memory file already exists: ${filename}` })
  } catch (e: any) {
    if (e.statusCode === 409) throw e
    // file doesn't exist — proceed
  }

  await fs.mkdir(resolveClaudePath('memory'), { recursive: true })

  const frontmatter = {
    name,
    description: description || '',
    ...(type ? { type } : {}),
  }

  const body_text = content || ''
  const fileContent = serializeFrontmatter(frontmatter, body_text)

  await fs.writeFile(filePath, fileContent, 'utf-8')
  return { filename, path: filePath }
})
