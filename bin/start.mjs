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

console.log(`Starting cclens on http://localhost:${port}`)

await import(outputServer)
