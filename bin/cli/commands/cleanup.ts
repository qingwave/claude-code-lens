import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { bold, dim, green, red, yellow, confirm } from '../ui.js'

const projectsDir = () => join(process.env.CLAUDE_DIR || join(homedir(), '.claude'), 'projects')

async function cleanProject(dir: string): Promise<{ deleted: number; files: string[] }> {
  let deleted = 0
  const files: string[] = []
  try {
    const entries = await fs.readdir(dir)
    for (const file of entries) {
      if (!file.endsWith('.jsonl')) continue
      const filePath = join(dir, file)
      const stat = await fs.stat(filePath)
      if (stat.size === 0) {
        await fs.unlink(filePath)
        files.push(file.replace('.jsonl', ''))
        deleted++
      }
    }
  } catch { /* skip unreadable */ }
  return { deleted, files }
}

export async function cmdCleanup(args: string[]) {
  const dryRun = args.includes('--dry-run') || args.includes('-n')
  const projectArg = args.find(a => !a.startsWith('-'))

  const dir = projectsDir()
  let totalDeleted = 0

  if (projectArg) {
    const projectDir = join(dir, projectArg)
    try {
      await fs.access(projectDir)
    } catch {
      console.error(`  Project not found: ${projectArg}`)
      process.exit(1)
    }

    if (dryRun) {
      const entries = await fs.readdir(projectDir)
      const empty = []
      for (const f of entries) {
        if (!f.endsWith('.jsonl')) continue
        const stat = await fs.stat(join(projectDir, f))
        if (stat.size === 0) empty.push(f.replace('.jsonl', ''))
      }
      if (empty.length === 0) {
        console.log(dim(`  No empty sessions in ${projectArg}`))
      } else {
        console.log(yellow(`  Would delete ${empty.length} empty session(s) in ${projectArg}:`))
        for (const id of empty) console.log(dim(`    · ${id}`))
      }
      return
    }

    const ok = await confirm(`Delete empty sessions in ${projectArg}?`)
    if (!ok) { console.log(dim('  Cancelled.')); return }

    const { deleted } = await cleanProject(projectDir)
    totalDeleted = deleted
    console.log(`  ${green('✓')} Deleted ${bold(String(deleted))} empty session(s) from ${projectArg}`)
  } else {
    // All projects
    try {
      await fs.access(dir)
    } catch {
      console.log(dim('  No projects directory found'))
      return
    }

    const entries = await fs.readdir(dir, { withFileTypes: true })
    const projects = entries.filter(e => e.isDirectory())

    if (dryRun) {
      let total = 0
      for (const p of projects) {
        const files = await fs.readdir(join(dir, p.name))
        const empty = []
        for (const f of files) {
          if (!f.endsWith('.jsonl')) continue
          const stat = await fs.stat(join(dir, p.name, f))
          if (stat.size === 0) empty.push(f)
        }
        if (empty.length > 0) {
          console.log(yellow(`  ${p.name}: ${empty.length} empty session(s)`))
          total += empty.length
        }
      }
      if (total === 0) console.log(dim('  No empty sessions found'))
      else console.log(dim(`\n  Would delete ${total} session(s) total. Run without --dry-run to clean.`))
      return
    }

    const ok = await confirm(`Delete all empty sessions across all projects?`)
    if (!ok) { console.log(dim('  Cancelled.')); return }

    for (const p of projects) {
      const { deleted } = await cleanProject(join(dir, p.name))
      totalDeleted += deleted
    }
    console.log(`  ${green('✓')} Deleted ${bold(String(totalDeleted))} empty session(s) across all projects`)
  }

  if (totalDeleted === 0) console.log(dim('  No empty sessions found'))
}
