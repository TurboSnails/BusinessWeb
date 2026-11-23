import React from 'react'
import { Badge, TableWrap } from '../../../components/ui'
import { useCandidates } from './candidates'
import { formatNum2, formatPct1 } from './labels'
import type { CandidateMetrics, CandidateResult, CandidatesFile, PillarId } from './types'

const PILLAR_LABEL: Record<PillarId | 'cap', string> = {
  growth: '增长与就业',
  credit: '信用',
  liquidity: '货币与流动性',
  inflation: '通胀',
  cap: '仓位上限',
}

const VERDICT = {
  adopt: { label: '采用', tone: 'down' },
  watch: { label: '观察', tone: 'warm' },
  reject: { label: '不采用', tone: 'up' },
} as const

const PERIODS = [
  { id: 'full', label: '全样本' },
  { id: 'early', label: '前段' },
  { id: 'late', label: '后段' },
] as const

type MetricId = 'cagr' | 'maxDd' | 'sharpe' | 'recessionsCaught' | 'falseAlarmMonths'

const METRICS: { id: MetricId; label: string; lowerIsBetter?: boolean }[] = [
  { id: 'cagr', label: '年化' },
  { id: 'maxDd', label: '最大回撤' },
  { id: 'sharpe', label: '夏普' },
  { id: 'recessionsCaught', label: '衰退捕捉' },
  { id: 'falseAlarmMonths', label: '误报月数', lowerIsBetter: true },
]

function visibleText(text: string): string {
  return text.replace(/(?<![\d.])-(?=\d)/g, '−')
}

function metricText(metrics: CandidateMetrics, id: MetricId): string {
  if (id === 'cagr' || id === 'maxDd') return formatPct1(metrics[id])
  if (id === 'sharpe') return visibleText(formatNum2(metrics[id]))
  return String(metrics[id])
}

function deltaText(id: MetricId, delta: number): string {
  if (id === 'cagr' || id === 'maxDd') {
    const points = delta * 100
    if (points === 0) return '0.0 个百分点'
    return `${points > 0 ? '+' : '−'}${Math.abs(points).toFixed(1)} 个百分点`
  }
  if (id === 'sharpe') return formatNum2(delta, { signed: true })
  if (delta === 0) return '0'
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`
}

function deltaClass(delta: number, lowerIsBetter = false): string {
  if (delta === 0) return 'is-neutral'
  const improved = lowerIsBetter ? delta < 0 : delta > 0
  return improved ? 'is-positive' : 'is-negative'
}

function ComparisonTable({ candidate }: { candidate: CandidateResult }): JSX.Element {
  return (
    <>
      <TableWrap label={`${candidate.name}回测对照`} className="mp-candidate-research__table-desktop">
        <table className="mp-table mp-candidate-research__table" data-testid={`mp-candidate-table-${candidate.id}`}>
          <thead>
            <tr>
              <th scope="col">时段</th>
              <th scope="col">指标</th>
              <th scope="col">基准</th>
              <th scope="col">加入后</th>
              <th scope="col">差值</th>
            </tr>
          </thead>
          <tbody>
            {PERIODS.map(period => (
              <React.Fragment key={period.id}>
                {METRICS.map((metric, index) => {
                  const delta = candidate.withCandidate[period.id][metric.id] - candidate.baseline[period.id][metric.id]
                  return (
                    <tr key={`${period.id}-${metric.id}`}>
                      {index === 0 ? <th scope="rowgroup" rowSpan={METRICS.length}>{period.label}</th> : null}
                      <th scope="row">{metric.label}</th>
                      <td>{metricText(candidate.baseline[period.id], metric.id)}</td>
                      <td>{metricText(candidate.withCandidate[period.id], metric.id)}</td>
                      <td className={deltaClass(delta, metric.lowerIsBetter)}>{deltaText(metric.id, delta)}</td>
                    </tr>
                  )
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <TableWrap label={`${candidate.name}回测对照（窄屏）`} className="mp-candidate-research__table-mobile">
        <table className="mp-table" data-testid={`mp-candidate-table-mobile-${candidate.id}`}>
          <thead>
            <tr>
              <th scope="col">指标</th>
              <th scope="col">时段</th>
              <th scope="col">差值</th>
            </tr>
          </thead>
          <tbody>
            {PERIODS.map(period => METRICS.map(metric => {
              const baseline = candidate.baseline[period.id]
              const withCandidate = candidate.withCandidate[period.id]
              const delta = withCandidate[metric.id] - baseline[metric.id]
              return (
                <tr key={`${period.id}-${metric.id}`}>
                  <th scope="row">{metric.label}</th>
                  <td>{period.label}</td>
                  <td
                    className={deltaClass(delta, metric.lowerIsBetter)}
                    title={`基准 ${metricText(baseline, metric.id)}；加入后 ${metricText(withCandidate, metric.id)}`}
                  >
                    {deltaText(metric.id, delta)}
                  </td>
                </tr>
              )
            }))}
          </tbody>
        </table>
      </TableWrap>
    </>
  )
}

function CandidateCard({ candidate }: { candidate: CandidateResult }): JSX.Element {
  const verdict = VERDICT[candidate.verdict]
  return (
    <article className="mp-candidate-research__card" data-testid={`mp-candidate-${candidate.id}`}>
      <header className="mp-candidate-research__head">
        <div>
          <h3>{candidate.name}</h3>
          <p className="mp-candidate-research__meta">
            {PILLAR_LABEL[candidate.pillar]} · 对应大师：{candidate.masters.join('、')}
          </p>
        </div>
        <Badge tone={verdict.tone} className={`mp-candidate-research__verdict is-${candidate.verdict}`}>
          <span data-testid={`mp-candidate-verdict-${candidate.id}`}>{verdict.label}</span>
        </Badge>
      </header>
      <dl className="mp-candidate-research__facts">
        <div><dt>数据与历史</dt><dd>{visibleText(candidate.data)}；约 {candidate.historyYears.toFixed(1)} 年</dd></div>
        <div><dt>子样本</dt><dd>{visibleText(candidate.split)}</dd></div>
        <div><dt>先验规则</dt><dd>{visibleText(candidate.rule)}</dd></div>
      </dl>
      {candidate.current ? (
        <p className="mp-candidate-research__current" data-testid={`mp-candidate-current-${candidate.id}`}>
          <strong>现在：</strong>{visibleText(candidate.current.display)}
          {candidate.current.score != null
            ? candidate.verdict === 'adopt'
              ? `（已并入核心规则，当前 ${candidate.current.score > 0 ? '+' : candidate.current.score < 0 ? '−' : ''}${Math.abs(candidate.current.score)} 分）`
              : `（若计入：${candidate.current.score > 0 ? '+' : candidate.current.score < 0 ? '−' : ''}${Math.abs(candidate.current.score)} 分，只展示、不参与档位）`
            : ''}
        </p>
      ) : null}
      <p className="mp-candidate-research__reason">{visibleText(candidate.reason)}</p>
      <details className="mp-candidate-research__details">
        <summary>展开对照表与逐项检验</summary>
        <ComparisonTable candidate={candidate} />
        <ul className="mp-candidate-research__checks">
          {candidate.checks.map(check => (
            <li key={check.id} data-testid={`mp-candidate-check-${candidate.id}-${check.id}`}>
              <span className={check.pass ? 'is-positive' : 'is-negative'}>{check.pass ? '通过' : '未通过'}</span>
              <strong>{check.label}</strong>
              <p>{visibleText(check.detail)}</p>
            </li>
          ))}
        </ul>
      </details>
    </article>
  )
}

function CombinedResult({ data }: { data: CandidatesFile }): JSX.Element | null {
  const combined = data.combined
  if (!combined) return null
  const names = combined.ids.map(id => data.candidates.find(candidate => candidate.id === id)?.name ?? '未命名候选')
  return (
    <div className="mp-candidate-research__combined" data-testid="mp-candidates-combined">
      <div className="mp-candidate-research__head">
        <h3>采用项合测</h3>
        <Badge tone={combined.pass ? 'down' : 'up'}>{combined.pass ? '通过' : '未通过'}</Badge>
      </div>
      <p>{names.join('、')}。{visibleText(combined.detail)}</p>
      <TableWrap label="采用项合测结果">
        <table className="mp-table">
          <thead>
            <tr>
              <th scope="col">时段</th>
              {METRICS.map(metric => <th scope="col" key={metric.id}>{metric.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map(period => (
              <tr key={period.id}>
                <th scope="row">{period.label}</th>
                {METRICS.map(metric => <td key={metric.id}>{metricText(combined.withCandidate[period.id], metric.id)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    </div>
  )
}

export default function CandidatesPanel(): JSX.Element {
  const state = useCandidates()
  return (
    <section className="mp-candidate-research" id="mp-candidates" aria-labelledby="mp-candidates-title">
      <h2 id="mp-candidates-title">候选指标检验</h2>
      {state.status === 'loading' ? <p className="mp-status" role="status">候选指标检验加载中…</p> : null}
      {state.status === 'error' ? (
        <p className="mp-muted" role="status" data-testid="mp-candidates-error">候选指标检验暂时无法读取，不影响本页其他结论。</p>
      ) : null}
      {state.status === 'ready' ? (
        <>
          {!state.data.candidates.some(candidate => candidate.verdict === 'adopt') ? (
            <p className="mp-candidate-research__outcome" data-testid="mp-candidates-none-adopted">
              本轮没有指标通过预注册标准，核心规则保持 v2.1；观察项只展示当前读数，不参与档位与置信度。
            </p>
          ) : null}
          <div className="mp-candidate-research__prereg">
            <p>{visibleText(state.data.preregistered)}</p>
            <p><strong>对照基准：</strong>{visibleText(state.data.baselineLabel)}</p>
            <ul>{state.data.criteria.map(criterion => <li key={criterion}>{visibleText(criterion)}</li>)}</ul>
            {state.data.candidates.some(candidate => candidate.verdict === 'watch')
              && !state.data.criteria.some(criterion => criterion.includes('观察不代表有效')) ? (
              <p data-testid="mp-candidates-watch-note"><strong>观察不代表有效，只表示没被否决。</strong></p>
            ) : null}
          </div>
          <div className="mp-candidate-research__list">
            {state.data.candidates.map(candidate => <CandidateCard key={candidate.id} candidate={candidate} />)}
          </div>
          <CombinedResult data={state.data} />
        </>
      ) : null}
    </section>
  )
}
