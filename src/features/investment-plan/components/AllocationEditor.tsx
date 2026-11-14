import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { chapterHref, REF } from '../../invest-start/content'
import { bpsToPercent, normalizeYuanInput, percentToBps } from '../money'
import type { PlanPatchFn } from '../patchTypes'
import { selectAllocation } from '../selectors'
import type { Allocation, Day, Instant, Mark, PlanDocument, ResearchPosition } from '../types'
import { DEFAULT_RELATIVE_BAND_BPS } from '../types'
import { bandLabel, dataLabel, FX_HINT, writeReasonLabel } from '../uiLabels'

function freshId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID?.() ?? Date.now()}`
}

const TEMPLATES: { id: string; label: string; stock: number; bond: number }[] = [
  { id: '30-70', label: '股票 30 / 债券 70', stock: 3000, bond: 7000 },
  { id: '50-50', label: '股票 50 / 债券 50', stock: 5000, bond: 5000 },
  { id: '70-30', label: '股票 70 / 债券 30', stock: 7000, bond: 3000 },
]

function emptyRow(id: string, label: string, targetBps: number | null): Allocation {
  return {
    id,
    label,
    targetBps,
    relativeBandBps: targetBps !== null ? DEFAULT_RELATIVE_BAND_BPS : null,
    mark: { value: null, asOf: null, source: 'manual', verifiedAt: null },
    riskTags: [],
  }
}

function emptyResearch(id: string): ResearchPosition {
  return {
    id,
    label: '研究持仓',
    mark: { value: null, asOf: null, source: 'manual', verifiedAt: null },
    instrument: null,
    candidateRef: null,
    riskTags: [],
  }
}

function bandRangeText(targetBps: number | null, bandBps: number | null): string | null {
  if (targetBps === null || bandBps === null) return null
  const lo = Math.round((targetBps * (10000 - bandBps)) / 10000)
  const hi = Math.round((targetBps * (10000 + bandBps)) / 10000)
  return `目标 ${bpsToPercent(targetBps)}%、±${bpsToPercent(bandBps)}% → ${bpsToPercent(lo)}%–${bpsToPercent(hi)}%`
}

export function AllocationEditor({
  doc,
  today,
  now,
  onPatch,
}: {
  doc: PlanDocument
  today: Day
  now: Instant
  onPatch: PlanPatchFn
}): JSX.Element {
  const view = selectAllocation(doc, today)
  const [mode, setMode] = useState<'rows' | 'total'>(doc.coreTotalOnly && !doc.core.length ? 'total' : 'rows')
  const [totalAmount, setTotalAmount] = useState(doc.coreTotalOnly?.value?.amount ?? '')
  const [totalAsOf, setTotalAsOf] = useState(doc.coreTotalOnly?.asOf ?? '')
  const [totalVerified, setTotalVerified] = useState(false)
  const [error, setError] = useState('')
  const [rowError, setRowError] = useState<Record<string, string>>({})
  const [templateAck, setTemplateAck] = useState(false)
  const [draftAmounts, setDraftAmounts] = useState<Record<string, string>>({})
  const [draftAsOf, setDraftAsOf] = useState<Record<string, string>>({})
  const [draftTargets, setDraftTargets] = useState<Record<string, string>>({})
  const [draftBands, setDraftBands] = useState<Record<string, string>>({})
  const [verifyIds, setVerifyIds] = useState<Record<string, boolean>>({})
  const [researchDraftAmounts, setResearchDraftAmounts] = useState<Record<string, string>>({})
  const [researchDraftAsOf, setResearchDraftAsOf] = useState<Record<string, string>>({})
  const [researchVerifyIds, setResearchVerifyIds] = useState<Record<string, boolean>>({})
  const [researchRowError, setResearchRowError] = useState<Record<string, string>>({})
  const [researchTotal, setResearchTotal] = useState(doc.researchTotalOnly?.value?.amount ?? '')
  const [researchTotalAsOf, setResearchTotalAsOf] = useState(doc.researchTotalOnly?.asOf ?? '')
  const [researchVerify, setResearchVerify] = useState(false)

  useEffect(() => {
    // 模板/外窗更新后清掉目标草稿，受控输入跟文档走
    setDraftTargets({})
    setDraftBands({})
  }, [doc.localRevision])

  const targetSumBps = doc.core.reduce((s, r) => s + (r.targetBps ?? 0), 0)
  const targetSumPct = bpsToPercent(targetSumBps)

  const applyTemplate = async (t: (typeof TEMPLATES)[0]): Promise<void> => {
    if (!templateAck) {
      setError('请先确认：教学模板是简化示意，不等于适合本人。')
      return
    }
    const extras = doc.core.filter(c => c.label !== '股票类' && c.label !== '债券类')
    const msg =
      extras.length > 0
        ? `模板只改目标比例。以下类别不在模板中，将保留金额、目标改为未填：${extras.map(e => e.label).join('、')}。继续？`
        : '模板只改股票类/债券类目标比例；其他类别与金额都会保留。继续？'
    if (!window.confirm(msg)) return
    setError('')
    const r = await onPatch(latest => {
      const byLabel = new Map(latest.core.map(c => [c.label, c]))
      const used = new Set(latest.core.map(c => c.id))
      const stockExisting = byLabel.get('股票类')
      const bondExisting = byLabel.get('债券类')
      // 无同标签行时生成新 id，避免与已改名的 core-stock 撞车
      let stockId = stockExisting?.id ?? 'core-stock'
      let bondId = bondExisting?.id ?? 'core-bond'
      if (!stockExisting) {
        while (used.has(stockId)) stockId = freshId('core-stock')
        used.add(stockId)
      }
      if (!bondExisting) {
        while (used.has(bondId)) bondId = freshId('core-bond')
        used.add(bondId)
      }
      const stock = stockExisting ?? emptyRow(stockId, '股票类', t.stock)
      const bond = bondExisting ?? emptyRow(bondId, '债券类', t.bond)
      const others = latest.core
        .filter(c => c.label !== '股票类' && c.label !== '债券类')
        .map(c => ({ ...c, targetBps: null }))
      return {
        ...latest,
        core: [
          { ...stock, targetBps: t.stock, relativeBandBps: stock.relativeBandBps ?? DEFAULT_RELATIVE_BAND_BPS },
          { ...bond, targetBps: t.bond, relativeBandBps: bond.relativeBandBps ?? DEFAULT_RELATIVE_BAND_BPS },
          ...others,
        ],
        coreTotalOnly: null,
      }
    }, doc.localRevision)
    if (!r.ok) setError(writeReasonLabel(r.reason ?? 'invalid'))
    else {
      setDraftTargets({})
      setDraftBands({})
    }
  }

  const switchMode = (next: 'rows' | 'total'): void => {
    // 仅切换编辑视图，不写盘、不抹另一侧；存盘时再处理互斥
    setMode(next)
    setError('')
  }

  const saveTotalOnly = async (): Promise<void> => {
    const amount = normalizeYuanInput(totalAmount)
    if (totalAmount.trim() && !amount) {
      setError('合计金额无效')
      return
    }
    if (amount && !totalAsOf) {
      setError('请填写估值日期')
      return
    }
    if (amount && totalAsOf > today) {
      setError('估值日期不能晚于今天')
      return
    }
    if (amount && !totalVerified) {
      setError('请勾选「这些金额已按该日核对」后再保存')
      return
    }
    if (doc.core.length > 0) {
      const ok = window.confirm(
        `切换后将不再计入已记的 ${doc.core.length} 个类别（合约要求与合计互斥）。类别草稿仍留在本页编辑区，确认替换？`,
      )
      if (!ok) return
    }
    setError('')
    const mark: Mark = amount
      ? {
          value: { currency: 'CNY', amount },
          asOf: totalAsOf,
          source: 'manual',
          verifiedAt: now,
        }
      : { value: null, asOf: null, source: 'manual', verifiedAt: null }
    const r = await onPatch(
      latest => ({
        ...latest,
        core: [],
        coreTotalOnly: mark,
      }),
      doc.localRevision,
    )
    if (!r.ok) {
      setError(writeReasonLabel(r.reason ?? 'invalid'))
      return
    }
    setMode('total')
  }

  const addRow = async (): Promise<void> => {
    if (doc.coreTotalOnly?.value) {
      const ok = window.confirm(
        `切换后将不再计入已记的合计金额 ${doc.coreTotalOnly.value.amount} 元（合约要求与类别互斥）。合计草稿仍留在本页编辑区，确认替换？`,
      )
      if (!ok) return
    }
    const id = freshId('core')
    const r = await onPatch(
      latest => ({
        ...latest,
        coreTotalOnly: null,
        core: [...latest.core, emptyRow(id, '新类别', null)],
      }),
      doc.localRevision,
    )
    if (!r.ok) setError(writeReasonLabel(r.reason ?? 'invalid'))
    setMode('rows')
  }

  const updateRowFields = async (
    id: string,
    fields: Partial<Pick<Allocation, 'label' | 'targetBps' | 'relativeBandBps' | 'riskTags'>>,
  ): Promise<void> => {
    setRowError(e => {
      const next = { ...e }
      delete next[id]
      return next
    })
    const r = await onPatch(
      latest => ({
        ...latest,
        core: latest.core.map(row => {
          if (row.id !== id) return row
          const next = { ...row, ...fields }
          if (
            fields.targetBps !== undefined &&
            fields.relativeBandBps === undefined &&
            next.relativeBandBps === null &&
            next.targetBps !== null
          ) {
            next.relativeBandBps = DEFAULT_RELATIVE_BAND_BPS
          }
          return next
        }),
      }),
      doc.localRevision,
    )
    if (!r.ok) {
      setRowError(e => ({ ...e, [id]: writeReasonLabel(r.reason ?? 'invalid') }))
    }
  }

  const commitTarget = async (id: string, raw: string): Promise<void> => {
    const row = doc.core.find(c => c.id === id)
    if (!row) return
    if (raw === '') {
      if (row.targetBps === null) return
      await updateRowFields(id, { targetBps: null })
      return
    }
    const p = percentToBps(raw)
    if (!p.ok || p.bps < 1) {
      setRowError(er => ({ ...er, [id]: '目标比例须为 0.01%–100%，最多两位小数' }))
      return
    }
    if (row.targetBps === p.bps) return
    await updateRowFields(id, { targetBps: p.bps })
  }

  const commitBand = async (id: string, raw: string): Promise<void> => {
    const row = doc.core.find(c => c.id === id)
    if (!row) return
    if (raw === '') {
      if (row.relativeBandBps === null) return
      await updateRowFields(id, { relativeBandBps: null })
      return
    }
    const p = percentToBps(raw)
    if (!p.ok || p.bps < 1) {
      setRowError(er => ({ ...er, [id]: '相对区间须为有效百分数' }))
      return
    }
    if (row.relativeBandBps === p.bps) return
    await updateRowFields(id, { relativeBandBps: p.bps })
  }

  const saveRowMark = async (id: string): Promise<void> => {
    const amountRaw = draftAmounts[id] ?? doc.core.find(c => c.id === id)?.mark.value?.amount ?? ''
    const asOf = draftAsOf[id] ?? doc.core.find(c => c.id === id)?.mark.asOf ?? ''
    const yuan = normalizeYuanInput(amountRaw)
    if (amountRaw.trim() && !yuan) {
      setRowError(e => ({ ...e, [id]: '金额无效' }))
      return
    }
    if (yuan && !asOf) {
      setRowError(e => ({ ...e, [id]: '请填写估值日期' }))
      return
    }
    if (yuan && asOf > today) {
      setRowError(e => ({ ...e, [id]: '估值日期不能晚于今天' }))
      return
    }
    if (yuan && !verifyIds[id]) {
      setRowError(e => ({ ...e, [id]: '请勾选「这些金额已按该日核对」' }))
      return
    }
    setRowError(e => {
      const next = { ...e }
      delete next[id]
      return next
    })
    const r = await onPatch(
      latest => ({
        ...latest,
        core: latest.core.map(row => {
          if (row.id !== id) return row
          if (!amountRaw.trim()) {
            return { ...row, mark: { value: null, asOf: null, source: 'manual', verifiedAt: null } }
          }
          return {
            ...row,
            mark: {
              value: { currency: 'CNY', amount: yuan! },
              asOf,
              source: 'manual',
              verifiedAt: now,
            },
          }
        }),
      }),
      doc.localRevision,
    )
    if (!r.ok) {
      setRowError(e => ({ ...e, [id]: writeReasonLabel(r.reason ?? 'invalid') }))
    }
  }

  const saveResearchTotal = async (): Promise<void> => {
    const amount = normalizeYuanInput(researchTotal)
    if (researchTotal.trim() && !amount) {
      setError('研究合计金额无效')
      return
    }
    if (amount && !researchTotalAsOf) {
      setError('请填写研究合计估值日期')
      return
    }
    if (amount && !researchVerify) {
      setError('请勾选研究合计「已按该日核对」')
      return
    }
    if (doc.research.length > 0) {
      if (!window.confirm(`切换后将不再计入已记的 ${doc.research.length} 条研究持仓，确认替换？`)) return
    }
    await onPatch(
      latest => ({
        ...latest,
        research: [],
        researchTotalOnly: amount
          ? {
              value: { currency: 'CNY', amount },
              asOf: researchTotalAsOf,
              source: 'manual',
              verifiedAt: now,
            }
          : null,
        researchCompleteAt: null,
      }),
      doc.localRevision,
    )
  }

  const addResearch = async (): Promise<void> => {
    if (doc.researchTotalOnly?.value) {
      if (!window.confirm('切换后将不再计入研究合计金额，确认替换？')) return
    }
    const id = freshId('research')
    await onPatch(
      latest => ({
        ...latest,
        researchTotalOnly: null,
        research: [...latest.research, emptyResearch(id)],
        researchCompleteAt: null,
      }),
      doc.localRevision,
    )
  }

  const saveResearchMark = async (id: string): Promise<void> => {
    const amountRaw = researchDraftAmounts[id] ?? doc.research.find(r => r.id === id)?.mark.value?.amount ?? ''
    const asOf = researchDraftAsOf[id] ?? doc.research.find(r => r.id === id)?.mark.asOf ?? ''
    const yuan = normalizeYuanInput(amountRaw)
    if (amountRaw.trim() && !yuan) {
      setResearchRowError(e => ({ ...e, [id]: '金额无效' }))
      return
    }
    if (yuan && !asOf) {
      setResearchRowError(e => ({ ...e, [id]: '请填写估值日期' }))
      return
    }
    if (yuan && asOf > today) {
      setResearchRowError(e => ({ ...e, [id]: '估值日期不能晚于今天' }))
      return
    }
    if (yuan && !researchVerifyIds[id]) {
      setResearchRowError(e => ({ ...e, [id]: '请勾选「这些金额已按该日核对」' }))
      return
    }
    setResearchRowError(e => {
      const next = { ...e }
      delete next[id]
      return next
    })
    const r = await onPatch(
      latest => ({
        ...latest,
        researchCompleteAt: null,
        research: latest.research.map(row => {
          if (row.id !== id) return row
          if (!amountRaw.trim()) {
            return { ...row, mark: { value: null, asOf: null, source: 'manual', verifiedAt: null } }
          }
          return {
            ...row,
            mark: {
              value: { currency: 'CNY', amount: yuan! },
              asOf,
              source: 'manual',
              verifiedAt: now,
            },
          }
        }),
      }),
      doc.localRevision,
    )
    if (!r.ok) setResearchRowError(e => ({ ...e, [id]: writeReasonLabel(r.reason ?? 'invalid') }))
  }

  const updateResearchLabel = async (id: string, label: string): Promise<void> => {
    await onPatch(
      latest => ({
        ...latest,
        research: latest.research.map(row => (row.id === id ? { ...row, label } : row)),
      }),
      doc.localRevision,
    )
  }

  return (
    <section className="ip-alloc" aria-labelledby="ip-alloc-title">
      <h2 id="ip-alloc-title" className="ip-h2">配置类别与市值</h2>
      <p className="ip-muted">
        默认没有选中模板。按类别合计即可判断偏离，不需要证券代码（
        <Link to={chapterHref(REF.s8_3)}>8.3</Link> /
        <Link to={chapterHref(REF.s8_6)}>8.6</Link>
        ）。无日期或旧导入记录不能当作当前比例。带宽：事先定的偏离范围，按目标的相对比例算。
      </p>
      <p className="ip-muted">{FX_HINT}</p>

      <details className="ip-details">
        <summary>教学模板（9.10 案例简化示意，不是处方）</summary>
        <label className="ip-check">
          <input type="checkbox" checked={templateAck} onChange={e => setTemplateAck(e.target.checked)} />
          <span>我明白模板不等于适合本人；应用只改目标，不静默抹掉金额</span>
        </label>
        <div className="ip-actions">
          {TEMPLATES.map(t => (
            <button key={t.id} type="button" className="tool-btn ip-btn" onClick={() => void applyTemplate(t)}>
              {t.label}
            </button>
          ))}
        </div>
      </details>

      <div className="ip-actions" role="group" aria-label="记录方式">
        <button
          type="button"
          className="tool-btn ip-btn"
          aria-pressed={mode === 'rows'}
          onClick={() => switchMode('rows')}
        >
          按类别记录{mode === 'rows' ? '（当前）' : ''}
        </button>
        <button
          type="button"
          className="tool-btn ip-btn"
          aria-pressed={mode === 'total'}
          onClick={() => switchMode('total')}
        >
          仅填底仓合计{mode === 'total' ? '（当前）' : ''}
        </button>
        {mode === 'rows' && (
          <button type="button" className="tool-btn ip-btn" onClick={() => void addRow()}>
            添加类别
          </button>
        )}
      </div>
      <p className="ip-muted" role="status">
        {mode === 'rows'
          ? doc.coreTotalOnly?.value
            ? `当前按类别记录；底仓合计草稿 ${doc.coreTotalOnly.value.amount} 元仍保留在合计视图，存盘时互斥需确认。`
            : '当前按类别记录'
          : doc.core.length > 0
            ? `当前仅填合计；已有 ${doc.core.length} 个类别草稿仍保留在类别视图，存盘时互斥需确认。`
            : '当前仅填底仓合计'}
      </p>

      {mode === 'total' && (
        <div>
          <p className="ip-muted">合计已记下后，类别偏离还不能判断。</p>
          <label className="ip-field">
            <span>底仓合计（元）</span>
            <input inputMode="decimal" value={totalAmount} onChange={e => setTotalAmount(e.target.value)} />
          </label>
          <label className="ip-field">
            <span>估值日期</span>
            <input type="date" value={totalAsOf} onChange={e => setTotalAsOf(e.target.value)} max={today} />
          </label>
          <label className="ip-check">
            <input type="checkbox" checked={totalVerified} onChange={e => setTotalVerified(e.target.checked)} />
            <span>这些金额已按该日核对</span>
          </label>
          <button type="button" className="tool-btn ip-btn" onClick={() => void saveTotalOnly()}>
            保存合计
          </button>
        </div>
      )}

      {mode === 'rows' && (
        <>
          <p className="ip-muted">
            目标合计 {targetSumPct}%，需为 100%
            {targetSumBps !== 10000 ? '（未齐备时偏离还不能判断）' : ''}
          </p>
          <ul className="ip-rows">
            {doc.core.map(row => {
              const amountVal = draftAmounts[row.id] ?? row.mark.value?.amount ?? ''
              const asOfVal = draftAsOf[row.id] ?? row.mark.asOf ?? ''
              const range = bandRangeText(row.targetBps, row.relativeBandBps)
              return (
                <li key={row.id} className="ip-row">
                  <label className="ip-field">
                    <span>类别</span>
                    <input
                      value={row.label}
                      onChange={e => void updateRowFields(row.id, { label: e.target.value.slice(0, 80) })}
                    />
                  </label>
                  <label className="ip-field">
                    <span>目标比例（%）</span>
                    <input
                      inputMode="decimal"
                      value={
                        draftTargets[row.id] !== undefined
                          ? draftTargets[row.id]
                          : row.targetBps !== null
                            ? bpsToPercent(row.targetBps)
                            : ''
                      }
                      onChange={e => setDraftTargets(d => ({ ...d, [row.id]: e.target.value }))}
                      onBlur={e => void commitTarget(row.id, e.target.value.trim())}
                    />
                  </label>
                  <label className="ip-field">
                    <span>相对区间（目标的 ±%，书 8.3 示例为 25）</span>
                    <input
                      inputMode="decimal"
                      value={
                        draftBands[row.id] !== undefined
                          ? draftBands[row.id]
                          : row.relativeBandBps !== null
                            ? bpsToPercent(row.relativeBandBps)
                            : ''
                      }
                      onChange={e => setDraftBands(d => ({ ...d, [row.id]: e.target.value }))}
                      onBlur={e => void commitBand(row.id, e.target.value.trim())}
                    />
                  </label>
                  {range && <p className="ip-muted">{range}</p>}
                  <label className="ip-field">
                    <span>本类别市值（元）</span>
                    <input
                      inputMode="decimal"
                      value={amountVal}
                      onChange={e => setDraftAmounts(d => ({ ...d, [row.id]: e.target.value }))}
                    />
                  </label>
                  <label className="ip-field">
                    <span>估值日期</span>
                    <input
                      type="date"
                      value={asOfVal}
                      max={today}
                      onChange={e => setDraftAsOf(d => ({ ...d, [row.id]: e.target.value }))}
                    />
                  </label>
                  <label className="ip-check">
                    <input
                      type="checkbox"
                      checked={!!verifyIds[row.id]}
                      onChange={e => setVerifyIds(v => ({ ...v, [row.id]: e.target.checked }))}
                    />
                    <span>这些金额已按该日核对</span>
                  </label>
                  <button type="button" className="tool-btn ip-btn" onClick={() => void saveRowMark(row.id)}>
                    保存本类市值
                  </button>
                  <label className="ip-field">
                    <span>相关风险标签（逗号分隔，可选）</span>
                    <input
                      defaultValue={row.riskTags.join(',')}
                      onBlur={e => {
                        const tags = [
                          ...new Set(
                            e.target.value
                              .split(/[,，]/)
                              .map(s => s.trim())
                              .filter(s => s.length >= 1 && s.length <= 32),
                          ),
                        ].slice(0, 8)
                        void updateRowFields(row.id, { riskTags: tags })
                      }}
                    />
                  </label>
                  <p className="ip-muted">状态：{bandLabel(view.rows.find(r => r.id === row.id)?.band ?? 'unknown')}</p>
                  {rowError[row.id] && (
                    <p className="ip-error" role="alert">
                      {rowError[row.id]}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}

      <details className="ip-details">
        <summary>主动（研究）持仓</summary>
        <p className="ip-muted">{FX_HINT}</p>
        <div className="ip-actions">
          <button type="button" className="tool-btn ip-btn" onClick={() => void addResearch()}>
            添加研究持仓
          </button>
        </div>
        <ul className="ip-rows">
          {doc.research.map(row => {
            const amountVal = researchDraftAmounts[row.id] ?? row.mark.value?.amount ?? ''
            const asOfVal = researchDraftAsOf[row.id] ?? row.mark.asOf ?? ''
            return (
              <li key={row.id} className="ip-row">
                <label className="ip-field">
                  <span>标签</span>
                  <input
                    value={row.label}
                    onChange={e => void updateResearchLabel(row.id, e.target.value.slice(0, 80))}
                  />
                </label>
                <label className="ip-field">
                  <span>市值（元）</span>
                  <input
                    inputMode="decimal"
                    value={amountVal}
                    onChange={e => setResearchDraftAmounts(d => ({ ...d, [row.id]: e.target.value }))}
                  />
                </label>
                <label className="ip-field">
                  <span>估值日期</span>
                  <input
                    type="date"
                    value={asOfVal}
                    max={today}
                    onChange={e => setResearchDraftAsOf(d => ({ ...d, [row.id]: e.target.value }))}
                  />
                </label>
                <label className="ip-check">
                  <input
                    type="checkbox"
                    checked={!!researchVerifyIds[row.id]}
                    onChange={e => setResearchVerifyIds(v => ({ ...v, [row.id]: e.target.checked }))}
                  />
                  <span>这些金额已按该日核对</span>
                </label>
                <button type="button" className="tool-btn ip-btn" onClick={() => void saveResearchMark(row.id)}>
                  保存本条市值
                </button>
                {researchRowError[row.id] && (
                  <p className="ip-error" role="alert">
                    {researchRowError[row.id]}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
        <label className="ip-field">
          <span>或仅填主动合计（元）</span>
          <input inputMode="decimal" value={researchTotal} onChange={e => setResearchTotal(e.target.value)} />
        </label>
        <label className="ip-field">
          <span>合计估值日期</span>
          <input
            type="date"
            value={researchTotalAsOf}
            max={today}
            onChange={e => setResearchTotalAsOf(e.target.value)}
          />
        </label>
        <label className="ip-check">
          <input type="checkbox" checked={researchVerify} onChange={e => setResearchVerify(e.target.checked)} />
          <span>这些金额已按该日核对</span>
        </label>
        <button type="button" className="tool-btn ip-btn" onClick={() => void saveResearchTotal()}>
          保存研究合计
        </button>
        <label className="ip-check">
          <input
            type="checkbox"
            checked={!!doc.researchCompleteAt}
            onChange={e => {
              void onPatch(
                latest => ({
                  ...latest,
                  researchCompleteAt: e.target.checked ? now : null,
                }),
                doc.localRevision,
              )
            }}
          />
          <span>我声明研究持仓记录完整（未声明不得说额度内）</span>
        </label>
      </details>

      <p aria-live="polite">
        偏离：{bandLabel(view.state)} · 数据：{dataLabel(view.dataState)}
        {view.historicalOnly ? '（历史数学，非当前绿灯）' : ''}
      </p>
      {error && (
        <p className="ip-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
