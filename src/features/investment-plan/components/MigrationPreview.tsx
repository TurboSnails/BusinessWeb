import React, { useState } from 'react'
import type { MigrationChoices, MigrationPreview as Preview } from '../migration'
import { buildMigrationPreview, confirmMigration } from '../migration'
import { bpsToPercent } from '../money'
import type { PlanRepository, StorageLike } from '../repository'
import type { Day, Instant } from '../types'
import { LEGACY_STATUS_LABEL, START_STATUS_LABEL, writeReasonLabel } from '../uiLabels'

const defaultChoices = (now: Instant, id: string, today: Day): MigrationChoices => ({
  ownershipConfirmed: false,
  importLegacyTotalSplit: false,
  importLegacyCap: false,
  importLegacyHoldings: false,
  importLegacyCashflowExpense: false,
  importLegacyCashflowReserve: false,
  importStartAssessment: false,
  importStartReview: false,
  importStartResearchCap: false,
  selectDerivedRoute: false,
  now,
  id,
  today,
})

export function MigrationPreviewPanel({
  storage,
  repository,
  today,
  now,
  idFactory,
  onDone,
  onCancel,
}: {
  storage: StorageLike | null
  repository: PlanRepository
  today: Day
  now: Instant
  idFactory: () => string
  onDone: () => void
  onCancel: () => void
}): JSX.Element {
  const [revealed, setRevealed] = useState(false)
  const [cashflow, setCashflow] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [choices, setChoices] = useState(() => defaultChoices(now, idFactory(), today))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = (withCashflow: boolean): void => {
    const p = buildMigrationPreview(storage, today, { includeCashflow: withCashflow })
    setPreview(p)
    setCashflow(withCashflow)
    // 仅加现金流时保持已揭示；首次预览才遮蔽
    if (!withCashflow) setRevealed(false)
    setChoices(c => ({
      ...c,
      now,
      today,
      id: withCashflow ? c.id : idFactory(),
      ownershipConfirmed: withCashflow ? c.ownershipConfirmed : false,
      importLegacyTotalSplit: withCashflow ? c.importLegacyTotalSplit : false,
      importLegacyHoldings: withCashflow ? c.importLegacyHoldings : false,
      importLegacyCap: withCashflow ? c.importLegacyCap : false,
      importLegacyCashflowExpense: false,
      importLegacyCashflowReserve: false,
      importStartAssessment: withCashflow ? c.importStartAssessment : false,
      importStartReview: withCashflow ? c.importStartReview : false,
      importStartResearchCap: withCashflow ? c.importStartResearchCap : false,
    }))
  }

  const confirm = async (): Promise<void> => {
    if (!preview) return
    if (!revealed) {
      setError('请先「显示本机记录并核对」后再确认导入。')
      return
    }
    if (!choices.ownershipConfirmed) {
      setError('请先确认「这是我的记录；我确认这些字段的来源与单位」。')
      return
    }
    setBusy(true)
    setError('')
    const r = await confirmMigration(preview, { ...choices, now, today }, repository, storage)
    setBusy(false)
    if (!r.ok) {
      setError(`未能导入：${writeReasonLabel(r.reason)}旧页记录没有被改动。`)
      if (r.reason === 'stale') load(cashflow)
      return
    }
    if (!r.persisted) setError('本机写入失败：计划在内存中，请立刻备份下载。')
    else if (r.receiptWritten === false) {
      setError('计划已保存，但“已导入”标记没写入；之后若再提示导入旧记录，请勿重复导入。')
    }
    onDone()
  }

  return (
    <section className="ip-migrate" aria-labelledby="ip-migrate-title">
      <h2 id="ip-migrate-title" className="ip-h2">
        预览本机已有记录
      </h2>
      <p className="ip-muted">
        不会自动保存。旧投资计划页是另一份独立记录；导入后在本页继续维护，旧页修改不会同步到这里。
      </p>
      {!preview && (
        <div className="ip-actions">
          <button type="button" className="tool-btn ip-btn" onClick={() => load(false)}>
            开始预览
          </button>
          <button type="button" className="tool-btn ip-btn" onClick={onCancel}>
            取消
          </button>
        </div>
      )}
      {preview && (
        <>
          <p>
            旧计划状态：{LEGACY_STATUS_LABEL[preview.legacy.status] ?? preview.legacy.status}；自测：
            {START_STATUS_LABEL[preview.start.status] ?? preview.start.status}
          </p>
          {preview.candidates.sameAsDefaultNote.map(n => (
            <p key={n} className="ip-muted">
              {n}
            </p>
          ))}
          {preview.issues.map(i => (
            <p key={i.path + i.code} className="ip-error" role="alert">
              {i.message}
            </p>
          ))}
          {!revealed ? (
            <div className="ip-actions">
              <button type="button" className="tool-btn ip-btn" onClick={() => setRevealed(true)}>
                显示本机记录并核对
              </button>
            </div>
          ) : (
            <div className="ip-migrate__fields">
              {preview.candidates.budgets && (
                <div>
                  <label className="ip-check">
                    <input
                      type="checkbox"
                      checked={choices.importLegacyTotalSplit}
                      onChange={e => setChoices(c => ({ ...c, importLegacyTotalSplit: e.target.checked }))}
                    />
                    <span>导入三笔预算</span>
                  </label>
                  <table className="ip-table">
                    <caption>预算换算</caption>
                    <thead>
                      <tr>
                        <th>项</th>
                        <th>新值（元）</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>总额</td>
                        <td>{preview.candidates.budgets.totalYuan.amount}</td>
                      </tr>
                      <tr>
                        <td>底仓</td>
                        <td>{preview.candidates.budgets.core.amount}</td>
                      </tr>
                      <tr>
                        <td>主动</td>
                        <td>{preview.candidates.budgets.research.amount}</td>
                      </tr>
                      <tr>
                        <td>备用金</td>
                        <td>{preview.candidates.budgets.reserve.amount}</td>
                      </tr>
                    </tbody>
                  </table>
                  {preview.candidates.budgets.roundingNote && (
                    <p className="ip-muted">{preview.candidates.budgets.roundingNote}</p>
                  )}
                </div>
              )}
              {preview.candidates.holdings.length > 0 && (
                <div>
                  <label className="ip-check">
                    <input
                      type="checkbox"
                      checked={choices.importLegacyHoldings}
                      onChange={e => setChoices(c => ({ ...c, importLegacyHoldings: e.target.checked }))}
                    />
                    <span>导入配置类别 {preview.candidates.holdings.length} 行</span>
                  </label>
                  <p className="ip-muted">原记录没有估值日期，导入后显示为“待核对”，不能当作当前比例</p>
                  <table className="ip-table">
                    <thead>
                      <tr>
                        <th>类别</th>
                        <th>目标%</th>
                        <th>市值（元）</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.candidates.holdings.map(h => (
                        <tr key={h.id}>
                          <td>{h.label}</td>
                          <td>{h.targetBps !== null ? bpsToPercent(h.targetBps) : '—'}</td>
                          <td>{h.mark.value?.amount ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {preview.candidates.holdingsSkipped.map(s => (
                <p key={s.index} className="ip-muted">
                  第 {s.index + 1} 行
                  {s.reason === 'unknown-amount' || s.reason === 'empty-amount'
                    ? '金额为空，已跳过'
                    : s.reason === 'negative'
                      ? '金额为负数，已跳过'
                      : s.reason === 'invalid'
                        ? '金额无法识别，已跳过'
                        : `${s.reason}，已跳过`}
                </p>
              ))}
              {preview.candidates.singleStockCapBps !== null && (
                <label className="ip-check">
                  <input
                    type="checkbox"
                    checked={choices.importLegacyCap}
                    onChange={e => setChoices(c => ({ ...c, importLegacyCap: e.target.checked }))}
                  />
                  <span>
                    导入单只上限候选 {bpsToPercent(preview.candidates.singleStockCapBps)}%（导入后仍需在本页单独确认上限）
                  </span>
                </label>
              )}
              {preview.start.status === 'ok' && (
                <>
                  <label className="ip-check">
                    <input
                      type="checkbox"
                      checked={choices.importStartAssessment}
                      onChange={e => setChoices(c => ({ ...c, importStartAssessment: e.target.checked }))}
                    />
                    <span>导入自测答案版本</span>
                  </label>
                  {preview.start.reviewOk && (
                    <label className="ip-check">
                      <input
                        type="checkbox"
                        checked={choices.importStartReview}
                        onChange={e => setChoices(c => ({ ...c, importStartReview: e.target.checked }))}
                      />
                      <span>导入检查日（保留原日历 UID）</span>
                    </label>
                  )}
                  {preview.start.researchCapBps !== null && (
                    <label className="ip-check">
                      <input
                        type="checkbox"
                        checked={choices.importStartResearchCap}
                        onChange={e => setChoices(c => ({ ...c, importStartResearchCap: e.target.checked }))}
                      />
                      <span>导入本人主动额度候选 {bpsToPercent(preview.start.researchCapBps)}%</span>
                    </label>
                  )}
                </>
              )}
              {!cashflow && (
                <button type="button" className="tool-btn ip-btn" onClick={() => load(true)}>
                  预览旧现金流
                </button>
              )}
              {cashflow && preview.cashflow.expense && (
                <label className="ip-check">
                  <input
                    type="checkbox"
                    checked={choices.importLegacyCashflowExpense}
                    onChange={e => setChoices(c => ({ ...c, importLegacyCashflowExpense: e.target.checked }))}
                  />
                  <span>
                    导入月必要支出：年 {preview.cashflow.expense.annualYuan.amount} 元 → 月{' '}
                    {preview.cashflow.expense.monthlyYuan.amount} 元
                    {preview.cashflow.expense.rounded ? '（有舍入）' : ''}
                  </span>
                </label>
              )}
              {cashflow && preview.cashflow.reserve && (
                <label className="ip-check">
                  <input
                    type="checkbox"
                    checked={choices.importLegacyCashflowReserve}
                    onChange={e => setChoices(c => ({ ...c, importLegacyCashflowReserve: e.target.checked }))}
                  />
                  <span>
                    导入备用金实际余额候选 {preview.cashflow.reserve.value.amount} 元（不覆盖预算）
                    {preview.cashflow.reserveVsBudgetNote ? `；${preview.cashflow.reserveVsBudgetNote}` : ''}
                  </span>
                </label>
              )}
            </div>
          )}
          <label className="ip-check ip-check--required">
            <input
              type="checkbox"
              checked={choices.ownershipConfirmed}
              disabled={!revealed}
              onChange={e => setChoices(c => ({ ...c, ownershipConfirmed: e.target.checked }))}
            />
            <span>这是我的记录；我确认这些字段的来源与单位</span>
          </label>
          {error && (
            <p className="ip-error" role="alert">
              {error}
            </p>
          )}
          <div className="ip-actions">
            <button
              type="button"
              className="tool-btn ip-btn"
              disabled={busy || !revealed}
              onClick={() => void confirm()}
            >
              确认导入到本页计划
            </button>
            <button type="button" className="tool-btn ip-btn" onClick={onCancel}>
              取消
            </button>
          </div>
        </>
      )}
    </section>
  )
}
