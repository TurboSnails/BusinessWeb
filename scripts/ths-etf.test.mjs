import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import {
  BROAD_ETFS, buildBroad, buildMarket, buildRebalance, classify, makeFlow, parseAdjustText, parseAnnouncementContent, parseKline,
  parseSse, parseSzseRows, parseTencent, readXlsxRows, targetDate, tradingDaysBack,
} from './ths-etf-lib.mjs'

test('分类：东财分组优先，其余按名称', () => {
  assert.equal(classify('沪深300ETF华泰柏瑞', 'MK0021'), '宽基')
  assert.equal(classify('A500ETF华泰柏瑞'), '宽基')
  assert.equal(classify('A500红利低波ETF易方达'), '行业主题')
  assert.equal(classify('创业板电池ETF永赢'), '行业主题')
  assert.equal(classify('创业板ETF易方达'), '宽基')
  assert.equal(classify('纳指ETF广发', 'MK0023'), '跨境')
  assert.equal(classify('恒生科技ETF'), '跨境')
  assert.equal(classify('黄金ETF华安', 'MK0024'), '商品')
  assert.equal(classify('豆粕ETF华夏'), '商品')
  assert.equal(classify('黄金股ETF'), '行业主题')
  assert.equal(classify('30年国债'), '债券')
  assert.equal(classify('华宝添益ETF'), '货币')
  assert.equal(classify('银华日利ETF', 'MK0022'), '货币')
})

test('宽基名单 20–40 只且无重复', () => {
  assert.ok(BROAD_ETFS.length >= 20 && BROAD_ETFS.length <= 40)
  assert.equal(new Set(BROAD_ETFS.map(b => b.code)).size, BROAD_ETFS.length)
})

test('上交所：万份→份，日期必须一致，空结果为 null', () => {
  const rows = Array.from({ length: 320 }, (_, i) => ({ STAT_DATE: '2026-11-17', SEC_CODE: String(510000 + i), SEC_NAME: 'X', TOT_VOL: '12.5' }))
  const out = parseSse({ result: rows }, '2026-11-17')
  assert.equal(out['510000'].shares, 125000)
  assert.equal(parseSse({ result: [] }, '2026-11-17'), null)
  assert.throws(() => parseSse({ result: [{ ...rows[0], STAT_DATE: '2026-11-16' }, ...rows] }, '2026-11-17'), /日期不符/)
  assert.throws(() => parseSse({ result: rows.slice(0, 10) }, '2026-11-17'), /条数过少/)
  assert.throws(() => parseSse('<html>', '2026-11-17'), /格式异常/)
})

// 构造最小 xlsx（deflate + inlineStr）
function zip(files) {
  const locals = []; const centrals = []; let off = 0
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text)); const n = Buffer.from(name)
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(data.length, 18); lh.writeUInt16LE(n.length, 26)
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(data.length, 20); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(off, 42)
    locals.push(lh, n, data); centrals.push(ch, n); off += 30 + n.length + data.length
  }
  const cd = Buffer.concat(centrals); const e = Buffer.alloc(22)
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(Object.keys(files).length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16)
  return Buffer.concat([...locals, cd, e])
}
const cell = (r, c, v) => `<c r="${c}${r}" t="inlineStr"><is><t>${v}</t></is></c>`
const sheet = (rows) => `<worksheet><sheetData>${rows.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => cell(i + 1, 'ABCD'[j], v)).join('')}</row>`).join('')}</sheetData></worksheet>`

test('深交所 xlsx：表头校验、份、代码去空格', () => {
  const buf = zip({ 'xl/worksheets/sheet1.xml': sheet([['日期', '基金代码', '基金简称', '基金规模(份)'], ['2026-11-17', '159915  ', '创业板ETF', '46859454900.00'], ['2026-11-16', '159915', '创业板ETF', '-']]) })
  const out = parseSzseRows(readXlsxRows(buf))
  assert.equal(out['2026-11-17']['159915'].shares, 46859454900)
  assert.equal(out['2026-11-16'], undefined) // '-' 是缺失，不当 0
  assert.throws(() => parseSzseRows([['日期', '代码']]), /表头异常/)
})

test('腾讯价格：只收目标日 15:00 后时间戳', () => {
  const f = (code, ts) => `v_sh${code}="1~名~${code}~4.042~4.054~${Array(25).fill('0').join('~')}~${ts}~x";`
  const out = parseTencent(f('510300', '20261117161455') + f('510310', '20261116161455') + f('510330', '20261117113000'), '2026-11-17')
  assert.deepEqual(out, { 510300: 4.042 })
})

test('日 K 解析与代码校验', () => {
  assert.deepEqual(parseKline({ data: { code: '510300', klines: ['2026-11-17,4.042', '2026-11-16,-'] } }, '510300'), { '2026-11-17': 4.042 })
  assert.throws(() => parseKline({ data: { code: '510310', klines: [] } }, '510300'))
})

test('申购净流入：份额差 × 当日收盘；前一交易日缺失 → null；份额不变 → 0', () => {
  const days = {
    '2026-11-13': { shares: { A: 100 }, close: {} },
    '2026-11-16': { shares: { A: 150, B: 10 }, close: { A: 2 } },
    '2026-11-17': { shares: { A: 150, B: 20 }, close: {} },
  }
  const flow = makeFlow(days)
  assert.equal(flow('A', '2026-11-16'), 100)
  assert.equal(flow('B', '2026-11-16'), null) // 新上市
  assert.equal(flow('A', '2026-11-17'), 0)
  assert.equal(flow('B', '2026-11-17'), null) // 缺价格
  assert.equal(flow('A', '2026-11-13'), null) // 前一日无记录
})

test('宽基与全市场汇总：严格求和、排行方向', () => {
  const dates = tradingDaysBack('2026-11-17', 22)
  const days = {}
  dates.forEach((d, i) => {
    const shares = {}; const close = {}
    for (const b of BROAD_ETFS) { shares[b.code] = 1e9 + i * 1e6; close[b.code] = 1 }
    shares['512880'] = 1e9 - i * 1e6; close['512880'] = 1
    days[d] = { shares, close }
  })
  const flow = makeFlow(days)
  const broad = buildBroad('2026-11-17', days, {}, flow)
  assert.equal(broad.list[0].flow1, 1e6)
  assert.equal(broad.list[0].flow20, 2e7)
  assert.equal(broad.list[0].streak, 21)
  assert.equal(broad.total.flow1, 1e6 * BROAD_ETFS.length)
  assert.equal(broad.history.length, 21)
  const meta = { 512880: { name: '证券ETF', cat: '行业主题' }, 510300: { name: '沪深300ETF', cat: '宽基' } }
  const m = buildMarket('2026-11-17', days, meta, flow)
  const theme = m.categories.find(c => c.cat === '行业主题')
  assert.equal(theme.rank.d1.outflow[0].code, '512880')
  assert.ok(!theme.rank.d1.inflow.some(r => r.code === '512880'))
  assert.ok(m.categories.find(c => c.cat === '宽基').rank.d5.inflow.every(r => r.flow5 > 0))
})

const CONTENT = '<p>决定调整沪深300、中证500等指数样本，于2026年6月12日收市后生效。其中沪深300指数更换2只样本，中证500指数更换1只样本。</p>'
const TEXT = ['附件：部分指数样本调整名单', '沪深 300 指数样本调整名单：', '调出名单 调入名单', '证券代码 证券名称 证券代码 证券名称', '000661 长春高新 000657 中钨高新', '000563 陕国投 A 000988 华工科技', '中证 500 指数样本调整名单：', '调出名单 调入名单', '000426 兴业银锡 000661 长春高新', '沪深 300 指数备选名单：', '1 000001 平安银行'].join('\n')

test('调仓公告：生效日、更换数量、名单解析', () => {
  const c = parseAnnouncementContent(CONTENT)
  assert.equal(c.effectiveDate, '2026-06-12')
  assert.deepEqual(c.expected, { 沪深300: 2, 中证500: 1 })
  const idx = parseAdjustText(TEXT)
  assert.deepEqual(idx.map(x => [x.index, x.in.length]), [['沪深300', 2], ['中证500', 1]])
  assert.deepEqual(idx[0].out[1], { code: '000563', name: '陕国投A' })
  const r = buildRebalance({ id: 1, title: 't', publishDate: '2026-05-29' }, CONTENT, TEXT)
  assert.equal(r.status, 'parsed')
  // 数量对不上 → pending，不发布名单
  assert.equal(buildRebalance({ id: 1, title: 't', publishDate: '2026-05-29' }, CONTENT.replace('更换1只', '更换3只'), TEXT).status, 'pending')
  assert.equal(buildRebalance({ id: 1, title: 't', publishDate: '2026-05-29' }, CONTENT, null).status, 'pending')
})

test('目标交易日：15:30 前取上一交易日', () => {
  assert.equal(targetDate(new Date('2026-11-17T07:00:00Z')), '2026-11-16')
  assert.equal(targetDate(new Date('2026-11-17T08:00:00Z')), '2026-11-17')
  assert.equal(targetDate(new Date('2026-11-17T19:00:00Z')), '2026-11-17')
  assert.equal(targetDate(new Date('2026-11-15T08:00:00Z')), '2026-11-13')
})
