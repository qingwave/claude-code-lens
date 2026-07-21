import { listMemory } from '../core.js'
import { bold, cyan, dim, gray, green, magenta, relativeTime, truncate, yellow } from '../ui.js'

const TYPE_COLOR: Record<string, (s: string) => string> = {
  user:      cyan,
  feedback:  yellow,
  project:   green,
  reference: magenta,
}

export async function cmdMemory(args: string[]) {
  const projectArg = args.find(a => !a.startsWith('-'))
  const files = await listMemory(projectArg)

  if (files.length === 0) {
    console.log(dim(projectArg
      ? `  No memory files found for project "${projectArg}"`
      : '  No memory files found'))
    return
  }

  // Group by scope → type
  const scopes = new Map<string, Map<string, typeof files>>()
  for (const f of files) {
    if (!scopes.has(f.scope)) scopes.set(f.scope, new Map())
    const types = scopes.get(f.scope)!
    if (!types.has(f.type)) types.set(f.type, [])
    types.get(f.type)!.push(f)
  }

  console.log()
  for (const [scope, types] of scopes) {
    const scopeLabel = scope === 'global' ? bold('Global') : bold(scope)
    console.log(`  ${scopeLabel}`)
    for (const [type, items] of types) {
      const colorFn = TYPE_COLOR[type] ?? dim
      console.log(`    ${colorFn(type)}`)
      for (const m of items) {
        const name = truncate(m.name, 26).padEnd(26)
        const time = m.mtime ? gray(relativeTime(m.mtime).padEnd(10)) : ''.padEnd(10)
        const desc = m.description ? dim(truncate(m.description, 44)) : ''
        console.log(`      ${green('·')} ${name} ${time} ${desc}`)
      }
    }
    console.log()
  }

  console.log(dim(`  ${files.length} memory file(s) total`))
  console.log()
}
