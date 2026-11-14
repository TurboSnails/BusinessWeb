import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractToken, parseJsonp, widgetSymbol, toNumber, parseHsics, mapEquityQuote, createHkexClient, HkexError } from './hkex.mjs'

const PAGE = `<script>
LabCI.getToken = function () {
  //return "Base64-AES-Encrypted-Token";
  return "evLtsLsBNAUVTPxtGqVeG%2fabc%3d%3d";
};
</script>`

const QUOTE = {
  data: {
    responsecode: '000',
    quote: {
      sym: '66', nm: '港铁公司', ccy: 'HKD', ls: '27.450', hc: '27.600', hi52: '30.200', lo52: '24.150',
      pe: '11.85', eps: '2.3164', eps_ccy: 'HKD', div_yied: '4.70', mkt_cap: '170.87', mkt_cap_u: 'B', lot: '500',
      hsic_ind_classification: '非必需性消费 - 旅游及消闲设施', hsic_sub_sector_classification: '公共运输',
      updatetime: '13 Nov 2026 16:08',
    },
  },
}

test('extractToken skips commented return and keeps URL-encoded token', () => {
  assert.equal(extractToken(PAGE), 'evLtsLsBNAUVTPxtGqVeG%2fabc%3d%3d')
  assert.throws(() => extractToken('<html></html>'), e => e instanceof HkexError && e.code === 'TOKEN_NOT_FOUND')
  assert.throws(() => extractToken('LabCI.getToken = function () { //return "x"; }'), e => e.code === 'TOKEN_EMPTY')
})

test('parseJsonp handles callback wrapper, trailing semicolon and plain JSON', () => {
  assert.deepEqual(parseJsonp('cb1({"a":1});'), { a: 1 })
  assert.deepEqual(parseJsonp(' jQuery.cb_2 ({"a":[1,2]}) '), { a: [1, 2] })
  assert.deepEqual(parseJsonp('{"a":2}'), { a: 2 })
  assert.throws(() => parseJsonp(''), e => e.code === 'EMPTY')
  assert.throws(() => parseJsonp('cb(<html>)'), e => e.code === 'BAD_JSONP')
})

test('widgetSymbol strips leading zeros and rejects junk', () => {
  assert.equal(widgetSymbol('00066'), '66')
  assert.equal(widgetSymbol('0700.HK'), '700')
  assert.equal(widgetSymbol(9988), '9988')
  assert.throws(() => widgetSymbol('ABC'), e => e.code === 'BAD_SYMBOL')
  assert.throws(() => widgetSymbol('00000'), e => e.code === 'BAD_SYMBOL')
})

test('toNumber parses separators, percent, unit suffix and placeholders', () => {
  assert.equal(toNumber('1,234.5'), 1234.5)
  assert.equal(toNumber('4.70%'), 4.7)
  assert.equal(toNumber('3.5B'), 3.5e9)
  assert.equal(toNumber('-'), null)
  assert.equal(toNumber(''), null)
  assert.equal(toNumber(undefined), null)
  assert.equal(toNumber('abc'), null)
})

test('parseHsics splits industry/sector and takes sub-sector field', () => {
  assert.deepEqual(parseHsics('工业 - 工用支援', '采购及供应链管理'), {
    industry: '工业', sector: '工用支援', subSector: '采购及供应链管理', label: '工业 - 工用支援 - 采购及供应链管理',
  })
  assert.deepEqual(parseHsics('必需性消費 - 消費者主要零售商 - 個人護理', ''), {
    industry: '必需性消費', sector: '消費者主要零售商', subSector: '個人護理', label: '必需性消費 - 消費者主要零售商 - 個人護理',
  })
  assert.equal(parseHsics('', 'x'), null)
})

test('mapEquityQuote maps quote, valuation and HSICS fields and keeps raw', () => {
  const q = mapEquityQuote(QUOTE)
  assert.equal(q.symbol, '66')
  assert.equal(q.name, '港铁公司')
  assert.equal(q.last, 27.45)
  assert.equal(q.pe, 11.85)
  assert.equal(q.dividendYield, 4.7)
  assert.equal(q.lotSize, 500)
  assert.equal(q.hsics.sector, '旅游及消闲设施')
  assert.equal(q.hsics.subSector, '公共运输')
  assert.equal(q.raw.mkt_cap_u, 'B')
  assert.throws(() => mapEquityQuote({}), e => e.code === 'NO_DATA')
  assert.throws(() => mapEquityQuote({ data: { responsecode: '005', responsemsg: 'invalid token' } }), e => e.code === 'RESPONSE_CODE')
  assert.throws(() => mapEquityQuote({ data: { responsecode: '000' } }), e => e.code === 'NO_QUOTE')
})

test('client caches token and refreshes once on 403 (injected fetch, no network)', async () => {
  const calls = []
  let pageHits = 0
  let quoteHits = 0
  const fetchImpl = async url => {
    calls.push(url)
    if (url.includes('Equities-Quote')) {
      pageHits++
      return { ok: true, status: 200, text: async () => PAGE.replace('abc', pageHits === 1 ? 'old' : 'new') }
    }
    quoteHits++
    if (url.includes('old')) return { ok: false, status: 403, text: async () => 'Forbidden' }
    const cb = /callback=(\w+)/.exec(url)[1]
    return { ok: true, status: 200, text: async () => `${cb}(${JSON.stringify(QUOTE)})` }
  }
  const client = createHkexClient({ fetchImpl, minIntervalMs: 0 })
  const q = await client.getEquityQuote('00066')
  assert.equal(q.hsics.sector, '旅游及消闲设施')
  assert.equal(pageHits, 2)
  await client.getEquityQuote('66', { lang: 'eng' })
  assert.equal(pageHits, 2, 'token reused after refresh')
  assert.ok(calls.every(u => !u.includes('Equities-Quote') || u.includes('sc_lang=en')))
  assert.ok(calls.filter(u => u.includes('getequityquote')).every(u => /sym=66&/.test(u)))
  await assert.rejects(client.getEquityQuote('66', { lang: 'xx' }), e => e.code === 'BAD_LANG')
})

test('client gives a clear error when token stays rejected', async () => {
  const fetchImpl = async url => (url.includes('Equities-Quote')
    ? { ok: true, status: 200, text: async () => PAGE }
    : { ok: false, status: 403, text: async () => '' })
  const client = createHkexClient({ fetchImpl, minIntervalMs: 0 })
  await assert.rejects(client.getEquityQuote('5'), e => e instanceof HkexError && e.code === 'AUTH' && e.status === 403)
})
