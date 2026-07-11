#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const root = resolve(fileURLToPath(import.meta.url), '../..')
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

const port = process.env.PORT || '3030'
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
