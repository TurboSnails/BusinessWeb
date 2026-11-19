// A-share index slices for the 中国市场 tab: 10 years of closes and turnover from
// Eastmoney, joined with the weekly PE history the jixing/ths collectors already keep.
import { readFile, rename, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { compactPrices } from './us-market-slices.mjs'

const OUTPUT = fileURLToPath(new URL('../public/data/cn-market-slices.json', import.meta.url))
const DATA = fileURLToPath(new URL('../public/data/', import.meta.url))
const KLINE = 'https://push2his.eastmoney.com/api/qt/stock/kline/get'
const CSINDEX = 'https://www.csindex.com.cn/#/indices/family/detail?indexCode='
const CNINDEX = 'https://www.cnindex.com.cn/module/index-detail.html?act_menu=1&indexCode='
const START = '20161101'
const SH_TZ = 'Asia/Shanghai'

const slice = (group, code, name) => ({ id: code.toLowerCase(), code, name, group })
export const CN_SLICES = [
  slice('broad', '000300', '沪深300'), slice('broad', '000001', '上证指数'), slice('broad', '000016', '上证50'),
  slice('broad', '000510', '中证A500'), slice('broad', '000905', '中证500'), slice('broad', '000852', '中证1000'),
  slice('broad', '932000', '中证2000'), slice('broad', '399006', '创业板指'), slice('broad', '000688', '科创50'),
  slice('broad', '000985', '中证全指'),
  slice('style', '399370', '国证成长'), slice('style', '399371', '国证价值'), slice('style', '000922', '中证红利'),
  slice('style', 'H30269', '红利低波'), slice('style', '000919', '300价值'), slice('style', '000925', '基本面50'),
  slice('style', '932365', '中证现金流'),
  slice('sector', '399986', '银行'), slice('sector', '399975', '证券公司'), slice('sector', '931775', '房地产'),
  slice('sector', '000932', '主要消费'), slice('sector', '399997', '白酒'), slice('sector', '930653', '食品饮料'),
  slice('sector', '399989', '医疗'), slice('sector', 'H30184', '半导体'), slice('sector', '930651', '计算机'),
  slice('sector', '399971', '传媒'), slice('sector', '399808', '新能源'), slice('sector', '930997', '新能源车'),
  slice('sector', '931151', '光伏产业'), slice('sector', '399967', '军工'), slice('sector', '930708', '有色金属'),
  slice('sector', '000820', '煤炭'), slice('sector', '930608', '基建'),
]
const GROUP_SCOPE = { broad: 'A 股宽基指数', style: 'A 股风格与策略指数', sector: 'A 股行业指数' }

/** Eastmoney market prefix: 399xxx trade in Shenzhen, CSI-only families on 2, the rest on Shanghai. */
export function secidOf(code) {
  if (/^399\d{3}$/.test(code)) return `0.${code}`
  if (/^(93\d{4}|H\d{5})$/i.test(code)) return `2.${code.toUpperCase()}`
  if (/^\d{6}$/.test(code)) return `1.${code}`
  throw new Error(`未知指数代码 ${code}`)
}

const shDate = (now) => new Intl.DateTimeFormat('en-CA', { timeZone: SH_TZ }).format(now)
const shMinutes = (now) => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: SH_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now).split(':').map(Number)
  return h * 60 + m
}

/** Eastmoney kline body → completed sessions only (today counts after 15:30 Beijing). */
export function parseKline(body, code, now = new Date()) {
  if (body?.rc !== 0 || String(body?.data?.code ?? '').toUpperCase() !== code.toUpperCase()) throw new Error('东财返回身份不符')
  const today = shDate(now)
  const closedToday = shMinutes(now) >= 15 * 60 + 30
  const rows = []
  for (const line of body.data.klines ?? []) {
    const [date, close, amount] = String(line).split(',')
    const price = Number(close)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(price > 0) || date > today || (date === today && !closedToday)) continue
    rows.push([date, { close: price, amount: Number(amount) }])
  }
  if (rows.length < 21) throw new Error('日线覆盖不足')
  const compact = compactPrices(rows)
  return {
    history: compact.map(([date, { close }]) => [date, Number(close.toFixed(2))]),
    // Turnover in 亿元 for the daily window only; volume ratios need consecutive sessions.
    volume: rows.slice(-420).flatMap(([date, { amount }]) => amount > 0 ? [[date, Number((amount / 1e8).toFixed(2))]] : []),
  }
}

/** Weekly PE from the jixing history file, else the ths valuation table. */
export function valuationFor(code, { jixingRows, jixingHistory, thsValuation }) {
  const row = jixingRows.find(item => item.code === code)
  const series = jixingHistory?.peSeries ?? []
  if (row && series.length >= 20 && row.pe > 0) {
    return {
      date: row.date, value: row.pe, history: series, pct: row.pePct === null || row.pePct === undefined ? undefined : Math.round(row.pePct * 1000) / 10,
      source: /^399/.test(code) ? CNINDEX + code : CSINDEX + code,
      scope: `${row.name} 滚动市盈率（${row.source === 'csi' ? '中证指数公司' : '国证指数公司'}），周度，${series[0][0].slice(0, 4)} 年起`,
    }
  }
  const ths = thsValuation.find(item => item.code === code)
  if (ths?.pe > 0 && ths.history?.length >= 20) {
    return {
      date: ths.history.at(-1)[0], value: ths.pe, history: ths.history, pct: ths.peP10 ?? undefined,
      source: ths.source ?? CSINDEX + code, scope: `${ths.name} 滚动市盈率，周度，${ths.history[0][0].slice(0, 4)} 年起`,
    }
  }
  return undefined
}

async function readJson(file) {
  try { return JSON.parse(await readFile(DATA + file, 'utf8')) } catch { return null }
}

async function fetchKline(code) {
  const query = new URLSearchParams({ secid: secidOf(code), fields1: 'f1,f2,f3', fields2: 'f51,f53,f57', klt: '101', fqt: '0', beg: START, end: '20500101' })
  const response = await fetch(`${KLINE}?${query}`, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://quote.eastmoney.com/' }, signal: AbortSignal.timeout(15000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

export async function buildCnSlices(previous, { load = fetchKline, now = new Date(), sources }) {
  const prior = new Map((previous?.slices ?? []).map(item => [item.id, item]))
  const slices = []
  const issues = []
  for (const meta of CN_SLICES) {
    const old = prior.get(meta.id)
    try {
      const { history, volume } = parseKline(await load(meta.code), meta.code, now)
      const valuation = valuationFor(meta.code, { ...sources, jixingHistory: sources.histories[meta.code] })
      slices.push({
        id: meta.id, name: meta.name, group: meta.group, symbol: meta.code, scope: `${GROUP_SCOPE[meta.group]} · 价格指数`,
        source: (/^399/.test(meta.code) ? CNINDEX : CSINDEX) + meta.code, history, volume,
        ...(valuation && { valuation }),
      })
    } catch (error) {
      issues.push(`${meta.name}：${error.message}`)
      if (old) slices.push({ ...old, refreshError: error.message })
    }
    await delay(120)
  }
  return { slices, issues }
}

async function main() {
  const previous = await readJson('cn-market-slices.json')
  const jixing = await readJson('jixing-table.json')
  const ths = await readJson('ths-tab-market.json')
  const histories = Object.fromEntries(await Promise.all(CN_SLICES.map(async ({ code }) => [code, await readJson(`jixing-table-hist-${code}.json`)])))
  const { slices, issues } = await buildCnSlices(previous, { sources: { jixingRows: jixing?.rows ?? [], thsValuation: ths?.valuation ?? [], histories } })
  if (!slices.length) throw new Error('没有任何指数更新成功')
  const tmp = `${OUTPUT}.tmp`
  await writeFile(tmp, JSON.stringify({ generatedAt: new Date().toISOString(), slices }) + '\n')
  await rename(tmp, OUTPUT)
  console.log(`A 股分类行情：${slices.length - issues.length}/${CN_SLICES.length} 项更新${issues.length ? '；' + issues.join('；') : ''}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
