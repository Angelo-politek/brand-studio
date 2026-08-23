#!/usr/bin/env node
/**
 * Packs the two offline icon sources (lucide-static, simple-icons) into
 * generated JSON files instead of shipping ~5440 individual SVG files
 * through Vite's `import.meta.glob`.
 *
 * Why: `import.meta.glob('.../*.svg', { query: '?raw' })` (the old approach
 * in src/renderer/src/lib/icons.ts) makes Rollup emit one chunk per SVG —
 * ~5440 chunks under 4KB each — which bloats the asar and slows app startup
 * (filesystem + require overhead per chunk).
 *
 * Output (all under src/renderer/src/lib/generated/, gitignored, rebuilt
 * from node_modules on every dev/build/test run):
 *  - icon-names.json     tiny: just the two sorted name lists, loaded
 *                         eagerly so the icon picker's search index can be
 *                         built synchronously (matches the old glob-based
 *                         behavior, which listed filenames without reading
 *                         their content).
 *  - lucide-icons.json   name -> raw svg, for all lucide icons.
 *  - simple-icons.json   name -> raw svg, for all simple-icons logos.
 * The two content maps are still lazy: icons.ts dynamic-imports them only
 * when an icon's SVG is actually needed, same as before — just one chunk
 * per source instead of one per icon.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')
const outDir = join(repoRoot, 'src/renderer/src/lib/generated')

function packDir(srcDir, outFile) {
  const files = readdirSync(srcDir).filter((f) => f.endsWith('.svg'))
  const map = {}
  for (const f of files) {
    const name = f.slice(0, -4)
    map[name] = readFileSync(join(srcDir, f), 'utf8')
  }
  writeFileSync(join(outDir, outFile), JSON.stringify(map), 'utf8')
  return Object.keys(map).sort()
}

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

const lucideDir = join(repoRoot, 'node_modules/lucide-static/icons')
const simpleDir = join(repoRoot, 'node_modules/simple-icons/icons')

const lucideNames = packDir(lucideDir, 'lucide-icons.json')
const simpleNames = packDir(simpleDir, 'simple-icons.json')

writeFileSync(
  join(outDir, 'icon-names.json'),
  JSON.stringify({ lucide: lucideNames, simple: simpleNames }),
  'utf8'
)

console.log(`[build-icons] packed ${lucideNames.length} lucide icons -> lucide-icons.json`)
console.log(`[build-icons] packed ${simpleNames.length} simple-icons -> simple-icons.json`)
