import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { resolveClaudePath } from '../utils/claudeDir'

export default defineEventHandler(async () => {
  const filePath = resolveClaudePath('MEMORY.md')

  if (!existsSync(filePath)) {
    return { exists: false, content: '', path: filePath }
  }

  try {
    const content = await readFile(filePath, 'utf-8')
    return { exists: true, content, path: filePath }
  } catch (e) {
    console.error('Failed to read global MEMORY.md:', e)
    return { exists: false, content: '', path: filePath }
  }
})
