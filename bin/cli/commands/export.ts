import { promises as fs } from 'node:fs'
import { searchSessions, getSessionMessages } from '../core.js'
import { bold, dim, green, gray, red, relativeTime, truncate, pick } from '../ui.js'

export async function cmdExport(args: string[]) {
  // parse -o / --output
  let outputPath: string | undefined
  const oIdx = args.findIndex(a => a === '-o' || a === '--output')
  if (oIdx !== -1) {
    outputPath = args[oIdx + 1]
    args.splice(oIdx, 2)
  }
  const eqArg = args.find(a => a.startsWith('--output='))
  if (eqArg) {
    outputPath = eqArg.split('=')[1]
    args.splice(args.indexOf(eqArg), 1)
  }

  const query = args.filter(a => !a.startsWith('-')).join(' ')

  if (!query) {
    console.log()
    console.log(`  ${bold('Usage')}`)
    console.log(`    cclens export ${dim('<sessionId|query>')} ${dim('[-o file.md]')}`)
    console.log()
    console.log(`  ${dim('Examples')}`)
    console.log(`    cclens export "fix login bug"            ${dim('# search and pick interactively')}`)
    console.log(`    cclens export abc123 -o session.md       ${dim('# export by session ID to file')}`)
    console.log(`    cclens export "auth" -o auth.md          ${dim('# search, pick, save to file')}`)
    console.log()
    process.exit(1)
  }

  // Try as sessionId first (UUID format)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query)
  let sessionId: string
  let summary = query

  if (isUuid) {
    sessionId = query
  } else {
    process.stdout.write(dim(`Searching for "${query}"…\n`))
    const results = await searchSessions(query)
    process.stdout.write('\x1b[1A\x1b[2K')

    if (results.length === 0) {
      console.log(dim(`  No sessions found for "${query}"`))
      return
    }

    if (results.length === 1) {
      sessionId = results[0]!.sessionId
      summary = results[0]!.summary
    } else {
      // interactive picker
      console.log(dim(`\n  ${results.length} results — select one to export\n`))
      const chosen = await pick(results, (r, selected, i) => {
        const cursor = selected ? green('❯') : ' '
        const num = dim(`${String(i + 1).padStart(3)}.`)
        const proj = `\x1b[36m${truncate(r.projectDisplayName, 14).padEnd(14)}\x1b[0m`
        const time = gray(relativeTime(r.lastActivity).padEnd(9))
        const title = selected ? bold(truncate(r.summary, 50)) : truncate(r.summary, 50)
        const snippet = r.matchedText ? `\n   ${dim(truncate(r.matchedText, 76))}` : ''
        return `${cursor} ${num} ${proj} ${time} ${title}${snippet}`
      }, 8)

      if (!chosen) {
        console.log(dim('\n  Cancelled.'))
        return
      }
      sessionId = chosen.sessionId
      summary = chosen.summary
    }
  }

  process.stdout.write(dim('Loading messages…\n'))
  const messages = await getSessionMessages(sessionId)
  process.stdout.write('\x1b[1A\x1b[2K')

  if (messages.length === 0) {
    console.error(`  ${red('✗')} No messages found for session ${sessionId}`)
    return
  }

  // Build clean markdown (no ANSI codes)
  const lines: string[] = [
    `# ${summary}`,
    '',
    `> Session ID: \`${sessionId}\``,
    '',
    '---',
    '',
  ]

  for (const msg of messages) {
    const role = msg.role === 'user' ? '**User**' : '**Assistant**'
    const time = msg.timestamp ? `  *${new Date(msg.timestamp).toLocaleString()}*` : ''
    lines.push(`${role}${time}`)
    lines.push('')
    lines.push(msg.text)
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  const content = lines.join('\n')

  if (outputPath) {
    await fs.writeFile(outputPath, content, 'utf8')
    console.log(`\n  ${green('✓')} Exported ${bold(String(messages.length))} messages to ${bold(outputPath)}`)
    console.log(`  ${dim(`Session: ${sessionId}`)}`)
    console.log()
  } else {
    process.stdout.write(content)
  }
}
