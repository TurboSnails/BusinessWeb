// 今天几星 · 指数日报：读当日 table/star（及可选 global）输出，抓收盘点位，写出近 30 天索引 + 按日文件。
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'
import { csiPerfUrl, num, validDate } from './ths-market-lib.mjs'
import { buildIndex, diffDaily, snapshotRows } from './jixing-daily-lib.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TABLE = join(ROOT, 'public/data/jixing-table.json')
const STAR = join(ROOT, 'public/data/jixing-star.json')
const OUT = join(ROOT, 'public/data/jixing-daily.json')
const RAW = join(ROOT, 'data-raw/jixing-daily')
const PUBLIC = join(ROOT, 'public/data')
const KEEP_PUBLIC = 60
const KEEP_INDEX = 30
const UA = { 'user-agent': 'Mozilla/5.0' }

const readJson = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return d } }
const dayFile = (date) => join(PUBLIC, `jixing-daily-${date}.json`)
const rawFile = (date) => join(RAW, `${date}.json`)

async function get(url) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) { if (i >= 2) throw e; await new Promise(r => setTimeout(r, 1200 * (i + 1))) }
  }
}

/** 中证 perf：tradeDate YYYYMMDD → close。 */
function parseCloses(body, code) {
  const out = new Map()
  if (!Array.isArray(body?.data)) return out
  for (const row of body.data) {
    if (String(row?.indexCode) !== code) continue
    const d = String(row?.tradeDate ?? '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
    const close = num(row?.close)
    if (validDate(d) && close > 0) out.set(d, close)
  }
  return out
}

/** 国证运行表无日期校验时仅作补充；主路径用中证 perf。深市代码走东财日 K。 */
async function emClose(code, start, end) {
  const sec = code.startsWith('399') ? `0.${code}` : `1.${code}`
  const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${sec}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57,f58&klt=101&fqt=0&beg=${start.replaceAll('-', '')}&end=${end.replaceAll('-', '')}`
  const body = await get(url)
  const out = new Map()
  for (const line of body?.data?.klines ?? []) {
    const [d, , close] = String(line).split(',')
    const c = num(close)
    if (validDate(d) && c > 0) out.set(d, c)
  }
  return out
}

async function fetchCloses(codes, start, end) {
  const result = {}
  const csi = codes.filter(c => !c.startsWith('399'))
  const cni = codes.filter(c => c.startsWith('399'))
  for (let i = 0; i < csi.length; i += 6) {
    await Promise.all(csi.slice(i, i + 6).map(async code => {
      try {
        const map = parseCloses(await get(csiPerfUrl(code, start, end)), code)
        if (map.size) result[code] = Object.fromEntries(map)
      } catch (e) { console.log(`收盘 ${code} 失败：${e.message}`) }
    }))
  }
  for (let i = 0; i < cni.length; i += 4) {
    await Promise.all(cni.slice(i, i + 4).map(async code => {
      try {
        const map = await emClose(code, start, end)
        if (map.size) result[code] = Object.fromEntries(map)
      } catch (e) { console.log(`收盘 ${code} 失败：${e.message}`) }
    }))
  }
  return result
}

function prunePublic() {
  const files = fs.readdirSync(PUBLIC).filter(f => /^jixing-daily-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse()
  for (const f of files.slice(KEEP_PUBLIC)) fs.unlinkSync(join(PUBLIC, f))
}

function loadPrevSnapshot(asOf) {
  let d = prevTradingDay(asOf)
  // 只认「确切前一交易日」文件，不拿更早顶替
  const raw = readJson(rawFile(d))
  if (raw?.asOf === d && Array.isArray(raw.rows)) return raw
  const pub = readJson(dayFile(d))
  if (pub?.asOf === d && Array.isArray(pub.rows) && pub.missingPrev === false) {
    // 公开 diff 文件不含原始 close 快照结构；回退 raw
    return null
  }
  // 尝试从同日 raw 缺失时返回 null
  return null
}

async function main() {
  const table = readJson(TABLE)
  const star = readJson(STAR)
  if (!table?.asOf || !Array.isArray(table.rows) || !table.rows.length) {
    console.log('指数日报：缺少估值表，跳过')
    return
  }
  const asOf = table.asOf
  if (!isTradingDay(asOf)) {
    console.log(`指数日报：${asOf} 非交易日，跳过`)
    return
  }
  const prevAsOf = prevTradingDay(asOf)
  const existing = readJson(rawFile(asOf))
  if (existing?.asOf === asOf && existing.complete) {
    // 仍刷新索引与公开文件
  }

  const codes = table.rows.map(r => r.code)
  const start = prevAsOf
  const closesByCode = await fetchCloses(codes, start, asOf)
  const closesToday = Object.fromEntries(codes.map(c => [c, closesByCode[c]?.[asOf] ?? null]))
  const closesPrev = Object.fromEntries(codes.map(c => [c, closesByCode[c]?.[prevAsOf] ?? null]))

  const todaySnap = {
    asOf,
    star: typeof star?.star === 'number' && star.asOf === asOf ? star.star : (typeof star?.star === 'number' ? star.star : null),
    starAsOf: star?.asOf ?? null,
    rows: snapshotRows(table.rows, closesToday),
    complete: codes.every(c => closesToday[c] > 0),
  }

  // 前日快照：优先 raw；否则用本次抓到的前日收盘 + 无法还原估值 → 仅 close 有值时仍写 raw，diff 用 raw
  let prevSnap = readJson(rawFile(prevAsOf))
  if (!prevSnap || prevSnap.asOf !== prevAsOf) {
    // 无前日 raw：变化列全部 null（不顶替）
    prevSnap = null
    // 若抓到了前日收盘，可先存一份不完整 raw（无估值），供日后补全；但不用于顶替 diff
    if (codes.some(c => closesPrev[c] > 0)) {
      const stub = {
        asOf: prevAsOf,
        star: null,
        rows: snapshotRows(table.rows.map(r => ({ ...r, pe: null, pePct: null, pb: null, pbPct: null, status: null })), closesPrev),
        complete: false,
        stub: true,
      }
      // 不写 stub 覆盖：避免污染。仅当完全没有 raw 时也不写。
      void stub
    }
  }

  const diff = diffDaily(todaySnap, prevSnap)
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    ...diff,
    note: diff.missingPrev
      ? `缺少前一交易日（${prevAsOf}）完整日报快照，变化列均为 null，不拿更早日期顶替。`
      : null,
  }

  fs.mkdirSync(RAW, { recursive: true })
  fs.writeFileSync(rawFile(asOf), JSON.stringify({ ...todaySnap, generatedAt: payload.generatedAt }) + '\n')
  fs.writeFileSync(dayFile(asOf), JSON.stringify(payload) + '\n')
  prunePublic()

  const dates = fs.readdirSync(PUBLIC)
    .map(f => /^jixing-daily-(\d{4}-\d{2}-\d{2})\.json$/.exec(f)?.[1])
    .filter(Boolean)
    .sort()
    .reverse()
  const latest = payload
  // 索引里嵌最新一份全文；体积控制：若过大则只放摘要
  let indexLatest = latest
  const probe = JSON.stringify({ version: 1, dates: dates.slice(0, KEEP_INDEX), latest })
  if (probe.length > 75_000) {
    indexLatest = {
      asOf: latest.asOf,
      prevDate: latest.prevDate,
      missingPrev: latest.missingPrev,
      star: latest.star,
      starPrev: latest.starPrev,
      starChange: latest.starChange,
      counts: latest.counts,
      countsDelta: latest.countsDelta,
      transitions: latest.transitions,
      note: latest.note,
      rows: [],
      truncated: true,
    }
  }
  const index = buildIndex(dates.slice(0, KEEP_INDEX).map(date => ({ date })), indexLatest, KEEP_INDEX)
  // buildIndex 已带 latest 参数
  index.latest = indexLatest
  fs.writeFileSync(`${OUT}.tmp`, JSON.stringify(index) + '\n')
  fs.renameSync(`${OUT}.tmp`, OUT)
  const size = fs.statSync(OUT).size
  console.log(`指数日报：${asOf}（前日 ${prevAsOf}${diff.missingPrev ? ' 缺快照' : ''}），索引 ${size} 字节，日期 ${index.dates.length} 个`)
}

main().catch(e => {
  console.error(`指数日报失败：${e.message}`)
  process.exitCode = 1
})
