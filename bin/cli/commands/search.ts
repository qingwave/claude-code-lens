import { spawnSync } from 'node:child_process'
import { searchSessions } from '../core.js'
import { bold, cyan, dim, gray, green, relativeTime, truncate, pick } from '../ui.js'

export async function cmdSearch(args: string[]) {
  const query = args.filter(a => !a.startsWith('-')).join(' ')

  if (!query) {
    console.error('Usage: cclens search <query>')
    process.exit(1)
  }

  process.stdout.write(dim(`Searching for "${query}"…\n`))
  const results = await searchSessions(query)
  process.stdout.write('\x1b[1A\x1b[2K')

  if (results.length === 0) {
    console.log(dim(`No results for "${query}"`))
    return
  }

  console.log(dim(`\n  ${results.length} result${results.length > 1 ? 's' : ''} — ↑↓ navigate  →/← page  ↵ resume  q quit\n`))

  const chosen = await pick(results, (r, selected, i) => {
    const cursor = selected ? green('❯') : ' '
    const num = dim(`${String(i + 1).padStart(3)}.`)
    const proj = cyan(truncate(r.projectDisplayName, 14).padEnd(14))
    const time = gray(relativeTime(r.lastActivity).padEnd(9))
    const title = selected ? bold(truncate(r.summary, 50)) : truncate(r.summary, 50)
    const snippet = r.matchedText ? `\n   ${dim(truncate(r.matchedText, 76))}` : ''
    return `${cursor} ${num} ${proj} ${time} ${title}${snippet}`
  }, 8)

  if (!chosen) {
    console.log(dim('\nCancelled.'))
    return
  }

  console.log(`\n${green('✓')} Resuming ${bold(truncate(chosen.summary, 60))}`)
  console.log(dim(`  Session: ${chosen.sessionId}\n`))

  spawnSync('claude', ['--resume', chosen.sessionId], { stdio: 'inherit', cwd: chosen.cwd })
}
