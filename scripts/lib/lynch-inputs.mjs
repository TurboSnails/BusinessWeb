// 林奇输入生成器（g / c / rg / ph / dy / pb / m 六项护城河 / w 与 f 说明）的公式层。
// 公式由现存 public/data/lynch.json 的证据文字反推（见 docs/data-maintenance.md「林奇输入生成器」）：
//   - 三个窗口：美股/ADR/A 股为三个 TTM（最新季度、一年前、两年前，各滚动四季）；港股与只有年报的发行人为三个财年；
//   - 利润：美股（us/ndx）用稀释 EPS 四季合计，其余用归母净利润；
//   - g = 最新/上一窗 −1；c = (最新/最早)^(1/2) −1；rg = 营收最新/上一窗 −1；基数 ≤0 时为 null；
//   - 护城河六项阈值见 MOAT 常量；分值 s = 通过项数，n = 可评项数。
// 本模块只做计算，不读写文件；类型 t / 关注度 r 的最终判定仍交给 lynch-classify.mjs（rebuild 路径）。
import { num, daysBetween } from './lynch-financials.mjs'

export const MOAT = {
  pricingAbs: 50, // 毛利率 ≥50% 直接通过
  pricingPremium: 5, // 或 ≥ 同行业中位 + 5pt
  pricingFloor: 25, // 且绝对值 ≥25%
  gmRangeMax: 4, // 近三期毛利率极差 ≤4pt
  roeLatest: 15, // 最新 ROE ≥15%
  roeMin: 12, // 三期最低 ≥12%
  drawdownMax: 0.3, // 三窗利润 最小/最大 ≥ 0.7
  debtMax: 60, // 资产负债率 ≤60%
  currentMin: 1, // 流动比率 ≥1
}

export const FINANCIAL_SECTOR_RE = /^(金融|银行|保险|其他金融)$/
export const REIT_RE = /房地产投资信托|REIT/i

// ───────── 数字格式（与原生成器文字一致） ─────────

/** Python '%.3g'：3 位有效数字，指数 ≥3 或 <-4 时用 e±XX */
export function fmt3g(x) {
  if (x == null || !Number.isFinite(x)) return 'nan'
  if (x === 0) return '0'
  const exp = Math.floor(Math.log10(Math.abs(Number(x.toPrecision(3)))))
  if (exp < -4 || exp >= 3) {
    const [m, e] = x.toExponential(2).split('e')
    const mant = m.replace(/\.?0+$/, '')
    const en = Number(e)
    return `${mant}e${en < 0 ? '-' : '+'}${String(Math.abs(en)).padStart(2, '0')}`
  }
  return String(Number(x.toPrecision(3)))
}

const signed = n => (n > 0 ? `+${n}` : n === 0 && Object.is(n, -0) ? '-0' : String(n))
const pct0 = x => Math.round(x)
const fix = (x, d) => x.toFixed(d)

// ───────── 窗口 ─────────

function contiguous(qs) {
  for (let i = 1; i < qs.length; i++) {
    const d = daysBetween(qs[i - 1].end, qs[i].end)
    if (d < 75 || d > 105) return false
  }
  return true
}

const sum = (xs, k) => (xs.some(x => x[k] == null) ? null : xs.reduce((s, x) => s + x[k], 0))

/**
 * 三个 TTM 窗口（新→旧）。需要截至 cutoff 的最近 12 个连续单季。
 * 返回 { basis:'ttm', windows:[{end,revenue,grossProfit,netIncome,eps,roe}×3], quarters(最近 12 季), missing }。
 */
export function ttmWindows(quarters, cutoff) {
  const qs = quarters.filter(q => !cutoff || q.end <= cutoff)
  // 最新季度若关键字段缺失（供应商只给了部分字段），回退一季
  while (qs.length && qs.at(-1).netIncome == null && qs.at(-1).revenue == null) qs.pop()
  const last12 = qs.slice(-12)
  if (last12.length < 12 || !contiguous(last12)) {
    let n = qs.length ? 1 : 0
    while (n < qs.length && contiguous(qs.slice(-(n + 1)))) n++
    const tail = qs.slice(-n)
    return { basis: 'ttm', windows: null, quarters: last12, available: n, span: n ? [tail[0].end, tail.at(-1).end] : null, missing: true }
  }
  const win = i => {
    const xs = last12.slice(i, i + 4)
    return {
      end: xs[3].end,
      revenue: sum(xs, 'revenue'), grossProfit: sum(xs, 'grossProfit'),
      netIncome: sum(xs, 'netIncome'), eps: sum(xs, 'eps'), roe: sum(xs, 'roe'),
    }
  }
  return { basis: 'ttm', windows: [win(8), win(4), win(0)], quarters: last12, available: qs.length, missing: false }
}

/** 三个财年窗口（新→旧），相邻财年间隔约一年 */
export function fyWindows(annual, cutoff) {
  const ys = annual.filter(y => !cutoff || y.end <= cutoff).filter(y => y.netIncome != null || y.revenue != null)
  const last3 = ys.slice(-3)
  const ok = last3.length === 3 && last3.every((y, i) => i === 0 || Math.abs(daysBetween(last3[i - 1].end, y.end) - 365) <= 20)
  if (!ok) return { basis: 'fy', windows: null, available: ys.length, missing: true }
  return { basis: 'fy', windows: last3.map(y => ({ ...y })).reverse(), available: ys.length, missing: false }
}

// ───────── 增速 ─────────

/** g / c / rg（百分比整数）。三窗为 新、中、旧。 */
export function growthOf([N, M, O], [RN, RM] = []) {
  const g = N != null && M != null && N > 0 && M > 0 ? pct0((N / M - 1) * 100) : null
  const c = N != null && O != null && N > 0 && O > 0 ? pct0((Math.sqrt(N / O) - 1) * 100) : null
  const rg = RN != null && RM != null && RM > 0 ? pct0((RN / RM - 1) * 100) : null
  return { g, c, rg }
}

/** 有效增速：两年年化可算时取 min(g,c)，否则取 g（原生成器口径：两年前亏损时只看近一年） */
export function generatorGrowth(g, c) {
  if (g == null) return null
  return c == null ? g : Math.min(g, c)
}

// ───────── 周期位置 ─────────

/** 周期位置（只对周期型输出）。阈值由原数据 360 条周期型/前周期型样本拟合，样本内 100% 一致。 */
export function cyclePhase([N, M, O]) {
  if (N == null || M == null || O == null) return '不明'
  const nm = M > 0 ? N / M : N > 0 ? Infinity : -Infinity
  if (nm <= 0.9) return '盈利下行'
  const no = O > 0 ? N / O : null
  if (nm > 1.25) return no == null || no > 1.27 ? '盈利高位' : '盈利回升初期'
  const mo = O > 0 ? M / O : null
  if (mo != null && mo <= 1) {
    if (nm <= 1) return Math.max(N, M, O) > 0 && N / Math.max(N, M, O) <= 0.6 ? '盈利低位' : '不明'
    return no == null ? '不明' : '盈利回升初期'
  }
  return '不明'
}

export const PHASE_ATTENTION = { 盈利高位: '低', 盈利下行: '低', 不明: '低', 盈利低位: '中', 盈利回升初期: '中' }

// ───────── 护城河六项 ─────────

export function pricingPower(gm, median) {
  if (gm == null) return ['定价权', null, '金融/无毛利率数据']
  const ok = gm >= MOAT.pricingAbs || (median != null && gm >= median + MOAT.pricingPremium && gm >= MOAT.pricingFloor)
  return ['定价权', ok, `毛利率 ${fix(gm, 1)}%（同行业中位 ${median == null ? '—' : fix(median, 1)}%）`]
}

export function marginStability(gms) {
  if (!gms || gms.length < 3 || gms.some(x => x == null)) return ['毛利稳定', null, '数据不足']
  const lo = Math.min(...gms), hi = Math.max(...gms)
  const spread = Math.round((hi - lo) * 10) / 10
  return ['毛利稳定', spread <= MOAT.gmRangeMax, `近三年毛利率区间 ${fix(lo, 1)}%–${fix(hi, 1)}%（极差 ${fix(hi - lo, 1)}pt）`]
}

export function capitalReturn(roes) {
  if (!roes || roes.length < 3 || roes.some(x => x == null)) return ['资本回报', null, 'ROE 数据不足']
  const ok = roes[0] >= MOAT.roeLatest && Math.min(...roes) >= MOAT.roeMin
  return ['资本回报', ok, `近三年 ROE ${roes.map(r => `${pct0(r)}%`).join('/')}（要求最新 ≥${MOAT.roeLatest}% 且三年最低 ≥${MOAT.roeMin}%）`]
}

export function earningsPersistence(profits) {
  if (!profits || profits.some(x => x == null)) return ['盈利持续', null, '数据不足']
  const [N, M, O] = profits
  const ok = Math.min(N, M, O) > 0 && N > O && Math.min(N, M, O) / Math.max(N, M, O) >= 1 - MOAT.drawdownMax
  return ['盈利持续', ok, `三个 TTM 窗口利润 ${profits.map(fmt3g).join('/')}（要求全正、未萎缩、回撤 ≤${MOAT.drawdownMax * 100}%）`]
}

export function financialHealth(balance, { financial = false } = {}) {
  if (financial) return ['财务稳健', null, '金融股杠杆属业务本身，不按此项评']
  const dr = balance?.debtRatio, cr = balance?.currentRatio
  if (dr == null) return ['财务稳健', null, '数据不足']
  if (cr == null) return ['财务稳健', dr <= MOAT.debtMax, `资产负债率 ${pct0(dr)}%`]
  return ['财务稳健', dr <= MOAT.debtMax && cr >= MOAT.currentMin, `资产负债率 ${pct0(dr)}%，流动比率 ${fix(cr, 2)}`]
}

export function demandResilience(revenues) {
  if (!revenues || revenues.some(x => x == null)) return ['需求韧性', null, '数据不足']
  const [N, M, O] = revenues
  return N > M && M > O ? ['需求韧性', true, '三个 TTM 窗口营收逐年增长'] : ['需求韧性', false, '三个 TTM 窗口营收逐年未持续增长']
}

export function moatScore(items) {
  const n = items.filter(x => x[1] !== null).length
  const s = items.filter(x => x[1] === true).length
  const l = n <= 3 ? '数据不足' : s / n > 0.8 ? '宽护城河迹象' : s / n >= 0.6 ? '窄护城河迹象' : '证据不足'
  return { s, n, l, i: items }
}

/** 同行业毛利率中位：原生成器按 市场+板块 取中位（板块有效样本 <4 家时用全市场中位）。 */
export function peerMedianIndex(lynch, industryOf) {
  const groups = new Map()
  const market = new Map()
  for (const [key, e] of Object.entries(lynch)) {
    const it = e?.m?.i?.find?.(x => x[0] === '定价权')
    const m = typeof it?.[2] === 'string' ? it[2].match(/同行业中位 ([\d.]+)%/) : null
    if (!m) continue
    const mk = key.split(':')[0]
    const sector = industryOf(key)?.sector ?? null
    const gk = `${mk}|${sector}`
    if (!groups.has(gk)) groups.set(gk, new Map())
    groups.get(gk).set(m[1], (groups.get(gk).get(m[1]) || 0) + 1)
    if (!market.has(mk)) market.set(mk, new Map())
    market.get(mk).set(m[1], (market.get(mk).get(m[1]) || 0) + 1)
  }
  const mode = cnt => (cnt ? Number([...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0]) : null)
  return {
    /** market: us/cn/hk/adr；ndx 按 us 查；返回 { median, basis } */
    lookup(mk, sector) {
      const m = mk === 'ndx' ? 'us' : mk
      const g = groups.get(`${m}|${sector}`)
      const total = g ? [...g.values()].reduce((s, v) => s + v, 0) : 0
      // 板块组内 ≥4 家时组内取值唯一（即板块中位）；否则原生成器退回全市场中位（取该市场最常见的「退回值」）
      if (g && total >= 4 && g.size === 1) return { median: mode(g), basis: `${m}·${sector} 板块中位（沿用原研究同组取值，${total} 家）` }
      const marketMode = fallbackMedian(groups, m) ?? mode(market.get(m))
      return { median: marketMode, basis: `${m} 全市场中位（板块样本不足 4 家，沿用原研究退回值）` }
    },
  }
}

function fallbackMedian(groups, m) {
  // 原数据里样本 <4 家的板块共用同一个全市场中位；取这些小组最常见的取值
  const cnt = new Map()
  for (const [gk, g] of groups) {
    if (!gk.startsWith(`${m}|`)) continue
    const total = [...g.values()].reduce((s, v) => s + v, 0)
    if (total >= 4) continue
    for (const [v, n] of g) cnt.set(v, (cnt.get(v) || 0) + n)
  }
  if (!cnt.size) return null
  return Number([...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0])
}

// ───────── 原生成器类型与说明（t0 / w / f），最终类型交给 lynch-classify ─────────

export const CYCLICAL_W = '行业属强周期'
export const VOLATILE_W = '近三个 TTM 窗口利润先升后降/先降后升，波动 ≥1.6 倍或符号翻转'

/** 三窗利润先升后降/先降后升，且两段变动都 ≥1.5 倍（或驼峰内符号翻转） */
export function isVolatile([N, M, O]) {
  if ([N, M, O].some(x => x == null)) return false
  const hump = (M > N && M > O) || (M < N && M < O)
  if (!hump) return false // 单边（含由亏转盈的单边上升）不算波动
  if (new Set([N, M, O].map(Math.sign)).size > 1) return true
  // 两段（旧→中、中→新）的变动倍数都 ≥1.5：原数据 757 条全正样本中误差 14 条（只看极值比 ≥1.6 时误差 69 条）
  const leg = (a, b) => Math.max(a / b, b / a)
  return Math.min(leg(M, O), leg(N, M)) >= 1.5
}

/** 谷底回升：中间窗 ≤ 最早窗一半，最新窗较中间窗回升 ≥30% */
export function isTroughRecovery([N, M, O]) {
  return N > 0 && M > 0 && O > 0 && M <= 0.5 * O && N >= 1.3 * M
}

/** 强周期行业但连续两年单边高增（利润两年都 ≥25%，且营收近一年 ≥15%） */
export function isTwoYearSurge([N, M, O], rg) {
  return N > 0 && M > 0 && O > 0 && M / O >= 1.25 && N / M >= 1.25 && rg != null && rg >= 15
}

/**
 * 原生成器的类型（t0）与说明 w / 标记 f。
 * ctx: { cyclical, reit, pb, basis, fyEnd, interim, quarters }
 */
export function generatorType(win, ctx = {}) {
  const w = [], f = []
  if (!win) {
    return { t: '数据不足', w: [ctx.basis === 'fy' ? '财报窗口不足 3 个财年，无法做三年窗口的林奇分类与护城河评分' : '上市不足 12 个季度或财报不连续，无法做三年窗口的林奇分类与护城河评分'], f }
  }
  const P = win.profits
  const [N, M, O] = P
  const { g, c, rg } = win.growth
  const eg = generatorGrowth(g, c)

  if (ctx.reit) return { t: '资产型', w: ['REIT/地产持有，按 NAV/FFO 而非 PE 估值'], f }
  if (N <= 0) {
    w.push('TTM 归母亏损')
    if (ctx.lastQuarterImproved) w.push('最近季度亏损收窄/转正')
    return { t: '困境反转型', w, f }
  }
  if (M <= 0) return { t: '困境反转型', w: ['TTM 刚由亏转盈（上年同期亏损）'], f }
  if (isTroughRecovery(P)) return { t: '困境反转型', w: [`利润从谷底回升：${fmt3g(O)}→${fmt3g(M)}→${fmt3g(N)}`], f }
  if (ctx.cyclical) {
    if (isTwoYearSurge(P, rg)) {
      w.push(`利润连续两年高增（${fmt3g(O)}→${fmt3g(M)}→${fmt3g(N)}）`)
      f.push('所属行业有周期属性（连续两年单边高增不等于脱离周期）')
      return { t: growthType(eg, rg) ?? '数据不足', w, f, cyclicalSurge: true }
    }
    w.push(CYCLICAL_W)
    if (isVolatile(P)) w.push(VOLATILE_W)
    return { t: '周期型', w, f }
  }
  if (isVolatile(P)) return { t: '周期型', w: [VOLATILE_W], f }
  if (ctx.pb != null && ctx.pb < 1) return { t: '资产型', w: [`PB ${ctx.pb}× <1，疑似资产折价（资产是否真实需核实）`], f }
  const t = growthType(eg, rg)
  if (!t) return { t: '数据不足', w: ['利润窗口不足，无法分类'], f }
  if (t === '快速增长型') {
    w.push(c != null ? `利润 ${signed(g)}%（两年年化 ${signed(c)}%）` : `利润增速 ${g}%`)
    if (rg != null) w.push(`营收 ${signed(rg)}%`)
  } else if (t === '稳健型') {
    w.push(c != null ? `利润 ${signed(g)}%（两年年化 ${signed(c)}%）` : `利润 ${signed(g)}%`)
  } else {
    w.push(`有效增速 ${signed(eg)}%（<8%）`)
  }
  return { t, w, f }
}

/** 与 lynch-classify growthBucket 同阈值：快速需 eg ≥20 且营收 ≥10 */
export function growthType(eg, rg) {
  if (eg == null) return null
  if (eg >= 20 && rg != null && rg >= 10) return '快速增长型'
  if (eg >= 8) return '稳健型'
  return '缓慢增长型'
}

function yoy(q, i) {
  const x = q[i], y = q[i - 4]
  return x?.revenue != null && y?.revenue ? pct0((x.revenue / y.revenue - 1) * 100) : null
}

/**
 * 拆股：EM 等供应商有时只把近几季 EPS 按新股本列示。以最新季度的隐含股本（归母净利/EPS）为基准，
 * 若最早的连续若干季（≥2 季）隐含股本都约为基准的 1/k（k 为常见拆股比 2/3/4/5/8/10/15/20/25/50，误差 ≤6%），
 * 且其后各季与基准一致，则把这些季度的 EPS 除以 k。|EPS| <0.05 的季度隐含股本不可靠，不参与判断。
 */
const SPLIT_RATIOS = [2, 3, 4, 5, 8, 10, 15, 20, 25, 50]
export function splitAdjust(quarters) {
  const q = quarters.map(x => ({ ...x }))
  const shares = q.map(x => (x.eps != null && Math.abs(x.eps) >= 0.05 && x.netIncome ? Math.abs(x.netIncome / x.eps) : null))
  const lastIdx = shares.findLastIndex(x => x != null)
  if (lastIdx < 0) return { quarters: q, adjusted: false }
  const base = shares[lastIdx]
  const kOf = s => {
    if (s == null) return null
    const ratio = base / s
    if (Math.abs(ratio - 1) <= 0.15) return 1
    const k = SPLIT_RATIOS.find(r => Math.abs(ratio - r) / r <= 0.06)
    return k ?? 0 // 0 = 既非同股本也非拆股倍数
  }
  const ks = shares.map(kOf)
  // 找到最后一个非 1 的有效季度，要求它之前的有效季度全部是同一个 k，之后的全部为 1
  const j = ks.findLastIndex(k => k != null && k !== 1)
  if (j < 0) return { quarters: q, adjusted: false }
  const k = ks[j]
  const before = ks.slice(0, j + 1).filter(x => x != null)
  const after = ks.slice(j + 1).filter(x => x != null)
  if (!k || before.length < 2 || before.some(x => x !== k) || after.some(x => x !== 1)) return { quarters: q, adjusted: false }
  for (let i = 0; i <= j; i++) if (q[i].eps != null) q[i].eps = q[i].eps / k
  return { quarters: q, adjusted: true, ratio: k }
}

/** 可复现的附加标记 f（只输出能从窗口数据直接验证的几类） */
export function generatorFlags(win, ctx = {}) {
  const f = []
  if (!win) return f
  if (ctx.basis === 'fy' && ctx.fyEnd) f.push(`按财年窗口（最新财年 ${ctx.fyEnd}）计算增速`)
  if (ctx.interim && ctx.interim.yoy != null) f.push(`最新中期（${ctx.interim.end}）利润同比 ${signed(pct0(ctx.interim.yoy))}%`)
  const { g, c } = win.growth
  const eg = generatorGrowth(g, c)
  if (['快速增长型', '稳健型'].includes(ctx.t) && eg != null) {
    if (eg > 50) f.push('增速 >50% 不可外推，PEG 以 50% 封顶')
    if (eg > 80) f.push('增速 >80% 多来自低基数或一次性因素，PEG 偏乐观，评级下调一档')
  }
  if (ctx.t === '快速增长型' && g != null && c != null && c >= 20 && g < c * 0.6) f.push('近一年增速较两年年化明显放缓')
  // 以下三类只在以 EPS 为利润口径（美股）时出现在原数据里
  const q = ctx.epsMetric ? ctx.quarters : null
  if (Array.isArray(q) && q.length >= 9) {
    const a = yoy(q, q.length - 1), b = yoy(q, q.length - 5)
    if (a != null && b != null && Math.max(Math.abs(a), Math.abs(b)) >= 40) f.push(`营收同比波动 ${signed(a)}%/${signed(b)}%（并购/分拆/口径变化可能）`)
  }
  if (ctx.splitAdjusted) f.push('已按拆股折算历史 EPS')
  if (Array.isArray(q) && q.length >= 5) {
    const sh = q.slice(-5).map(x => (x.eps && x.netIncome != null ? Math.abs(x.netIncome / x.eps) : null))
    if (sh.every(x => x != null && x > 0) && Math.max(...sh) / Math.min(...sh) - 1 > 0.25) f.push('隐含股本在近 5 个季度变动 >25%（增发/并购/回购）')
    const eps4 = q.slice(-4).map(x => x.eps).filter(x => x != null && x !== 0)
    if (eps4.length >= 3 && new Set(eps4.map(Math.sign)).size > 1) f.push('近四季 EPS 波动过大或符号翻转')
  }
  return f
}

/**
 * 从归一化财报算出一条林奇输入（不含 PE 等行情字段）。
 * opts: { key, market, sector, cutoff, peerMedian, cyclical, pb, dy }
 */
export function buildInputs(series, opts = {}) {
  const market = opts.market ?? opts.key?.split(':')[0]
  const financial = FINANCIAL_SECTOR_RE.test(opts.sector || '')
  const reit = REIT_RE.test(`${opts.sector || ''}|${opts.batch || ''}`)
  const useEps = market === 'us' || market === 'ndx'
  // 港股、只有年报的发行人用财年窗口；其余用 TTM
  const split = useEps && series.quarters?.length ? splitAdjust(series.quarters) : { quarters: series.quarters || [], adjusted: false }
  let w = market === 'hk' || !split.quarters.length ? fyWindows(series.annual || [], opts.cutoff) : ttmWindows(split.quarters, opts.cutoff)
  if (w.missing && w.basis === 'ttm' && (series.annual || []).length >= 3) {
    const fy = fyWindows(series.annual, opts.cutoff)
    if (!fy.missing) w = fy
  }
  // 窗口过旧（供应商停更，最新窗口早于截止日 400 天以上）按缺失处理
  if (w.windows && opts.cutoff && daysBetween(w.windows[0].end, opts.cutoff) > 400) w = { ...w, windows: null, missing: true, stale: w.windows[0].end }
  const wins = w.windows
  // 美股 EPS 若有缺期（供应商只给部分季度 EPS）而归母净利完整，改用归母净利润
  const epsFallback = useEps && !!wins && wins.some(x => x.eps == null) && wins.every(x => x.netIncome != null)
  const profitKey = useEps && !epsFallback ? 'eps' : 'netIncome'
  const profitsRaw = wins ? wins.map(x => x[profitKey]) : null
  const complete = !!wins && profitsRaw.every(x => x != null)
  // 窗口不全：与原数据「上市不足」条目一致，增速与护城河留空，不拿残缺窗口出数
  const profits = complete ? profitsRaw : null
  const revenues = complete ? wins.map(x => x.revenue) : null
  const growth = complete ? growthOf(profits, revenues) : { g: null, c: null, rg: null }
  const win = complete ? { profits, growth } : null

  // 毛利率与 ROE：TTM 口径用窗口值；A 股（累计报表）与财年口径用最近三个财年
  const annualBased = w.basis === 'fy' || market === 'cn'
  const annual3 = (series.annual || []).filter(y => !opts.cutoff || y.end <= opts.cutoff).slice(-3).reverse()
  const gms = annualBased
    ? annual3.map(y => y.grossMargin ?? (y.revenue && y.grossProfit != null ? (y.grossProfit / y.revenue) * 100 : null))
    : wins?.map(x => (x.revenue && x.grossProfit != null ? (x.grossProfit / x.revenue) * 100 : null))
  const roes = annualBased ? annual3.map(y => y.roe) : wins?.map(x => x.roe)
  // 供应商把营收直接记成毛利（毛利率 100%）或某窗毛利缺失/为负：原数据记为「无毛利率数据」
  const gmUsable = !financial && gms?.length === 3 && gms.every(x => x != null && x > 0 && x < 99.95)
  const gmLatest = gmUsable ? gms[0] : null
  const balance = series.balance && (!opts.cutoff || series.balance.end <= opts.cutoff)
    ? series.balance
    : latestBalanceBefore(series, opts.cutoff)

  const items = [
    pricingPower(gmLatest, opts.peerMedian ?? null),
    marginStability(gmUsable ? gms : null),
    capitalReturn(roes && roes.length === 3 ? roes : null),
    earningsPersistence(profits && profits.length === 3 ? profits : null),
    financialHealth(balance, { financial }),
    demandResilience(revenues && revenues.length === 3 ? revenues : null),
  ]
  const lastQ = series.quarters?.filter(q => !opts.cutoff || q.end <= opts.cutoff) ?? []
  const lq = lastQ.at(-1), lq4 = lastQ.at(-5)
  const interim = market === 'hk' ? latestInterim(series, opts.cutoff, w) : null
  const base = generatorType(win, {
    cyclical: !!opts.cyclical, reit, pb: opts.pb ?? null, basis: w.basis,
    lastQuarterImproved: lq && lq4 && lq.netIncome != null && lq4.netIncome != null ? lq.netIncome > lq4.netIncome : false,
  })
  const f = [...base.f, ...generatorFlags(win, {
    t: base.t, basis: w.basis, fyEnd: wins?.[0]?.end, interim, epsMetric: useEps,
    quarters: w.basis === 'ttm' ? w.quarters : null, splitAdjusted: split.adjusted && w.basis === 'ttm',
  })]
  if (epsFallback) f.push('EPS 缺期，三窗利润改用归母净利润')
  if (!win) {
    const span = w.span ? `（${w.span[0]} 至 ${w.span[1]}）` : ''
    f.push(w.stale ? `数据源最新报告期停在 ${w.stale}，无近期三年窗口` : `数据源只有 ${w.available ?? 0} 个${w.basis === 'fy' ? '财年' : '连续单季'}财报期${span}，无三年财务窗口`)
  }
  const isCyc = base.t === '周期型'
  const ph = isCyc && win ? cyclePhase(profits) : null
  return {
    t0: base.t,
    r0: isCyc ? PHASE_ATTENTION[ph] ?? '低' : null,
    g: growth.g, c: growth.c, rg: growth.rg, ph,
    w: base.w, f, m: win ? moatScore(items) : null,
    basis: w.basis,
    windowEnds: win ? wins.map(x => x.end) : null,
    profitMetric: profitKey === 'eps' ? (w.basis === 'fy' ? '稀释 EPS（财年）' : '稀释 EPS（四季合计）') : '归母净利润',
    profits, revenues, balance,
    available: w.available,
  }
}

function latestBalanceBefore(series, cutoff) {
  const rows = [...(series.quarters || []), ...(series.annual || []), ...(series.interim || [])]
    .filter(r => r.debtRatio != null && (!cutoff || r.end <= cutoff))
    .sort((a, b) => (a.end < b.end ? -1 : 1))
  const r = rows.at(-1)
  return r ? { end: r.end, debtRatio: r.debtRatio, currentRatio: r.currentRatio ?? null } : null
}

function latestInterim(series, cutoff, w) {
  const fyEnd = w.windows?.[0]?.end
  const it = (series.interim || []).filter(r => (!cutoff || r.end <= cutoff) && (!fyEnd || r.end > fyEnd)).at(-1)
  if (!it) return null
  let yoy = it.yoy ?? null
  const prev = (series.interim || []).find(r => Math.abs(daysBetween(r.end, it.end) - 365) <= 20)
  if (prev && prev.netIncome && prev.netIncome > 0 && it.netIncome != null) yoy = (it.netIncome / prev.netIncome - 1) * 100
  return { end: it.end, yoy }
}

export { num }
