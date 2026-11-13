import test from 'node:test'
import assert from 'node:assert/strict'
import {
  effectiveGrowth,
  classifyLynchType,
  classifyLynchAttention,
  computePeg,
  applyLynchReclassification,
} from './lynch-classify.mjs'

test('有效增速取近一年与两年年化的较小者', () => {
  assert.equal(effectiveGrowth({ g: 32, c: 15 }), 15)
  assert.equal(effectiveGrowth({ g: 5, c: 20 }), 5)
  assert.equal(effectiveGrowth({ g: null, c: 10 }), null)
})

test('类型：快速/稳健/缓慢边界（含 eg=8 归稳健）', () => {
  assert.equal(classifyLynchType({ g: 26, c: 25, rg: 10 }), '快速增长型')
  assert.equal(classifyLynchType({ g: 32, c: 15, rg: 14 }), '稳健型')
  assert.equal(classifyLynchType({ g: 8, c: 8, rg: 12 }), '稳健型')
  assert.equal(classifyLynchType({ g: 7.9, c: 20, rg: 30 }), '缓慢增长型')
  assert.equal(classifyLynchType({ g: 25, c: 25, rg: 9 }), '稳健型') // 营收不足 10%，不能进快速
})

test('类型：困境/周期/资产在缺新序列时保留', () => {
  assert.equal(classifyLynchType({ t: '周期型', g: 40, c: 30, rg: 20 }), '周期型')
  assert.equal(classifyLynchType({ t: '困境反转型', g: 5, c: 5, rg: 5 }), '困境反转型')
  assert.equal(classifyLynchType({ t: '资产型', g: 1, c: 1, rg: 1, pb: 0.5 }), '资产型')
})

test('关注度：快速看 PEG，稳健看 PE，缓慢看低PE/高股息', () => {
  assert.equal(classifyLynchAttention('快速增长型', { pe: 20, g: 30, c: 30 }), '高') // PEG 20/30
  assert.equal(classifyLynchAttention('快速增长型', { pe: 36, g: 30, c: 30 }), '中') // 1.2
  assert.equal(classifyLynchAttention('快速增长型', { pe: 50, g: 30, c: 30 }), '低')
  assert.equal(classifyLynchAttention('稳健型', { pe: 14 }), '高')
  assert.equal(classifyLynchAttention('稳健型', { pe: 20 }), '中')
  assert.equal(classifyLynchAttention('稳健型', { pe: 38 }), '低')
  assert.equal(classifyLynchAttention('缓慢增长型', { pe: 12 }), '中')
  assert.equal(classifyLynchAttention('缓慢增长型', { pe: 20, dy: 4 }), '中')
  assert.equal(classifyLynchAttention('缓慢增长型', { pe: 20 }), '低')
})

test('PEG 仅快速增长型计算，增速封顶 50%', () => {
  assert.equal(computePeg('稳健型', { pe: 20, g: 15, c: 15 }), null)
  assert.equal(computePeg('快速增长型', { pe: 40, g: 80, c: 80 }), 0.8) // 40/50
})

test('apply 关注度变化时写说明，类型未变不写 classificationAsOf', () => {
  const out = applyLynchReclassification(
    { t: '稳健型', r: '低', pe: 14, g: 12, c: 12, rg: 11, checkedAt: 'T' },
    { asOf: '2026-11-07' },
  )
  assert.equal(out.t, '稳健型')
  assert.equal(out.r, '高')
  assert.equal(out.classificationAsOf, undefined)
  assert.match(out.v, /2026-11-07 按站内规则调整：关注度 低→高/)
})

// ───────── 2026-11-13 规则修正 ─────────
import { isCyclical, turnaroundWindows, LYNCH_ATTENTION } from './lynch-classify.mjs'

const CYC_F = ['所属行业有周期属性（连续两年单边高增不等于脱离周期）']
const moatTtm = (latestFirst) => ({ s: 1, n: 6, l: '证据不足', i: [['盈利持续', false, `三个 TTM 窗口利润 ${latestFirst.join('/')}（要求全正、未萎缩、回撤 ≤30%）`]] })

test('周期识别：生成器行业标记、调用方行业上下文、显式 cyclical 字段优先', () => {
  assert.equal(isCyclical({ w: ['行业属强周期'] }), true)
  assert.equal(isCyclical({ f: CYC_F }), true)
  assert.equal(isCyclical({ w: ['利润从谷底回升：19→6.74→29.1'] }), false)
  assert.equal(isCyclical({}, { cyclicalIndustry: true }), true)
  assert.equal(isCyclical({ w: ['行业属强周期'], cyclical: false }), false) // 数据层纠错可显式取消
  assert.equal(isCyclical({ cyclical: true }), true)
})

test('周期优先于增速：强周期行业高增仍判周期型（LRCX/中微 类）', () => {
  assert.equal(classifyLynchType({ t: '快速增长型', g: 38, c: 41, rg: 26, f: CYC_F }), '周期型')
  assert.equal(classifyLynchType({ t: '快速增长型', g: 105, c: 200, rg: 34 }, { cyclicalIndustry: true }), '周期型')
  assert.equal(classifyLynchType({ t: '缓慢增长型', g: 1, c: 1, rg: 1, w: ['行业属强周期'] }), '周期型')
})

test('周期型关注度不走 PEG：由快速增长改判周期后不保留 PEG 给的「高」', () => {
  const lrcx = { t: '快速增长型', r: '高', pe: 35.8, g: 38, c: 41, rg: 26, f: CYC_F }
  assert.equal(classifyLynchAttention('周期型', lrcx), '低') // 连续高增 = 盈利高位，低 PE 是顶部信号
  assert.equal(classifyLynchAttention('周期型', { t: '快速增长型', r: '高', pe: 10, g: 5, c: 12, f: CYC_F }), '待定') // 周期位置未知
  assert.equal(classifyLynchAttention('周期型', { t: '困境反转型', r: '高', ph: '盈利回升初期', g: 5, c: 5 }), '中')
  assert.equal(classifyLynchAttention('周期型', { t: '困境反转型', r: '高', ph: '盈利高位' }), '低')
  // 原本就是周期型：保留生成器按周期位置给的档
  assert.equal(classifyLynchAttention('周期型', { t: '周期型', r: '中', ph: '盈利回升初期', pe: 8, g: 60, c: 60 }), '中')
})

test('判定顺序：周期在困境反转之前（炼油/钢铁的谷底回升是周期本身）', () => {
  const mpc = { t: '困境反转型', r: '低', pe: 7.9, g: 332, c: 24, rg: 16, w: ['利润从谷底回升：19→6.74→29.1'], m: moatTtm([29.1, 6.74, 19]) }
  assert.equal(classifyLynchType(mpc, { cyclicalIndustry: true }), '周期型')
  assert.equal(classifyLynchAttention('周期型', mpc), '低') // eg 24 ≥20：盈利已超前高
})

test('困境反转不再永久锁定：有 TTM 窗口时重判，缺窗口才保留', () => {
  const base = { t: '困境反转型', r: '低', pe: 12, g: 729, c: 23, rg: 45 }
  // 利润已回到谷底前水平之上 → 反转完成，按增速重判
  assert.equal(classifyLynchType({ ...base, m: moatTtm([16.2, 1.95, 10.6]) }), '快速增长型')
  // 已恢复但有效增速 >80%（低基数/一次性）→ 暂留困境反转（FIS 类）
  assert.equal(classifyLynchType({ ...base, g: 3517, c: 125, m: moatTtm([6.51, 0.18, 1.29]) }), '困境反转型')
  // 仍在谷底回升途中（最新 < 谷底前）→ 仍是困境反转
  assert.equal(classifyLynchType({ ...base, m: moatTtm([8, 1.95, 10.6]) }), '困境反转型')
  // 仍亏损 / 刚由亏转盈 → 困境反转
  assert.equal(classifyLynchType({ ...base, m: moatTtm([-3, -5, 2]) }), '困境反转型')
  assert.equal(classifyLynchType({ ...base, m: moatTtm([1, -2, 4]) }), '困境反转型')
  // 结构化字段 ttm（旧→新）优先于文本
  assert.equal(classifyLynchType({ ...base, ttm: [10.6, 1.95, 8], m: moatTtm([16.2, 1.95, 10.6]) }), '困境反转型')
  // 缺窗口 → 保留
  assert.equal(classifyLynchType({ ...base, m: null }), '困境反转型')
  assert.equal(classifyLynchType({ t: '困境反转型', g: 5, c: 5, rg: 5 }), '困境反转型')
  // 已恢复但缺增速 → 无法放入增速桶，保留
  assert.equal(classifyLynchType({ t: '困境反转型', g: null, c: null, m: moatTtm([5, 4, 3]) }), '困境反转型')
  assert.deepEqual(turnaroundWindows({ m: moatTtm([5.76, 4.16, 2.9]) }), [2.9, 4.16, 5.76])
  assert.equal(turnaroundWindows({ m: moatTtm(['4.23e+09', '1.8e+09', '1.3e+09']) })[2], 4.23e9)
})

test('资产型：PB 折价已消失才重判；PB 缺失或 REIT 保留', () => {
  const pbAsset = { t: '资产型', r: '中', w: ['PB 0.95× <1，疑似资产折价'], g: 10, c: 10, rg: 5, pe: 14 }
  assert.equal(classifyLynchType({ ...pbAsset, pb: 0.95 }), '资产型')
  assert.equal(classifyLynchType({ ...pbAsset, pb: 1.3 }), '稳健型')
  assert.equal(classifyLynchType({ ...pbAsset, pb: null }), '资产型')
  assert.equal(classifyLynchType({ t: '资产型', w: ['REIT/地产持有，按 NAV/FFO 估值'], pb: 2, g: 10, c: 10, rg: 5 }), '资产型')
})

test('PE 缺失：关注度为「待定」而不是「低」', () => {
  assert.ok(LYNCH_ATTENTION.includes('待定'))
  assert.equal(classifyLynchAttention('快速增长型', { pe: null, g: 30, c: 30 }), '待定')
  assert.equal(classifyLynchAttention('稳健型', { pe: null, g: 12, c: 12 }), '待定')
  assert.equal(classifyLynchAttention('缓慢增长型', { pe: null }), '待定')
  assert.equal(classifyLynchAttention('缓慢增长型', { pe: null, dy: 4 }), '中') // 股息够高，不依赖 PE
  assert.equal(classifyLynchAttention('资产型', { pb: null }), '待定')
  assert.equal(classifyLynchAttention('资产型', { pb: null, r: '中' }), '中')
})

const STALE_V = 'PE行情字段于T核验；分类、增速和护城河为原研究，原核验日期缺失，未按新报表重新认证。PEG待同口径盈利预测，不沿用旧值。'

test('apply：无变化时原样返回，不改 v / classificationAsOf / historicalAssessment / peg', () => {
  const entry = { t: '稳健型', r: '中', pe: 20.3, g: 12, c: 12, rg: 11, peg: null, v: STALE_V, historicalAssessment: 'PE 21.9× 尚可，稳健型可观察', classificationAsOf: null }
  const out = applyLynchReclassification(entry, { asOf: '2026-11-13' })
  assert.deepEqual(out, entry)
})

test('apply：不用旧增速 ÷ 新 PE 填 PEG', () => {
  const entry = { t: '快速增长型', r: '高', pe: 20, g: 30, c: 30, rg: 20, peg: null, v: STALE_V }
  assert.equal(applyLynchReclassification(entry, { asOf: '2026-11-13' }).peg, null)
  // 有同口径预测增速时才算
  assert.equal(applyLynchReclassification({ ...entry, forecastGrowth: 25 }, { asOf: '2026-11-13' }).peg, 0.8)
})

test('apply：只改变化的字段并留痕；仅关注度变化时不写 classificationAsOf', () => {
  const lrcx = { t: '快速增长型', r: '高', pe: 35.8, g: 38, c: 41, rg: 26, peg: null, f: CYC_F, w: ['利润连续两年高增'], v: STALE_V, historicalAssessment: 'PEG 0.79<1：增速支撑估值', classificationAsOf: null }
  const out = applyLynchReclassification(lrcx, { asOf: '2026-11-13' })
  assert.equal(out.t, '周期型')
  assert.equal(out.r, '低')
  assert.equal(out.peg, null)
  assert.equal(out.classificationAsOf, '2026-11-13')
  assert.match(out.classificationNote, /快速增长型→周期型/)
  assert.match(out.classificationNote, /高→低/)
  assert.ok(out.v.startsWith(STALE_V)) // 原说明保留，追加变更
  assert.match(out.v, /2026-11-13/)
  assert.notEqual(out.historicalAssessment, lrcx.historicalAssessment)
  // 幂等：再跑一次不再变化
  assert.deepEqual(applyLynchReclassification(out, { asOf: '2026-11-14' }), out)

  const onlyAttn = { t: '稳健型', r: '中', pe: 14, g: 12, c: 12, rg: 11, v: STALE_V, classificationAsOf: null }
  const o2 = applyLynchReclassification(onlyAttn, { asOf: '2026-11-13' })
  assert.equal(o2.r, '高')
  assert.equal(o2.classificationAsOf, null)
  assert.match(o2.classificationNote, /关注度 中→高/)
})

import { cyclicalIndustryOf } from './lynch-industry.mjs'

test('行业上下文：只认经典强周期子行业，不误中化学药/收费管道', () => {
  assert.equal(cyclicalIndustryOf({ sector: '能源', batch: '补全·Oil & Gas Refining & Marketing' }), true)
  assert.equal(cyclicalIndustryOf({ sector: '材料', batch: '补全·Steel' }), true)
  assert.equal(cyclicalIndustryOf({ sector: '化工', batch: '2026-10-07·化工第3批' }), true)
  assert.equal(cyclicalIndustryOf({ sector: '原材料', batch: '稀有金属' }), true)
  assert.equal(cyclicalIndustryOf({ sector: '信息技术', batch: '53 家 AI 情景研究', profile: '硬盘（HDD）双寡头之一（Seagate），近线大容量盘。TTM 营收' }), true)
  assert.equal(cyclicalIndustryOf({ sector: '医药卫生', batch: '化学药' }), false)
  assert.equal(cyclicalIndustryOf({ sector: '能源', batch: '补全·Oil & Gas Storage & Transportation' }), false)
  assert.equal(cyclicalIndustryOf({ sector: '信息技术', batch: '53 家 AI 情景研究', profile: '企业软件龙头。客户包括 NAND 厂商' }), false)
  assert.equal(cyclicalIndustryOf(undefined), false)
})

import { industryContextOf, nonCyclicalIndustryOf } from './lynch-industry.mjs'
import { LYNCH_CYCLICAL_OVERRIDES, applyCyclicalOverride } from './lynch-overrides.mjs'

test('行业上下文：化学药/化学制药不算强周期，且压过生成器的「行业属强周期」文字标记', () => {
  for (const batch of ['化学药', '化学制药']) {
    const company = { sector: '医药卫生', batch }
    assert.equal(cyclicalIndustryOf(company), false)
    assert.equal(nonCyclicalIndustryOf(company), true)
    const entry = { t: '周期型', r: '低', w: ['行业属强周期'], f: [], g: 5, c: 19, rg: 4, pe: 35 }
    assert.equal(isCyclical(entry, industryContextOf(company)), false)
  }
  // 化学原料/化学制品仍是强周期
  assert.equal(industryContextOf({ sector: '原材料', batch: '化学原料' }).cyclicalIndustry, true)
  assert.equal(industryContextOf({ sector: '原材料', batch: '化学制品' }).nonCyclicalIndustry, false)
  // 显式 cyclical:true 压过非周期行业上下文（新和成）
  assert.equal(isCyclical({ cyclical: true, w: [] }, industryContextOf({ sector: '医药卫生', batch: '化学药' })), true)
})

test('人工强周期纠错：化学药与芯片设计取消，存储/设备/代工/模拟不在列，新和成保留', () => {
  assert.equal(LYNCH_CYCLICAL_OVERRIDES['cn:600276'][0], false)
  assert.equal(LYNCH_CYCLICAL_OVERRIDES['us:NVDA'][0], false)
  assert.equal(LYNCH_CYCLICAL_OVERRIDES['cn:002001'][0], true)
  for (const k of ['us:MU', 'us:AMAT', 'us:LRCX', 'us:KLAC', 'adr:TSM', 'cn:688981', 'us:TXN', 'us:ADI', 'cn:603986', 'adr:SKHY']) {
    assert.equal(LYNCH_CYCLICAL_OVERRIDES[k], undefined, k)
  }
  const e = { t: '周期型', r: '低', w: ['行业属强周期'], f: [] }
  assert.deepEqual(applyCyclicalOverride('cn:600276', e), { ...e, cyclical: false })
  assert.equal(applyCyclicalOverride('us:MU', e), e)
  const nvda = { t: '快速增长型', r: '高', pe: 20, g: 125, c: 93, rg: 83, w: [], f: ['所属行业有周期属性（连续两年单边高增不等于脱离周期）'] }
  assert.equal(classifyLynchType(applyCyclicalOverride('us:NVDA', nvda)), '快速增长型')
  assert.equal(classifyLynchType(nvda), '周期型')
})
