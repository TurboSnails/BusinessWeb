import React from 'react'
import { Badge, TableWrap } from '../../../components/ui'
import { formatNum2, formatPct1, scoreBadge } from '../../macro-posture/composite/labels'
import { useMarket } from './market'
import type {
  MarketComponent,
  MarketConfig,
  MarketFile,
  MarketMetrics,
  TierId,
} from '../../macro-posture/composite/types'

const TIER_LABEL: Record<TierId, string> = {
  offense: '进攻',
  'lean-offense': '偏进攻',
  neutral: '中性',
  'lean-defense': '偏防守',
  defense: '防守',
}

function visibleText(text: string): string {
  return text.replace(/(?<![\d.])-(?=\d)/g, '−')
}

function scoreText(score: number | null | undefined): string {
  if (score == null) return '暂无'
  const raw = scoreBadge(score as -2 | -1 | 0 | 1)
  return visibleText(raw)
}

function weightPct(w: number): string {
  return `${(w * 100).toFixed(0)}%`
}

function relationText(stage2: MarketFile['stage2']): string {
  if (stage2.verdict === 'adopt') {
    return `已作为第五根支柱并入总结论（权重 ${weightPct(stage2.chosenW)}）`
  }
  return '独立参考，不改变总结论'
}

function MetricCells({ m, period }: { m: MarketMetrics; period: 'train' | 'test' | 'full' }): JSX.Element {
  const testClass = period === 'test' ? ' mp-market__col--test' : ''
  return (
    <>
      <td className={`num${testClass}`}>{formatPct1(m.cagr)}</td>
      <td className={`num${testClass}`}>{formatPct1(m.maxDd)}</td>
      <td className={`num${testClass}`}>{visibleText(formatNum2(m.sharpe))}</td>
    </>
  )
}

function Stage1CompareTable({
  chosen,
  benchmarks,
}: {
  chosen: MarketConfig
  benchmarks: MarketFile['stage1']['benchmarks']
}): JSX.Element {
  const rows: { key: string; label: string; train: MarketMetrics; test: MarketMetrics; full: MarketMetrics; highlight?: boolean }[] = [
    { key: 'chosen', label: chosen.label, train: chosen.train, test: chosen.test, full: chosen.full, highlight: true },
    ...benchmarks.map(b => ({ key: b.id, label: b.label, train: b.train, test: b.test, full: b.full })),
  ]
  return (
    <TableWrap label="市场综合第一阶段对照" className="mp-market__scroll mp-market__scroll--sticky-test">
      <table className="mp-table mp-market__table" data-testid="mp-market-stage1-table">
        <thead>
          <tr>
            <th scope="col" className="mp-market__col--name">方案</th>
            <th scope="col" className="mp-market__col--test">验证年化<span className="mp-market__hint">未参与挑选</span></th>
            <th scope="col" className="mp-market__col--test">验证回撤</th>
            <th scope="col" className="mp-market__col--test">验证夏普</th>
            <th scope="col">训练年化</th>
            <th scope="col">训练回撤</th>
            <th scope="col">训练夏普</th>
            <th scope="col">全年化</th>
            <th scope="col">全回撤</th>
            <th scope="col">全夏普</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} className={row.highlight ? 'is-highlight' : undefined}>
              <th scope="row" className="mp-market__col--name">{row.label}</th>
              <MetricCells m={row.test} period="test" />
              <MetricCells m={row.train} period="train" />
              <MetricCells m={row.full} period="full" />
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

function AllConfigsTable({
  configs,
  chosenId,
}: {
  configs: MarketConfig[]
  chosenId: string
}): JSX.Element {
  const sorted = [...configs].sort((a, b) => b.train.sharpe - a.train.sharpe)
  return (
    <TableWrap label="全部市场组合" className="mp-market__scroll mp-market__scroll--sticky-test">
      <table className="mp-table mp-market__table" data-testid="mp-market-all-configs">
        <thead>
          <tr>
            <th scope="col" className="mp-market__col--name">组合</th>
            <th scope="col" className="mp-market__col--test">验证夏普</th>
            <th scope="col" className="mp-market__col--test">验证年化</th>
            <th scope="col" className="mp-market__col--test">验证回撤</th>
            <th scope="col">训练夏普</th>
            <th scope="col">训练年化</th>
            <th scope="col">训练回撤</th>
            <th scope="col">全夏普</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(cfg => (
            <tr
              key={cfg.id}
              className={cfg.id === chosenId ? 'is-highlight' : undefined}
              data-testid={cfg.id === chosenId ? 'mp-market-chosen-row' : undefined}
              data-chosen={cfg.id === chosenId ? 'true' : undefined}
            >
              <th scope="row" className="mp-market__col--name">{cfg.label}</th>
              <td className="num mp-market__col--test">{visibleText(formatNum2(cfg.test.sharpe))}</td>
              <td className="num mp-market__col--test">{formatPct1(cfg.test.cagr)}</td>
              <td className="num mp-market__col--test">{formatPct1(cfg.test.maxDd)}</td>
              <td className="num">{visibleText(formatNum2(cfg.train.sharpe))}</td>
              <td className="num">{formatPct1(cfg.train.cagr)}</td>
              <td className="num">{formatPct1(cfg.train.maxDd)}</td>
              <td className="num">{visibleText(formatNum2(cfg.full.sharpe))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

function Stage2Table({ data }: { data: MarketFile['stage2'] }): JSX.Element {
  const rows = [
    { key: 'baseline', label: `基准（${data.baselineLabel}）`, train: data.baseline.train, test: data.baseline.test, highlight: false },
    ...data.weights.map(row => ({
      key: `w-${row.w}`,
      label: `市场权重 ${weightPct(row.w)}${row.w === data.chosenW ? '（选中）' : ''}`,
      train: row.train,
      test: row.test,
      highlight: row.w === data.chosenW,
    })),
  ]
  return (
    <TableWrap label="市场综合第二阶段权重对照" className="mp-market__scroll mp-market__scroll--sticky-test">
      <table className="mp-table mp-market__table" data-testid="mp-market-stage2-table">
        <thead>
          <tr>
            <th scope="col" className="mp-market__col--name">方案</th>
            <th scope="col" className="mp-market__col--test">验证年化<span className="mp-market__hint">未参与挑选</span></th>
            <th scope="col" className="mp-market__col--test">验证回撤</th>
            <th scope="col" className="mp-market__col--test">验证夏普</th>
            <th scope="col">训练年化</th>
            <th scope="col">训练回撤</th>
            <th scope="col">训练夏普</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} className={row.highlight ? 'is-highlight' : undefined}>
              <th scope="row" className="mp-market__col--name">{visibleText(row.label)}</th>
              <MetricCells m={row.test} period="test" />
              <MetricCells m={row.train} period="train" />
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )
}

function ComponentList({ items }: { items: MarketComponent[] }): JSX.Element {
  return (
    <ul className="mp-market__components" data-testid="mp-market-components">
      {items.map(item => (
        <li key={item.id} className="mp-market__component" data-testid={`mp-market-comp-${item.id}`}>
          <div className="mp-market__component-main">
            <span className="mp-market__component-name">{item.label}</span>
            <span className="mp-market__component-display">{visibleText(item.display)}</span>
            <Badge tone={item.score == null ? 'muted' : item.score > 0 ? 'down' : item.score < 0 ? 'warm' : 'neutral'}>
              {scoreText(item.score)}
            </Badge>
            {!item.inBacktest || item.id === 'forwardPe' ? (
              <Badge tone="neutral">
                <span data-testid="mp-market-forward-pe-note">{item.note ?? '只展示，无历史可回测'}</span>
              </Badge>
            ) : null}
          </div>
          <p className="mp-market__component-rule">{visibleText(item.rule)}</p>
        </li>
      ))}
    </ul>
  )
}

function MiniTimeline({ rows }: { rows: MarketFile['stage1']['timeline'] }): JSX.Element | null {
  if (!rows.length) return null
  return (
    <div className="mp-market__timeline-wrap">
      <h3 className="mp-market__subhead">选中组合月度档位</h3>
      <div
        className="mp-market__timeline"
        role="img"
        aria-label="选中组合的月度市场档位色带"
        data-testid="mp-market-timeline"
      >
        {rows.map(point => {
          const tier = point.tier
          const label = tier ? TIER_LABEL[tier] : '证据不足'
          return (
            <span
              key={point.d}
              className={`mp-market__band${tier ? ` mp-market__band--${tier}` : ' mp-market__band--none'}`}
              title={`${point.d} · ${label}`}
            >
              <span className="visually-hidden">{point.d} {label}</span>
            </span>
          )
        })}
      </div>
      <ul className="mp-market__timeline-legend" aria-label="档位图例">
        {(Object.keys(TIER_LABEL) as TierId[]).map(id => (
          <li key={id}>
            <span className={`mp-market__swatch mp-market__swatch--${id}`} aria-hidden="true" />
            {TIER_LABEL[id]}
          </li>
        ))}
      </ul>
    </div>
  )
}

function MarketReady({ data }: { data: MarketFile }): JSX.Element {
  const { stage1, stage2 } = data
  const chosen = stage1.configs.find(c => c.id === stage1.chosenId) ?? stage1.configs[0]
  const tier = stage1.current.tier
  const tierName = tier ? TIER_LABEL[tier] : '证据不足'
  const verdictTone = stage2.verdict === 'adopt' ? 'down' : 'neutral'

  return (
    <>
      <p className="mp-market__prereg">{visibleText(data.preregistered)}</p>

      <div className="mp-market__verdict" data-testid="mp-market-verdict">
        <p
          className={`mp-market__tier${tier ? ` mp-market__tier--${tier}` : ''}`}
          data-testid="mp-market-tier"
        >
          {tierName}
        </p>
        <p className="mp-market__score" data-testid="mp-market-score">
          综合分 {stage1.current.score == null ? '—' : visibleText(formatNum2(stage1.current.score, { signed: true }))}
        </p>
        <p className="mp-market__headline" data-testid="mp-market-headline">
          {visibleText(stage1.current.headline)}
        </p>
        <p className="mp-market__relation" data-testid="mp-market-relation">
          {relationText(stage2)}
        </p>
      </div>

      <h3 className="mp-market__subhead">组件读数</h3>
      <ComponentList items={stage1.current.components} />

      <h3 className="mp-market__subhead">第一阶段：市场综合单独回测</h3>
      <p className="mp-muted">
        训练期 {stage1.trainRange} 按夏普挑选；验证期 {stage1.testRange} 只原样报告，未参与挑选。
      </p>
      {chosen ? <Stage1CompareTable chosen={chosen} benchmarks={stage1.benchmarks} /> : null}
      <details className="mp-market__all">
        <summary data-testid="mp-market-all-summary">全部 {stage1.configs.length} 个组合（按训练期夏普排序）</summary>
        <AllConfigsTable configs={stage1.configs} chosenId={stage1.chosenId} />
      </details>

      <h3 className="mp-market__subhead">第二阶段：并入总综合</h3>
      <p className="mp-muted">
        对照基准 {visibleText(stage2.baselineLabel)}；训练期 {stage2.trainRange} 选权重，验证期 {stage2.testRange} 原样报告。
      </p>
      <Stage2Table data={stage2} />
      <div className="mp-market__stage2-result" data-testid="mp-market-stage2-result">
        <Badge tone={verdictTone} className={`mp-market__stage2-verdict is-${stage2.verdict}`}>
          <span data-testid="mp-market-stage2-verdict">{stage2.verdict === 'adopt' ? '并入核心' : '独立参考'}</span>
        </Badge>
        <p data-testid="mp-market-stage2-reason">{visibleText(stage2.reason)}</p>
      </div>
      <ul className="mp-market__checks" data-testid="mp-market-checks">
        {stage2.checks.map(check => (
          <li key={check.id} data-testid={`mp-market-check-${check.id}`}>
            <span className={check.pass ? 'is-positive' : 'is-negative'}>{check.pass ? '通过' : '未通过'}</span>
            <strong>{check.label}</strong>
            <p>{visibleText(check.detail)}</p>
          </li>
        ))}
      </ul>

      <MiniTimeline rows={stage1.timeline} />

      <h3 className="mp-market__subhead">披露</h3>
      <ul className="mp-market__disclosures" data-testid="mp-market-disclosures">
        {data.disclosures.map(item => <li key={item}>{visibleText(item)}</li>)}
      </ul>
    </>
  )
}

export default function MarketPanel(): JSX.Element {
  const state = useMarket()
  return (
    <section className="mp-market" id="mp-market" aria-labelledby="mp-market-title">
      <h2 id="mp-market-title">市场综合<span className="mr-market__subtitle">（股市内部与估值的两阶段回测）</span></h2>
      {state.status === 'loading' ? <p className="mp-status" role="status">市场综合加载中…</p> : null}
      {state.status === 'error' ? (
        <p className="mp-muted" role="status" data-testid="mp-market-error">
          市场综合暂时无法读取，不影响本页其他结论。
        </p>
      ) : null}
      {state.status === 'ready' ? <MarketReady data={state.data} /> : null}
    </section>
  )
}
