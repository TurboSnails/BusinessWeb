import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  HK_ROWS, parseHsiDir, parseHsiCsv, hsiCsvUrl, parseRoundupTable, nextRoundupMonth, roundupCandidates,
  percentile, pePercentile, stateOf, monthEnds, weekEnds, valuationStats, hkSamples, buildHkRow,
  parseMultplTable, parseHomForward, buildGlobalRow, parseSinaGc, lastClosedGcDate, parseTreasuryReal, parseBlsCpi, cpiFor, buildGold,
  parseCsiPerfPe, shouldWrite, carryRows, asOfOf,
} from './jixing-global-lib.mjs'

const utf16 = (text) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])
const csv = (date, rows) => utf16([
  '"交易日"\t"指數"\t"指數貨幣"\t"全日最高"\t"全日最低"\t"指數收市"\t"點數變動"\t"百分比變動"\t"股息率"\t"市盈率"',
  '"Trade Date"\t"Index"\t"Index Currency"\t"Daily High"\t"Daily Low"\t"Index Close"\t"Point Change"\t"% Change"\t"Dividend Yield (%)"\t"PE Ratio (times)"',
  ...rows.map(([name, close, dy, pe]) => `"${date.replaceAll('-', '')}"\t"${name}"\t"HKD"\t"1"\t"1"\t"${close}"\t"0"\t"0"\t"${dy}"\t"${pe}"`),
].join('\r\n'))

test('恒生日报目录：只收路径与日期一致、不晚于今天的 idx 报表', () => {
  const body = [{ seriesCode: 'hsi', reportList: [
    { reportType: 'con-pdf-1', reportDate: [{ url: 'x', date: '2026-11-17' }] },
    { reportType: 'idx', reportDate: [
      { url: '/public-website/webapp/contents/en/indexes/report/hsi/idx_17Nov26.csv', date: '2026-11-17' },
      { url: '/public-website/webapp/contents/en/indexes/report/hsi/idx_3Nov26.csv', date: '2026-11-03' },
      { url: '/public-website/webapp/contents/en/indexes/report/hsi/idx_9Nov26.csv', date: '2026-11-10' }, // 路径与日期不符
      { url: '/public-website/webapp/contents/en/indexes/report/hsi/idx_19Nov26.csv', date: '2026-11-19' }, // 未来
    ] },
  ] }]
  assert.deepEqual(parseHsiDir(body, 'hsi', '2026-11-18'), ['2026-11-17', '2026-11-03'])
  assert.throws(() => parseHsiDir([], 'hsi', '2026-11-18'), /系列身份/)
  assert.match(hsiCsvUrl('hsi', '2026-11-03'), /idx_3Nov26\.csv$/)
})

test('恒生日报 CSV：按名称取唯一行，交易日必须一致，缺值不写 0', () => {
  const b = csv('2026-11-17', [['Hang Seng Index 恒生指數', '23508.17', '3.11', '13.16'], ['Hang Seng TECH Index 恒生科技指數', '3758.17', '', '']])
  assert.deepEqual(parseHsiCsv(b, '2026-11-17', 'Hang Seng Index 恒生指數'), { date: '2026-11-17', close: 23508.17, pe: 13.16, dy: 3.11 })
  assert.deepEqual(parseHsiCsv(b, '2026-11-17', 'Hang Seng TECH Index 恒生科技指數'), { date: '2026-11-17', close: 3758.17, pe: null, dy: null })
  assert.throws(() => parseHsiCsv(b, '2026-11-18', 'Hang Seng Index 恒生指數'), /不符/)
  assert.throws(() => parseHsiCsv(b, '2026-11-17', 'Hang Seng China Enterprises Index 恒生中國企業指數'), /唯一/)
  assert.throws(() => parseHsiCsv(Buffer.from('abc'), '2026-11-17', 'x'), /UTF-16LE/)
})

const roundupPages = (asAt = 'As at 30 October') => [
  `Monthly Roundup ${asAt}\nPE Ratio (Times)\nHang Seng Index and its related indexes`,
  [
    'Hang Seng Index -5.36% -10.01% -10.08% -9.11% 13.04 3.14%',
    'Hang Seng China Enterprises Index -4.35% -8.71% -14.25% -11.80% 11.64 2.97%',
    'Hang Seng TECH Index -11.73% -22.25% -36.44% -31.93% -25.43 1.23%',
    'Hang Seng Healthcare Index -14.34% -1.45% -15.91% -7.03% - -',
    `${asAt} 2026`,
  ].join('\n'),
]

test('恒生月报：As at 日期、各指数 PE 与股息率；缺行记 null，亏损 PE 保留负值', () => {
  const url = 'https://www.hsi.com.hk/content/dam/wpb/hsil/en_hk/monthly_roundup/content/20261102T000000.pdf'
  const r = parseRoundupTable(roundupPages(), url)
  assert.equal(r.date, '2026-10-30')
  assert.equal(r.month, '2026-10')
  assert.deepEqual(r.values.hsi, { pe: 13.04, dy: 3.14 })
  assert.deepEqual(r.values.hstech, { pe: -25.43, dy: 1.23 })
  assert.deepEqual(r.values.hshci, { pe: null, dy: null })
  assert.equal(r.values.hshdyi, null)
  assert.throws(() => parseRoundupTable(roundupPages(), 'https://evil.test/x.pdf'), /白名单/)
  assert.throws(() => parseRoundupTable(roundupPages('As at 15 October'), url), /最后 7 天/)
  // 12 月报告在次年 1 月发布
  const dec = parseRoundupTable(roundupPages('As at 31 December'), 'https://www.hsi.com.hk/content/dam/wpb/hsil/en_hk/monthly_roundup/content/20270104T000000.pdf')
  assert.equal(dec.date, '2026-12-31')
})

test('月报探测：下一份报告月与候选 URL', () => {
  assert.equal(nextRoundupMonth('2026-10', '2026-11-18'), null)
  assert.deepEqual(nextRoundupMonth('2026-10', '2026-12-02'), { reportMonth: '2026-11', pubMonth: '2026-12' })
  assert.deepEqual(nextRoundupMonth('2026-11', '2027-01-05'), { reportMonth: '2026-12', pubMonth: '2027-01' })
  const c = roundupCandidates('2026-12', '2026-12-02')
  assert.equal(c[0], 'https://www.hsi.com.hk/content/dam/wpb/hsil/en_hk/monthly_roundup/content/20261201T000000.pdf')
  assert.equal(c.length, 12)
})

test('分位：(低于 + 0.5 × 等于) / n；PE 分位按盈利收益率排序，亏损视为最贵', () => {
  assert.equal(percentile([1, 2, 3, 4], 3), 62.5)
  assert.equal(percentile([], 3), null)
  assert.equal(pePercentile([10, 20, 30, 40], 30), 62.5)
  // 亏损月（PE 为负）比任何盈利月都贵：当前 PE 40 低于它
  assert.equal(pePercentile([10, 20, -50, 40], 40), 62.5)
  assert.equal(stateOf(29.9), '低估')
  assert.equal(stateOf(30), '正常')
  assert.equal(stateOf(70), '正常')
  assert.equal(stateOf(70.1), '高估')
  assert.equal(stateOf(null), null)
})

test('采样：月末与周末各取最后一个点', () => {
  const pts = [{ date: '2026-10-30' }, { date: '2026-11-02' }, { date: '2026-11-17' }]
  assert.deepEqual(monthEnds(pts).map(p => p.date), ['2026-10-30', '2026-11-17'])
  assert.deepEqual(weekEnds([{ date: '2026-11-16' }, { date: '2026-11-18' }, { date: '2026-11-23' }]).map(p => p.date), ['2026-11-18', '2026-11-23'])
})

const monthly = (n, f, start = 2021) => Array.from({ length: n }, (_, i) => {
  const y = start + Math.floor(i / 12), m = i % 12 + 1
  return { date: `${y}-${String(m).padStart(2, '0')}-28`, ...f(i) }
})

test('估值统计：窗口、样本不足、股息率反向、亏损占比过高不判定', () => {
  const s = monthly(60, i => ({ pe: 10 + i * 0.1, dy: 5 - i * 0.01 }))
  const st = valuationStats(s, { years: 5, freq: '月', basis: 'pe' })
  assert.equal(st.window.n, 60)
  assert.ok(st.pePct > 99)
  assert.equal(st.state, '高估')
  const dy = valuationStats(s, { years: 5, freq: '月', basis: 'dy' })
  assert.ok(dy.dyPct < 1) // 股息率最低 → 最贵
  assert.equal(dy.valPct, Math.round((100 - dy.dyPct) * 10) / 10)
  assert.equal(dy.state, '高估')
  assert.ok(dy.refs.low > dy.refs.high) // 股息率参考线：低估线在高股息一侧
  const short = valuationStats(s.slice(-20), { years: 5, freq: '月', basis: 'pe' })
  assert.equal(short.pePct, null)
  assert.equal(short.state, null)
  assert.equal(short.window.enough, false)
  const lossy = monthly(60, i => ({ pe: i < 10 ? -50 : 20, dy: 1 }))
  const l = valuationStats(lossy, { years: 5, freq: '月', basis: 'pe' })
  assert.ok(l.pePct !== null)
  assert.equal(l.state, null)
  assert.equal(l.window.distorted, true)
})

test('港股合并：月报优先，日报补缺月与当月最新，中证缺 PE 的天不进样本', () => {
  const row = HK_ROWS.find(r => r.key === 'hsi')
  const m = [{ month: '2026-10', date: '2026-10-30', values: { hsi: { pe: 13.04, dy: 3.14 } } }]
  const daily = { hsi: [['2026-10-30', 1, 99, 9], ['2026-11-17', 1, 13.16, 3.11], ['2026-11-18', 1, 13.04, 3.14]] }
  const s = hkSamples(row, m, daily, {})
  assert.deepEqual(s.map(p => [p.date, p.pe, p.src]), [['2026-10-30', 13.04, 'roundup'], ['2026-11-18', 13.04, 'daily']])
  const csiRow = HK_ROWS.find(r => r.csi)
  const cs = hkSamples(csiRow, [], {}, { [csiRow.csi]: [{ date: '2026-11-17', pe: 10.9 }, { date: '2026-11-18', pe: null }] })
  assert.deepEqual(cs.map(p => p.date), ['2026-11-17'])
  const built = buildHkRow(row, s)
  assert.equal(built.date, '2026-11-18')
  assert.equal(built.freq, '日')
  assert.equal(built.pePct, null) // 只有 2 个样本
  assert.equal(built.pb, null)
})

test('中证行情：peg 缺失或非正记 null', () => {
  const r = parseCsiPerfPe({ code: '200', data: [{ tradeDate: '20261117', peg: '10.92' }, { tradeDate: '20261118', peg: null }, { tradeDate: '20261118', peg: 1 }] })
  assert.deepEqual(r, [{ date: '2026-11-17', pe: 10.92 }, { date: '2026-11-18', pe: null }])
  assert.throws(() => parseCsiPerfPe({ code: '500' }), /为空/)
})

test('multpl 表格：升序、估算标记、丢弃未来日期', () => {
  const rows = [['Nov 30, 2026', '<abbr title="Estimate">†</abbr>\n1.10%'], ['Nov 17, 2026', '<abbr title="Estimate">†</abbr>\n25.04'], ['Nov 1, 2026', '&#x2002;\n25.73']]
  for (let i = 0; i < 120; i++) rows.push([`Jan 1, ${1900 + i}`, '&#x2002;\n15.0'])
  const html = `<table id="datatable"><tr><th>Date</th></tr>${rows.map(([d, v]) => `<tr class="odd">\n<td>${d}</td>\n<td>\n${v}\n</td>\n</tr>`).join('\n')}</table>`
  const t = parseMultplTable(html, '2026-11-18')
  assert.equal(t.at(-1).date, '2026-11-17')
  assert.equal(t.at(-1).est, true)
  assert.equal(t.at(-2).est, false)
  assert.ok(!t.some(p => p.date === '2026-11-30'))
  assert.throws(() => parseMultplTable('<html></html>'), /数据表/)
})

test('History of Market：终端周度 + 自算日度按周拼接，记录拼接日', () => {
  const forward = Array.from({ length: 120 }, (_, i) => ({ date: new Date(Date.UTC(2024, 0, 5 + 7 * i)).toISOString().slice(0, 10), value: 20 }))
  const last = forward.at(-1).date
  const own = [{ date: last, value: 19 }, { date: '2026-11-16', value: 18 }, { date: '2026-11-17', value: 17.6 }]
  const h = parseHomForward({ forward, forwardOwn: own, updated: '2026-11-18' })
  assert.equal(h.spliceDate, last)
  assert.equal(h.points.at(-1).value, 17.6)
  assert.equal(h.points.at(-1).own, true)
  assert.ok(!h.points.some(p => p.date === last && p.own)) // 拼接日用终端值
  assert.throws(() => parseHomForward({ forward: [] }), /缺失/)
  const row = buildGlobalRow({ key: 'x', name: 'X', freq: '周', peKind: 'Forward PE', source: 's' }, h.points.map(p => ({ date: p.date, pe: p.value, dy: null })))
  assert.equal(row.date, '2026-11-17')
  assert.equal(row.history.at(-1)[1], 17.6)
})

test('黄金：新浪日线、收盘判定、财政部 CSV、BLS 缺月、实际金价分位', () => {
  const sina = `/*<script>*/\nvar _GC=([${Array.from({ length: 250 }, (_, i) => `{"date":"${new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)}","close":"${3000 + i}"}`).join(',')}]);`
  const gc = parseSinaGc(sina)
  assert.equal(gc.length, 250)
  assert.equal(gc[0].close, 3000)
  assert.equal(lastClosedGcDate('2026-11-18T12:00:00Z'), '2026-11-18') // 北京 20:00：只收 11-17 及以前
  assert.equal(lastClosedGcDate('2026-11-18T22:30:00Z'), '2026-11-18') // 北京 11-19 06:30：07:00 前仍只收 11-17
  assert.equal(lastClosedGcDate('2026-11-18T23:30:00Z'), '2026-11-19') // 北京 11-19 07:30：11-18 已收盘
  const real = parseTreasuryReal('Date,"5 YR","7 YR","10 YR","20 YR","30 YR"\n11/17/2026,2.64,2.76,2.89,3.14,3.28\n11/16/2026,2.68,2.79,,3.17,3.30')
  assert.deepEqual(real, [{ date: '2026-11-17', y10: 2.89 }])
  assert.throws(() => parseTreasuryReal('x,y'), /表头/)
  const cpi = parseBlsCpi({ status: 'REQUEST_SUCCEEDED', Results: { series: [{ seriesID: 'CUUR0000SA0', data: [{ year: '2025', period: 'M10', value: '-' }, { year: '2025', period: 'M09', value: '324.8' }, { year: '2025', period: 'M13', value: '1' }] }] } })
  assert.deepEqual(cpi, { '2025-09': 324.8 })
  assert.deepEqual(cpiFor(cpi, '2025-10'), { month: '2025-09', value: 324.8 })
  assert.equal(cpiFor(cpi, '2025-08'), null)
  // 40 个月：金价逐月上涨、CPI 不变 → 最新实际金价分位最高
  const months = Array.from({ length: 40 }, (_, i) => ({ date: `${2023 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}-28`, close: 2000 + i * 10 }))
  const c = Object.fromEntries(months.map(p => [p.date.slice(0, 7), 300]))
  const g = buildGold(months, [{ date: '2026-04-27', y10: 2.0 }], c)
  assert.equal(g.window.n, 40)
  assert.ok(g.pct > 98)
  assert.equal(g.state, '高估')
  assert.equal(g.realPrice, 2390)
  assert.equal(g.realYield.pct, null) // 实际利率只有 1 个样本
})

test('写盘判定与沿用上一份数据', () => {
  const mk = (date, n) => ({ generatedAt: 'x', hk: { rows: Array.from({ length: n }, (_, i) => ({ key: `k${i}`, date, pe: 1, dy: null })) }, global: { rows: [] }, gold: null })
  assert.equal(asOfOf(mk('2026-11-18', 1)), '2026-11-18')
  assert.equal(shouldWrite(null, mk('2026-11-18', 1)).write, true)
  assert.equal(shouldWrite(mk('2026-11-18', 2), mk('2026-11-17', 3)).write, false) // 历史重跑
  assert.equal(shouldWrite(mk('2026-11-18', 3), mk('2026-11-18', 2)).write, false) // 同日更不完整
  assert.equal(shouldWrite(mk('2026-11-18', 2), { ...mk('2026-11-18', 2), generatedAt: 'y' }).write, false) // 内容未变
  assert.equal(shouldWrite(mk('2026-11-17', 2), mk('2026-11-18', 2)).write, true)
  assert.equal(shouldWrite(null, mk('2026-11-18', 0)).write, false)
  const prev = [{ key: 'a', date: '2026-11-17', pe: 10, dy: null }, { key: 'b', date: '2026-11-18', pe: 5, dy: null }]
  const fresh = [{ key: 'a', date: null, pe: null, dy: null }, { key: 'b', date: '2026-11-17', pe: 6, dy: null }]
  const out = carryRows(fresh, prev)
  assert.deepEqual(out.map(r => [r.key, r.pe, r.carried]), [['a', 10, true], ['b', 5, true]])
})
