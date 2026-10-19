import { mkdir, readFile, readdir, writeFile, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TURNOVER_URLS, computeWeeklyTurnoverRatio } from './market-cycle-liquidity.mjs'
import { collectHsiPoolRatio } from './market-cycle-hsi-pool.mjs'

const BASE = 'https://www.hsi.com.hk/api/wsit-hsi-ddoc-ea-public-website-proxy/v1'
export const HSI_REPORT_METADATA_URL = `${BASE}/product-data/pub/series/metadata/v2?data=dailyReport&seriesCode=hsi`
const CACHE = fileURLToPath(new URL('../.cache/market-cycle-hsi-turnover/', import.meta.url))
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dateOK = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date
const add = (date, n) => new Date(Date.parse(date) + n * 864e5).toISOString().slice(0, 10)
const monday = date => add(date, -((new Date(date).getUTCDay() + 6) % 7))
export function hsiCompletedWeekStart(date) {
  if (!dateOK(date)) throw new Error('恒指完整周观察日无效')
  const currentMonday = monday(date), weekday = new Date(date).getUTCDay()
  return weekday === 0 || weekday === 6 ? currentMonday : add(currentMonday, -7)
}
const resourceFor = date => `/public-website/webapp/contents/en/indexes/report/hsi/idx_${Number(date.slice(8))}${MONTHS[Number(date.slice(5, 7)) - 1]}${date.slice(2, 4)}.csv`
const validTradeDate = date => dateOK(date) && [1, 2, 3, 4, 5].includes(new Date(date).getUTCDay())

export function hsiReportUrl(date) {
  if (!validTradeDate(date)) throw new Error(`恒指日报日期无效：${date}`)
  return `${BASE}/content/gcs/download?resource=${encodeURIComponent(resourceFor(date))}`
}

function validateSource(date, source) {
  if (source !== hsiReportUrl(date)) throw new Error('恒指日报来源路径/日期不匹配')
}

export function parseHsiReportMetadata(body, today) {
  const rows = Array.isArray(body) ? body : body?.data
  if (!dateOK(today) || !Array.isArray(rows)) throw new Error('恒指日报目录响应无效')
  const series = rows.filter(row => row?.seriesCode === 'hsi')
  if (series.length !== 1) throw new Error('恒指日报目录指数身份无效')
  const reports = series[0].reportList?.filter(row => row.reportType === 'idx')
  if (!Array.isArray(reports) || reports.length !== 1 || !Array.isArray(reports[0].reportDate)) throw new Error('恒指日报目录无唯一idx系列')
  const dates = new Set()
  return reports[0].reportDate.map(row => {
    if (!validTradeDate(row?.date) || row.date > today) throw new Error('恒指日报目录日期无效或未来')
    if (dates.has(row.date)) throw new Error('恒指日报目录日期重复')
    dates.add(row.date)
    if (row.url !== resourceFor(row.date)) throw new Error('恒指日报目录来源路径/日期不匹配')
    return { date: row.date, source: hsiReportUrl(row.date) }
  }).sort((a, b) => b.date.localeCompare(a.date))
}

function tabFields(line) {
  const fields = []; let value = '', quoted = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++ } else quoted = !quoted
    } else if (c === '\t' && !quoted) { fields.push(value); value = '' } else value += c
  }
  if (quoted) throw new Error('恒指日报CSV引号未闭合')
  fields.push(value)
  return fields
}

export function parseHsiReportCsv(buffer, date, source) {
  validateSource(date, source)
  if (!Buffer.isBuffer(buffer) || buffer.length < 2 || buffer.length > 5e6 || buffer.length % 2 || buffer[0] !== 255 || buffer[1] !== 254) throw new Error('恒指日报必须是UTF16LE BOM CSV')
  const lines = buffer.subarray(2).toString('utf16le').split(/\r?\n/).filter(line => line.trim())
  if (lines.length < 3) throw new Error('恒指日报CSV缺少表头/数据')
  const header = tabFields(lines[1])
  const required = ['Trade Date', 'Index', 'Index Currency', 'Index Turnover (Mn)', 'Market Turnover (Mn)']
  const indices = required.map(label => {
    if (header.filter(h => h === label).length !== 1) throw new Error(`恒指日报缺少唯一列：${label}`)
    return header.indexOf(label)
  })
  const rows = lines.slice(2).map(tabFields)
  const matches = rows.filter(row => row[indices[1]] === 'Hang Seng Index 恒生指數')
  if (matches.length !== 1) throw new Error('恒指日报缺少唯一Hang Seng Index行')
  const row = matches[0]
  if (row[indices[0]] !== date.replaceAll('-', '') || row[indices[2]] !== 'HKD') throw new Error('恒指日报日期/港元单位不匹配')
  const raw = row[indices[3]]
  if (typeof raw !== 'string' || !/^\d+(?:\.\d+)?$/.test(raw) || !Number.isFinite(Number(raw)) || Number(raw) <= 0) throw new Error('恒指Index Turnover金额缺少或非正数')
  return { date, amount: Number(raw) * 1e6, source }
}

// Validate identity and trading dates only. hkHSI's amount is whole-market
// turnover and is deliberately never read or used for index turnover.
function parseCalendar(body, today) {
  const data = body?.data?.hkHSI, quote = data?.qt?.hkHSI
  if (body?.code !== 0 || quote?.[2] !== 'HSI' || quote?.[75] !== 'HKD' || !Array.isArray(data?.day) || !data.day.length) throw new Error('恒指参考交易日历身份无效')
  let previous = ''
  return data.day.map(row => {
    const date = row?.[0]
    if (!validTradeDate(date) || date <= previous || date > today) throw new Error('恒指参考日历日期乱序/重复/未来')
    previous = date
    return date
  })
}

export async function collectHsiTurnover(ctx, { cacheDir = CACHE, budget = 40, pool = false } = {}) {
  const issue = message => ctx.issue(`hsi-turnover: ${message}`)
  try {
    const today = ctx.now.slice(0, 10)
    const directory = parseHsiReportMetadata(await ctx.get(HSI_REPORT_METADATA_URL), today)
    const calendar = parseCalendar(await ctx.get(TURNOVER_URLS.hsi), today)
    await mkdir(cacheDir, { recursive: true })
    const cached = new Map()
    for (const name of await readdir(cacheDir)) {
      if (!/^\d{4}-\d{2}-\d{2}\.csv$/.test(name)) continue
      const date = name.slice(0, 10)
      if (!validTradeDate(date) || date > today) { issue(`忽略无效/未来缓存日期${date}`); continue }
      try { cached.set(date, parseHsiReportCsv(await readFile(join(cacheDir, name)), date, hsiReportUrl(date))) } catch (error) { issue(`缓存${date}无效，将重新采集：${error.message}`) }
    }
    const cap = Number.isFinite(budget) ? Math.max(0, Math.min(40, Math.floor(budget))) : 40
    const pending = directory.filter(row => !cached.has(row.date)).slice(0, cap)
    let next = 0
    await Promise.all(Array.from({ length: Math.min(2, pending.length) }, async () => {
      while (next < pending.length) {
        const row = pending[next++]
        try {
          const raw = await ctx.get(row.source, { as: 'buffer' })
          const parsed = parseHsiReportCsv(raw, row.date, row.source)
          const path = join(cacheDir, `${row.date}.csv`), temporary = `${path}.tmp`
          await writeFile(temporary, raw); await rename(temporary, path)
          cached.set(row.date, parsed)
        } catch (error) { issue(`日报${row.date}采集失败：${error.message}`) }
      }
    }))
    const points = [...cached.values()].sort((a, b) => a.date.localeCompare(b.date))
    const weekStart = hsiCompletedWeekStart(today)
    const weekEnd = add(weekStart, 6)
    const expected = calendar.filter(date => date >= weekStart && date <= weekEnd)
    if (!expected.length || expected.at(-1) < add(weekStart, 3)) throw new Error('完整周缺少周末行情确认')
    if (expected.some(date => !cached.has(date))) throw new Error(`完整周缺少恒指日报：${expected.filter(date => !cached.has(date)).join('、')}`)
    if (points.some(row => row.date >= weekStart && row.date <= weekEnd && !expected.includes(row.date))) throw new Error('恒指日报与参考交易日历不一致')
    const week = expected.map(date => cached.get(date)), observationDate = expected.at(-1)
    if ((Date.parse(today) - Date.parse(observationDate)) / 864e5 > 14) throw new Error('完整周观测超过14天')
    const average = week.reduce((sum, row) => sum + row.amount, 0) / week.length
    let ratio
    let ratioError
    try { ratio = computeWeeklyTurnoverRatio(points, calendar, today) } catch (error) { ratioError = `档案${points.length}日(${points[0]?.date ?? '无'}~${points.at(-1)?.date ?? '无'})；暂不能用官方档案计算52周比：${error.message}` }
    const description = `恒生官方Index Performance Summary中Hang Seng Index恒指自身Index Turnover(Mn)×100万=港元，非Market Turnover全港金额；完整周${weekStart}~${weekEnd}共${week.length}个真实交易日，日均${(average / 1e8).toFixed(2)}亿港元；原始日报档案覆盖${points[0].date}~${points.at(-1).date}共${points.length}日。${ratio ? '已达到前52周完整基准。' : '尚缺此前完整52周同口径档案，当前金额仅展示，不计资金票。'}逐日官方来源：${week.map(row => `${row.date} ${row.source}`).join('；')}`
    let poolRatio
    if (!ratio && pool) {
      try { poolRatio = await collectHsiPoolRatio(ctx, { calendar, official: new Map(points.map(row => [row.date, row.amount])), cacheDir, ...(pool === true ? {} : pool) }) }
      catch (error) { issue(`成分池52周基准未发布：${error.message}`) }
    }
    if (ratioError && !poolRatio) issue(ratioError)
    const facts = [{ metricId: 'index_week_daily_turnover_hkd', market: 'hsi', value: Number(average.toFixed(2)), observationDate, source: week.at(-1).source, unit: '港元', kind: 'observed', frequency: 'weekly', description }]
    if (ratio) facts.push({ metricId: 'turnover_ratio_52w', market: 'hsi', value: Number(ratio.value.toFixed(6)), observationDate: ratio.observationDate, source: week.at(-1).source, unit: '倍', kind: 'observed', frequency: 'weekly', description: `${description}完整基准此前52周${ratio.baselineStart}~${ratio.baselineEnd}共${ratio.baselineDays}个真实交易日，日均${(ratio.baselineDailyAverage / 1e8).toFixed(2)}亿港元；本周/此前52周日均比${ratio.value.toFixed(6)}。` })
    if (poolRatio) facts.push({ metricId: 'turnover_ratio_52w', market: 'hsi', value: Number(poolRatio.value.toFixed(6)), observationDate: poolRatio.observationDate, source: week.at(-1).source, unit: '倍', kind: 'observed', frequency: 'weekly',
      description: `恒指当前成分池口径：官方日报只开放约${points.length}个交易日，无法直接取得恒指自身52周成交额，改用名单${poolRatio.universe.date}的${poolRatio.total}只成分逐股成交额（腾讯日线，港元）加总。恒指Index Turnover即成分股成交额之和；本完整周${poolRatio.checks.length}个交易日与官方日报逐日核对，最大偏差${(Math.max(...poolRatio.checks.map(c => Math.abs(c.gap))) * 100).toFixed(2)}%（门槛${0.5}%），官方档案${poolRatio.archiveDays}日中${poolRatio.matchedArchive}日吻合（不吻合日期为旧名单期间）。基准仅用上市满一年的${poolRatio.seasoned}只（占本周成交额${(poolRatio.share * 100).toFixed(1)}%），完整周日均${(poolRatio.weekDailyAverage / 1e8).toFixed(2)}亿港元，此前52周${poolRatio.baselineStart}~${poolRatio.baselineEnd}共${poolRatio.baselineDays}个交易日日均${(poolRatio.baselineDailyAverage / 1e8).toFixed(2)}亿港元；比值${poolRatio.value.toFixed(4)}。历史期按当前成分回看，与当时官方指数成交额存在成分变更差异（实测约3%~7%），属同池比较口径。` })
    return facts
  } catch (error) { issue(error instanceof Error ? error.message : String(error)); return [] }
}
