// 林奇输入生成器的财报归一化：把 scripts/fetch-lynch-financials.py 取回的原始供应商表
// （东方财富美股/港股指标、新浪 A 股财务摘要、SEC XBRL companyfacts）统一成：
//   quarters: 单季（离散）{ end, revenue, grossProfit, netIncome, eps, roe, debtRatio, currentRatio }
//   annual:   财年 { end, revenue, grossProfit, grossMargin, netIncome, eps, roe, debtRatio, currentRatio }
//   interim:  中期（港股半年报）{ end, months, netIncome }
//   balance:  最新一期资产负债表比率 { end, debtRatio, currentRatio }
// 只做口径换算，不补值：供应商缺的字段保持 null。

const DAY = 86400000

export function num(v) {
  if (v == null || v === '' || v === '--' || v === false) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function isoDate(v) {
  if (v == null) return null
  const s = String(v)
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

export function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY)
}

const sortByEnd = rows => [...rows].sort((a, b) => (a.end < b.end ? -1 : a.end > b.end ? 1 : 0))

function latestBalance(rows) {
  const withBs = sortByEnd(rows.filter(r => r.debtRatio != null))
  const last = withBs.at(-1)
  return last ? { end: last.end, debtRatio: last.debtRatio, currentRatio: last.currentRatio ?? null } : null
}

/** 东方财富美股 单季报（stock_financial_us_analysis_indicator_em indicator=单季报）：本身就是离散单季 */
export function normalizeEmUsQuarterly(raw) {
  const quarters = sortByEnd((raw.rows || []).map(r => ({
    end: isoDate(r.REPORT_DATE),
    revenue: num(r.OPERATE_INCOME),
    grossProfit: num(r.GROSS_PROFIT),
    netIncome: num(r.PARENT_HOLDER_NETPROFIT),
    eps: num(r.DILUTED_EPS) ?? num(r.BASIC_EPS),
    roe: num(r.ROE_AVG),
    debtRatio: num(r.DEBT_ASSET_RATIO),
    currentRatio: num(r.CURRENT_RATIO),
  })).filter(r => r.end))
  const first = (raw.rows || [])[0] || {}
  return {
    quarters, annual: [], interim: [], balance: latestBalance(quarters),
    currency: first.CURRENCY_ABBR || first.CURRENCY || null,
    standard: first.ACCOUNTING_STANDARDS || null,
  }
}

/** 东方财富美股 年报（20-F 等只有年报的发行人） */
export function normalizeEmUsAnnual(raw) {
  const annual = sortByEnd((raw.rows || []).map(r => {
    const revenue = num(r.OPERATE_INCOME)
    const grossProfit = num(r.GROSS_PROFIT)
    return {
      end: isoDate(r.REPORT_DATE), revenue, grossProfit,
      grossMargin: num(r.GROSS_PROFIT_RATIO) ?? (revenue && grossProfit != null ? (grossProfit / revenue) * 100 : null),
      netIncome: num(r.PARENT_HOLDER_NETPROFIT), eps: num(r.DILUTED_EPS) ?? num(r.BASIC_EPS),
      roe: num(r.ROE_AVG), debtRatio: num(r.DEBT_ASSET_RATIO), currentRatio: num(r.CURRENT_RATIO),
    }
  }).filter(r => r.end))
  const first = (raw.rows || [])[0] || {}
  return {
    quarters: [], annual, interim: [], balance: latestBalance(annual),
    currency: first.CURRENCY_ABBR || first.CURRENCY || null, standard: first.ACCOUNTING_STANDARDS || null,
  }
}

/**
 * 新浪 A 股财务摘要（stock_financial_abstract）：累计口径（Q1/H1/Q3/FY）。
 * 单季 = 本期累计 − 同年上一期累计；毛利按「毛利率 × 营业总收入」还原后同样拆单季。
 */
export function normalizeSinaCn(raw) {
  const cum = sortByEnd((raw.rows || []).map(r => {
    const end = isoDate(r['报告期'])
    const revenue = num(r['营业总收入'])
    const gm = num(r['毛利率'])
    return {
      end, revenue, grossMargin: gm,
      grossProfit: revenue != null && gm != null ? (revenue * gm) / 100 : null,
      netIncome: num(r['归母净利润']),
      eps: num(r['稀释每股收益']) ?? num(r['基本每股收益']),
      roe: num(r['净资产收益率(ROE)']) ?? num(r['净资产收益率_平均']),
      debtRatio: num(r['资产负债率']),
      currentRatio: num(r['流动比率']),
    }
  }).filter(r => r.end))
  const byEnd = new Map(cum.map(r => [r.end, r]))
  const prevCumEnd = end => {
    const [y, md] = [end.slice(0, 4), end.slice(5)]
    return { '06-30': `${y}-03-31`, '09-30': `${y}-06-30`, '12-31': `${y}-09-30` }[md] ?? null
  }
  const quarters = []
  for (const r of cum) {
    const md = r.end.slice(5)
    if (!['03-31', '06-30', '09-30', '12-31'].includes(md)) continue
    const p = md === '03-31' ? null : byEnd.get(prevCumEnd(r.end))
    if (md !== '03-31' && !p) continue
    const diff = k => (r[k] == null || (p && p[k] == null) ? null : r[k] - (p ? p[k] : 0))
    quarters.push({
      end: r.end, revenue: diff('revenue'), grossProfit: diff('grossProfit'), netIncome: diff('netIncome'), eps: diff('eps'),
      roe: null, debtRatio: r.debtRatio, currentRatio: r.currentRatio,
    })
  }
  const annual = cum.filter(r => r.end.endsWith('-12-31')).map(r => ({ ...r }))
  return { quarters, annual, interim: [], balance: latestBalance(cum), currency: 'CNY', standard: '中国企业会计准则' }
}

/** 东方财富港股 报告期（stock_financial_hk_analysis_indicator_em）：001 年报、002 中报（累计 6 个月） */
export function normalizeEmHk(raw) {
  const rows = (raw.rows || []).map(r => {
    const revenue = num(r.OPERATE_INCOME)
    const grossProfit = num(r.GROSS_PROFIT)
    const start = isoDate(r.START_DATE)
    const end = isoDate(r.REPORT_DATE)
    return {
      end, start, type: String(r.DATE_TYPE_CODE ?? ''),
      months: start && end ? Math.round(daysBetween(start, end) / 30.4) : null,
      revenue, grossProfit,
      grossMargin: num(r.GROSS_PROFIT_RATIO) ?? (revenue && grossProfit != null ? (grossProfit / revenue) * 100 : null),
      netIncome: num(r.HOLDER_PROFIT), eps: num(r.DILUTED_EPS) ?? num(r.BASIC_EPS),
      roe: num(r.ROE_AVG), debtRatio: num(r.DEBT_ASSET_RATIO), currentRatio: num(r.CURRENT_RATIO),
      yoy: num(r.HOLDER_PROFIT_YOY),
    }
  }).filter(r => r.end)
  const annual = sortByEnd(rows.filter(r => r.type === '001' || r.months === 12))
  // 中期 = 半年报（002，6 个月）；季报（003/004）不进中期比较
  const interim = sortByEnd(rows.filter(r => r.type === '002' || (r.type !== '001' && r.months === 6)))
  const first = (raw.rows || [])[0] || {}
  return { quarters: [], annual, interim, balance: latestBalance(rows), currency: first.CURRENCY || null, standard: 'HKFRS/IFRS（东方财富港股口径）' }
}

/**
 * SEC XBRL companyfacts：同一指标按候选概念优先级合并（前面的概念优先，缺的期间由后面的概念补），
 * 每个 (start,end) 取最新申报值；单季 = 3 个月区间，缺的第四季 = 全年 − 9 个月累计（或 − 前三季）。
 * 比率由原值计算：资产负债率 = 负债/资产（无负债概念时 = 1 − 权益/资产），流动比率 = 流动资产/流动负债；
 * 单季 ROE = 单季归母净利 ÷ 期初期末平均股东权益（与东方财富单季 ROE_AVG 同口径），TTM 窗口取四季合计。
 */
export function normalizeSec(raw) {
  const facts = raw.facts || {}
  const unitsOf = (name, prefer) => {
    for (const ns of ['us-gaap', 'ifrs-full']) {
      const units = facts[`${ns}:${name}`]
      if (!units) continue
      const keys = Object.keys(units)
      const unit = (prefer && keys.find(u => u === prefer)) || (prefer && keys.find(u => u.startsWith(prefer))) || keys[0]
      if (unit) return { list: units[unit], unit, concept: `${ns}:${name}` }
    }
    return null
  }
  const latestFiled = list => {
    const m = new Map()
    for (const x of list) {
      const k = `${x.start || ''}|${x.end}`
      const prev = m.get(k)
      if (!prev || String(x.filed) > String(prev.filed)) m.set(k, x)
    }
    return [...m.values()]
  }
  /** 合并候选概念：返回 { durations:[{start,end,val,days}], instants: Map(end→val), unit, concept } */
  const metric = (names, prefer) => {
    const dur = new Map(), inst = new Map()
    let unit = null, concept = null
    for (const n of names) {
      const c = unitsOf(n, prefer)
      if (!c) continue
      unit ??= c.unit; concept ??= c.concept
      for (const x of latestFiled(c.list)) {
        const v = num(x.val)
        if (v == null) continue
        if (x.start) {
          const k = `${x.start}|${x.end}`
          if (!dur.has(k)) dur.set(k, { start: x.start, end: x.end, val: v, days: daysBetween(x.start, x.end) + 1 })
        } else if (!inst.has(x.end)) inst.set(x.end, v)
      }
    }
    return { durations: [...dur.values()], instants: inst, unit, concept }
  }
  const quarterly = m => {
    const d = m.durations
    const q = new Map()
    for (const x of d.filter(x => x.days >= 80 && x.days <= 100)) if (!q.has(x.end)) q.set(x.end, x.val)
    for (const fy of d.filter(x => x.days >= 350 && x.days <= 380)) {
      if (q.has(fy.end)) continue
      const ytd9 = d.find(x => x.start === fy.start && x.days >= 260 && x.days <= 285)
      if (ytd9) { q.set(fy.end, fy.val - ytd9.val); continue }
      const inside = [...q.entries()].filter(([e]) => e > fy.start && e < fy.end)
      if (inside.length === 3) q.set(fy.end, fy.val - inside.reduce((s, [, v]) => s + v, 0))
    }
    // 只有半年累计的 Q2：H1 − Q1
    for (const h1 of d.filter(x => x.days >= 170 && x.days <= 195)) {
      if (q.has(h1.end)) continue
      const q1 = d.find(x => x.start === h1.start && x.days >= 80 && x.days <= 100)
      if (q1) q.set(h1.end, h1.val - q1.val)
    }
    return q
  }
  const annualOf = m => {
    const out = new Map()
    for (const x of m.durations.filter(x => x.days >= 350 && x.days <= 380)) if (!out.has(x.end)) out.set(x.end, x.val)
    return out
  }

  const rev = metric(['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'Revenue'], 'USD')
  const gp = metric(['GrossProfit'], 'USD')
  const cogs = metric(['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfSales'], 'USD')
  const ni = metric(['NetIncomeLoss', 'ProfitLossAttributableToOwnersOfParent', 'ProfitLoss'], 'USD')
  const eps = metric(['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'DilutedEarningsLossPerShare'], 'USD/shares')
  const assets = metric(['Assets'], 'USD').instants
  const liab = metric(['Liabilities'], 'USD').instants
  const equity = metric(['StockholdersEquity', 'EquityAttributableToOwnersOfParent'], 'USD').instants
  const ca = metric(['AssetsCurrent', 'CurrentAssets'], 'USD').instants
  const cl = metric(['LiabilitiesCurrent', 'CurrentLiabilities'], 'USD').instants
  const ratios = end => {
    const a = assets.get(end)
    const l = liab.get(end) ?? (a != null && equity.get(end) != null ? a - equity.get(end) : null)
    return {
      debtRatio: a && l != null ? (l / a) * 100 : null,
      currentRatio: ca.get(end) != null && cl.get(end) ? ca.get(end) / cl.get(end) : null,
    }
  }
  const qRev = quarterly(rev), qGp = quarterly(gp), qCogs = quarterly(cogs), qNi = quarterly(ni), qEps = quarterly(eps)
  const ends = [...new Set([...qRev.keys(), ...qNi.keys()])].sort()
  const eqEnds = [...equity.keys()].sort()
  const quarters = ends.map((end, _i) => {
    const revenue = qRev.get(end) ?? null
    const grossProfit = qGp.get(end) ?? (revenue != null && qCogs.get(end) != null ? revenue - qCogs.get(end) : null)
    const netIncome = qNi.get(end) ?? null
    const prevEq = eqEnds.filter(e => e < end && daysBetween(e, end) >= 75 && daysBetween(e, end) <= 105).at(-1)
    const avgEq = equity.get(end) != null && prevEq ? (equity.get(end) + equity.get(prevEq)) / 2 : null
    return { end, revenue, grossProfit, netIncome, eps: qEps.get(end) ?? null, roe: netIncome != null && avgEq ? (netIncome / avgEq) * 100 : null, ...ratios(end) }
  })
  const aRev = annualOf(rev), aGp = annualOf(gp), aCogs = annualOf(cogs), aNi = annualOf(ni), aEps = annualOf(eps)
  const annual = [...new Set([...aRev.keys(), ...aNi.keys()])].sort().map(end => {
    const revenue = aRev.get(end) ?? null
    const grossProfit = aGp.get(end) ?? (revenue != null && aCogs.get(end) != null ? revenue - aCogs.get(end) : null)
    const netIncome = aNi.get(end) ?? null
    const prevEq = eqEnds.filter(e => e < end && Math.abs(daysBetween(e, end) - 365) <= 20).at(-1)
    const avgEq = equity.get(end) != null && prevEq ? (equity.get(end) + equity.get(prevEq)) / 2 : null
    return {
      end, revenue, grossProfit, grossMargin: revenue && grossProfit != null ? (grossProfit / revenue) * 100 : null,
      netIncome, eps: aEps.get(end) ?? null, roe: netIncome != null && avgEq ? (netIncome / avgEq) * 100 : null, ...ratios(end),
    }
  })
  const lastAssets = [...assets.keys()].sort().at(-1)
  const balance = lastAssets ? { end: lastAssets, ...ratios(lastAssets) } : null
  return {
    quarters, annual, interim: [], balance: balance?.debtRatio != null ? balance : null,
    currency: (rev.unit || ni.unit || '').replace(/\/.*/, '') || null,
    standard: (rev.concept || ni.concept || '').startsWith('ifrs') ? 'IFRS（SEC 20-F XBRL）' : 'US GAAP（SEC XBRL）',
  }
}

/** yfinance 年报（第三方，最后手段）：ROE = 归母净利 ÷ 期初期末平均股东权益 */
export function normalizeYf(raw) {
  const rows = sortByEnd((raw.rows || []).map(r => ({ ...r, end: isoDate(r.end) })).filter(r => r.end))
  const annual = rows.map((r, i) => {
    const prev = rows[i - 1]
    const revenue = num(r.revenue), grossProfit = num(r.grossProfit), netIncome = num(r.netIncome)
    const eq = num(r.equity), peq = prev && Math.abs(daysBetween(prev.end, r.end) - 365) <= 20 ? num(prev.equity) : null
    const assets = num(r.assets), liab = num(r.liabilities)
    return {
      end: r.end, revenue, grossProfit, grossMargin: revenue && grossProfit != null ? (grossProfit / revenue) * 100 : null,
      netIncome, eps: num(r.eps),
      roe: netIncome != null && eq != null && peq != null ? (netIncome / ((eq + peq) / 2)) * 100 : null,
      debtRatio: assets && liab != null ? (liab / assets) * 100 : null,
      currentRatio: num(r.currentAssets) != null && num(r.currentLiabilities) ? num(r.currentAssets) / num(r.currentLiabilities) : null,
    }
  }).filter(r => r.revenue != null || r.netIncome != null)
  return { quarters: [], annual, interim: [], balance: latestBalance(annual), currency: raw.financialCurrency || null, standard: 'yfinance 年报（第三方汇总，未逐项核对公告）' }
}

const NORMALIZERS = {
  yf: normalizeYf,
  'em-us': normalizeEmUsQuarterly,
  'em-us-y': normalizeEmUsAnnual,
  'sina-cn': normalizeSinaCn,
  'em-hk': normalizeEmHk,
  sec: normalizeSec,
}

/** raw（fetch-lynch-financials.py 的一个文件）→ 归一化序列，附来源元数据 */
export function normalizeFinancials(raw) {
  const fn = NORMALIZERS[raw?.source]
  if (!fn) throw new Error(`unknown financial source: ${raw?.source}`)
  return { key: raw.key, source: raw.source, tool: raw.tool, args: raw.args, retrievedAt: raw.retrievedAt, ...fn(raw) }
}
