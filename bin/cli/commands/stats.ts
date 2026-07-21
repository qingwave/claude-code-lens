import { listProjects, getTokenStats, getRecentSessions, getAgentUsage, listAgents, listSkills, listCommands, listWorkflows, listPlugins, listMcp } from '../core.js'
import { bold, cyan, dim, formatCost, formatTokens, green, gray, relativeTime, truncate, yellow } from '../ui.js'

export async function cmdStats(_args: string[]) {
  process.stdout.write(dim('Loading stats…\n'))
  const [stats, projects, recent, agentUsage, agents, skills, commands, workflows, plugins, mcpServers] = await Promise.all([
    getTokenStats(),
    listProjects(),
    getRecentSessions(6),
    getAgentUsage(),
    listAgents(),
    listSkills(),
    listCommands(),
    listWorkflows(),
    listPlugins(),
    listMcp(),
  ])
  process.stdout.write('\x1b[1A\x1b[2K')

  // Overview
  console.log()
  console.log(bold('  Overview'))
  console.log()
  const overviewItems = [
    ['Projects',  String(projects.length)],
    ['Sessions',  String(stats.sessionCount)],
    ['Agents',    String(agents.length)],
    ['Skills',    String(skills.length)],
    ['Commands',  String(commands.length)],
    ['Workflows', String(workflows.length)],
    ['Plugins',   String(plugins.length)],
    ['MCP',       String(mcpServers.length)],
  ]
  // render in 2 columns
  for (let i = 0; i < overviewItems.length; i += 2) {
    const [l1, v1] = overviewItems[i]!
    const [l2, v2] = overviewItems[i + 1] ?? ['', '']
    const col1 = `${dim(l1!.padEnd(10))} ${cyan(v1!.padStart(5))}`
    const col2 = l2 ? `    ${dim(l2.padEnd(10))} ${cyan(v2!.padStart(5))}` : ''
    console.log(`  ${col1}${col2}`)
  }
  console.log()
  console.log(bold('  Token Usage'))
  console.log()
  console.log(`  ${dim('Input')}        ${cyan(formatTokens(stats.inputTokens).padStart(8))}`)
  console.log(`  ${dim('Output')}       ${cyan(formatTokens(stats.outputTokens).padStart(8))}`)
  if (stats.cacheReadTokens > 0)
    console.log(`  ${dim('Cache read')}   ${dim(formatTokens(stats.cacheReadTokens).padStart(8))}`)
  if (stats.cacheCreationTokens > 0)
    console.log(`  ${dim('Cache write')}  ${dim(formatTokens(stats.cacheCreationTokens).padStart(8))}`)
  console.log()
  console.log(`  ${dim('Est. cost')}    ${yellow(formatCost(stats.estimatedCost).padStart(8))}`)

  // Recent projects
  if (projects.length > 0) {
    console.log()
    console.log(bold('  Recent Projects'))
    console.log()
    for (const p of projects.slice(0, 6)) {
      const name = truncate(p.displayName, 22).padEnd(22)
      const sessions = dim(`${p.sessionsCount} sessions`.padEnd(12))
      const time = p.lastActivity ? gray(relativeTime(p.lastActivity)) : ''
      console.log(`  ${green('·')} ${name} ${sessions} ${time}`)
    }
  }

  // Recent sessions
  if (recent.length > 0) {
    console.log()
    console.log(bold('  Recent Sessions'))
    console.log()
    for (const s of recent) {
      const proj = cyan(truncate(s.projectDisplayName, 12).padEnd(12))
      const time = gray(relativeTime(s.lastActivity).padEnd(9))
      const title = truncate(s.summary, 48)
      console.log(`  ${green('·')} ${proj} ${time} ${title}`)
    }
  }

  // Agent usage
  if (agentUsage.length > 0) {
    console.log()
    console.log(bold('  Agent Usage'))
    console.log()
    for (const a of agentUsage.slice(0, 6)) {
      const name = truncate(a.name, 22).padEnd(22)
      const count = cyan(`${a.sessionCount}`.padStart(4))
      const time = a.lastUsed ? gray(relativeTime(a.lastUsed)) : ''
      console.log(`  ${green('·')} ${name} ${count} uses  ${time}`)
    }
  }

  console.log()
}
