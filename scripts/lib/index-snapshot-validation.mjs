/** 写盘前验证：自动更新不得静默改写历史；人工导入可明确修订，但仍须通过结构与日期门禁。 */
export function assertIndexSnapshot(next, previous = null, asOf = new Date().toISOString().slice(0, 10), options = {}) {
  const entries = Object.entries(next?.indexes ?? {})
  if (!entries.length) throw new Error('没有可发布的指数')
  const cutoff = next?.generatedAt ?? asOf
  const realDate = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d
  const validDate = d => realDate(d) && d <= asOf && d <= cutoff
  if (!realDate(asOf) || !realDate(cutoff) || cutoff > asOf) throw new Error('快照日期无效或超出截止日')
  const valid = rows => Array.isArray(rows) && rows.every((p, i) => Array.isArray(p) && validDate(p[0]) && Number.isFinite(p[1]) && p[1] > 0 && (!i || rows[i - 1][0] < p[0]))
  // 月线最后一根是当月未收盘的 K 线（本站 PE 当月值同理，随月内刷新变化），旧快照末尾还可能追加了当日最新价，二者每次运行都会变；
  // 雅虎按 UTC 给港股、A 股月线标日期，当月 K 线会落在上月最后一天（如 11 月标成 10-31），所以可变区从上月最后一天算起。
  const openMonthFrom = last => { const d = new Date(`${last.slice(0, 7)}-01T00:00:00Z`); d.setUTCDate(0); return d.toISOString().slice(0, 10) }
  // open：'month' 当月区间可变；'last' 只有末尾一个点可变（按周取点的参考 PE，本周最新点会滚动替换）
  const retain = (old, fresh, label, open = null) => {
    if (!old?.length || options.allowHistoryRewrite) return
    if (!fresh?.length || fresh[0][0] > old[0][0] || fresh.at(-1)[0] < old.at(-1)[0]) throw new Error(`${label} 历史覆盖退化，保留原快照`)
    const settled = open === 'month' ? old.filter(p => p[0] < openMonthFrom(old.at(-1)[0])) : open === 'last' ? old.slice(0, -1) : old
    if (fresh.length < settled.length) throw new Error(`${label} 历史覆盖退化，保留原快照`)
    const current = new Map(fresh.map(p => [p[0], p[1]]))
    if (settled.some(p => current.get(p[0]) !== p[1])) throw new Error(`${label} 历史观测被改写，保留原快照；请走明确人工导入`)
  }
  for (const key of Object.keys(previous?.indexes ?? {})) if (!next.indexes[key]) throw new Error(`${key} 指数消失，保留原快照`)
  for (const [key, ix] of entries) {
    if (!ix.latest || !Number.isFinite(ix.latest.value) || ix.latest.value <= 0 || !validDate(ix.latest.date) || !valid(ix.monthly) || !ix.monthly.length || !valid(ix.fpe) || (ix.ref && !valid(ix.ref.points))) throw new Error(`${key} 指数数据结构或观测无效`)
    const old = previous?.indexes?.[key]
    retain(old?.monthly, ix.monthly, `${key} 月线`, 'month')
    retain(old?.fpe, ix.fpe, `${key} 本站PE`, 'month')
    if (old?.ref && old.ref.source === ix.ref?.source) retain(old.ref.points, ix.ref?.points, `${key} 参考PE`, 'last')
    if (old?.latest?.date > ix.latest.date) throw new Error(`${key} 最新观测回退，保留原快照`)
  }
}
