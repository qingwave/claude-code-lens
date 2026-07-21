import { listMcp } from '../core.js'
import { bold, cyan, dim, green, gray, truncate } from '../ui.js'

export async function cmdMcp(_args: string[]) {
  const servers = await listMcp()

  if (servers.length === 0) {
    console.log(dim('  No MCP servers configured in ~/.claude/settings.json'))
    return
  }

  console.log()
  for (const s of servers) {
    const name = bold(s.name.padEnd(24))
    const type = cyan(s.type.padEnd(8))
    const detail = s.command ? gray(truncate(s.command, 48)) : s.url ? gray(truncate(s.url, 48)) : ''
    console.log(`  ${green('·')} ${name} ${type} ${detail}`)
  }
  console.log()
  console.log(dim(`  ${servers.length} MCP server(s) configured`))
  console.log()
}
