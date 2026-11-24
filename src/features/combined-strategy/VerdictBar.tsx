import React from 'react'
import { Link } from 'react-router-dom'
import type { Stage } from '../macro/stages'
import { visibleText } from './labels'
import { useCombinedStrategy } from './load'
import '../../styles/verdict-bar.css'

export interface VerdictBarProps {
  /** 风险预算阶段；传入 Stage 时展示阶段名与动作，未传则用通用说明 */
  stage?: Stage | null
  /** 观察盘等场景：阶段卡就在下方，整行不显示 */
  hideStage?: boolean
  /** 测试注入 */
  fetcher?: typeof fetch
}

export default function VerdictBar({ stage, hideStage = false, fetcher }: VerdictBarProps): JSX.Element {
  const state = useCombinedStrategy(fetcher)

  if (state.status === 'loading') {
    return (
      <aside className="verdict-bar verdict-bar--loading" aria-label="本站当前结论">
        <p className="verdict-bar__status" role="status">正在读取当前结论…</p>
      </aside>
    )
  }

  if (state.status === 'error') {
    return (
      <aside className="verdict-bar verdict-bar--error" aria-label="本站当前结论">
        <p className="verdict-bar__error">
          当前结论暂时读不到，请到
          <Link to="/invest/strategy">综合策略</Link>
          页查看。
        </p>
      </aside>
    )
  }

  const instruction = visibleText(state.data.current.instruction)
  const stageLine = stage
    ? `风险预算阶段：${stage.name}。${stage.does[0]}`
    : '按风险预算阶段执行，不随仓位档位变。'

  return (
    <aside className="verdict-bar" aria-label="本站当前结论" data-testid="verdict-bar">
      <div className="verdict-bar__row">
        <span className="verdict-bar__label">美股仓位</span>
        <p className="verdict-bar__body" data-testid="verdict-bar-equity">{instruction}</p>
        <Link className="verdict-bar__link" to="/invest/strategy">综合策略</Link>
      </div>
      {!hideStage ? (
        <div className="verdict-bar__row">
          <span className="verdict-bar__label">主动额度与备用金</span>
          <p className="verdict-bar__body" data-testid="verdict-bar-stage">{stageLine}</p>
          <Link className="verdict-bar__link" to="/monitor?tab=method">阶段规则</Link>
        </div>
      ) : null}
      <p className="verdict-bar__note">以上只针对美股；A 股、港股暂无仓位结论。</p>
    </aside>
  )
}
