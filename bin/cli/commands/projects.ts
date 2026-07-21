import { listProjects } from '../core.js'
import { bold, cyan, dim, green, gray, relativeTime, truncate } from '../ui.js'

export async function cmdProjects(_args: string[]) {
  const projects = await listProjects()
  if (projects.length === 0) {
    console.log(dim('  No projects found in ~/.claude/projects/'))
    return
  }
  console.log()
  for (const p of projects) {
    const name = bold(truncate(p.displayName, 24).padEnd(24))
    const sessions = cyan(`${p.sessionsCount} sessions`.padEnd(12))
    const time = p.lastActivity ? gray(relativeTime(p.lastActivity)) : ''
    console.log(`  ${green('·')} ${name} ${sessions} ${time}`)
    console.log(`     ${dim(p.path)}`)
  }
  console.log()
  console.log(dim(`  ${projects.length} project(s) in ~/.claude/projects/`))
  console.log()
}
