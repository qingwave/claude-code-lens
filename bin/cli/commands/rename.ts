import { renameProject, listProjects, encodePath } from '../core.js'
import { bold, dim, green, red, yellow, cyan, gray, confirm } from '../ui.js'
import { promises as fs } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'

const claudeDir = () => process.env.CLAUDE_DIR || join(homedir(), '.claude')

export async function cmdRename(args: string[]) {
  const oldArg = args[0]
  const newArg = args[1]

  if (!oldArg || !newArg) {
    console.log()
    console.log(`  ${bold('Usage')}`)
    console.log(`    cclens rename ${dim('<old-path>')} ${dim('<new-path>')}`)
    console.log()
    console.log(`  ${dim('Example')}`)
    console.log(`    cclens rename ~/work/old-name ~/work/new-name`)
    console.log()
    console.log(`  ${dim('Note: move the actual project directory first, then run this command.')}`)
    console.log()
    const projects = await listProjects()
    if (projects.length > 0) {
      console.log(`  ${bold('Available projects')}`)
      for (const p of projects.slice(0, 10)) {
        console.log(`    ${green('·')} ${cyan(p.displayName.padEnd(20))} ${dim(p.path)}`)
      }
      console.log()
    }
    process.exit(1)
  }

  const expand = (p: string) => {
    const expanded = p.startsWith('~') ? p.replace('~', process.env.HOME ?? homedir()) : p
    return resolve(expanded)
  }
  const oldPath = expand(oldArg)
  const newPath = expand(newArg)

  console.log()

  // Check 1: old ~/.claude/projects entry must exist
  const oldEncoded = encodePath(oldPath)
  const oldClaudeDir = join(claudeDir(), 'projects', oldEncoded)
  const oldClaudeExists = await fs.access(oldClaudeDir).then(() => true).catch(() => false)
  if (!oldClaudeExists) {
    console.error(`  ${red('✗')} No Claude project found for: ${oldPath}`)
    console.error(`    ${dim(`Expected: ~/.claude/projects/${oldEncoded}`)}`)
    console.log()
    process.exit(1)
  }
  console.log(`  ${green('✓')} Old Claude project found: ${gray(oldEncoded)}`)

  // Check 2: new path must actually exist on disk (user must mv first)
  const newPathExists = await fs.access(newPath).then(() => true).catch(() => false)
  if (!newPathExists) {
    console.error(`  ${red('✗')} New path does not exist on disk: ${newPath}`)
    console.error(`    ${dim('Please move the project directory first:')}`)
    console.error(`    ${dim(`  mv ${oldPath} ${newPath}`)}`)
    console.log()
    process.exit(1)
  }
  console.log(`  ${green('✓')} New path exists on disk: ${gray(newPath)}`)

  // Check 3: new ~/.claude/projects entry must NOT already exist
  const newEncoded = encodePath(newPath)
  const newClaudeDir = join(claudeDir(), 'projects', newEncoded)
  const newClaudeExists = await fs.access(newClaudeDir).then(() => true).catch(() => false)
  if (newClaudeExists) {
    console.error(`  ${red('✗')} Target Claude project already exists: ${gray(newEncoded)}`)
    console.log()
    process.exit(1)
  }

  console.log()
  console.log(`  ${dim('Renaming')}  ${oldPath}`)
  console.log(`  ${dim('      →')}   ${newPath}`)
  console.log()

  const ok = await confirm(`Rename this project in ~/.claude?`)
  if (!ok) {
    console.log(dim('  Cancelled.'))
    console.log()
    return
  }
  console.log()

  try {
    const { warnings } = await renameProject(oldPath, newPath)
    console.log(`  ${green('✓')} Renamed ~/.claude/projects entry successfully`)
    console.log()
    for (const w of warnings) {
      console.log(`  ${yellow('!')} ${dim(w)}`)
    }
    console.log()
  } catch (err: any) {
    console.error(`  ${red('✗')} ${err.message}`)
    process.exit(1)
  }
}
