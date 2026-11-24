import React, { useCallback, useState } from 'react'
import MarketPanel from '../market-radar/market/MarketPanel'
import { useMarket } from '../market-radar/market/market'
import FusionPanel from './FusionPanel'
import TimelinePanel from './TimelinePanel'
import type { CombinedStrategyFile } from './types'

const SUMMARY =
  '研究记录：试过哪些融合办法、为什么没采用（不影响操作，可以不看）'

function weightList(weights: { w: number }[]): string {
  return weights.map(row => `${Math.round(row.w * 100)}%`).join('、')
}

function MarketResearchIntro(): JSX.Element | null {
  const state = useMarket()
  if (state.status !== 'ready') return null
  const { stage1, stage2 } = state.data
  const n = stage1.configs.length
  const weights = weightList(stage2.weights)

  return (
    <div className="cs-research__market-intro" data-testid="cs-research-market-intro">
      <p>这是在做市场雷达之前的一次尝试，分两步。</p>
      <p>
        第一步：只用股市自身的几项指标（行业宽度、窄幅领涨、量价、股债利差等）定仓位，从 {n} 种组合里按 {stage1.trainRange} 的表现选出一种，再看它在 {stage1.testRange} 的表现。
      </p>
      <p>
        第二步：把选出的这一种当作第五根支柱并入宏观攻守的总分，试了 {weights} 几种权重，原来四根支柱按比例让出权重，熔断、均线和修复确认不变；按 {stage2.trainRange} 选权重，再看 {stage2.testRange}。
      </p>
      <p>结果：{stage2.reason}</p>
      <p>
        所以这一步没有并入。下面显示的「市场综合」档位只是这次研究的读数，不是操作信号，不需要据此做任何事。
      </p>
    </div>
  )
}

export default function ResearchPanel({ data }: { data: CombinedStrategyFile }): JSX.Element {
  const [open, setOpen] = useState(false)
  const toggle = useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault()
    setOpen(prev => {
      const next = !prev
      if (next) {
        // 折叠容器展开后图表才能量到宽度，触发一次 resize 让 TimelineView 重测
        requestAnimationFrame(() => {
          window.dispatchEvent(new Event('resize'))
        })
      }
      return next
    })
  }, [])

  return (
    <section className="cs-research" id="cs-research" aria-labelledby="cs-research-title">
      <h2 id="cs-research-title" className="visually-hidden">研究记录</h2>
      <details className="cs-research__details" data-testid="cs-research-details" open={open}>
        <summary
          className="cs-research__summary"
          data-testid="cs-research-summary"
          onClick={toggle}
        >
          <span className="cs-research__summary-text">{SUMMARY}</span>
          <span className="cs-research__summary-hint" aria-hidden="true">{open ? '收起' : '展开'}</span>
        </summary>

        {open ? (
          <div className="cs-research__body">
            <h3 className="cs-subhead">试过的六种融合办法</h3>
            <FusionPanel data={data} embedded />

            <h3 className="cs-subhead">宏观档位与股市冷热的月度对照</h3>
            <TimelinePanel data={data} embedded />

            <h3 className="cs-subhead">更早的一次尝试：把股市指标并入宏观攻守</h3>
            <MarketResearchIntro />
            <MarketPanel researchMode />
          </div>
        ) : null}
      </details>
    </section>
  )
}
