// 开盘啦 · 个股：当日涨停/炸板/龙虎榜/成交额前百的并集，保留前十个交易日，最多 600 只。
// 所有必需来源与证券日 K 齐备才发布；估值是可缺省的报告资料，独立标注报告日期。
// 分片使用平铺 kpl-stock-<代码前三位>.json，适配共享 workflow 的 public/data/kpl-*.json。
import fs from 'node:fs'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { parsePool, prevTradingDay } from './market-mood-lib.mjs'
import { cyq, intervalStats, mergeUniverse, monthlyReturns, num, parseKlines, parseLhb, parseTop, parseValuation, snapshotAllowed, valuationBand } from './kpl-stock-lib.mjs'

const OUT = 'public/data/kpl-stock.json', RAW = 'data-raw/kpl-stock'
const API = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130.0 Safari/537.36'
const read = (file, fallback = null) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback } }
const secid = code => `${code.startsWith('6') ? 1 : 0}.${code}`
const shardFile = code => `kpl-stock-${code.slice(0, 3)}.json`
// 只在确定发布后取整压缩。历史分位始终在原始日频数值上计算。
const encode = value => JSON.stringify(value, (_k, v) => typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v)

export async function run({ now = new Date(), get: suppliedGet, root = '.', budgetMs = 220_000 } = {}) {
  const started = performance.now(), date = new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10)
  if (!snapshotAllowed(date, now)) return { written: false, reason: `${date} 非受支持交易日或北京 15:10 前` }
  const deadline = AbortSignal.timeout(budgetMs), network = new AbortController()
  const file = f => path.join(root, f)
  // 单次请求 10 秒超时，失败重试 2 次（东财偶发断连）；整体仍受预算约束
  const get = suppliedGet ?? (async url => {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(url, { headers: { 'user-agent': UA, referer: 'https://quote.eastmoney.com/' }, signal: AbortSignal.any([deadline, network.signal, AbortSignal.timeout(10_000)]) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return await res.json()
      } catch (e) {
        if (attempt >= 2 || deadline.aborted || network.signal.aborted) throw new Error(`${new URL(url).host}：${e.message}`)
        await new Promise(r => setTimeout(r, 800 * (attempt + 1)))
      }
    }
  })
  const report = async (reportName, filter, columns, pageSize = 2000) => {
    const body = await get(`${API}?${new URLSearchParams({ reportName, filter, columns, pageNumber: '1', pageSize: String(pageSize), sortColumns: 'TRADE_DATE', sortTypes: '1', source: 'WEB', client: 'WEB' })}`)
    if (body?.code === 9201) return []
    if (!body?.success || !Array.isArray(body?.result?.data) || body.result.pages > 1 || body.result.data.length !== body.result.count) throw new Error(`${reportName} 报表不完整：${body?.message ?? '无结果'}`)
    return body.result.data
  }
  const pool = async (ep, list) => {
    const body = await get(`https://push2ex.eastmoney.com/${ep}?${new URLSearchParams({ ut: '7eea3edcaed734bea9cbfc24409ed989', dpt: 'wz.ztzt', Pageindex: '0', pagesize: '10000', sort: 'fbt:asc', date: date.replaceAll('-', '') })}`)
    parsePool(body, date)
    return body.data.pool.map(r => ({ code: r.c, name: r.n, industry: r.hybk?.trim() || '', pct: num(r.zdp), lists: [list] }))
  }
  let lhbPending = false
  try {
    // 最多同时 5 个请求；龙虎榜空值视为尚未发布，不能把昨日名单混入今日。
    const sources = await Promise.allSettled([
      pool('getTopicZTPool', 'zt'), pool('getTopicZBPool', 'zb'),
      // 龙虎榜要到傍晚才发布：未发布时先不含龙虎榜股票，当天之后的运行会把它们补进当日名单
      report('RPT_DAILYBILLBOARD_DETAILSNEW', `(TRADE_DATE='${date}')`, 'ALL').then(rows => parseLhb(rows, date)).catch(e => { if (!/尚未发布/.test(e.message)) throw e; lhbPending = true; return [] }),
      ...[1, 2].map(page => get(`https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?${new URLSearchParams({ node: 'hs_a', sort: 'amount', asc: '0', num: '80', page: String(page) })}`)),
    ])
    const failed = sources.find(s => s.status === 'rejected')
    if (failed) throw failed.reason
    const [zt, zb, lhb, top1, top2] = sources.map(s => s.value)
    if (!Array.isArray(top1) || top1.length !== 80 || !Array.isArray(top2) || top2.length !== 80) throw new Error('新浪成交额分页不完整')
    const top = parseTop([...top1, ...top2])
    const oldStore = read(file(`${RAW}/universe.json`), {})
    const universe = mergeUniverse([...zt, ...zb, ...lhb, ...top], oldStore, date)
    const oldIndex = read(file(OUT)), oldShards = new Map()
    const previous = code => {
      const name = shardFile(code)
      if (!oldShards.has(name)) oldShards.set(name, read(file(`public/data/${name}`), {}))
      return oldShards.get(name)?.[code] ?? null
    }
    const references = new Map()
    const daban = read(file('public/data/kpl-daban.json'))
    for (const r of [...(daban?.zt ?? []), ...(daban?.zb ?? [])]) references.set(r.code, { industry: r.sector, concepts: [] })
    // 只复用板块页已收集的概念成分；F10 的「主营业务/核心竞争力」分类并非所属概念。
    const plates = read(file('public/data/kpl-plates.json'))
    for (const group of plates?.groups?.concept ?? []) for (const member of group.stocks ?? []) {
      if (!/^\d{6}$/.test(member.code) || !group.name?.trim()) continue
      const ref = references.get(member.code) ?? { industry: '', concepts: [] }
      ref.concepts.push(group.name.trim())
      references.set(member.code, ref)
    }
    const names = read(file('data-raw/kpl-daban/stocks.json'), {})
    const from = `${Number(date.slice(0, 4)) - 5}${date.slice(5).replaceAll('-', '')}`
    const klineStart = new Date(`${date.slice(0, 7)}-01T00:00:00Z`)
    klineStart.setUTCMonth(klineStart.getUTCMonth() - 26)
    const fromKline = klineStart.toISOString().slice(0, 10).replaceAll('-', '')
    const kline = async (code, latest = false) => parseKlines(await get(`https://push2his.eastmoney.com/api/qt/stock/kline/get?${new URLSearchParams({ secid: secid(code), klt: '101', fqt: '1', beg: latest ? date.replaceAll('-', '') : fromKline, end: date.replaceAll('-', ''), ...(latest ? { lmt: '1' } : {}), fields1: 'f1,f2,f3,f4,f5,f6', fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61' })}`), code, date)
    const details = new Map(), valuationErrors = [], failures = []
    let valuationCutoff = date
    for (let i = 0; i < 5; i++) valuationCutoff = prevTradingDay(valuationCutoff)
    let cursor = 0, reused = 0
    // 每个 worker 串行请求，不在 worker 内开启并发，HTTP 并发始终 ≤ 6。
    const workers = await Promise.allSettled(Array.from({ length: Math.min(6, universe.stocks.length) }, async () => {
      try {
        while (cursor < universe.stocks.length) {
          if (network.signal.aborted) throw new Error('请求已中止')
          // 预算将尽：停止处理，剩下的股票沿用旧明细（见循环后），不整批放弃
          if (deadline.aborted || performance.now() - started > budgetMs - 15_000) break
          const stock = universe.stocks[cursor++], old = previous(stock.code)
          try {
          const latestOnly = old?.asOf === date
          const rows = await kline(stock.code, latestOnly)
          const latest = rows.at(-1)
          if (stock.lists.length && latest.date !== date) throw new Error(`${stock.code} 当日日 K 尚未齐备：${latest.date}`)
          if (!(latest.close > 0)) throw new Error(`${stock.code} 收盘价无效`)
          let detail
          if (old?.asOf === latest.date) { detail = { ...old }; delete detail.stale; reused++ }
          else {
            const history = latestOnly ? await kline(stock.code) : rows
            detail = { code: stock.code, name: stock.name, asOf: latest.date, close: latest.close, pct: latest.pct, industry: '', concepts: [], intervals: intervalStats(history), months: monthlyReturns(history, latest.date), chips: cyq(history), valuation: null, valuationReason: null }
          }
          // 同一交易日重跑复用日 K 派生结果；估值报告可能晚发布，因此滞后报告每天/每轮仍尝试更新。
          // 估值历史变化慢：报告日期落后超过 5 个交易日才重取，省下每只每天一次请求
          if (!detail.valuation || !detail.valuation.pe.date || detail.valuation.pe.date < valuationCutoff) {
            try {
              const reports = await report('RPT_VALUEANALYSIS_DET', `(SECURITY_CODE="${stock.code}")(TRADE_DATE>='${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6)}')(TRADE_DATE<='${date}')`, 'SECURITY_CODE,TRADE_DATE,PE_TTM,PB_MRQ,BOARD_NAME')
              const values = parseValuation(reports, stock.code, date)
              detail.industry = reports.at(-1)?.BOARD_NAME?.trim() || detail.industry
              if (!values.length) throw new Error('公开估值报告为空')
              detail.valuation = { pe: valuationBand(values, 'pe'), pb: valuationBand(values, 'pb') }
              // 图上保留每月最后一个观测值（控制分片体积，每天整批重写）；五档与分位仍取全体日频观测。
              // 亏损（PE 不适用）的折线页面不画，不存点。
              for (const band of Object.values(detail.valuation)) {
                const monthly = new Map()
                for (const p of band.points) if (p.value !== null) monthly.set(p.date.slice(0, 7), { date: p.date, value: Math.round(p.value * 100) / 100 })
                band.points = band.status === 'loss' ? [] : [...monthly.values()]
              }
              detail.valuationReason = null
            } catch (e) {
              detail.valuationReason = `估值更新不可用：${e.message}${detail.valuation ? '；保留已标注日期的历史报告' : ''}`
              valuationErrors.push(stock.code)
            }
          }
          const ref = references.get(stock.code)
          detail.pct = latest.date === date ? latest.pct : null
          detail.name = stock.name
          detail.industry = stock.industry || detail.industry || old?.industry || ref?.industry || names[stock.code]?.[1] || ''
          // 概念仅复用板块页的公开成分关系，按来源顺序截取。
          detail.concepts = [...new Set([...(old?.concepts ?? []), ...(ref?.concepts ?? [])])].slice(0, 5)
          details.set(stock.code, detail)
          } catch (e) {
            // 单只失败不拖垮整批：有旧明细就沿用（当日涨幅置空），没有就本轮不收录；失败过多时整体放弃
            failures.push(`${stock.code}：${e.message}`)
            if (old) details.set(stock.code, { ...old, pct: null, stale: true })
          }
        }
      } catch (e) { network.abort(); throw e }
    }))
    const workerFailure = workers.find(r => r.status === 'rejected')
    if (workerFailure) throw workerFailure.reason
    for (const stock of universe.stocks) {
      if (details.has(stock.code) || failures.some(f => f.startsWith(`${stock.code}：`))) continue
      const old = previous(stock.code)
      if (old) details.set(stock.code, { ...old, pct: null, stale: true }); else failures.push(`${stock.code}：预算用尽未处理`)
    }
    if (![...details.values()].some(d => !d.stale)) throw new Error(`本轮没有新处理的个股（预算用尽或全部失败），保留旧文件：${failures.slice(0, 3).join('；')}`)
    if (failures.length > Math.max(5, universe.stocks.length * 0.1)) throw new Error(`日 K 失败 ${failures.length} 只，超过一成：${failures.slice(0, 3).join('；')}`)
    universe.stocks = universe.stocks.filter(stock => details.has(stock.code))
    const shards = new Map()
    const stocks = universe.stocks.map(stock => {
      const d = details.get(stock.code), name = shardFile(stock.code)
      if (!shards.has(name)) shards.set(name, {})
      shards.get(name)[stock.code] = d
      return { code: stock.code, name: d.name, industry: d.industry, pct: d.pct, lists: stock.lists, date: d.asOf, lastSeen: stock.lastSeen, ...(stock.lists.includes('amount') ? { rank: stock.rank } : {}) }
    })
    const output = { version: 1, asOf: date, generatedAt: now.toISOString(), lhbPending, stocks }
    const index = encode(output)
    if (Buffer.byteLength(index) > 150 * 1024) throw new Error('索引超过 150 KB')
    // 原始历史仅保留每日候选池；公开详情的周频历史足够复用，避免重复保存大体积日 K。
    // 暂存所有分片，发布索引前逐个原子替换，索引引用的证券与日期在前端再次校验。
    const staged = file(`${RAW}/staging`)
    fs.mkdirSync(staged, { recursive: true })
    for (const [name, payload] of shards) fs.writeFileSync(path.join(staged, name), encode(payload))
    fs.writeFileSync(path.join(staged, 'index.json'), index)
    fs.mkdirSync(file('public/data'), { recursive: true })
    for (const name of shards.keys()) fs.renameSync(path.join(staged, name), file(`public/data/${name}`))
    fs.renameSync(path.join(staged, 'index.json'), file(OUT))
    fs.writeFileSync(file(`${RAW}/universe.json`), encode({ days: universe.days }))
    // 删除整片及片内退出候选池的股票；同一前缀仍有股票时已被上面的完整分片替换。
    for (const name of fs.readdirSync(file('public/data'))) if (/^kpl-stock-\d{3}\.json$/.test(name) && !shards.has(name)) fs.rmSync(file(`public/data/${name}`))
    fs.rmSync(staged, { recursive: true, force: true })
    return { written: true, date, stocks: stocks.length, current: universe.days[date].length, shards: shards.size, indexBytes: Buffer.byteLength(index), detailBytes: [...shards.values()].reduce((s, v) => s + Buffer.byteLength(encode(v)), 0), reused, valuationMissing: valuationErrors.length, failed: failures.length, seconds: Math.round((performance.now() - started) / 100) / 10, previousDate: oldIndex?.asOf ?? null }
  } catch (e) {
    return { written: false, date, reason: e.message, seconds: Math.round((performance.now() - started) / 100) / 10 }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await run()))
