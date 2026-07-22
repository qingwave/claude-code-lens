import { createRequire } from 'node:module'
import { bold, cyan, dim, green } from './ui.js'
import { cmdSearch } from './commands/search.js'
import { cmdSessions } from './commands/sessions.js'
import { cmdStats } from './commands/stats.js'
import { cmdCleanup } from './commands/cleanup.js'
import { cmdAgents } from './commands/agents.js'
import { cmdMemory } from './commands/memory.js'
import { cmdMcp } from './commands/mcp.js'
import { cmdCommands, cmdSkills } from './commands/commands.js'
import { cmdWorkflows } from './commands/workflows.js'
import { cmdPlugins } from './commands/plugins.js'
import { cmdProjects } from './commands/projects.js'
import { cmdExport } from './commands/export.js'
import { cmdRename } from './commands/rename.js'

const require = createRequire(import.meta.url)
const { version } = require('../../package.json') as { version: string }

type Command = (args: string[]) => Promise<void>

interface CommandDef {
  fn: Command
  usage: string
  desc: string
}

const commands: Record<string, CommandDef> = {
  search:   { fn: cmdSearch,   usage: 'search, -s <query>',       desc: 'Search sessions by content, select to resume' },
  sessions: { fn: cmdSessions, usage: 'sessions [project]',       desc: 'Browse recent sessions, select to resume' },
  export:   { fn: cmdExport,   usage: 'export <id|query>',        desc: 'Export a session to markdown' },
  projects: { fn: cmdProjects, usage: 'projects',                 desc: 'List all projects with session counts' },
  rename:   { fn: cmdRename,   usage: 'rename <old> <new>',       desc: 'Rename a project in ~/.claude' },
  agents:   { fn: cmdAgents,   usage: 'agents [name]',            desc: 'List agents or show one\'s details' },
  commands: { fn: cmdCommands, usage: 'commands',                 desc: 'List custom slash commands' },
  skills:   { fn: cmdSkills,   usage: 'skills',                   desc: 'List skills and their context' },
  workflows:{ fn: cmdWorkflows,usage: 'workflows',                desc: 'List workflows and steps' },
  plugins:  { fn: cmdPlugins,  usage: 'plugins',                  desc: 'List installed plugins' },
  memory:   { fn: cmdMemory,   usage: 'memory [project]',         desc: 'Browse memory files by scope and type' },
  mcp:      { fn: cmdMcp,      usage: 'mcp',                      desc: 'List configured MCP servers' },
  stats:    { fn: cmdStats,    usage: 'stats',                    desc: 'Overview: tokens, cost, activity, usage' },
  cleanup:  { fn: cmdCleanup,  usage: 'cleanup [project]',        desc: 'Remove empty sessions' },
}

const categories: { label: string; keys: string[] }[] = [
  { label: 'Sessions',      keys: ['search', 'sessions', 'export', 'cleanup'] },
  { label: 'Projects',      keys: ['projects', 'rename'] },
  { label: 'Configuration', keys: ['agents', 'commands', 'skills', 'workflows', 'plugins', 'memory', 'mcp'] },
  { label: 'Stats',         keys: ['stats'] },
]

function printHelp() {
  console.log()
  console.log(`  ${bold('CCLens')} ${dim(`v${version}`)}  ${dim('Manage Claude Code config & sessions from UI or CLI')}`)
  console.log()
  console.log(`  ${bold('Usage')}`)
  console.log(`    ${'cclens'.padEnd(20)} ${dim(''.padEnd(16))} Start web UI at http://localhost:3030`)
  console.log(`    ${'cclens --port 8080'.padEnd(20)} ${dim(''.padEnd(16))} Start web UI on custom port`)
  console.log(`    ${'cclens <command>'.padEnd(20)} ${dim('[args]'.padEnd(16))} Run a CLI command`)
  console.log()

  for (const { label, keys } of categories) {
    console.log(`  ${bold(label)}`)
    for (const key of keys) {
      const { usage, desc } = commands[key]!
      console.log(`    ${green(key.padEnd(10))} ${dim(usage.padEnd(26))} ${desc}`)
    }
    console.log()
  }

  console.log(`  ${bold('Other')}`)
  console.log(`    ${green('-v, version')} ${dim(''.padEnd(25))} Print version`)
  console.log(`    ${green('-h, help   ')} ${dim(''.padEnd(25))} Show this help`)
  console.log()
}

async function main() {
  const [, , cmd, ...args] = process.argv

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    printHelp()
    return
  }

  if (cmd === '--version' || cmd === '-v' || cmd === 'version') {
    console.log(`cclens v${version}`)
    return
  }

  if (cmd === '-s') {
    await commands.search!.fn(args)
    return
  }

  const entry = commands[cmd]
  if (!entry) {
    console.error(`\n  Unknown command: ${bold(cmd)}\n`)
    printHelp()
    process.exit(1)
  }

  await entry.fn(args)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
