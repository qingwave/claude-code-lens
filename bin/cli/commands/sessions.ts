import { spawnSync } from 'node:child_process'
import { listSessions } from '../core.js'
import { bold, cyan, dim, gray, green, relativeTime, truncate, pick } from '../ui.js'

export async function cmdSessions(args: string[]) {
  const projectArg = args.find(a => !a.startsWith('-'))

  const sessions = await listSessions(projectArg)

  if (sessions.length === 0) {
    console.log(dim(projectArg ? `No sessions found for project "${projectArg}"` : 'No sessions found'))
    return
  }

  console.log(dim(`\n  ${sessions.length} session${sessions.length > 1 ? 's' : ''} — ↑↓ navigate  →/← page  ↵ resume  q quit\n`))

  const chosen = await pick(sessions, (s, selected, i) => {
    const cursor = selected ? green('❯') : ' '
    const num = dim(`${String(i + 1).padStart(3)}.`)
    const proj = cyan(truncate(s.projectDisplayName, 14).padEnd(14))
    const time = gray(relativeTime(s.lastActivity).padEnd(9))
    const msgs = dim(`${s.messageCount}msg`.padEnd(6))
    const title = selected ? bold(truncate(s.summary, 50)) : truncate(s.summary, 50)
    return `${cursor} ${num} ${proj} ${time} ${msgs} ${title}`
  }, 10)

  if (!chosen) {
    console.log(dim('\nCancelled.'))
    return
  }

  console.log(`\n${green('✓')} Resuming ${bold(truncate(chosen.summary, 60))}`)
  console.log(dim(`  Session: ${chosen.sessionId}\n`))

  spawnSync('claude', ['--resume', chosen.id], { stdio: 'inherit', cwd: chosen.cwd })
}
