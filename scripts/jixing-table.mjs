// 今天几星 · A股估值表，每个交易日盘后同日完整发布。
import fs from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isTradingDay } from './market-mood-lib.mjs'
import { addDays, CSI, csiValUrl } from './ths-market-lib.mjs'
import { weekEnds } from './ths-industry-lib.mjs'
import {
  buildRow, canPublish, histPayload, INDICES, INDUSTRY_PB_FROM, industryPbUrl, marketCloses, mergeHistory,
  parseCniSnapshot, parseCsiHistory, parseCsiSnapshot, parseIndustryPb, PB_INDUSTRY, slimRow, sourceDate,
} from './jixing-table-lib.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(ROOT, 'public/data/jixing-table.json')
const RAW = join(ROOT, 'data-raw/jixing-table')
const INDUSTRY_STORE = join(RAW, 'industry-pb.json')
const LOCK = join(tmpdir(), `jixing-table-${createHash('sha256').update(ROOT).digest('hex').slice(0, 16)}.lock`)
const CSI_SEED = '1990-01-01'
const CALENDAR_SEED = '2010-01-01' // 国证日行情覆盖已验证最早的中证估值（2011 年）
const CNI = 'https://www.cnindex.com.cn'
const CNI_DAY = `${CNI}/index/queryDay`
const CNI_RUNNING = `${CNI}/index/running?type=0`
const CNI_QUOTES = 'https://hq.cnindex.com.cn/market/market/getIndexDailyDataWithDataFormat'
const CSI_HIST = `${CSI}/perf/indexCsiDsPe`
const INDUSTRY_CAP = Number(process.env.INDUSTRY_PB_CAP ?? 80)
const SOURCES = [
  { label: '中证指数官网 · 历史滚动市盈率', url: `${CSI_HIST}?indexCode=000985` },
  { label: '中证指数官网 · 每日估值总览', url: csiValUrl },
  { label: '中证指数官网 · 行业市盈率（中证行业分类，PB 判定行）', url: industryPbUrl('2026-11-17') },
  { label: '国证指数网 · 指数运行', url: CNI_RUNNING },
]

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

function writeJson(file, data) {
  fs.mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${randomUUID()}.tmp`
  try {
    fs.writeFileSync(tmp, JSON.stringify(data) + '\n')
    fs.renameSync(tmp, file)
  } finally {
    fs.rmSync(tmp, { force: true })
  }
}

async function get(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(8_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (error) {
      if (attempt === 2) throw new Error(`${new URL(url).pathname}：${error.message}`)
      await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)))
    }
  }
}

function cfgDate(now, arg) {
  const beijing = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'short',
  }).format(now)
  const [today, clock] = beijing.split(' ')
  const explicit = arg?.match(/^--date=(\d{4}-\d{2}-\d{2})$/)?.[1]
  if (arg && !explicit && arg !== '--rebuild') {
    throw new Error('参数请使用 --date=YYYY-MM-DD 或 --rebuild，且日期不得晚于北京当日')
  }
  if (explicit && (sourceDate(explicit) !== explicit || explicit > today)) {
    throw new Error('参数请使用 --date=YYYY-MM-DD，且不得晚于北京当日')
  }
  const date = explicit ?? today
  if (!isTradingDay(date) || (date === today && clock < '15:10' && !explicit)) return null
  return date
}

const historyFile = code => join(RAW, `${code}.json`)
const histPublic = code => join(ROOT, 'public/data', `jixing-table-hist-${code}.json`)
const cniQuoteUrl = (code, start, date) => `${CNI_QUOTES}?indexCode=${code}&startDate=${start}&endDate=${date}&frequency=day`
const compact = date => date.replaceAll('-', '')

function loadIndustryStore() {
  const raw = readJson(INDUSTRY_STORE, { version: 1, byDate: {} })
  return raw?.byDate && typeof raw.byDate === 'object' ? raw : { version: 1, byDate: {} }
}

function saveIndustryStore(store) {
  writeJson(INDUSTRY_STORE, { version: 1, byDate: store.byDate })
}

/** 补齐行业 PB：历史按周采样，日常补最近缺失交易日；单次请求有上限。 */
async function ensureIndustryPb(target, { cap = INDUSTRY_CAP, daily = true } = {}) {
  const store = loadIndustryStore()
  const needed = new Set(weekEnds(INDUSTRY_PB_FROM, target))
  if (daily && isTradingDay(target)) needed.add(target)
  // 也补近 10 个交易日，避免只靠周采样漏掉最新几天
  if (daily) {
    let d = target
    for (let i = 0; i < 10; i++) {
      if (isTradingDay(d)) needed.add(d)
      d = addDays(d, -1)
    }
  }
  const missing = [...needed].filter(d => {
    const row = store.byDate[d]
    if (!row) return true
    return Object.keys(PB_INDUSTRY).some(code => !row[code] || !Number.isFinite(row[code].pb))
  }).sort()
  let fetched = 0
  for (let i = 0; i < missing.length && fetched < cap; i += 6) {
    const batch = missing.slice(i, i + 6)
    await Promise.all(batch.map(async date => {
      const body = await get(industryPbUrl(date))
      const parsed = parseIndustryPb(body, date)
      if (!parsed.size) {
        // 明确无匹配时记空对象，避免同一无效日反复请求
        if (String(body?.code) === '200' && sourceDate(body?.data?.tradeDate) === date) {
          store.byDate[date] = store.byDate[date] ?? {}
        }
        return
      }
      const slot = store.byDate[date] ?? {}
      for (const [code, value] of parsed) {
        slot[code] = {
          pb: value.pb, dp: value.dp, industryCode: value.industryCode, industryName: value.industryName,
        }
      }
      store.byDate[date] = slot
      fetched++
    }))
    saveIndustryStore(store)
  }
  return { store, missing: missing.length, fetched }
}

function industryHistoryPoints(store, indexCode, target) {
  const out = []
  for (const [date, slot] of Object.entries(store.byDate)) {
    if (!validDateLike(date) || date > target) continue
    const hit = slot?.[indexCode]
    if (hit && Number.isFinite(hit.pb) && hit.pb > 0) out.push([date, null, hit.pb])
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]))
}

function validDateLike(d) {
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)
}

function applyIndustryObservation(observations, store, date) {
  const slot = store.byDate[date] ?? {}
  for (const index of INDICES.filter(i => i.pbIndustry)) {
    const hit = slot[index.code]
    const current = observations.get(index.code)
    if (!hit || !current) continue
    observations.set(index.code, {
      ...current,
      pb: hit.pb,
      dp: current.dp ?? hit.dp,
      industryCode: hit.industryCode,
      industryName: hit.industryName,
    })
  }
}

function writePublic(date, rows) {
  const keep = new Set(rows.map(({ index }) => index.code))
  for (const file of fs.readdirSync(join(ROOT, 'public/data'))) {
    const m = file.match(/^jixing-table-hist-(.+)\.json$/)
    if (m && !keep.has(m[1])) fs.rmSync(join(ROOT, 'public/data', file), { force: true })
  }
  for (const { row } of rows) writeJson(histPublic(row.code), histPayload(row))
  writeJson(OUT, {
    version: 1, asOf: date, generatedAt: new Date().toISOString(), sources: SOURCES,
    rows: rows.map(({ row }) => slimRow(row)),
  })
}

function publish(date, observations, histories, store, { allowSameDay = false } = {}) {
  try {
    fs.mkdirSync(LOCK)
  } catch (error) {
    if (error.code === 'EEXIST') return false
    throw error
  }
  try {
    const prior = readJson(OUT, null)?.asOf ?? null
    if (!allowSameDay && !canPublish(prior, date, INDICES, observations)) return false
    if (allowSameDay) {
      if (!canPublish(null, date, INDICES, observations)) return false
      if (prior && prior > date) return false
    }
    const rows = INDICES.map(index => {
      const current = observations.get(index.code)
      const peIncoming = [...(histories.get(index.code) ?? []), [date, current.pe, current.pb]]
      let history = mergeHistory(readJson(historyFile(index.code), []), peIncoming, date)
      if (index.pbIndustry) {
        const industryPts = industryHistoryPoints(store, index.code, date)
        history = mergeHistory(history, industryPts, date)
        // 当日 PB 必须以行业观测为准
        history = mergeHistory(history, [[date, current.pe, current.pb]], date)
      }
      return { index, history, row: buildRow(index, date, current, history) }
    })
    for (const { index, history } of rows) writeJson(historyFile(index.code), history)
    writePublic(date, rows)
    return true
  } finally {
    fs.rmdirSync(LOCK)
  }
}

/** 仅用本地 raw + 行业 PB 店重写出公开表（不抓中证 PE）。 */
function rebuildFromStore(date, store) {
  const observations = new Map()
  const histories = new Map()
  for (const index of INDICES) {
    const history = readJson(historyFile(index.code), [])
    const last = [...history].reverse().find(([d]) => d === date) ?? history.at(-1)
    if (!last || last[0] !== date || !(last[1] > 0)) {
      throw new Error(`缺少 ${index.code} 在 ${date} 的 PE 历史，无法 --rebuild`)
    }
    const slot = store.byDate[date]?.[index.code]
    const pb = index.pbIndustry ? slot?.pb ?? null : last[2]
    observations.set(index.code, {
      date, pe: last[1], pb, dp: slot?.dp ?? null,
      industryCode: slot?.industryCode, industryName: slot?.industryName,
    })
    histories.set(index.code, [])
  }
  // snapshot/cni 行的 pb/dp 已在 raw 末行；若 raw 无 pb，尝试沿用已发布主表
  const published = readJson(OUT, null)
  if (published?.asOf === date) {
    for (const row of published.rows ?? []) {
      const cur = observations.get(row.code)
      if (!cur) continue
      if (cur.pb == null && row.pb != null) cur.pb = row.pb
      if (cur.dp == null && row.dp != null) cur.dp = row.dp
    }
  }
  applyIndustryObservation(observations, store, date)
  if (!publish(date, observations, histories, store, { allowSameDay: true })) {
    throw new Error(`--rebuild 未能发布 ${date}`)
  }
}

async function main() {
  const rebuild = process.argv.includes('--rebuild')
  const dateArg = process.argv.find(a => a.startsWith('--date='))
  const date = rebuild
    ? (dateArg?.slice('--date='.length) ?? readJson(OUT, null)?.asOf ?? null)
    : cfgDate(new Date(), dateArg)
  if (!date) return console.log('A股估值表：未到北京 15:10 或休市，保留上一份数据')

  const { store, missing, fetched } = await ensureIndustryPb(date, {
    cap: rebuild ? Number(process.env.INDUSTRY_PB_CAP ?? 700) : INDUSTRY_CAP,
  })
  console.log(`行业 PB：待补 ${missing} 日，本轮写入 ${fetched} 日（库存 ${Object.keys(store.byDate).length} 日）`)

  if (rebuild) {
    rebuildFromStore(date, store)
    return console.log(`A股估值表：已按本地历史重建 ${date}，${INDICES.length} 条指数`)
  }

  const prior = readJson(OUT, null)?.asOf ?? null
  if (prior && prior >= date) return console.log(`A股估值表：已发布 ${prior}，跳过 ${date}`)

  const snapshot = parseCsiSnapshot(await get(csiValUrl), date)
  const snapshotIndices = INDICES.filter(i => i.snapshot)
  const ready = new Map(snapshotIndices.map(i => [i.code, snapshot.get(i.csiName)]))
  if (!canPublish(prior, date, snapshotIndices, ready)) {
    return console.log(`A股估值表：中证估值总览未完整更新到 ${date}，保留上一份数据`)
  }

  const csiIndices = INDICES.filter(i => i.source === 'csi')
  const cniIndices = INDICES.filter(i => i.source === 'cni')
  const starts = new Map(csiIndices.map(i => [i.code, readJson(historyFile(i.code), []).at(-1)?.[0] ?? CSI_SEED]))
  const shortStart = addDays(date, -7)
  const anchorStart = [...starts.values()].map(s => s === CSI_SEED ? CALENDAR_SEED : s).reduce((a, b) => a < b ? a : b, shortStart)
  const [calendar, cniOverview, ...quoteBodies] = await Promise.all([
    get(CNI_DAY), get(CNI_RUNNING),
    ...cniIndices.map(i => get(cniQuoteUrl(i.code, i.code === '399001' ? anchorStart : shortStart, date))),
  ])
  const closesByCode = new Map(cniIndices.map((i, k) => [i.code, marketCloses(quoteBodies[k], date)]))
  const cniSnapshot = parseCniSnapshot(cniOverview, calendar, date, cniIndices, closesByCode)
  const tradingDays = closesByCode.get('399001')
  if (!tradingDays.has(date) || !canPublish(prior, date, cniIndices, cniSnapshot)) {
    return console.log(`A股估值表：国证估值或收盘行情未完整更新到 ${date}，保留上一份数据`)
  }

  const histories = new Map()
  const observations = new Map([...ready, ...cniSnapshot])
  for (let offset = 0; offset < csiIndices.length; offset += 8) {
    await Promise.all(csiIndices.slice(offset, offset + 8).map(async index => {
      const start = starts.get(index.code)
      const data = await get(`${CSI_HIST}?indexCode=${index.code}&startDate=${compact(start)}&endDate=${compact(date)}`)
      const history = parseCsiHistory(data, index, start, date, tradingDays)
      histories.set(index.code, history)
      const current = history.find(([day]) => day === date)
      const snap = observations.get(index.code)
      if (!current || (snap && snap.pe !== current[1])) observations.delete(index.code)
      else if (!snap) observations.set(index.code, { date, pe: current[1], pb: null, dp: null })
    }))
  }

  applyIndustryObservation(observations, store, date)

  if (!canPublish(prior, date, INDICES, observations)) {
    const missingCodes = INDICES.filter(i => {
      const row = observations.get(i.code)
      if (!row) return true
      if (i.pbIndustry && !(row.pb > 0)) return true
      return false
    }).map(i => i.code).join('、')
    return console.log(`A股估值表：${date} 估值未发全或同日数据不一致（${missingCodes}），保留上一份数据`)
  }
  if (publish(date, observations, histories, store)) console.log(`A股估值表：已发布 ${date}，${INDICES.length} 条指数`)
  else console.log('A股估值表：并行更新已占用写入，或同日数据已发布')
}

main().catch(error => {
  console.error(`A股估值表更新失败：${error.message}`)
  process.exitCode = 1
})
