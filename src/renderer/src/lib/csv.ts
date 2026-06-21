export interface ParsedCsv {
  headers: string[]
  rows: Record<string, string>[]
}

function parseLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else quoted = false
      } else cur += c
    } else if (c === ',') {
      out.push(cur)
      cur = ''
    } else if (c === '"') {
      quoted = true
    } else cur += c
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

/** Minimal CSV parser: handles quotes and commas (not embedded newlines). */
export function parseCsv(text: string): ParsedCsv {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }
  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map((line) => {
    const cells = parseLine(line)
    const r: Record<string, string> = {}
    headers.forEach((h, i) => {
      r[h] = cells[i] ?? ''
    })
    return r
  })
  return { headers, rows }
}
