import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

// Minimal .env loader (no dependency). Reads KEY=VALUE lines into process.env.
// Looks in the given roots in order and loads the first .env it finds.
export function loadEnv(roots = [process.cwd()]) {
  for (const root of roots) {
    const file = join(root, '.env')
    if (!existsSync(file)) continue

    try {
      const raw = readFileSync(file, 'utf8')
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue

        const eq = trimmed.indexOf('=')
        if (eq === -1) continue

        const key = trimmed.slice(0, eq).trim()
        let value = trimmed.slice(eq + 1).trim()
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1)
        }
        // Don't clobber values already set in the real environment.
        if (!(key in process.env)) process.env[key] = value
      }
      return file
    } catch (err) {
      console.error('Failed to read .env:', err)
    }
  }
  return null
}
