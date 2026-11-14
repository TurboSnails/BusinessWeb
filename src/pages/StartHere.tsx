import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, Card, Page, Segmented } from '../components/ui'
import { localToday, reviewStatus } from '../features/invest-start/checks'
import {
  DISCLAIMER, PRIVACY_NOTE, REF, RISK_NOTE, ROUTE_INFO, ROUTE_STEPS, chapterHref,
} from '../features/invest-start/content'
import { answeredCount, evaluate } from '../features/invest-start/recommend'
import { RULES_VERSION, type Answer, type Qid, type Route } from '../features/invest-start/types'
import { useStartState } from '../features/invest-start/useStartState'
import { Assessment } from '../features/invest-start/components/Assessment'
import { EmergencyCalc } from '../features/invest-start/components/EmergencyCalc'
import { LegacyPlanCard } from '../features/invest-start/components/LegacyPlanCard'
import { Glossary, Legend, NotYet } from '../features/invest-start/components/References'
import { ResultCard } from '../features/invest-start/components/ResultCard'
import { ReviewPanel } from '../features/invest-start/components/ReviewPanel'
import { RouteChecklist } from '../features/invest-start/components/RouteChecklist'
import { QUESTIONS } from '../features/invest-start/content'
import '../styles/invest-start.css'

const TOTAL = QUESTIONS.length
const ROUTE_TABS: Array<{ id: Route; label: string }> = (['foundation', 'simple', 'combined', 'research'] as Route[]).map(id => ({ id, label: ROUTE_INFO[id].title }))

/** /invest/start「从这里开始」：纯前端；唯一写入 localStorage['start:v1']，不发任何网络请求 */
export default function StartHere(): JSX.Element {
  const { state, update, reset, mode, saveFailed, deleteFailed, questionnaireChanged, rulesOutdated, legacy, candidateCount } = useStartState()
  const result = useMemo(() => evaluate(state.answers), [state.answers])
  const done = answeredCount(state.answers)
  const [assessIndex, setAssessIndex] = useState<number | null>(() =>
    done === TOTAL ? null : done === 0 ? 0 : Math.max(0, QUESTIONS.findIndex(q => !state.answers[q.id])),
  )
  const [viewRoute, setViewRoute] = useState<Route | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)
  const resultRef = useRef<HTMLHeadingElement>(null)
  const assessRef = useRef<HTMLElement>(null)
  const focusResult = useRef(false)
  const today = localToday()

  useEffect(() => {
    if (focusResult.current) {
      focusResult.current = false
      resultRef.current?.focus()
    }
  })

  /** 父组件触发的跳题：清掉路线浏览，并把键盘焦点交给新出现的题目 */
  const jumpToQuestion = (i: number): void => {
    setViewRoute(null)
    setAssessIndex(i)
    setFocusRequest(n => n + 1)
  }

  const complete = result.status === 'complete' && !!result.route
  const systemRoute: Route = complete && result.route ? result.route : 'foundation'
  // 未答完一律是静态先打底路径：浏览其他路线只在结果完整时有效（其他标签页把结果改成未答完也一样）
  const shownRoute: Route = complete ? viewRoute ?? systemRoute : 'foundation'
  const groups = ROUTE_STEPS[shownRoute]

  const setAnswer = (qid: Qid, v: Answer): void =>
    update(s => ({ ...s, answers: { ...s.answers, [qid]: v }, rulesVersion: RULES_VERSION }))

  const finish = (): void => {
    update(s => ({ ...s, assessedAt: new Date().toISOString(), rulesVersion: RULES_VERSION }))
    setAssessIndex(null)
    setViewRoute(null)
    focusResult.current = true
  }

  const restart = (): void => {
    update(s => ({ ...s, answers: {}, assessedAt: undefined, rulesVersion: RULES_VERSION }))
    jumpToQuestion(0)
  }

  const redoOtherMoney = (): void => {
    update(s => {
      const answers = { ...s.answers }
      delete answers.q3
      delete answers.q4
      return { ...s, answers, assessedAt: undefined }
    })
    jumpToQuestion(QUESTIONS.findIndex(q => q.id === 'q3'))
    assessRef.current?.scrollIntoView?.({ block: 'start' })
  }

  const firstOpenStep = groups.flatMap(g => g.steps).find(s => !state.steps[s.id]?.checked)
  const review = state.review ? reviewStatus(state.review, today) : null

  // 一句话下一步
  let nextLine: React.ReactNode
  if (!complete) {
    nextLine = done === 0
      ? <>先做 5 分钟自测：9 道单选，答案只存在这台设备上。<a href="#start-assessment">开始自测 →</a></>
      : <>继续自测：还剩 {TOTAL - done} 题。<a href="#start-assessment">回到自测 →</a></>
  } else if (systemRoute === 'foundation') {
    nextLine = result.foundationOnlyHorizon
      ? <>这笔钱 1 年内要用，不进市场。如果还有 5 年以上不用的钱，按那笔钱重做一次自测。</>
      : <>先攒应急金、还高息欠款，读<Link to={chapterHref(REF.openingFourSteps)}>开篇四步</Link>。现在不需要选任何产品。</>
  } else if (review) {
    nextLine = review.due
      ? <>检查日 {review.due} 已到：先更新金额，再看是否越过阈值。<a href="#start-review">去检查 →</a></>
      : <>下次检查日 {review.next}，还有 {review.daysToNext} 天。未到例行检查日，仍需留意资金与产品变化。</>
  } else {
    nextLine = firstOpenStep
      ? <>勾选路线清单的下一步：{firstOpenStep.title}。<a href="#start-route">去清单 →</a></>
      : <>清单都勾完了，定一个检查日。<a href="#start-review">设检查日 →</a></>
  }

  return (
    <Page className="invest-start">
      <nav className="breadcrumb is-breadcrumb" aria-label="面包屑">
        <Link to="/">Live</Link>
        <span aria-hidden="true">›</span>
        <Link to="/invest">投资</Link>
        <span aria-hidden="true">›</span>
        <span className="breadcrumb__current">从这里开始</span>
      </nav>

      <header className="page-head is-head">
        <h1>从这里开始</h1>
        <p>先确认该不该投，再决定投什么、投多少、什么时候检查。</p>
      </header>

      <Callout tone="muted" title="不构成投资建议，不承诺收益" className="is-disclaimer">
        <p>{DISCLAIMER}</p>
        <p>{RISK_NOTE}</p>
      </Callout>

      <section className="is-next-step" aria-labelledby="is-next-title">
        <h2 id="is-next-title" className="is-next-step__title">你的下一步</h2>
        <p aria-live="polite">{nextLine}</p>
      </section>

      {result.safetyWarning && (
        <div role="alert" className="is-redline">
          <p className="is-redline__title">先停下：有人承诺收益、带单或让你转账</p>
          <p>
            承诺收益、拉你进「老师带单」群、让你把钱转到别人名下，任何一条都应该立刻停下，不要继续转账。
            书里列了五条红线和已经转账后该怎么做：<Link to={chapterHref(REF.s7_8)}>第7章 7.8 五条红线</Link>。
          </p>
        </div>
      )}

      {(saveFailed || mode === 'corrupt') && (
        <Callout tone="warn" title={mode === 'corrupt' ? '本机保存的记录无法识别' : '当前未保存'}>
          {mode === 'corrupt' ? (
            <p>为了不覆盖原来的记录，本页现在只在内存里工作。确认不需要那份记录后，可以在页面底部清除并重新开始。</p>
          ) : (
            <p>这个浏览器不允许本机存储（可能是隐私模式）。页面照常可用，但关掉后答案和勾选会丢失。</p>
          )}
        </Callout>
      )}
      {questionnaireChanged && <Callout tone="info">题目已经更新，旧答案不再沿用，请重新做一次自测；清单勾选和检查日都保留了。</Callout>}
      {rulesOutdated && complete && (
        <Callout tone="info">推荐规则已经更新，下面的结果按新规则重新计算；建议重做一次自测核对。</Callout>
      )}

      <section id="start-assessment" ref={assessRef} className="is-section" aria-labelledby="is-assess-title">
        <h2 id="is-assess-title" className="is-h2">5 分钟自测</h2>
        <Assessment
          answers={state.answers}
          index={assessIndex}
          onIndex={setAssessIndex}
          onAnswer={setAnswer}
          onFinish={finish}
          onRestart={restart}
          assessedAt={state.assessedAt}
          focusRequest={focusRequest}
        />
      </section>

      <ResultCard
        ref={resultRef}
        result={result}
        userCapBps={state.userResearchCapBps}
        candidateCount={candidateCount}
        onRedoOtherMoney={redoOtherMoney}
        onUserCap={bps => update(s => {
          const next = { ...s }
          if (bps === undefined) delete next.userResearchCapBps
          else next.userResearchCapBps = bps
          return next
        })}
      />

      <section id="start-route" className="is-section" aria-labelledby="is-route-title">
        <h2 id="is-route-title" className="is-h2">
          {complete ? `路线清单：${ROUTE_INFO[shownRoute].title}` : '先打底学习路径'}
        </h2>
        <p className="is-muted">勾选只是你自己记下「做过了」，不代表资金审核或投资许可；勾选只存在这台设备上。</p>
        {complete && (
          <div className="is-route-tabs">
            <Segmented label="浏览其他路线的清单" items={ROUTE_TABS} value={shownRoute} onChange={id => setViewRoute(id === systemRoute ? null : id)} />
            {viewRoute && (
              <p className="is-muted" role="status">
                只是浏览「{ROUTE_INFO[viewRoute].title}」的清单，自测结果仍是「{ROUTE_INFO[systemRoute].title}」
                {systemRoute === 'foundation' || systemRoute === 'simple' ? '，并不表示你已经符合这条路线的条件' : ''}。
              </p>
            )}
          </div>
        )}
        <RouteChecklist
          groups={groups}
          steps={state.steps}
          onToggle={(id, checked) => update(s => ({ ...s, steps: { ...s.steps, [id]: { checked, at: new Date().toISOString() } } }))}
        />
      </section>

      <Card as="section" id="start-emergency" className="is-section-card" title="应急金临时算式" label="应急金临时算式">
        <EmergencyCalc />
      </Card>

      <Card as="section" id="start-review" className="is-section-card" title="检查日" label="检查日">
        <p className="is-muted">
          每季度或每半年核对一次资金用途、产品与比例，越过事先定的阈值才调整（<Link to={chapterHref(REF.openingFourSteps)}>开篇四步③</Link>、
          <Link to={chapterHref(REF.s8_2)}>8.2</Link>）。
        </p>
        <ReviewPanel review={state.review} today={today} onChange={r => update(s => {
          const next = { ...s }
          if (r) next.review = r
          else delete next.review
          return next
        })} />
      </Card>

      <section className="is-section" aria-label="投资计划页的旧记录">
        <LegacyPlanCard
          legacy={legacy}
          onConfirm={() => update(s => ({ ...s, legacyConfirmation: { fingerprint: legacy.fingerprint, confirmedAt: new Date().toISOString() } }))}
          onRevoke={() => update(s => {
            const next = { ...s }
            delete next.legacyConfirmation
            return next
          })}
        />
      </section>

      <section className="is-section" aria-labelledby="is-notyet-title">
        <h2 id="is-notyet-title" className="is-h2">这些先别开</h2>
        <p className="is-muted">先打底和省心路线用不到下面这些页面；它们没有错，只是和检查日规则无关。</p>
        <NotYet />
      </section>

      <section className="is-section" aria-labelledby="is-legend-title">
        <h2 id="is-legend-title" className="is-h2">站内数字怎么看</h2>
        <Legend />
      </section>

      <section className="is-section" aria-labelledby="is-glossary-title">
        <h2 id="is-glossary-title" className="is-h2">常见词</h2>
        <Glossary />
      </section>

      <section className="is-section is-privacy" aria-labelledby="is-privacy-title">
        <h2 id="is-privacy-title" className="is-h2">本机记录</h2>
        <p>{PRIVACY_NOTE}</p>
        {deleteFailed && (
          <p className="is-error" role="alert">清除失败：浏览器没有允许删除，这台设备上的记录仍然保留。可以换一个允许本机存储的窗口再试，或在浏览器设置里清除本站数据。</p>
        )}
        <p className="is-muted">清除只删除本页的记录，不动投资计划页和其他页面的数据；已经导入日历的检查日需要在日历里自己删除。</p>
        <div className="is-actions">
          {confirmClear ? (
            <>
              <button
                type="button"
                className="tool-btn tool-btn--danger is-btn"
                onClick={() => {
                  setConfirmClear(false)
                  if (reset()) jumpToQuestion(0)
                }}
              >
                确认清除
              </button>
              <button type="button" className="tool-btn is-btn" onClick={() => setConfirmClear(false)}>取消</button>
            </>
          ) : (
            <button type="button" className="tool-btn is-btn" onClick={() => setConfirmClear(true)}>清除本页在这台设备上的记录</button>
          )}
        </div>
      </section>
    </Page>
  )
}
