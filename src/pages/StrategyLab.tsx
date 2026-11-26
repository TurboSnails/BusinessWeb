import React, { useEffect, useRef } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Page } from '../components/ui'
import { PageTabs } from '../components/ui/PageTabs'
import DailyExecutionStudy from '../features/strategy-lab/DailyExecutionStudy'
import DefensiveTiltStudy from '../features/strategy-lab/DefensiveTiltStudy'
import DefensiveTrendStudy from '../features/strategy-lab/DefensiveTrendStudy'
import DruckenmillerNote from '../features/strategy-lab/DruckenmillerNote'
import EffectiveStrategies from '../features/strategy-lab/EffectiveStrategies'
import EtfVolumeStudy from '../features/strategy-lab/EtfVolumeStudy'
import LateCycleStudy from '../features/strategy-lab/LateCycleStudy'
import LateWarningStudy from '../features/strategy-lab/LateWarningStudy'
import MultiAssetStudy from '../features/strategy-lab/MultiAssetStudy'
import OptionHedgeStudy from '../features/strategy-lab/OptionHedgeStudy'
import OverfitAuditStudy from '../features/strategy-lab/OverfitAuditStudy'
import RadarVixStudy from '../features/strategy-lab/RadarVixStudy'
import TrendStudy from '../features/strategy-lab/TrendStudy'
import VolConfirmStudy from '../features/strategy-lab/VolConfirmStudy'
import VolTargetStudy from '../features/strategy-lab/VolTargetStudy'
import TrioNav from '../features/combined-strategy/TrioNav'
import '../styles/combined-strategy.css'
import '../styles/strategy-spec.css'
import '../styles/strategy-lab.css'
import '../styles/strategy-lab-tabs.css'

export const STRATEGY_LAB_LEAD =
  '还没写进正式规则的研究放在这里：结论不确定、没通过检验、或只在影子跟踪的内容。这一页不影响仓位，仓位以综合策略和策略说明书为准。'

export type LabTab = 'overview' | 'audit' | 'late' | 'trend' | 'vol' | 'cn'
type Status = 'pass' | 'partial' | 'fail' | 'note'

export interface LabStudy {
  id: string
  tab: Exclude<LabTab, 'overview'>
  title: string
  date: string
  status: Status
  statusText: string
  summary: string
  Component: () => JSX.Element
}

/** 全部研究，按页签分组；同一页签内的顺序就是页面上的顺序 */
export const LAB_STUDIES: LabStudy[] = [
  { id: 'lab-overfit-audit', tab: 'audit', title: '现行规则的过拟合审计', date: '2026-11-26', status: 'note', statusText: '审计', summary: '算上试过的 86 种写法，不能排除优势来自挑选；参数过拟合风险高；整类宏观写法仍有显著好于恒定仓位的。规则不变，预期打折。', Component: OverfitAuditStudy },
  { id: 'lab-late-warning', tab: 'late', title: '牛市后期多维预警', date: '2026-11-26', status: 'fail', statusText: '不通过', summary: '利差走阔、VIX 放大、新高变少、防守轮动、大盘停滞，7 种写法都不通过：这些现象多在回调开始后才凑齐。', Component: LateWarningStudy },
  { id: 'lab-defensive-tilt', tab: 'late', title: '股票部分长期防守倾斜', date: '2026-11-26', status: 'pass', statusText: '通过 · 影子运行', summary: '1934–1972 年通过，但同等波动下大跌并没有少跌，好处是效率；ETF 影子运行 12 个月。', Component: DefensiveTiltStudy },
  { id: 'lab-radar-vix', tab: 'late', title: '雷达加企业利差与 VIX 变化趋势', date: '2026-11-26', status: 'fail', statusText: '不通过', summary: '两种计分写法验证期都更差；VIX 变化趋势改为只展示。', Component: RadarVixStudy },
  { id: 'lab-druckenmiller', tab: 'late', title: '德鲁肯米勒「逃顶」核查', date: '2026-11-26', status: 'note', statusText: '核查', summary: '只对了一半：公开说不做多股票时，标普已从高点回落约 6%。', Component: DruckenmillerNote },
  { id: 'lab-option-hedge', tab: 'trend', title: '期权保护能否更便宜地防急跌', date: '2026-11-26', status: 'partial', statusText: '部分成立', summary: '每月买看跌急跌里少亏约 23%，但同等少亏下和直接降仓一样贵；零成本领口不起作用。', Component: OptionHedgeStudy },
  { id: 'lab-trend', tab: 'trend', title: '趋势防下跌：1872–1934 年确认检验', date: '2026-11-26', status: 'partial', statusText: '部分成立', summary: '现行十个月均线和破位封顶 50% 在 8 次大跌里都全部少跌，统计上不显著；规则不变，破位封顶进影子记录。', Component: TrendStudy },
  { id: 'lab-late-cycle', tab: 'trend', title: '牛市后段到回调：月中刹车', date: '2026-11-25', status: 'fail', statusText: '不通过', summary: '策略只对宏观先转差的下跌有用；4 种按日刹车都不通过。', Component: LateCycleStudy },
  { id: 'lab-daily-execution', tab: 'trend', title: '宏观攻守能不能按日执行', date: '2026-11-25', status: 'fail', statusText: '不通过', summary: '按日执行更差，维持按月。', Component: DailyExecutionStudy },
  { id: 'lab-defensive-trend', tab: 'vol', title: '防守部分放趋势过滤的债券（14 国）', date: '2026-11-26', status: 'fail', statusText: '不通过', summary: '债券趋势择时有价值（14 国全改善、安慰剂 p 0.006），但利率上行期仍比现金每年少 1.4 个百分点；防守部分继续放现金。', Component: DefensiveTrendStudy },
  { id: 'lab-vol-confirm', tab: 'vol', title: '降低波动：确认检验与决定', date: '2026-11-25', status: 'partial', statusText: '部分成立', summary: '波动率目标不纳入规则；最可靠的是美股上限取 80%。', Component: VolConfirmStudy },
  { id: 'lab-multi-asset', tab: 'vol', title: '多资产降波动（股、债、金）', date: '2026-11-25', status: 'fail', statusText: '不通过', summary: '两个候选都不通过；降波动继续用调低上限。', Component: MultiAssetStudy },
  { id: 'lab-vol-target', tab: 'vol', title: '波动率目标：市场越乱，仓位越低', date: '2026-11-25', status: 'fail', statusText: '不通过', summary: '回撤明显更浅，但按事先门槛差一点不通过。', Component: VolTargetStudy },
  { id: 'lab-etf-volume', tab: 'cn', title: 'A 股 ETF 择时加成交量', date: '2026-11-25', status: 'fail', statusText: '不通过', summary: '三种成交量条件都没有帮助。', Component: EtfVolumeStudy },
]

const TAB_LABEL: Record<LabTab, string> = { overview: '总览', audit: '规则可信度', late: '牛市后期', trend: '防下跌', vol: '降低波动', cn: 'A 股 ETF' }
const TAB_ORDER: LabTab[] = ['overview', 'audit', 'late', 'trend', 'vol', 'cn']
const isTab = (v: string | null): v is LabTab => v != null && (TAB_ORDER as string[]).includes(v)
const studyTab = (id: string): LabTab | null => (id === 'lab-v01' ? 'overview' : LAB_STUDIES.find(s => s.id === id)?.tab ?? null)

function StudyCard({ study, onOpen }: { study: LabStudy; onOpen(): void }): JSX.Element {
  return (
    <li className="lab-rcard" data-status={study.status}>
      <button type="button" className="lab-rcard__btn" onClick={onOpen} data-testid={`lab-card-${study.id}`}>
        <span className="lab-rcard__meta">
          <span className="lab-pill" data-status={study.status}>{study.statusText}</span>
          <span className="lab-rcard__date">{study.date}</span>
          <span className="lab-rcard__tab">{TAB_LABEL[study.tab]}</span>
        </span>
        <span className="lab-rcard__title">{study.title}</span>
        <span className="lab-rcard__summary">{study.summary}</span>
        <span className="lab-rcard__go" aria-hidden="true">查看 →</span>
      </button>
    </li>
  )
}

export default function StrategyLab(): JSX.Element {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const hashId = decodeURIComponent(location.hash.slice(1))
  // 指向具体研究的锚点（旧链接 #lab-xxx）优先，其次 ?tab=，默认总览
  const paramTab = params.get('tab')
  const tab: LabTab = studyTab(hashId) ?? (isTab(paramTab) ? paramTab : 'overview')

  const go = (next: LabTab, id?: string): void => {
    navigate({ search: next === 'overview' ? '' : `?tab=${next}`, hash: id ? `#${id}` : '' }, { replace: true })
  }

  useEffect(() => {
    // 有锚点就滚到那项研究；只切页签时，若页签已滚出视口，回到页签处
    const frame = requestAnimationFrame(() => {
      const target = hashId ? document.getElementById(hashId) : null
      if (target) { target.scrollIntoView?.({ behavior: 'smooth', block: 'start' }); return }
      const top = panelRef.current?.getBoundingClientRect().top ?? 0
      if (top < 0) window.scrollTo({ top: window.scrollY + top - 120, behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(frame)
  }, [tab, hashId])

  const inTab = LAB_STUDIES.filter(s => s.tab === tab)
  const latest = [...LAB_STUDIES].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <Page className="cs-page ss-page lab-page">
      <header className="page-head cs-head">
        <h1>研究中</h1>
        <p className="cs-head__lead" data-testid="lab-lead">{STRATEGY_LAB_LEAD}</p>
        <TrioNav />
      </header>

      <PageTabs<LabTab>
        label="研究分类"
        value={tab}
        onChange={next => go(next)}
        items={TAB_ORDER.map(id => {
          const n = LAB_STUDIES.filter(s => s.tab === id).length
          return { id, label: id === 'overview' ? TAB_LABEL[id] : `${TAB_LABEL[id]} · ${n}` }
        })}
      />

      <div className="ss-body lab-panel" ref={panelRef} role="tabpanel" aria-label={TAB_LABEL[tab]} data-testid={`lab-panel-${tab}`}>
        {tab === 'overview' ? (
          <>
            <section className="lab-overview" aria-labelledby="lab-all-title">
              <h2 id="lab-all-title" className="lab-overview__title">全部研究</h2>
              <p className="lab-overview__hint">按日期从新到旧。点卡片看完整研究。</p>
              <ol className="lab-rcards" data-testid="lab-cards">
                {latest.map(s => <StudyCard key={s.id} study={s} onOpen={() => go(s.tab, s.id)} />)}
              </ol>
            </section>
            <EffectiveStrategies />
          </>
        ) : (
          <>
            {inTab.length > 1 ? (
              <nav className="lab-jump" aria-label="本页研究">
                <span className="lab-jump__label">本页</span>
                {inTab.map(s => (
                  <button key={s.id} type="button" className="lab-jump__btn" onClick={() => go(tab, s.id)}>
                    <span className="lab-pill" data-status={s.status}>{s.statusText}</span>
                    {s.title}
                  </button>
                ))}
              </nav>
            ) : null}
            {inTab.map(({ id, Component }) => <Component key={id} />)}
          </>
        )}
      </div>

      <footer className="cs-footer" role="note">
        <p>
          每项研究先写预注册、再计算；通过门槛也只进入影子跟踪，写入正式规则要另行检验。
          {' '}<Link to="/invest/strategy/spec">策略说明书</Link>
        </p>
        <p>历史统计，不构成买卖建议。</p>
      </footer>
    </Page>
  )
}
