import { listPlugins } from '../core.js'
import { bold, cyan, dim, green, gray, relativeTime, truncate } from '../ui.js'

export async function cmdPlugins(_args: string[]) {
  const plugins = await listPlugins()
  if (plugins.length === 0) {
    console.log(dim('  No plugins installed in ~/.claude/plugins/'))
    return
  }
  console.log()
  for (const p of plugins) {
    const name = bold(truncate(p.name, 28).padEnd(28))
    const version = cyan(`v${p.version}`.padEnd(10))
    const scope = dim(p.scope.padEnd(8))
    const time = p.installedAt ? gray(relativeTime(p.installedAt)) : ''
    console.log(`  ${green('·')} ${name} ${version} ${scope} ${time}`)
  }
  console.log()
  console.log(dim(`  ${plugins.length} plugin(s) installed`))
  console.log()
}
