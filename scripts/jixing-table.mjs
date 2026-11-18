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
  applyIndustryFetchResult, buildRow, canPublish, danjuanSym, histPayload, INDICES, INDUSTRY_PB_FROM, industryPbUrl,
  marketCloses, mergeHistory, parseCniSnapshot, parseCsiHistory, parseCsiSnapshot, parseDanjuanDetail,
  parseDanjuanHistory, planIndustryFetch, slimRow, sourceDate,
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
const DJ = 'https://danjuanfunds.com/djapi/index_eva'
const SOURCES = [
  { label: '中证指数官网 · 历史滚动市盈率（peg，非 PE(TTM)）', url: `${CSI_HIST}?indexCode=000985` },
  { label: '中证指数官网 · 每日估值总览', url: csiValUrl },
  { label: '中证指数官网 · 行业市盈率（中证行业分类，PB 判定行）', url: industryPbUrl('2026-11-17') },
  { label: '国证指数网 · 指数运行（交易日门禁）', url: CNI_RUNNING },
  { label: '蛋卷估值 · 创业板/深成指等 PE·PB（近似 TTM）', url: `${DJ}/detail/SZ399006` },
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

/**
 * 补齐行业 PB。
 * daily：只补目标日 + 近 10 交易日（目标优先）；周采样仅 rebuild。
 * 休市回退记 `{}`；同日空列表＝未发布不写（B1'）；单日失败 catch 跳过（I1）。
 */
async function ensureIndustryPb(target, { cap = INDUSTRY_CAP, rebuild = false } = {}) {
  const store = loadIndustryStore()
  const extra = rebuild
    ? weekEnds(INDUSTRY_PB_FROM, target).filter(d => isTradingDay(d))
    : []
  const missing = planIndustryFetch(store, target, { recent: 10, extra })
  let fetched = 0
  let cursor = 0
  while (cursor < missing.length && fetched < cap) {
    const batch = missing.slice(cursor, cursor + Math.min(6, cap - fetched))
    cursor += batch.length
    await Promise.all(batch.map(async date => {
      try {
        const body = await get(industryPbUrl(date))
        const result = applyIndustryFetchResult(store, date, body)
        if (result.action === 'wrote' || result.action === 'holiday') fetched++
      } catch {
        // 单日失败不中断整表；能否发布交给 canPublish（I1）
      }
    }))
    saveIndustryStore(store)
  }
  return { store, missing: missing.length, fetched, planned: missing }
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
    if (!hit || !current || !(hit.pb > 0)) continue
    observations.set(index.code, {
      ...current,
      pb: hit.pb,
      dp: null, // 不混填行业股息率（I2）
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
      // 国证四条改走蛋卷周频历史：每次全量重写，丢掉旧的 peDynamic 单点脏数据
      const priorHist = index.source === 'cni' ? [] : readJson(historyFile(index.code), [])
      let history = mergeHistory(priorHist, peIncoming, date)
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
    observations.set(index.code, {
      date,
      pe: last[1],
      pb: index.pbIndustry ? (slot?.pb ?? null) : last[2],
      dp: null,
      industryCode: slot?.industryCode,
      industryName: slot?.industryName,
    })
    histories.set(index.code, [])
  }
  // snapshot/cni：raw 末行可能只有 pe/pb；股息率从已发布主表回填（行业行保持 null）
  const published = readJson(OUT, null)
  if (published?.asOf === date) {
    for (const row of published.rows ?? []) {
      const cur = observations.get(row.code)
      const meta = INDICES.find(i => i.code === row.code)
      if (!cur || meta?.pbIndustry) continue
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

  if (rebuild) {
    const { store, missing, fetched } = await ensureIndustryPb(date, {
      cap: Number(process.env.INDUSTRY_PB_CAP ?? 700), rebuild: true,
    })
    console.log(`行业 PB：待补 ${missing} 日，本轮写入 ${fetched} 日（库存 ${Object.keys(store.byDate).length} 日）`)
    rebuildFromStore(date, store)
    return console.log(`A股估值表：已按本地历史重建 ${date}，${INDICES.length} 条指数`)
  }

  const prior = readJson(OUT, null)?.asOf ?? null
  if (prior && prior >= date) return console.log(`A股估值表：已发布 ${prior}，跳过 ${date}`)

  // 已发布检查之后再抓行业 PB，避免同日重复请求（B1）
  const { store, missing, fetched } = await ensureIndustryPb(date, { cap: INDUSTRY_CAP, rebuild: false })
  console.log(`行业 PB：待补 ${missing} 日，本轮写入 ${fetched} 日（库存 ${Object.keys(store.byDate).length} 日）`)

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
  const cniGate = parseCniSnapshot(cniOverview, calendar, date, cniIndices, closesByCode)
  const tradingDays = closesByCode.get('399001')
  if (!tradingDays.has(date) || !canPublish(prior, date, cniIndices, cniGate)) {
    return console.log(`A股估值表：国证估值或收盘行情未完整更新到 ${date}，保留上一份数据`)
  }

  // 国证四条：门禁用 peDynamic，估值改用蛋卷（近似 TTM + 周频历史），否则地图/分位长期空白
  const histories = new Map()
  const cniSnapshot = new Map()
  await Promise.all(cniIndices.map(async index => {
    const [peBody, pbBody, detailBody] = await Promise.all([
      get(`${DJ}/pe_history/${danjuanSym(index.code)}?day=all`),
      get(`${DJ}/pb_history/${danjuanSym(index.code)}?day=all`),
      get(`${DJ}/detail/${danjuanSym(index.code)}`),
    ])
    const detail = parseDanjuanDetail(detailBody, date)
    if (!detail) return
    cniSnapshot.set(index.code, detail)
    histories.set(index.code, parseDanjuanHistory(peBody, pbBody, date))
  }))
  if (!canPublish(prior, date, cniIndices, cniSnapshot)) {
    return console.log(`A股估值表：蛋卷估值未完整更新到 ${date}，保留上一份数据`)
  }

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
