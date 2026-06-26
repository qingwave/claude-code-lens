import { writeFile } from 'node:fs/promises'
import { resolveClaudePath } from '../utils/claudeDir'

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const { content } = body

  if (typeof content !== 'string') {
    throw createError({ statusCode: 400, message: 'Content is required' })
  }

  const filePath = resolveClaudePath('CLAUDE.md')

  try {
    await writeFile(filePath, content, 'utf-8')
    return { success: true, path: filePath }
  } catch (e: any) {
    console.error('Failed to write global CLAUDE.md:', e)
    throw createError({ statusCode: 500, message: `Failed to save CLAUDE.md: ${e.message}` })
  }
})
