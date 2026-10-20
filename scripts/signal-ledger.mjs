// 信号台账：把当天的研究评级、价格、自动 DCF 与机会雷达信号存为一期快照（每周一期），
// 写入 public/data/signal-ledger-YYYY.json，供机会雷达页的「信号复盘」事后检验。
// 用法：node scripts/signal-ledger.mjs [YYYY-MM-DD]（默认今天，上海时间）
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const date = process.argv[2] ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Invalid date: ${date}`)
const read = async (name) => JSON.parse(await readFile(`${root}/${name}`, 'utf8'))
const venueOf = (market) => (market === 'cn' ? 'cn' : market === 'hk' ? 'hk' : 'us')

const { createServer } = await import(`${root}/node_modules/vite/dist/node/index.js`)
const server = await createServer({ root, server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' })
// 公司库的程序化补全来自 public/data/*.json：改为读本地文件，其他网络请求一律拒绝
globalThis.fetch = async (input) => {
  const match = String(input).match(/data\/(us|cn|hk|adr|ndx)\.json$/)
  if (!match) throw new Error(`Unexpected network request: ${input}`)
  try { return new Response(JSON.stringify(await read(`public/data/${match[1]}.json`)), { status: 200 }) } catch { return new Response('[]', { status: 404 }) }
}
try {
  const companiesMod = await server.ssrLoadModule('/src/data/companies.ts')
  const { buildAutoDcf } = await server.ssrLoadModule('/src/features/dcf/autoDcf.ts')
  const { radarRows } = await server.ssrLoadModule('/src/features/dcf/radar.ts')
  const ledgerMod = await server.ssrLoadModule('/src/features/signals/ledger.ts')

  const companies = (await Promise.all(['us', 'cn', 'hk', 'adr', 'ndx'].map(m => companiesMod.loadCompanies(m)))).flat()
    .map(c => ({ venue: venueOf(c.market), code: c.code, rating: c.rating, price: c.marketRefresh?.price }))
  const lib = await read('public/data/dcf-prefill.json')
  const auto = buildAutoDcf(lib)
  const radar = new Map(radarRows(lib.items, auto).map(r => [`${r.item.m}:${r.item.c.toUpperCase()}`, r.score]))
  const snapshot = ledgerMod.buildSnapshot({ companies, dcf: auto, radar })

  const file = `public/data/signal-ledger-${date.slice(0, 4)}.json`
  let previous = null
  try { previous = await read(file) } catch { /* 新的一年 */ }
  if (previous && !ledgerMod.validLedger(previous)) throw new Error(`${file} 结构无效，拒绝覆盖`)
  const next = ledgerMod.mergeSnapshot(previous, date, snapshot)
  await writeFile(`${root}/${file}`, JSON.stringify(next) + '\n')
  console.log(JSON.stringify({ date, file, securities: Object.keys(snapshot).length, rated: Object.values(snapshot).filter(r => r[1] !== null).length, radar: radar.size, snapshots: Object.keys(next.snapshots).length }))
} finally {
  await server.close()
}
