import React from 'react'
import { Link } from 'react-router-dom'
import { Card } from '../../../components/ui'
import type { PlanRead } from '../repository'
import { selectPlanStatus } from '../selectors'
import type { Day } from '../types'

/** StartHere / 摘要：不显示个人金额 */
export function PlanSummaryCard({
  snapshot,
  today,
}: {
  snapshot: PlanRead
  today: Day
}): JSX.Element {
  if (snapshot.mode === 'empty') {
    return (
      <Card as="section" className="ip-summary" label="我的计划">
        <h2 className="ip-h2">还没有本页计划</h2>
        <p>去建立或导入本机记录。旧投资计划页是另一份独立记录。</p>
        <p className="ip-actions">
          <Link className="tool-btn ip-btn" to="/invest/my-plan">去我的计划与持仓 →</Link>
        </p>
      </Card>
    )
  }
  if (snapshot.mode === 'corrupt') {
    return (
      <Card as="section" className="ip-summary" label="我的计划">
        <h2 className="ip-h2">本机计划无法识别</h2>
        <p>请先下载原文再恢复，不会自动覆盖。</p>
        <p className="ip-actions">
          <Link className="tool-btn ip-btn" to="/invest/my-plan">去恢复 →</Link>
        </p>
      </Card>
    )
  }
  if (snapshot.mode === 'unavailable' || snapshot.unsaved) {
    return (
      <Card as="section" className="ip-summary" label="我的计划">
        <h2 className="ip-h2">这次尚未保存</h2>
        <p>关页会丢失，请先备份。编辑计算仍可用。</p>
        <p className="ip-actions">
          <Link className="tool-btn ip-btn" to="/invest/my-plan">去我的计划 →</Link>
        </p>
      </Card>
    )
  }
  const doc = snapshot.document!
  const status = selectPlanStatus(doc, today)
  const reviewLine = !doc.review
    ? '还没设检查日'
    : status.review.due
      ? `检查日 ${status.review.due} 已到`
      : `下次检查日 ${status.review.next}，还有 ${status.review.daysToNext} 天`
  return (
    <Card as="section" className="ip-summary" label="我的计划">
      <h2 className="ip-h2">我的计划与持仓</h2>
      <p aria-live="polite">{reviewLine} · 待办 {status.todos.length} 项{status.dataState !== 'ok' ? ' · 数据待核' : ''}</p>
      <p className="ip-muted">本卡不显示个人金额。去计划页核对规则与事项。</p>
      <p className="ip-actions ip-actions--gap">
        <Link className="tool-btn ip-btn" to="/invest/my-plan">去我的计划检查 →</Link>
        <Link className="ip-inline" to="/investment-plan-2026">查看旧页独立记录</Link>
      </p>
    </Card>
  )
}
