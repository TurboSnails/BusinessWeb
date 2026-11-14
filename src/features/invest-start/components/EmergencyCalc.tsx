import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { REF, chapterHref } from '../content'
import { readLegacyMonthlyExpenseYuan } from '../legacyPlan'

const safeStorage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** 应急金临时算式：月必要支出 × 月数。只在内存里，不保存、不写回投资计划页 */
export function EmergencyCalc(): JSX.Element {
  const [monthly, setMonthly] = useState('')
  const [months, setMonths] = useState('6')
  const [cash, setCash] = useState('')
  const [prefillNote, setPrefillNote] = useState('')

  const m = Number(monthly)
  const n = Number(months)
  const valid = monthly.trim() !== '' && Number.isFinite(m) && m > 0 && Number.isInteger(n) && n >= 1 && n <= 36
  const result = valid ? Math.round(m * n) : null
  const c = Number(cash)
  const cashValid = cash.trim() !== '' && Number.isFinite(c) && c >= 0
  const gap = result !== null && cashValid ? Math.round(result - c) : null

  // 只在本人点击时读旧页的现金流记录（年必要开支，万元 → 元 / 月）
  const prefill = (): void => {
    const v = readLegacyMonthlyExpenseYuan(safeStorage())
    if (v === null) {
      setPrefillNote('投资计划页的现金流工具里没有填过年必要开支。')
      return
    }
    setMonthly(String(v))
    setPrefillNote('已按投资计划页「现金流」里的年必要开支 ÷ 12 预填，请核对。')
  }

  return (
    <div className="is-calc">
      <div className="is-calc__row">
        <label className="is-field">
          <span>每月必要支出（元）</span>
          <input type="number" inputMode="decimal" min={0} value={monthly} onChange={e => setMonthly(e.target.value)} />
        </label>
        <label className="is-field">
          <span>月数（书里建议 6—12）</span>
          <input type="number" inputMode="numeric" min={1} max={36} step={1} value={months} onChange={e => setMonths(e.target.value)} />
        </label>
        <label className="is-field">
          <span>现在能随时动用的现金（元，可不填）</span>
          <input type="number" inputMode="decimal" min={0} value={cash} onChange={e => setCash(e.target.value)} />
        </label>
      </div>
      <p className="is-calc__result" aria-live="polite">
        {result !== null
          ? `应急金需求约 ${result.toLocaleString('zh-CN')} 元（${Number(monthly).toLocaleString('zh-CN')} × ${n}）。`
          : '填上每月必要支出和月数（1—36），这里显示应急金需求。'}
        {gap !== null && (gap > 0
          ? ` 按你填的现金，还差约 ${gap.toLocaleString('zh-CN')} 元。`
          : ' 按你填的现金，已经够这个月数。')}
      </p>
      <p className="is-muted">
        这只是你自己算的数，不是银行或券商的审核，也不是任何资格认定；钱不够就先攒应急金。应急金放在随时能取的地方，
        中短债和纯债基金也可能下跌，不能代替应急现金（<Link to={chapterHref(REF.s7_1)}>7.1</Link>）。数字不保存，关掉页面就没了。
      </p>
      <div className="is-actions">
        <button type="button" className="tool-btn is-btn" onClick={prefill}>用投资计划页填过的年必要开支预填</button>
      </div>
      {prefillNote && <p className="is-muted" role="status">{prefillNote}</p>}
    </div>
  )
}
