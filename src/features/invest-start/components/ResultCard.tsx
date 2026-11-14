import React, { forwardRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Card } from '../../../components/ui'
import { REASONS, REF, ROUTE_INFO, chapterHref } from '../content'
import { validUserCapBps } from '../recommend'
import { SUGGESTED_CAP_BPS, USER_CAP_MAX_BPS, type AssessmentResult } from '../types'
import { ChapterLinks } from './ChapterLinks'

const pct = (bps: number): string => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`

/** 结果卡：路线 + 每条理由带书章节；档位永远待本人确认；不出现交易指令 */
export const ResultCard = forwardRef<HTMLHeadingElement, {
  result: AssessmentResult
  userCapBps?: number
  candidateCount: number | null
  onRedoOtherMoney: () => void
  onUserCap: (bps: number | undefined) => void
}>(function ResultCard({ result, userCapBps, candidateCount, onRedoOtherMoney, onUserCap }, headingRef) {
  if (result.status === 'incomplete' || !result.route) {
    return (
      <Card as="section" className="is-result" label="自测结果">
        <h2 ref={headingRef} tabIndex={-1} className="is-h2">还没完成自测：先核对资金底座</h2>
        <p>答完 9 道题之前，本页不给任何路线或入市比例。可以先按下面「先打底」的路径读书、算应急金。</p>
      </Card>
    )
  }
  const route = result.route
  const info = ROUTE_INFO[route]
  return (
    <Card as="section" className={`is-result is-result--${route}`} label="自测结果">
      <p className="is-result__kicker"><Badge tone={route === 'foundation' ? 'warm' : 'accent'}>{info.badge}</Badge></p>
      <h2 ref={headingRef} tabIndex={-1} className="is-h2">你的起步路线：{info.title}</h2>
      <p>{result.foundationOnlyHorizon ? '1 年内要用的钱不进市场。这次自测问的是「这笔钱」；如果你还有 5 年以上不用的钱，可以按那笔钱重新做一次。' : info.summary}</p>
      {result.foundationOnlyHorizon && (
        <div className="is-actions">
          <button type="button" className="tool-btn is-btn" onClick={onRedoOtherMoney}>按另一笔钱重做</button>
        </div>
      )}

      <h3 className="is-h3">为什么</h3>
      <ul className="is-reasons">
        {result.reasonIds.map(id => (
          <li key={id}>
            {REASONS[id]?.text}
            {' '}<span className="is-muted"><ChapterLinks refs={REASONS[id]?.refs} /></span>
          </li>
        ))}
      </ul>

      {route !== 'foundation' && (
        <>
          <h3 className="is-h3">股票和债券的比例：待你本人确认</h3>
          <p>
            比例由你按「愿意承受 / 能够承受 / 需要承受」三问自己定，取三者里最低的一档。这 9 道题没有完整问到这三点，
            所以本页不替你判定保守、均衡或积极，也不预选模板。
          </p>
          <p className="is-muted">
            <ChapterLinks refs={[REF.s7_2, REF.s9_10]} prefix="三问讨论：" />
            <span aria-hidden="true"> · </span>
            <Link to="/investment-plan-2026?tab=allocation">投资计划页的三档模板（只作参考）</Link>
          </p>

          <h3 className="is-h3">主动额度（研究个股的上限）</h3>
          {route === 'simple' ? (
            <p>主动额度为 0：这条路线不研究个股。</p>
          ) : (
            <>
              <p>建议起点上限 {pct(SUGGESTED_CAP_BPS)}，可以为 0。额度是上限，不是要用完的任务（<Link to={chapterHref(REF.s33_1)}>33.1</Link>）。</p>
              <p>
                {candidateCount === null
                  ? '候选池记录暂时读不出来。'
                  : `候选池里观察 ${candidateCount} 家 ≠ 持仓。`}
                观察可以宽，资金要严（<Link to={chapterHref(REF.s36_4)}>36.4</Link>）。
              </p>
              {route === 'research' && <ResearchCap userCapBps={userCapBps} onUserCap={onUserCap} />}
            </>
          )}
        </>
      )}

      <p className="is-next">
        <Link to={chapterHref(REF.openingFourSteps)}>记下这条路线，下一步先读开篇四步 →</Link>
      </p>
    </Card>
  )
})

/** 研究路线：本人可在 0–20% 之间自定上限；不生成默认值，不写回投资计划页 */
function ResearchCap({ userCapBps, onUserCap }: { userCapBps?: number; onUserCap: (bps: number | undefined) => void }): JSX.Element {
  const [input, setInput] = useState(userCapBps !== undefined ? String(userCapBps / 100) : '')
  const [ackRecord, setAckRecord] = useState(false)
  const [ackExit, setAckExit] = useState(false)
  const [error, setError] = useState('')
  const parsed = input.trim() === '' ? NaN : Number(input)
  const bps = Number.isFinite(parsed) ? Math.round(parsed * 100) : NaN
  const needsAck = Number.isFinite(bps) && bps > SUGGESTED_CAP_BPS

  const save = (): void => {
    if (!validUserCapBps(bps)) {
      setError(`请输入 0 到 ${USER_CAP_MAX_BPS / 100} 之间的数字。`)
      return
    }
    if (needsAck && !(ackRecord && ackExit)) {
      setError('提高到 5% 以上前，请先勾选下面两项。')
      return
    }
    setError('')
    onUserCap(bps)
  }

  return (
    <details className="is-cap">
      <summary>
        我的研究额度上限：{userCapBps !== undefined ? `本人设定 ${pct(userCapBps)}` : '未设置（建议起点 5%）'}
      </summary>
      <p className="is-muted">
        20% 是作者自己的案例上限（<Link to={chapterHref(REF.s9_1)}>9.1</Link>、<Link to={chapterHref(REF.s9_4)}>9.4</Link>），
        书中写明不是新手比例，也没有证据说明能提高收益；额度是上限，不是任务（<Link to={chapterHref(REF.s33_1)}>33.1</Link>）。
        这里的设定只存在本页，不会改投资计划页。
      </p>
      <label className="is-field">
        <span>本人上限（%，0—{USER_CAP_MAX_BPS / 100}）</span>
        <input type="number" inputMode="decimal" min={0} max={USER_CAP_MAX_BPS / 100} step={0.5} value={input} onChange={e => setInput(e.target.value)} />
      </label>
      {needsAck && (
        <div className="is-acks">
          <label className="is-check"><input type="checkbox" checked={ackRecord} onChange={e => setAckRecord(e.target.checked)} /><span>我已至少完成一份完整的决策记录（<Link to={chapterHref(REF.s37_4)}>37.4</Link>）</span></label>
          <label className="is-check"><input type="checkbox" checked={ackExit} onChange={e => setAckExit(e.target.checked)} /><span>我读过「这套方法不适合我」的三条判据（<Link to={chapterHref(REF.s18_10)}>18.10</Link>）</span></label>
        </div>
      )}
      {error && <p className="is-error" role="alert">{error}</p>}
      <div className="is-actions">
        <button type="button" className="tool-btn is-btn" onClick={save}>保存我的上限</button>
        {userCapBps !== undefined && (
          <button type="button" className="tool-btn is-btn" onClick={() => { setInput(''); onUserCap(undefined) }}>改回未设置</button>
        )}
      </div>
    </details>
  )
}
