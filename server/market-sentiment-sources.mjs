import { BLUE_CHIP_SYMBOLS, WEIGHT_INDEX_SYMBOLS, DRAWDOWN_THRESHOLD, finiteNumber, computeBreadth, computeTurnover, computeLimitUp, computeDrawdown, computeWeight } from './market-sentiment.mjs'

const SINA = 'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/'
const countUrl = `${SINA}Market_Center.getHQNodeStockCount?node=hs_a`
const pageUrl = (page, size) => `${SINA}Market_Center.getHQNodeData?${new URLSearchParams({ node: 'hs_a', sort: 'symbol', asc: '1', num: String(size), page: String(page) })}`
const retry = async run => {
  for (let attempt = 0; ; attempt++) {
    try { return await run() } catch (error) { if (attempt >= 2) throw error }
  }
}
async function mapPages(items, run) {
  let cursor = 0, failure
  const results = Array(items.length)
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (cursor < items.length && !failure) {
      const index = cursor++
      // Settle every worker before returning, including after one page fails.
      try { results[index] = { value: await run(items[index], index) } }
      catch (error) { failure = error; results[index] = { error } }
    }
  }))
  if (failure) throw failure
  return results.map(result => result.value)
}

// Coverage follows Sina's hs_a universe; accept Beijing symbols if supplied.
// Never treat a short page, capped endpoint or changing count as a complete market.
export async function collectSinaMarket({ get, initialTotal, minTotal = 4000, maxTotal = 8000, pageSize = 80 }) {
  const parseCount = body => {
    if (!['string', 'number'].includes(typeof body) || !/^\d+$/.test(String(body))) throw new Error('新浪全市场总数格式异常')
    return Number(body)
  }
  const total = parseCount(initialTotal ?? await retry(() => get(countUrl)))
  if (!Number.isInteger(total) || total < minTotal || total > maxTotal) return { status: 'incomplete', reason: '全市场总数异常', expected: total, received: 0 }
  let pages
  try {
    pages = await mapPages(Array.from({ length: Math.ceil(total / pageSize) }, (_, i) => i + 1), page => retry(async () => {
      const body = await get(pageUrl(page, pageSize))
      const expected = Math.min(pageSize, total - (page - 1) * pageSize)
      if (!Array.isArray(body) || body.length !== expected) throw new Error(`全市场第 ${page} 页不足或格式异常`)
      return body.map(row => {
        if (!/^(sh|sz|bj)\d{6}$/.test(row?.symbol) || typeof row.name !== 'string' || !row.name.trim()) throw new Error('全市场证券字段异常')
        const pct = finiteNumber(row.changepercent), price = finiteNumber(row.trade)
        return { code: row.symbol.slice(2), name: row.name, pct: price === null || price <= 0 ? null : pct }
      })
    }))
  } catch (error) { return { status: 'incomplete', reason: error.message, expected: total, received: null } }
  const rows = pages.flat()
  const finalTotal = parseCount(await retry(() => get(countUrl)))
  if (finalTotal !== total || new Set(rows.map(row => row.code)).size !== total) return { status: 'incomplete', reason: '全市场总数变化或证券重复', expected: total, received: rows.length }
  return { status: 'ready', rows }
}

export async function buildMarketSentiment({ get, poolUrl, parsePool, parseQuotes, dataDate, today, fetchedAt, history, previousDates, up, broken, down, indexRows, blueChipSymbols = BLUE_CHIP_SYMBOLS, drawdownThreshold = DRAWDOWN_THRESHOLD }) {
  // Nested provenance keeps the legacy seven-source schema valid in existing clients.
  const sources = []
  const collect = async (id, label, url, parser, kind) => {
    const source = { id, label, url, date: null, fetchedAt, status: 'unavailable', note: '' }
    sources.push(source)
    try { return { source, value: parser(await get(url, kind)) } }
    catch (error) { source.note = error instanceof Error ? error.message : '数据源暂时不可用'; return { source, value: null } }
  }
  const requireRows = result => {
    if (!result.value || result.value.date !== dataDate) throw new Error(result.source.note || '股池日期不匹配或不可用')
    return result.value.rows
  }
  const previous = history.find(row => row.dataDate === previousDates[0] && row.sources?.some(source => source.id === 'limitUp' && source.status === 'ready'))
  const breadthSources = [
    { id: 'sentimentBreadthCount', label: '新浪A股总数', url: countUrl },
    { id: 'sentimentBreadth', label: '新浪A股分页行情（无交易日期）', url: pageUrl(1, 80) },
  ].map(source => ({ ...source, date: null, fetchedAt, status: 'unavailable', note: '' }))
  sources.push(...breadthSources)
  const marketPromise = (async () => {
    try {
      if (dataDate !== today) throw new Error('新浪全市场行情无日期，不能用于历史交易日')
      const value = await collectSinaMarket({ get })
      for (const source of breadthSources) {
        source.status = value.status === 'ready' ? 'undated' : 'partial'
        source.note = value.reason ?? 'hs_a A股；无源交易日期，仅代表本次采集'
      }
      return value
    } catch (error) {
      for (const source of breadthSources) source.note = error.message
      return { status: 'error', reason: error.message }
    }
  })()
  const yesterdayPromise = collect('sentimentYesterday', '东方财富昨日涨停股池', poolUrl('getYesterdayZTPool', 'zs:desc'), body => {
    const parsed = parsePool(body, today)
    parsed.rows = parsed.rows.map((row, i) => {
      const value = finiteNumber(body.data.pool[i].lbc)
      const archived = previous?.upStocks?.find(stock => stock.code === row.code)?.boards
      return { ...row, boards: Number.isInteger(value) && value >= 1 ? value : Number.isInteger(archived) && archived >= 1 ? archived : null }
    })
    return parsed
  })
  const weightUrl = `https://qt.gtimg.cn/q=${[...new Set([...WEIGHT_INDEX_SYMBOLS, ...blueChipSymbols])].join(',')}`
  const weightPromise = collect('sentimentWeight', '腾讯主要指数与蓝筹批量行情', weightUrl, raw => parseQuotes(raw, today), 'quotes')
  const [market, yesterdayResult, weightResult] = await Promise.all([marketPromise, yesterdayPromise, weightPromise])
  if (yesterdayResult.value) {
    yesterdayResult.source.date = yesterdayResult.value.date
    yesterdayResult.source.status = yesterdayResult.value.date === dataDate ? 'ready' : 'unavailable'
    if (yesterdayResult.value.date !== dataDate) yesterdayResult.source.note = '昨日涨停股池统计日期与快照不一致'
  }
  let cohortQuotes = [], cohortError
  try {
    const yesterday = requireRows(yesterdayResult)
    if (yesterday.length) {
      const symbol = code => `${/^(?:[48]|92)/.test(code) ? 'bj' : /^[56]/.test(code) ? 'sh' : 'sz'}${code}`
      const ordered = [...yesterday].sort((a, b) => a.code.localeCompare(b.code))
      const chunks = Array.from({ length: Math.ceil(ordered.length / 80) }, (_, i) => ordered.slice(i * 80, (i + 1) * 80))
      const batches = await mapPages(chunks, async (rows, index) => {
        const result = await collect(`sentimentYesterdayQuotes${index}`, '腾讯昨日涨停股今日行情', `https://qt.gtimg.cn/q=${rows.map(row => symbol(row.code)).join(',')}`, raw => parseQuotes(raw, today), 'quotes')
        const quotes = [...(result.value?.values() ?? [])].filter(row => row.date === dataDate)
        result.source.date = quotes.length ? dataDate : null
        result.source.status = rows.every(row => quotes.some(quote => quote.code === row.code)) ? 'ready' : quotes.length ? 'partial' : 'unavailable'
        if (result.source.status !== 'ready') { result.source.note ||= '昨日涨停股今日报价缺失或日期不匹配'; throw new Error(result.source.note) }
        return quotes.map(row => ({ code: row.code, name: row.name, pct: row.change }))
      })
      cohortQuotes = batches.flat()
    }
  } catch (error) { cohortError = error }
  const block = run => {
    try { return run() } catch (error) { return { status: 'error', reason: error.message || '数据不可用' } }
  }
  const cohort = () => { if (cohortError) throw cohortError; return requireRows(yesterdayResult) }
  const breadth = block(() => market.status !== 'ready' ? market : computeBreadth({ rows: market.rows, limitUp: requireRows(up), limitDown: requireRows(down) }))
  const turnover = block(() => {
    const sh = indexRows.find(row => row.symbol === 'sh000001'), sz = indexRows.find(row => row.symbol === 'sz399001')
    if (sh?.amount == null || sz?.amount == null) throw new Error('两市指数成交额缺失')
    return computeTurnover({ amount: (sh.amount + sz.amount) / 1e8, dataDate, history, previousDates })
  })
  const limitUp = block(() => computeLimitUp({ yesterday: cohort(), quotes: cohortQuotes, current: requireRows(up), broken: requireRows(broken) }))
  const drawdown = block(() => computeDrawdown({ yesterday: cohort(), quotes: cohortQuotes, threshold: drawdownThreshold }))
  const weight = block(() => {
    const rows = [...(weightResult.value?.values() ?? [])].filter(row => row.date === dataDate)
    weightResult.source.date = rows.length ? dataDate : null
    const expected = [...WEIGHT_INDEX_SYMBOLS, ...blueChipSymbols]
    const complete = expected.every(symbol => rows.some(row => row.symbol === symbol))
    weightResult.source.status = complete ? 'ready' : rows.length ? 'partial' : 'unavailable'
    if (!complete) { weightResult.source.note ||= '蓝筹或指数报价缺失、日期不匹配'; throw new Error(weightResult.source.note) }
    return computeWeight({
      indices: rows.filter(row => WEIGHT_INDEX_SYMBOLS.includes(row.symbol)).map(({ symbol, code, name, change }) => ({ symbol, code, name: name || code, change })),
      blueChips: rows.filter(row => blueChipSymbols.includes(row.symbol)).map(({ code, name, change }) => ({ code, name: name || code, pct: change })),
      expectedSymbols: blueChipSymbols.map(symbol => symbol.slice(2)), medianPct: breadth.status === 'ready' ? breadth.medianPct : null,
    })
  })
  return { asOf: dataDate, breadth, turnover, limitUp, drawdown, weight, sources }
}
