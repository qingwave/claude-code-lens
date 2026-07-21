import { listAgents } from '../core.js'
import { bold, cyan, dim, gray, green, magenta, truncate } from '../ui.js'

export async function cmdAgents(args: string[]) {
  const showArg = args.find(a => !a.startsWith('-'))

  const agents = await listAgents()
  if (agents.length === 0) {
    console.log(dim('  No agents found in ~/.claude/agents/'))
    return
  }

  if (showArg) {
    const agent = agents.find(a => a.slug === showArg || a.name === showArg)
    if (!agent) {
      console.error(`  Agent not found: ${showArg}`)
      process.exit(1)
    }
    console.log()
    console.log(`  ${bold(agent.name)}  ${dim(agent.slug)}`)
    if (agent.model) console.log(`  ${dim('model')}   ${cyan(agent.model)}`)
    if (agent.color) console.log(`  ${dim('color')}   ${agent.color}`)
    if (agent.description) console.log(`  ${dim('desc')}    ${agent.description}`)
    console.log()
    if (agent.body) {
      console.log(dim('  ─── instructions ───'))
      console.log()
      for (const line of agent.body.split('\n').slice(0, 30)) {
        console.log(`  ${dim(line)}`)
      }
      if (agent.body.split('\n').length > 30) console.log(dim('  …'))
    }
    console.log()
    return
  }

  console.log()
  for (const a of agents) {
    const model = a.model ? cyan(a.model.padEnd(8)) : dim('default '.padEnd(8))
    const name = bold(a.name.padEnd(20))
    const desc = a.description ? gray(truncate(a.description, 50)) : ''
    console.log(`  ${green('·')} ${name} ${model} ${desc}`)
  }
  console.log()
  console.log(dim(`  ${agents.length} agent(s)  ·  cclens agents <name> to inspect`))
  console.log()
}
