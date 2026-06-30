import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, isAbsolute, extname } from 'node:path'
import { getClaudeDir } from '../../utils/claudeDir'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const path = query.path as string

  if (!path) {
    throw createError({ statusCode: 400, message: 'Path is required' })
  }

  const claudeDir = getClaudeDir()
  const fullPath = isAbsolute(path) ? path : join(claudeDir, path)

  if (!existsSync(fullPath)) {
    throw createError({ statusCode: 404, message: `File not found: ${fullPath}` })
  }

  const ext = extname(fullPath).toLowerCase()
  const mime = MIME[ext]

  if (!mime) {
    throw createError({ statusCode: 400, message: 'Not a supported image type' })
  }

  try {
    const buffer = await readFile(fullPath)
    setHeader(event, 'Content-Type', mime)
    setHeader(event, 'Cache-Control', 'public, max-age=60')
    return buffer
  } catch (err: any) {
    throw createError({ statusCode: 500, message: `Failed to read file: ${err.message}` })
  }
})
