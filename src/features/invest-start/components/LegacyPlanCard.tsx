import React from 'react'
import { Link } from 'react-router-dom'
import { REF, chapterHref } from '../content'
import type { Field, LegacySummary } from '../legacyPlan'

const fmt = (n: number): string => n.toFixed(1)

function FieldLine({ label, field, render, show }: {
  label: string
  field: Field<unknown>
  render: () => React.ReactNode
  show: boolean
}): JSX.Element {
  let text: React.ReactNode
  if (field.state === 'filled') text = show ? render() : '已填写（确认后显示）'
  else if (field.state === 'invalid') text = '无法识别'
  else text = '还没有填写（示例值不算）'
  return <li><span className="is-legacy__label">{label}</span>：{text}</li>
}

/** 旧投资计划只读卡：默认折叠；未经本人确认不显示任何金额或比例；不回写旧页 */
export function LegacyPlanCard({ legacy, onConfirm, onRevoke }: {
  legacy: LegacySummary
  onConfirm: () => void
  onRevoke: () => void
}): JSX.Element {
  const show = legacy.status === 'confirmed'
  const { total, split, cap, holdings, calculatedDeviation } = legacy

  return (
    <details className="is-legacy">
      <summary>投资计划页里的旧记录（只读，默认收起）</summary>
      {legacy.status === 'missing' && <p>这台设备上没有投资计划页的记录。</p>}
      {legacy.status === 'unfilled' && (
        <p>还没有填写（投资计划页打开时会自动存一份示例值：100 万元、75 / 20 / 5、单只 5%，这些示例值不算你的计划）。</p>
      )}
      {legacy.status === 'invalid' && <p>投资计划页的记录无法识别，本页不显示。</p>}
      {(legacy.status === 'unconfirmed' || legacy.status === 'confirmed') && (
        <>
          <ul className="is-legacy__list">
            <FieldLine label="参考总额" field={total} show={show} render={() => total.state === 'filled' && `${total.value} 万元`} />
            <FieldLine
              label="配置底仓 / 主动 / 备用金"
              field={split}
              show={show}
              render={() => split.state === 'filled' && `${split.value.base}% / ${split.value.active}% / ${split.value.reserve}%`}
            />
            <FieldLine label="单只上限" field={cap} show={show} render={() => cap.state === 'filled' && `参考总额的 ${cap.value}%`} />
            <FieldLine
              label="配置底仓各类金额"
              field={holdings}
              show={show}
              render={() => holdings.state === 'filled' && holdings.value.map(r => `${r.name} ${r.amount.trim() || '—'} 万元`).join('；')}
            />
          </ul>
          <p className="is-muted">
            旧页的「配置底仓 / 主动 / 备用金」沿用书 <Link to={chapterHref(REF.s9_1)}>9.1</Link> 案例，是参考总额内的投资预算分法，
            不是书 <Link to={chapterHref(REF.s7_1)}>7.1</Link> 先单独留出的「近期用款 / 应急金 / 长期钱」。旧页的备用金在参考总额之内，不能代替应急金。
          </p>
          {show && calculatedDeviation && (
            <div className="is-legacy__dev">
              <p><strong>按原记录计算的偏离</strong>（旧记录没有估值日期，不代表现在的情况；检查日请先更新金额再判断）：</p>
              <ul>
                {calculatedDeviation.rows.map(r => (
                  <li key={r.name}>{r.name}：目标 {fmt(r.targetPct)}%，按原记录 {fmt(r.weightPct)}%，相对偏离 {fmt(r.relativeDevPct)}%（阈值 ±{fmt(r.bandPct)}%）</li>
                ))}
              </ul>
            </div>
          )}
          {legacy.issues.length > 0 && <p className="is-muted">说明：{legacy.issues.join('；')}。</p>}
          <div className="is-actions">
            {show ? (
              <button type="button" className="tool-btn is-btn" onClick={onRevoke}>收起金额</button>
            ) : (
              <button type="button" className="tool-btn is-btn" onClick={onConfirm}>这些是我自己填的，显示金额</button>
            )}
            <Link className="tool-btn is-btn" to="/investment-plan-2026">打开投资计划页</Link>
          </div>
        </>
      )}
    </details>
  )
}
