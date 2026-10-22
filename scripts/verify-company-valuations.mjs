// Cross-check batch coverage, the skill's portable contract and the exact browser parser.
import { readFile, access } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import ts from 'typescript'
// The parser only imports types. Transpile it locally instead of starting a dev server.
const source = (await readFile('src/features/company-valuation/model.ts', 'utf8')).replaceAll('import.meta.env.BASE_URL', JSON.stringify('/'))
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const moduleExports = {}
new Function('exports', compiled)(moduleExports)
const { parseValuationDocument } = moduleExports
const summary = []
for (const market of ['us', 'cn', 'hk', 'adr', 'ndx']) {
  const file = `public/data/company-valuations/${market}.json`
  const universeFile = `public/research/comprehensive-valuation-2026-10-22/universe-${market}.json`
  execFileSync('python3', ['-B', '.agents/skills/comprehensive-equity-valuation/scripts/validate_records.py', file, '--universe', universeFile], { stdio: 'pipe' })
  const doc = JSON.parse(await readFile(file, 'utf8'))
  const universe = JSON.parse(await readFile(universeFile, 'utf8'))
  const parsed = parseValuationDocument(doc, market)
  if (parsed.size !== universe.length) throw new Error(`${market}: browser parser accepted ${parsed.size}/${universe.length}`)
  const paths = new Set(doc.records.flatMap(r => r.sources.map(s => s.url)).filter(s => !/^https?:\/\//i.test(s)))
  for (const path of paths) {
    if (path.startsWith('.local/')) throw new Error(`${market}: source is not archived: ${path}`)
    await access(resolve(path.startsWith('research/') || path.startsWith('data/') ? `public/${path}` : path))
  }
  const status = {}, kinds = {}, methods = {}
  for (const r of doc.records) {
    status[r.status] = (status[r.status] ?? 0) + 1
    if (r.value) { kinds[r.value.kind] = (kinds[r.value.kind] ?? 0) + 1; methods[r.value.primaryMethod] = (methods[r.value.primaryMethod] ?? 0) + 1 }
  }
  summary.push({ market, records: doc.records.length, status, kinds, methods })
}
console.log(JSON.stringify({ ok: true, total: summary.reduce((n, s) => n + s.records, 0), markets: summary }, null, 2))
