import { listCommands, listSkills } from '../core.js'
import { bold, cyan, dim, gray, green, truncate, yellow } from '../ui.js'

export async function cmdCommands(args: string[]) {
  const commands = await listCommands()
  if (commands.length === 0) {
    console.log(dim('  No commands found in ~/.claude/commands/'))
    return
  }
  console.log()
  for (const c of commands) {
    const name = green(`/${c.name}`.padEnd(22))
    const hint = c.argumentHint ? cyan(truncate(c.argumentHint, 16).padEnd(16)) : ''.padEnd(16)
    const desc = c.description ? dim(truncate(c.description, 44)) : ''
    const agent = c.agent ? gray(` [${c.agent}]`) : ''
    console.log(`  ${name} ${hint} ${desc}${agent}`)
  }
  console.log()
  console.log(dim(`  ${commands.length} command(s) in ~/.claude/commands/`))
  console.log()
}

export async function cmdSkills(args: string[]) {
  const skills = await listSkills()
  if (skills.length === 0) {
    console.log(dim('  No skills found in ~/.claude/skills/'))
    return
  }
  console.log()
  for (const s of skills) {
    const name = bold(truncate(s.name, 24).padEnd(24))
    const ctx = s.context ? yellow(s.context.padEnd(8)) : dim('—'.padEnd(8))
    const desc = s.description ? dim(truncate(s.description, 48)) : ''
    const agent = s.agent ? gray(` [${s.agent}]`) : ''
    console.log(`  ${green('·')} ${name} ${ctx} ${desc}${agent}`)
  }
  console.log()
  console.log(dim(`  ${skills.length} skill(s) in ~/.claude/skills/`))
  console.log()
}
