import { promises as fs, createReadStream } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createInterface } from 'node:readline'
import { getModelPricing } from '../../utils/models'

export interface TokenStats {
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  /** Estimated total cost in USD */
  estimatedCostUsd: number
  /** cache_read / (input + cache_creation + cache_read) */
  cacheHitRate: number
  /** Tokens saved by cache (what would have been input without cache) */
  tokensSavedByCache: number
}

export default defineEventHandler(async (): Promise<TokenStats> => {
  const projectsDir = join(homedir(), '.claude', 'projects')

  let inputTokens = 0
  let outputTokens = 0
  let cacheCreationTokens = 0
  let cacheReadTokens = 0
  let estimatedCostUsd = 0

  try {
    await fs.access(projectsDir)
  } catch {
    return buildResult(0, 0, 0, 0, 0)
  }

  const entries = await fs.readdir(projectsDir, { withFileTypes: true })

  for (const dir of entries) {
    if (!dir.isDirectory()) continue
    const dirPath = join(projectsDir, dir.name)

    let files: string[]
    try {
      files = await fs.readdir(dirPath)
    } catch {
      continue
    }

    const jsonlFiles = files.filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'))

    for (const file of jsonlFiles) {
      const rl = createInterface({
        input: createReadStream(join(dirPath, file)),
        crlfDelay: Infinity,
      })

      try {
        for await (const line of rl) {
          if (!line.trim()) continue
          let obj: Record<string, unknown>
          try {
            obj = JSON.parse(line)
          } catch {
            continue
          }

          const usage = (obj as any).message?.usage
          if (!usage || typeof usage !== 'object') continue

          const inp = (usage.input_tokens as number) || 0
          const out = (usage.output_tokens as number) || 0
          const cacheCreate = (usage.cache_creation_input_tokens as number) || 0
          const cacheRead = (usage.cache_read_input_tokens as number) || 0

          if (inp === 0 && out === 0 && cacheCreate === 0 && cacheRead === 0) continue

          inputTokens += inp
          outputTokens += out
          cacheCreationTokens += cacheCreate
          cacheReadTokens += cacheRead

          const model = (obj as any).message?.model as string | undefined
          const pricing = getModelPricing(model)
          estimatedCostUsd +=
            (inp / 1_000_000) * pricing.input +
            (out / 1_000_000) * pricing.output +
            (cacheCreate / 1_000_000) * pricing.input * 1.25 + // cache write ~25% surcharge
            (cacheRead / 1_000_000) * pricing.cached
        }
      } catch {
        // skip unreadable files
      } finally {
        rl.close()
      }
    }
  }

  return buildResult(inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, estimatedCostUsd)
})

function buildResult(
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number,
  estimatedCostUsd: number,
): TokenStats {
  const totalReadable = inputTokens + cacheCreationTokens + cacheReadTokens
  const cacheHitRate = totalReadable > 0 ? cacheReadTokens / totalReadable : 0
  const tokensSavedByCache = cacheReadTokens
  return {
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    estimatedCostUsd,
    cacheHitRate,
    tokensSavedByCache,
  }
}
