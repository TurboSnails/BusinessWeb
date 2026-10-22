// Export the exact merged company universe used by the research UI; no network or live prices.
import { createServer } from 'vite'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const args = process.argv.slice(2)
const output = resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : '.local/comprehensive-valuation')
const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
  const { resolveMarket } = await server.ssrLoadModule('/src/data/companyCore.ts')
  await mkdir(output, { recursive: true })
  const universe = []
  for (const market of ['us', 'cn', 'hk', 'adr', 'ndx']) {
    let generated = []
    try { generated = JSON.parse(await readFile(`public/data/${market}.json`, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
    const rows = (await resolveMarket(market)).merge(generated)
    universe.push(...rows)
    await writeFile(resolve(output, `${market}.json`), JSON.stringify(rows, null, 2))
    console.log(`${market}: ${rows.length}`)
  }
  await writeFile(resolve(output, 'universe.json'), JSON.stringify(universe, null, 2))
  console.log(`Total: ${universe.length}`)
} finally { await server.close() }
