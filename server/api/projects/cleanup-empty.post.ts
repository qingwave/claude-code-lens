import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const projectName = body?.projectName as string | undefined

  const projectsDir = join(homedir(), '.claude', 'projects')
  let deleted = 0

  try {
    await fs.access(projectsDir)
  } catch {
    return { deleted: 0 }
  }

  async function cleanProject(dir: string) {
    try {
      const files = await fs.readdir(dir)
      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue
        const filePath = join(dir, file)
        const stat = await fs.stat(filePath)
        if (stat.size === 0) {
          await fs.unlink(filePath)
          deleted++
        }
      }
    } catch {
      // skip unreadable dirs
    }
  }

  if (projectName) {
    await cleanProject(join(projectsDir, projectName))
  } else {
    const entries = await fs.readdir(projectsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isDirectory()) {
        await cleanProject(join(projectsDir, entry.name))
      }
    }
  }

  return { deleted }
})
