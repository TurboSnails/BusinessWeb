import React, { useEffect, useState } from 'react'
import { TableWrap } from '../../components/ui'
import { fmtNum, fmtPct } from './LabTable'
import data from './data/crypto-l039.json'

const { asOf, forward, history, leverageAppendix } = data
const { base } = history
const archiveUrl = `${import.meta.env.BASE_URL}data/crypto-forward/l039.jsonl`
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const price = (value: number | null): string => value === null ? '—' : usd.format(value)
const percent = (value: number): string => fmtPct(value, 2)
function points(value: number, digits = 2, signed = false): string {
  return `${signed && value > 0 ? '+' : ''}${fmtNum(value * 100, digits)} 个百分点`
}

type ArchiveRow = {
  date: string
  marketDate?: string | null
  k1Signal?: 'btc' | 'cash' | null
  close?: number | null
  ma200?: number | null
  mvrv?: number | null
  mvrvDate?: string | null
}

type Archive = { latest: ArchiveRow; days: number; gaps: number }
type ArchiveState = Archive | 'loading' | 'empty' | 'unavailable'
const dayMs = 86_400_000

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value
}

function readArchive(body: string): ArchiveState {
  if (!body.trim()) return 'empty'
  const rows = new Map<string, ArchiveRow>()
  for (const line of body.split('\n').filter(line => line.trim())) {
    const row = JSON.parse(line) as ArchiveRow | null
    if (!isDate(row?.date)) throw new Error('Invalid observation date')
    if (row.date >= forward.start && row.date <= forward.end) rows.set(row.date, row)
  }
  const latestDate = [...rows.keys()].sort().at(-1)
  if (!latestDate) return 'empty'
  const latest = rows.get(latestDate)!
  const elapsedDays = (Date.parse(latest.date) - Date.parse(forward.start)) / dayMs + 1
  return { latest, days: rows.size, gaps: elapsedDays - rows.size }
}

function ForwardArchive(): JSX.Element {
  const [archive, setArchive] = useState<ArchiveState>('loading')
  useEffect(() => {
    const controller = new AbortController()
    async function load(): Promise<void> {
      try {
        const response = await fetch(archiveUrl, {
          cache: 'no-cache',
          signal: controller.signal,
          headers: { Accept: 'application/x-ndjson, text/plain' },
        })
        const missing = response.status === 404 ||
          (response.ok && response.headers.get('content-type')?.startsWith('text/html'))
        if (!response.ok && !missing) throw new Error('Archive request failed')
        const next = missing ? 'empty' : readArchive(await response.text())
        if (!controller.signal.aborted) setArchive(next)
      } catch {
        if (!controller.signal.aborted) setArchive('unavailable')
      }
    }
    void load()
    return () => controller.abort()
  }, [])

  const latest = typeof archive === 'object' ? archive.latest : null
  const trend = latest ? latest.k1Signal === 'btc' : asOf.trend
  const trendText = latest && latest.k1Signal !== 'btc' && latest.k1Signal !== 'cash' ? '信号缺失' : trend ? '趋势开' : '趋势关'
  const close = latest ? latest.close ?? null : asOf.close
  const ma200 = latest ? latest.ma200 ?? null : asOf.ma200
  const marketDate = latest ? latest.marketDate : asOf.marketDate
  const mvrv = latest ? latest.mvrv : asOf.mvrv
  const mvrvDate = latest ? latest.mvrvDate : asOf.mvrvDate

  return (
    <section aria-labelledby="lab-crypto-l039-forward">
      <h3 className="ss-h3" id="lab-crypto-l039-forward">三年前推</h3>
      <ul className="ss-list">
        <li><strong>{trendText}</strong>（{asOf.marketSource}{isDate(marketDate) ? `，${marketDate}` : ''}） · 收盘 {price(close)} · 200 日均线 {price(ma200)}</li>
        <li>MVRV {fmtNum(mvrv)}（{asOf.mvrvSource}{isDate(mvrvDate) ? `，${mvrvDate}` : ''}）</li>
      </ul>
      <p className="ss-p" aria-live="polite">
        {typeof archive === 'object'
          ? `已留档 ${archive.days} 天 · 最近一天 ${archive.latest.date} · 断档 ${archive.gaps} 天`
          : { loading: '正在读取留档', empty: `${forward.start} 起每日留档`, unavailable: '留档暂时加载不了' }[archive]}
      </p>
      <p className="ss-p">满三年（{forward.end}）后一次揭盲。</p>
    </section>
  )
}

type HistoryRun = typeof base
const runs = [
  { label: '主口径', result: base },
  { label: '晚一天成交', result: history.lateOneDay },
  { label: '成本翻倍', result: history.doubleCost },
]
const gates: { key: keyof HistoryRun['gates']; label: string; threshold: string; value: (run: HistoryRun) => string }[] = [
  { key: 'match', label: '同波动匹配', threshold: '毛波动差 ≤ 0.5 个百分点，且趋势毛波动不高于持有', value: run => fmtNum(run.M.matchError * 100, 4) },
  { key: 'cerVsM', label: '比固定仓位的确定性等价收益高', threshold: '至少高 0 个百分点', value: run => fmtNum(run.deltas.cerVsM * 100, 2) },
  { key: 'mddVsM', label: '比固定仓位的最大回撤浅', threshold: '至少浅 5 个百分点', value: run => fmtNum(run.deltas.mddVsM * 100, 2) },
  { key: 'mddVsB0', label: '比持有的最大回撤浅', threshold: '至少浅 10 个百分点', value: run => fmtNum(run.deltas.mddVsB0 * 100, 2) },
  { key: 'sigmaReductionVsB0', label: '比持有的年化波动低', threshold: '相对降幅至少 15%', value: run => percent(run.deltas.sigmaReductionVsB0) },
]

const leverageScenarios = [
  { key: 'trend2x', label: '趋势 2 倍' },
  { key: 'trend3x', label: '趋势 3 倍' },
  { key: 'halfEquityProxy', label: '趋势 2 倍与抄底 1 倍各用一半本金' },
] as const

function range(low: number, high: number, format: (value: number) => string): string {
  return low === high ? format(low) : `${format(Math.min(low, high))}–${format(Math.max(low, high))}`
}

function ReportAppendix(): JSX.Element {
  return (
    <details className="lab-crypto-appendix">
      <summary>抄底（MVRV）与杠杆 · 只作报告，不参与判定</summary>
      <h3 className="ss-h3">趋势叠加抄底</h3>
      <p className="ss-p">趋势关时，按 MVRV 低于 1 的连续天数分档买入。趋势重新开启或 MVRV 升至 1.25 时结束抄底。</p>
      <TableWrap label="抄底历史附表" className="lab-wrap">
        <table className="cs-table lab-table">
          <thead><tr><th scope="col">区间</th><th scope="col" className="num">年化波动</th><th scope="col" className="num">最大回撤</th><th scope="col" className="num">年化确定性等价收益</th></tr></thead>
          <tbody>
            {([
              ['旧史（2012–2017）', data.chainOverlay.history],
              ['探索性复现（2018–2026）', data.chainOverlay.replay],
            ] as const).map(([label, metrics]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td className="num">{percent(metrics.sigma)}</td>
                <td className="num">{percent(metrics.mdd)}</td>
                <td className="num">{percent(metrics.cer)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <h3 className="ss-h3">永续合约逐仓杠杆</h3>
      <p className="ss-p">Binance BTC/USDT，{leverageAppendix.start} 至 {leverageAppendix.end}。按标记日低价和 {percent(leverageAppendix.maintenanceMargin)} 维持保证金估算强平触线次数。</p>
      <TableWrap label="历史杠杆风险附表" className="lab-wrap">
        <table className="cs-table lab-table">
          <thead><tr><th scope="col">杠杆场景</th><th scope="col">成本</th><th scope="col" className="num">最大回撤</th><th scope="col" className="num">趋势触线次数</th><th scope="col" className="num">抄底触线次数</th></tr></thead>
          <tbody>
            {leverageScenarios.flatMap(({ key, label }) => ([
              ['主口径', leverageAppendix.base[key]],
              ['成本翻倍', leverageAppendix.doubleCost[key]],
            ] as const).map(([cost, { minFundingBalance: low, maxFundingBalance: high }]) => (
              <tr key={`${key}-${cost}`}>
                <th scope="row">{label}</th>
                <td className="lab-crypto-cost">{cost}</td>
                <td className="num">{range(low.mdd, high.mdd, percent)}</td>
                <td className="num">{range(low.touchesByLeg.trend, high.touchesByLeg.trend, String)}</td>
                <td className="num">{'bottom' in low.touchesByLeg && 'bottom' in high.touchesByLeg ? range(low.touchesByLeg.bottom, high.touchesByLeg.bottom, String) : '—'}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </TableWrap>
    </details>
  )
}

export default function CryptoL039Study(): JSX.Element {
  return (
    <article className="ss-section lab-study" id="lab-crypto-l039" aria-labelledby="lab-crypto-l039-title">
      <p className="lab-status">2026-11-27</p>
      <h2 id="lab-crypto-l039-title">{data.title}</h2>
      <div className="ss-cover lab-answer">
        <p className="ss-cover__summary">
          <strong>{data.title}{data.verdict}</strong>（趋势择时绝对年化波动 {percent(data.verdictRisk.sigma)}，最大回撤 {percent(data.verdictRisk.mdd)}）。
          最大回撤比同波动固定仓位浅 {points(base.deltas.mddVsM)}，但 2012–2017 年牛市里多数时间满仓，波动只比持有低 {percent(base.deltas.sigmaReductionVsB0)}，未达到预定的 15%。美股仓位规则保持现行口径。
        </p>
        <p className="ss-p">{data.disclaimer}</p>
      </div>
      <p className="ss-p">研究源自用户转来的「五币趋势 + BTC 抄底」截图。五个币是事后挑选的，组合无法重建，因此这里只检验 BTC。</p>

      <h3 className="ss-h3">旧史主判定</h3>
      <p className="ss-p">{base.coverage.start} 至 {base.coverage.end}（UTC）。趋势择时在收盘低于 200 日均线时转为美元现金。同波动固定仓位每月调回 {percent(base.M.weight)} 的 BTC 仓位。</p>
      <TableWrap label="旧史三种持仓对照" className="lab-wrap">
        <table className="cs-table lab-table">
          <thead>
            <tr>
              <th scope="col">做法</th>
              <th scope="col" className="num">年化波动</th>
              <th scope="col" className="num">最大回撤</th>
              <th scope="col" className="num">年化确定性等价收益差<span className="lab-th-sub">相对同波动固定仓位</span></th>
            </tr>
          </thead>
          <tbody>
            {([
              ['趋势择时', base.K1],
              ['同波动固定仓位', base.M],
              ['直接持有', base.B0],
            ] as const).map(([label, metrics]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td className="num">{percent(metrics.sigma)}</td>
                <td className="num">{percent(metrics.mdd)}</td>
                <td className="num">{points(metrics.cer - base.M.cer, 2, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <p className="ss-p">确定性等价收益会从收益中扣除波动的代价。主口径和两项稳健性检验均须满足下列门槛。表中带 % 的数字为相对降幅，其余数字以百分点计。</p>
      <TableWrap label="预注册门槛与稳健性" className="lab-wrap">
        <table className="cs-table lab-table">
          <thead><tr><th scope="col">预注册门槛</th>{runs.map(({ label }) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
          <tbody>
            {gates.map(({ key, label, threshold, value }) => (
              <tr key={key}>
                <th scope="row">{label}<span className="lab-rule">{threshold}</span></th>
                {runs.map(({ label: scenario, result }) => (
                  <td key={scenario} className="num">
                    {value(result)}
                    <span className={`lab-delta ${result.gates[key] ? 'is-better' : 'is-worse'}`}>{result.gates[key] ? '达到' : '未达到'}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>

      <h3 className="ss-h3">分段结果</h3>
      <TableWrap label="旧史分段结果" className="lab-wrap">
        <table className="cs-table lab-table">
          <thead><tr><th scope="col">区间</th><th scope="col" className="num">趋势最大回撤</th><th scope="col" className="num">固定仓位最大回撤</th><th scope="col" className="num">年化确定性等价收益差</th></tr></thead>
          <tbody>
            {Object.values(data.segments).map(({ coverage, K1, M, deltas }) => (
              <tr key={coverage.start}>
                <th scope="row"><time dateTime={coverage.start}>{coverage.start}</time> 至 <time dateTime={coverage.end}>{coverage.end}</time></th>
                <td className="num">{percent(K1.mdd)}</td>
                <td className="num">{percent(M.mdd)}</td>
                <td className="num">{points(deltas.cerVsM, 2, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <ReportAppendix />
      <ForwardArchive />
    </article>
  )
}
