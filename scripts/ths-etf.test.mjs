import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import {
  BROAD_ETFS, buildBroad, buildMarket, buildRebalance, classify, makeFlow, parseAdjustText, parseAnnouncementContent, parseKline,
  exchangeCount, keepArchive, notListed, parseSse, parseSzseRows, parseTencent, readXlsxRows, shouldReplace, targetDate, tradingDaysBack, universeOk,
  checkLaggedShares, isExchangeSzse, parseTencentShares, pickTencentShares, sseOnlyTotal, tencentSharesDate,
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

test('宽基历史：某只缺份额记录 → 当天合计为 null 并给出缺失只数，不当 0；新上市的不算缺失', () => {
  const dates = tradingDaysBack('2026-11-17', 3)
  const src = { sse: true, szse: true }
  const mk = (i) => { const shares = {}; const close = {}; for (const b of BROAD_ETFS) { shares[b.code] = 1e9 + i * 1e6; close[b.code] = 1 } return { shares, close, src: { ...src } } }
  const days = Object.fromEntries(dates.map((d, i) => [d, mk(i)]))
  // 11-17：510300 的份额记录缺失（旧逻辑：两天不都有份额 → 当 0 计入合计）
  delete days['2026-11-17'].shares['510300']
  // 11-16：563300 当日新上市（前一日交易所数据在、但没有这只）
  delete days['2026-11-13'].shares['563300']
  const flow = makeFlow(days)
  const b = buildBroad('2026-11-17', days, {}, flow)
  const h = Object.fromEntries(b.history.map(x => [x.date, x]))
  assert.deepEqual(h['2026-11-17'], { date: '2026-11-17', flow: null, missing: 1 })
  assert.equal(h['2026-11-16'].missing, 0)
  assert.equal(h['2026-11-16'].flow, 1e6 * (BROAD_ETFS.length - 1))
  assert.equal(b.list.find(r => r.code === '510300').flow1, null)
  assert.equal(b.byIndex.find(x => x.index === '沪深300').flow1, null)
  assert.equal(notListed(days, '563300', '2026-11-16'), true)
  assert.equal(notListed(days, '510300', '2026-11-17'), false)
  // 前一日该交易所数据整体缺失时，不能当作「未上市」
  const d2 = { '2026-11-16': { shares: { 510300: 1 }, close: {}, src: { szse: true } }, '2026-11-17': { shares: { 510300: 2 }, close: { 510300: 1 }, src } }
  assert.equal(notListed(d2, '510300', '2026-11-17'), false)
})

test('调仓附件：公告列出的指数在附件里缺失 → pending，不标 parsed', () => {
  const content = CONTENT.replace('中证500指数更换1只样本', '中证500指数更换1只样本，中证1000指数更换2只样本')
  assert.equal(buildRebalance({ id: 1, title: 't', publishDate: '2026-05-29' }, content, TEXT).status, 'pending')
  // 正文没解析出任何数量时也无法核对，标 pending
  assert.equal(buildRebalance({ id: 1, title: 't', publishDate: '2026-05-29' }, '<p>于2026年6月12日收市后生效。</p>', TEXT).status, 'pending')
})

test('交易所条数完整性：与参照日比较，不再只看 300 条下限', () => {
  assert.equal(universeOk(920, 925), true)
  assert.equal(universeOk(600, 925), false, '比前一日少三成 → 截断')
  assert.equal(universeOk(299, null), false)
  assert.equal(universeOk(400, null), true)
  const day = { src: { sse: true, szse: true }, shares: { 510300: 1, 588000: 1, 159915: 1 } }
  assert.equal(exchangeCount(day, 'sse'), 2)
  assert.equal(exchangeCount(day, 'szse'), 1)
  assert.equal(exchangeCount({ src: { sse: true }, shares: {} }, 'szse'), null)
})

test('历史 DATE 重跑：不删更新的存档、不替换更新的公开文件；同日更差的不替换', () => {
  const keep = new Set(tradingDaysBack('2026-11-10', 3))
  assert.equal(keepArchive('2026-11-17', '2026-11-10', keep), true)
  assert.equal(keepArchive('2026-11-06', '2026-11-10', keep), true)
  assert.equal(keepArchive('2026-10-01', '2026-11-10', keep), false)
  const q = { sse: 925, szse: 772, priceMissing: 0, broadMissing: 0 }
  assert.equal(shouldReplace(null, { asOf: '2026-11-17', quality: q }), true)
  assert.equal(shouldReplace({ asOf: '2026-11-17', quality: q }, { asOf: '2026-11-10', quality: q }), false)
  assert.equal(shouldReplace({ asOf: '2026-11-16', quality: q }, { asOf: '2026-11-17', quality: q }), true)
  assert.equal(shouldReplace({ asOf: '2026-11-17', quality: q }, { asOf: '2026-11-17', quality: { ...q, priceMissing: 4 } }), false)
  assert.equal(shouldReplace({ asOf: '2026-11-17', quality: q }, { asOf: '2026-11-17', quality: { ...q, szse: 700 } }), false)
  assert.equal(shouldReplace({ asOf: '2026-11-17', quality: q }, { asOf: '2026-11-17', quality: q }), true)
})

test('降级：已发布的是深交所缺席版，同日补齐深交所的结果可替换（沪市条数不能变少）', () => {
  const degraded = { sse: 925, szse: 0, priceMissing: 0, broadMissing: 0 }
  const full = { sse: 925, szse: 772, priceMissing: 2, broadMissing: 1 }
  assert.equal(shouldReplace({ asOf: '2026-11-17', quality: degraded }, { asOf: '2026-11-17', quality: full }), true)
  assert.equal(shouldReplace({ asOf: '2026-11-17', quality: degraded }, { asOf: '2026-11-17', quality: { ...full, sse: 900 } }), false)
  assert.equal(shouldReplace({ asOf: '2026-11-17', quality: full }, { asOf: '2026-11-17', quality: degraded }), false)
  assert.equal(shouldReplace({ asOf: '2026-11-16', quality: full }, { asOf: '2026-11-17', quality: degraded }), true)
})

// 腾讯行情一行：字段 1 名称、30 时间戳、72/73 总份额
const tq = (code, ts, s72, s73 = s72) => { const f = Array(80).fill(''); f[0] = '51'; f[1] = `名${code}`; f[2] = code; f[3] = '2.3'; f[30] = ts; f[72] = s72; f[73] = s73; return `v_sz${code}="${f.join('~')}";\n` }

test('腾讯份额：取字段 72（与 73 一致、正整数），沪市与异常行丢弃', () => {
  const text = tq('159915', '20261117161445', '46202454936') + tq('159919', '20261117161457', '13838616676', '1') + tq('159338', '20261117161451', '') + tq('159901', '20261117', '1')
    + 'v_sh510300="1~x~510300";'
  assert.deepEqual(parseTencentShares(text), { 159915: { name: '名159915', shares: 46202454936, ts: '20261117161445' } })
})

test('腾讯份额日期：时间戳日期的上一交易日；北京 07:00–09:30 不用', () => {
  // 北京 2026-11-17 18:00（周二收盘后）→ 时间戳应为 11-17，份额是 11-16
  assert.deepEqual(tencentSharesDate(new Date('2026-11-17T10:00:00Z')), { tsDate: '2026-11-17', date: '2026-11-16' })
  // 北京 11-18 04:30（开盘前、份额字段尚未换日）→ 仍是 11-17 快照、11-16 份额
  assert.deepEqual(tencentSharesDate(new Date('2026-11-17T20:30:00Z')), { tsDate: '2026-11-17', date: '2026-11-16' })
  // 北京 11-18 08:00：份额字段可能已换、时间戳还没换 → 不用
  assert.equal(tencentSharesDate(new Date('2026-11-18T00:00:00Z')), null)
  // 北京 11-18 10:00 盘中 → 时间戳 11-18，份额 11-17
  assert.deepEqual(tencentSharesDate(new Date('2026-11-18T02:00:00Z')), { tsDate: '2026-11-18', date: '2026-11-17' })
  // 周六 → 时间戳是周五，份额是周四
  assert.deepEqual(tencentSharesDate(new Date('2026-11-21T04:00:00Z')), { tsDate: '2026-11-20', date: '2026-11-19' })
  const picked = pickTencentShares({ 159915: { name: 'a', shares: 1, ts: '20261117161445' }, 159916: { name: 'b', shares: 2, ts: '20261113150000' } }, '2026-11-17')
  assert.deepEqual(picked, { 159915: { name: 'a', shares: 1 } }) // 停牌（时间戳旧）的不用
})

test('腾讯份额交叉校验：与同日交易所存档须一致、与前一日存档须有足够变化；交易所口径不被覆盖', () => {
  const codes = Array.from({ length: 200 }, (_, i) => String(159000 + i))
  const got = Object.fromEntries(codes.map((c, i) => [c, { shares: 1000 + i }]))
  const day = (f, via) => ({ src: { szse: true }, ...(via ? { via: { szse: via } } : {}), shares: Object.fromEntries(codes.map((c, i) => [c, f(i)])) })
  const prevChanged = day(i => (i % 2 ? 1000 + i : 900 + i))
  assert.equal(checkLaggedShares(got, undefined, prevChanged).ok, true)
  assert.equal(checkLaggedShares(got, day(i => 1000 + i), prevChanged).ok, true)
  assert.match(checkLaggedShares(got, day(i => (i < 20 ? 1 : 1000 + i)), prevChanged).reason, /同日深交所存档不一致/)
  assert.match(checkLaggedShares(got, undefined, day(i => (i < 5 ? 1 : 1000 + i))).reason, /几乎相同/)
  // 同日存档是行情推断值时不当作交易所数据比对
  assert.equal(checkLaggedShares(got, day(() => 1, 'tencent-qt'), prevChanged).ok, true)
  assert.equal(isExchangeSzse(day(() => 1)), true)
  assert.equal(isExchangeSzse(day(() => 1, 'szse')), true)
  assert.equal(isExchangeSzse(day(() => 1, 'tencent-qt')), false)
  assert.equal(isExchangeSzse({ src: { sse: true }, shares: {} }), false)
})

test('仅沪市合计：只加沪市名单，严格求和', () => {
  const list = [{ code: '510300', flow1: 1, flow5: 2, flow20: null, scale: 10 }, { code: '588000', flow1: 3, flow5: 4, flow20: 5, scale: 20 }, { code: '159919', flow1: null, flow5: null, flow20: null, scale: null }]
  assert.deepEqual(sseOnlyTotal(list), { n: 2, flow1: 4, flow5: 6, flow20: null, scale: 30 })
})
