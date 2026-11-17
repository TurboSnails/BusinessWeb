// 影子运行备用数据源（东财前复权）解析：身份校验、字段顺序、丢弃坏行
import test from 'node:test'
import assert from 'node:assert/strict'
import { eastmoneyUrl, emMarket, parseEastmoney } from './research/etf-strategy-oos/sources.mjs'

test('交易所：5/6 开头上交所，其余深交所', () => {
  assert.equal(emMarket('510300'), 1)
  assert.equal(emMarket('588000'), 1)
  assert.equal(emMarket('159915'), 0)
  assert.equal(emMarket('161716'), 0)
})

test('URL 用前复权、日线、截到给定日期', () => {
  const u = eastmoneyUrl('159915', '2026-11-17')
  assert.match(u, /secid=0\.159915/)
  assert.match(u, /fqt=1/)
  assert.match(u, /klt=101/)
  assert.match(u, /end=20261117/)
})

test('解析日期、开、收、高、低，丢弃坏行', () => {
  const j = { rc: 0, data: { code: '510300', market: 1, klines: ['2026-11-16,4.1,4.2,4.3,4.0,1', 'bad', '2026-11-17,4.2,4.15,4.25,4.1,1'] } }
  assert.deepEqual(parseEastmoney(j, '510300'), [
    { date: '2026-11-16', open: 4.1, close: 4.2, high: 4.3, low: 4.0 },
    { date: '2026-11-17', open: 4.2, close: 4.15, high: 4.25, low: 4.1 },
  ])
})

test('代码或交易所不符、rc 非 0 时报错，不串号', () => {
  const ok = { rc: 0, data: { code: '510300', market: 1, klines: [] } }
  assert.throws(() => parseEastmoney({ ...ok, rc: 102 }, '510300'))
  assert.throws(() => parseEastmoney(ok, '510880'))
  assert.throws(() => parseEastmoney({ rc: 0, data: { ...ok.data, market: 0 } }, '510300'))
  assert.throws(() => parseEastmoney({ rc: 0, data: null }, '510300'))
})
