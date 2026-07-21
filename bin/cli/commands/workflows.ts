import { listWorkflows } from '../core.js'
import { bold, cyan, dim, green, gray, relativeTime, truncate } from '../ui.js'

export async function cmdWorkflows(_args: string[]) {
  const workflows = await listWorkflows()
  if (workflows.length === 0) {
    console.log(dim('  No workflows found in ~/.claude/workflows/'))
    return
  }
  console.log()
  for (const w of workflows) {
    const name = bold(truncate(w.name, 28).padEnd(28))
    const steps = cyan(`${w.steps.length} steps`.padEnd(9))
    const time = w.createdAt ? gray(relativeTime(w.createdAt)) : ''
    const desc = w.description ? `\n     ${dim(truncate(w.description, 60))}` : ''
    console.log(`  ${green('·')} ${name} ${steps} ${time}${desc}`)
    for (const step of w.steps) {
      console.log(`     ${dim('→')} ${step.label} ${gray(`[${step.agentSlug}]`)}`)
    }
    console.log()
  }
  console.log(dim(`  ${workflows.length} workflow(s) in ~/.claude/workflows/`))
  console.log()
}
