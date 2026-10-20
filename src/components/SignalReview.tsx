import React, { useEffect, useState } from 'react'
import { GROUP_LABEL, REVIEW_RULES, reviewLedger, validLedger, type Ledger, type Review } from '../features/signals/ledger'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
const VENUE: Record<string, string> = { cn: 'A股', hk: '港股', us: '美股' }
const pct = (v: number | null): string => (v == null ? '—' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`)
const addDays = (date: string, n: number): string => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

/** 读取今年与去年的台账并合并 */
async function loadLedger(fetchImpl: typeof fetch = fetch): Promise<Ledger | null> {
  const year = new Date().getFullYear()
  const parts = await Promise.all([year - 1, year].map(y => fetchImpl(`${BASE}data/signal-ledger-${y}.json`, { cache: 'no-cache' })
    .then(r => (r.ok ? r.json() : null)).catch(() => null)))
  const valid = parts.filter(validLedger)
  if (!valid.length) return null
  return { schemaVersion: 1, snapshots: Object.assign({}, ...valid.map(l => l.snapshots)) }
}

function ReviewTable({ review }: { review: Review }): JSX.Element {
  return (
    <section className="radar-tier" aria-label={`${review.from} 至 ${review.to}`}>
      <h3>{review.from} → {review.to}<span className="radar-count">{review.days} 天</span></h3>
      {review.venues.map(v => (
        <div key={v.venue} className="radar-table-wrap">
          <table className="radar-table">
            <caption>{VENUE[v.venue]} · {v.n} 只，等权平均 {pct(v.mean)}</caption>
            <thead><tr><th scope="col">信号组</th><th scope="col">样本</th><th scope="col">平均收益</th><th scope="col">相对同市场</th><th scope="col">跑赢中位数比例</th></tr></thead>
            <tbody>
              {v.groups.map(g => (
                <tr key={g.id}>
                  <td>{GROUP_LABEL(g.id)}</td>
                  <td>{g.n}</td>
                  <td>{g.mean == null ? `样本少于 ${REVIEW_RULES.minSample}` : pct(g.mean)}</td>
                  <td className={g.excess == null ? undefined : g.excess >= 0 ? 'radar-mos' : 'radar-neg'}>{pct(g.excess)}</td>
                  <td>{g.beatRate == null ? '—' : `${(g.beatRate * 100).toFixed(0)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  )
}

/** 机会雷达页底部：信号台账的事后复盘。样本期不足时只说明进度，不给结论 */
export default function SignalReview(): JSX.Element {
  const [ledger, setLedger] = useState<Ledger | null | 'loading'>('loading')
  useEffect(() => { let alive = true; void loadLedger().then(l => { if (alive) setLedger(l) }); return () => { alive = false } }, [])
  if (ledger === 'loading') return <p role="status" className="radar-muted">正在加载信号台账…</p>
  if (!ledger) return <p className="radar-muted">信号台账暂时无法加载。</p>
  const { first, latest, count, reviews } = reviewLedger(ledger)
  return (
    <section className="radar-review" aria-labelledby="radar-review-title">
      <h2 id="radar-review-title">信号复盘：这些信号事后有没有用</h2>
      <p className="radar-muted">
        每个工作日行情刷新后留存一期快照（每周保留一期）：当时的研究评级、价格、自动 DCF 与雷达信号。满 {REVIEW_RULES.minDays} 天后，按市场比较各信号组到最新一期的平均收益与同市场全部公司等权平均。
        只看价格变动、不含分红与汇率，样本少于 {REVIEW_RULES.minSample} 家的组不下结论；短期结果受市场风格影响大，需积累多期再判断。
      </p>
      {reviews.length === 0 ? (
        <p role="status" className="radar-muted">
          台账从 {first ?? '—'} 开始记录，目前 {count} 期（最新 {latest ?? '—'}）。最早可在 {first ? addDays(first, REVIEW_RULES.minDays) : '—'} 之后看到第一期复盘。
        </p>
      ) : reviews.slice(0, 3).map(r => <ReviewTable key={r.from} review={r} />)}
    </section>
  )
}
