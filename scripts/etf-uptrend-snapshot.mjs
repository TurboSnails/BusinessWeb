// 同花顺 ETF 主升浪轻量脚本：只采名单+分类标签。
// 正式管线请用 npm run etf-uptrend:update（scripts/etf_uptrend.py）。
// 用法：npm run etf-uptrend:light
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(REPO, 'public/data/etf-uptrend')
const POOL_API = 'https://fund.10jqka.com.cn/quotation/fund_pool/v2/query'
const ALL_POOL = '1f3b943f-c5f4-312f-95b9-64de02642115'
const CATEGORY_POOLS = {
  t0: 'f3e152a1-5cc0-3617-a89d-d68bdd0d1dab',
  industry: '012e0cb0-f790-35ed-a369-eddc757f228e',
  broad_index: 'd6d4b394-ab20-3f9d-9d65-a7589767c57a',
}
const FILTERS = { trend_retracement: 'last_day_step_signal', new_pool: 'new_up_trend' }
const TAG_KEYS = ['trend_retracement', 'new_pool', 't0', 'industry', 'broad_index', 'unique_rep']
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1'
const SOURCE_PAGE = 'https://fund.10jqka.com.cn/thsjj-jj-fe-market-domain/uptrend-list/index.html#/'

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const bit = k => 1 << TAG_KEYS.indexOf(k)

function beijingNow() {
  return new Date(Date.now() + 8 * 3600 * 1000)
}
function beijingToday() {
  return beijingNow().toISOString().slice(0, 10)
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA, Referer: SOURCE_PAGE },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(25000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  if (json && typeof json === 'object' && 'status_code' in json) {
    if (json.status_code !== 0) throw new Error(`gateway ${json.status_code}: ${json.status_msg ?? ''}`)
    return json.data
  }
  return json
}

function poolPayload(filterType = null, poolKey = ALL_POOL, unique = false) {
  const custom = { fieldList: ['code'], limit: 10000, offset: 0 }
  if (filterType) {
    custom.filterList = [{ type: filterType, relation: 'AND', filterTypeQueryList: [{ cond: 'eq', value: '1' }] }]
  }
  if (unique) custom.uniqueTracking = true
  return { businessKey: 'etfUpTrend', businessPoolKey: poolKey, custom }
}

function parsePool(data) {
  if (!data || !Array.isArray(data.itemList) || !Array.isArray(data.indexes)) {
    throw new Error(`名单结构不符：${JSON.stringify(data).slice(0, 160)}`)
  }
  const fields = data.indexes.map(i => i.type)
  const rows = data.itemList.map(row => Object.fromEntries(fields.map((f, i) => [f, row[i]])))
  const total = Number(data.total ?? rows.length)
  if (rows.length !== total) throw new Error(`名单不完整：${rows.length}/${total}`)
  return rows
}

function encodeDay(pools) {
  const tags = {}
  for (const k of TAG_KEYS) {
    if (pools[k]) tags[k] = new Set(pools[k].map(r => r.code))
  }
  const cats = TAG_KEYS.filter(k => pools[k])
  const rows = pools.all.map(r => {
    let flags = 0
    for (const k of TAG_KEYS) if (tags[k]?.has(r.code)) flags |= bit(k)
    const code = r.code
    const name = r.simpleName || r.tradeCode || code
    return [code, name, flags]
  })
  const n = { all: rows.length }
  for (const k of TAG_KEYS) n[k] = tags[k] ? rows.filter(r => r[2] & bit(k)).length : undefined
  return { cats, rows, n }
}

export async function runSnapshot({ root = OUT, today = beijingToday(), at = beijingNow().toISOString().replace('Z', '+08:00') } = {}) {
  mkdirSync(join(root, 'days'), { recursive: true })
  const pools = { all: parsePool(await postJson(POOL_API, poolPayload())) }
  for (const [key, ftype] of Object.entries(FILTERS)) {
    try { pools[key] = parsePool(await postJson(POOL_API, poolPayload(ftype))) } catch (e) { log(`跳过 ${key}: ${e.message}`) }
  }
  for (const [key, pk] of Object.entries(CATEGORY_POOLS)) {
    try { pools[key] = parsePool(await postJson(POOL_API, poolPayload(null, pk))) } catch (e) { log(`跳过 ${key}: ${e.message}`) }
  }
  try { pools.unique_rep = parsePool(await postJson(POOL_API, poolPayload(null, ALL_POOL, true))) } catch (e) { log(`跳过 unique_rep: ${e.message}`) }

  const { cats, rows, n } = encodeDay(pools)
  const dayFile = { d: today, cats, rows }
  writeFileSync(join(root, 'days', `${today}.json`), `${JSON.stringify(dayFile)}\n`)

  const indexPath = join(root, 'index.json')
  const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : {
    days: [], status: {}, schedule: { times: ['23:30', '07:00'], tz: 'Asia/Shanghai' }, source_page: SOURCE_PAGE, tag_keys: TAG_KEYS,
  }
  const meta = { d: today, asof: today, at, st: 'success', n, notes: ['本站轻量采集：仅名单与标签，无区间/AI原因'] }
  index.days = [...(index.days || []).filter(d => d.d !== today), meta].sort((a, b) => a.d.localeCompare(b.d))
  index.status = {
    last_run: { status: 'success', finished_at: at, source_as_of: today },
    last_success: { status: 'success', finished_at: at, source_as_of: today },
  }
  index.source_page = SOURCE_PAGE
  index.tag_keys = TAG_KEYS
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`)
  log(`${today} 主升浪 ${rows.length} 只 → days/${today}.json`)
  return { day: today, count: rows.length }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])
if (isMain) {
  runSnapshot().catch(e => { console.error(e); process.exitCode = 1 })
}
