#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync, spawnSync } from 'node:child_process'

const root = resolve(fileURLToPath(import.meta.url), '../..')

// Parse args: --port/-p starts server with custom port, anything else → CLI mode
const args = process.argv.slice(2)
const portFlagIdx = args.findIndex(a => a === '--port' || a === '-p')
let customPort = null
if (portFlagIdx !== -1) {
  customPort = args[portFlagIdx + 1]
  args.splice(portFlagIdx, 2)
}
// Also handle --port=3031 form
const portEqArg = args.find(a => a.startsWith('--port='))
if (portEqArg) {
  customPort = portEqArg.split('=')[1]
  args.splice(args.indexOf(portEqArg), 1)
}

const firstArg = args[0]
if (firstArg) {
  const cliEntry = resolve(root, 'bin', 'dist', 'cli.js')
  if (!existsSync(cliEntry)) {
    console.error('CLI not built. Run: bun run build:cli')
    process.exit(1)
  }
  const result = spawnSync(process.execPath, [cliEntry, ...process.argv.slice(2)], { stdio: 'inherit' })
  process.exit(result.status ?? 0)
}
const outputServer = resolve(root, '.output', 'server', 'index.mjs')

if (!existsSync(outputServer)) {
  console.log('Building cclens...')
  try {
    execSync('npx nuxi build', { cwd: root, stdio: 'inherit' })
  } catch (err) {
    console.error('Build failed. Please run `bun run build` manually and check for errors.')
    process.exit(1)
  }
}

const port = customPort || process.env.PORT || '3030'
process.env.PORT = port
process.env.HOST = process.env.HOST || 'localhost'

const reset  = '\x1b[0m'
const bold   = '\x1b[1m'
const dim    = '\x1b[2m'
const cyan   = '\x1b[38;2;232;137;91m'
const yellow = '\x1b[33m'
const green  = '\x1b[32m'

console.log('')
console.log(`${cyan}${bold}   ██████╗ ██████╗██╗     ███████╗███╗   ██╗███████╗${reset}`)
console.log(`${cyan}${bold}  ██╔════╝██╔════╝██║     ██╔════╝████╗  ██║██╔════╝${reset}`)
console.log(`${cyan}${bold}  ██║     ██║     ██║     █████╗  ██╔██╗ ██║███████╗${reset}`)
console.log(`${cyan}${bold}  ██║     ██║     ██║     ██╔══╝  ██║╚██╗██║╚════██║${reset}`)
console.log(`${cyan}${bold}  ╚██████╗╚██████╗███████╗███████╗██║ ╚████║███████║${reset}`)
console.log(`${cyan}${bold}   ╚═════╝ ╚═════╝╚══════╝╚══════╝╚═╝  ╚═══╝╚══════╝${reset}`)
console.log('')
console.log(`${bold}  Claude Code Lens${reset}  ${dim}v0.1.0${reset}`)
console.log(`${dim}  Visual dashboard for managing Claude Code agents,${reset}`)
console.log(`${dim}  commands, skills, workflows and plugins.${reset}`)
console.log('')
console.log(`  ${dim}Docs     ${reset}${yellow}https://github.com/qingwave/claude-code-lens${reset}`)
console.log(`  ${dim}Config   ${reset}${dim}~/.claude${reset}`)
console.log(`  ${dim}Port     ${reset}${dim}${port}${reset}`)
console.log('')
console.log(`  ${green}✓${reset} Ready at ${bold}http://localhost:${port}${reset}`)
console.log('')

await import(outputServer)

// Open browser after server starts
setTimeout(() => {
  const url = `http://localhost:${port}`
  const cmd = process.platform === 'darwin' ? `open ${url}`
    : process.platform === 'win32' ? `start ${url}`
    : `xdg-open ${url}`
  execSync(cmd, { stdio: 'ignore' })
}, 1000)
