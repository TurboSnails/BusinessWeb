import assert from 'node:assert/strict'

export const rawStock = i => ({ symbol: `sh${String(600000 + i)}`, code: String(600000 + i), name: `股票${i}`, trade: '10', changepercent: i === 0 ? '-6' : '1' })
export const quote = symbol => {
  const fields = Array(50).fill('')
  Object.assign(fields, { 1: symbol, 3: '10', 30: '20261021150000', 32: symbol === 'sh600000' ? '-6' : '1', 35: '10/100/10000000000', 37: '1000000', 38: '2' })
  return `v_${symbol}="${fields.join('~')}";`
}
export const pool = rows => ({ rc: 0, data: { qdate: 20261021, tc: rows.length, pool: rows } })
export function fixtureFetch({ failBreadth = false, failBroken = false, yesterday = [{ c: '600000', n: '浦发银行', lbc: 2 }] } = {}) {
  return async (url, options) => {
    assert.equal(options.redirect, 'error')
    assert.ok(options.signal)
    const u = new URL(url)
    let body
    if (u.host === 'qt.gtimg.cn') return new Response(u.pathname.slice(3).split(',').map(quote).join('\n'))
    if (u.pathname.includes('getHQNodeStockCount')) body = failBreadth ? { error: 'denied' } : '4000'
    else if (u.pathname.includes('getHQNodeData') && u.searchParams.get('num') !== '5') {
      const page = Number(u.searchParams.get('page')), size = Number(u.searchParams.get('num'))
      body = Array.from({ length: Math.min(size, 4000 - (page - 1) * size) }, (_, i) => rawStock((page - 1) * size + i))
    } else if (u.pathname.includes('getHQNodeData')) body = Array.from({ length: 5 }, (_, i) => rawStock(i))
    else if (u.pathname.includes('getYesterdayZTPool')) body = pool(yesterday)
    else if (u.pathname.includes('getTopicZBPool')) {
      if (failBroken) return new Response('{}', { status: 503 })
      body = pool([{ c: '600000', n: '浦发银行' }])
    } else if (u.pathname.includes('getTopicZTPool')) body = pool([{ c: '600001', n: '股票1', lbc: 1 }])
    else if (u.pathname.includes('getTopicDTPool')) body = pool([])
    else if (u.pathname.includes('MoneyFlow')) body = [{ name: '行业', netamount: '100000000' }]
    else throw new Error(`Unexpected fixture URL ${url}`)
    return new Response(JSON.stringify(body))
  }
}

