import React, { useEffect, useRef } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Page } from '../components/ui'
import { PageTabs } from '../components/ui/PageTabs'
import CryptoL039Study from '../features/strategy-lab/CryptoL039Study'
import DailyExecutionStudy from '../features/strategy-lab/DailyExecutionStudy'
import DefensiveTrendStudy from '../features/strategy-lab/DefensiveTrendStudy'
import DruckenmillerNote from '../features/strategy-lab/DruckenmillerNote'
import EffectiveStrategies from '../features/strategy-lab/EffectiveStrategies'
import EtfVolumeStudy from '../features/strategy-lab/EtfVolumeStudy'
import { LiquidityStudy, NasdaqSemisHeatStudy } from '../features/strategy-lab/HeatLiquidityStudies'
import LateCycleStudy from '../features/strategy-lab/LateCycleStudy'
import LateWarningStudy from '../features/strategy-lab/LateWarningStudy'
import MultiAssetStudy from '../features/strategy-lab/MultiAssetStudy'
import OptionHedgeStudy from '../features/strategy-lab/OptionHedgeStudy'
import OverfitAuditStudy from '../features/strategy-lab/OverfitAuditStudy'
import RadarVixStudy from '../features/strategy-lab/RadarVixStudy'
import { CountryMomentumStudy, HeatMoreStudy } from '../features/strategy-lab/RotationHeatStudies'
import Trend14Study from '../features/strategy-lab/Trend14Study'
import TrendMomentumStudy from '../features/strategy-lab/TrendMomentumStudy'
import TierSwitchStudy from '../features/strategy-lab/TierSwitchStudy'
import LiquidityDefenseStudy from '../features/strategy-lab/LiquidityDefenseStudy'
import SpxQqqTiltStudy from '../features/strategy-lab/SpxQqqTiltStudy'
import DeadCatBounceStudy from '../features/strategy-lab/DeadCatBounceStudy'
import ThemePeCnStudy from '../features/strategy-lab/ThemePeCnStudy'
import EtfTimingConfirmStudy from '../features/strategy-lab/EtfTimingConfirmStudy'
import TrendStudy from '../features/strategy-lab/TrendStudy'
import VolConfirmStudy from '../features/strategy-lab/VolConfirmStudy'
import VolTargetStudy from '../features/strategy-lab/VolTargetStudy'
import TrioNav from '../features/combined-strategy/TrioNav'
import '../styles/combined-strategy.css'
import '../styles/strategy-spec.css'
import '../styles/strategy-lab.css'
import '../styles/strategy-lab-tabs.css'

export const STRATEGY_LAB_LEAD =
  '还没通过检验的研究放在这里：结论不确定、没通过、或部分成立的内容；通过检验的策略单独放在「通过检验」页。这一页不影响仓位，仓位以综合策略和策略说明书为准。文中「L-0xx」是本站研究登记簿的编号，同一编号在说明书、研究中、通过检验三页指同一次检验。'

/** 已移到「通过检验」页的研究：旧链接（锚点或 ?tab=sector）跳过去 */
const MOVED: Record<string, string> = {
  'lab-sector-rotation': '/invest/verified',
  'lab-defensive-tilt': '/invest/verified?tab=tilt',
}

export type LabTab = 'overview' | 'audit' | 'late' | 'trend' | 'vol' | 'rotate' | 'cn'
type Status = 'pass' | 'partial' | 'fail' | 'note'

type StudyTab = Exclude<LabTab, 'overview'>

export interface LabGroup {
  id: string
  label: string
  /** 可选的一句话说明，显示在分组标题下 */
  note?: string
}

/** 每个页签内的子分组；页面按这里的顺序分组显示，组内按 LAB_STUDIES 的顺序 */
export const LAB_GROUPS: Record<StudyTab, LabGroup[]> = {
  audit: [{ id: 'rules', label: '现行规则审计' }],
  late: [
    { id: 'heat', label: '过热与拥挤读数' },
    { id: 'signal', label: '预警信号与新指标' },
    { id: 'case', label: '案例核查' },
  ],
  trend: [
    { id: 'ma', label: '均线破位' },
    { id: 'speed', label: '执行频率与刹车' },
    { id: 'hedge', label: '期权保护' },
    { id: 'other', label: '其他资产', note: '单独研究其他资产自身的择时，与美股仓位规则无关。' },
  ],
  vol: [
    { id: 'cap', label: '调仓位降波动' },
    { id: 'assets', label: '多资产与防守部分' },
  ],
  rotate: [
    { id: 'industry', label: '按档位切换行业' },
    { id: 'multi', label: '多资产轮动' },
    { id: 'country', label: '跨国轮动' },
  ],
  cn: [{ id: 'timing', label: '择时信号' }],
}

export interface LabStudy {
  id: string
  tab: StudyTab
  /** LAB_GROUPS[tab] 里的分组 id */
  group: string
  title: string
  date: string
  status: Status
  statusText: string
  summary: string
  Component: () => JSX.Element
}

/** 全部研究，按页签分组；同一页签内的顺序就是页面上的顺序 */
export const LAB_STUDIES: LabStudy[] = [
  { id: 'lab-overfit-audit', tab: 'audit', group: 'rules', title: '现行规则的过拟合审计', date: '2026-11-26', status: 'note', statusText: '审计', summary: '算上试过的 86 种写法，不能排除优势来自挑选；参数过拟合风险高；整类宏观写法仍有显著好于恒定仓位的。规则不变，预期打折。', Component: OverfitAuditStudy },
  { id: 'lab-heat-more', tab: 'late', group: 'heat', title: '更多过热读数：小盘、港股、A 股、能源、金融与 49 个行业', date: '2026-11-26', status: 'fail', statusText: '没有预测力', summary: '罗素 2000、恒生、上证远高于均线，能源、金融占比偏高，之后一年都不更差；49 个行业一起看也不显著。作为展示指标加入雷达。', Component: HeatMoreStudy },
  { id: 'lab-nasdaq-semis', tab: 'late', group: 'heat', title: '纳斯达克与半导体的超配 / 过热读数', date: '2026-11-26', status: 'fail', statusText: '没有预测力', summary: '纳指、半导体过热或拥挤之后一年并没有更差；四种口径都没有预测力，作为展示指标加入雷达。', Component: NasdaqSemisHeatStudy },
  { id: 'lab-liquidity', tab: 'late', group: 'signal', title: '流动性能不能加进宏观攻守', date: '2026-11-26', status: 'fail', statusText: '不采用', summary: '政策流动性已在规则里；再加实际 M2 或美联储净流动性，规则反而变差。', Component: LiquidityStudy },
  { id: 'lab-late-warning', tab: 'late', group: 'signal', title: '牛市后期多维预警', date: '2026-11-26', status: 'fail', statusText: '不通过', summary: '利差走阔、VIX 放大、新高变少、防守轮动、大盘停滞，7 种写法都不通过：这些现象多在回调开始后才凑齐。', Component: LateWarningStudy },
  { id: 'lab-radar-vix', tab: 'late', group: 'signal', title: '雷达加企业利差与 VIX 变化趋势', date: '2026-11-26', status: 'fail', statusText: '不通过', summary: '两种计分写法验证期都更差；VIX 变化趋势改为只展示。', Component: RadarVixStudy },
  { id: 'lab-druckenmiller', tab: 'late', group: 'case', title: '德鲁肯米勒「逃顶」核查', date: '2026-11-26', status: 'note', statusText: '核查', summary: '只对了一半：公开说不做多股票时，标普已从高点回落约 6%。', Component: DruckenmillerNote },
  { id: 'lab-trend-14', tab: 'trend', group: 'ma', title: '十个月均线：14 国确认检验', date: '2026-11-26', status: 'fail', statusText: '不通过', summary: '14 国全部少跌、时机显著，但只少跌约 3.5%，全周期一半赚一半亏，晚一个月执行就亏；退路改为只保留上限。', Component: Trend14Study },
  { id: 'lab-option-hedge', tab: 'trend', group: 'hedge', title: '期权保护能否更便宜地防急跌', date: '2026-11-26', status: 'partial', statusText: '部分成立', summary: '每月买看跌急跌里少亏约 23%，但同等少亏下和直接降仓一样贵；零成本领口不起作用。', Component: OptionHedgeStudy },
  { id: 'lab-trend', tab: 'trend', group: 'ma', title: '趋势防下跌：1872–1934 年确认检验', date: '2026-11-26', status: 'partial', statusText: '部分成立', summary: '现行十个月均线和破位封顶 50% 在 8 次大跌里都全部少跌，统计上不显著；规则不变，破位封顶进影子记录。', Component: TrendStudy },
  { id: 'lab-late-cycle', tab: 'trend', group: 'speed', title: '牛市后段到回调：月中刹车', date: '2026-11-25', status: 'fail', statusText: '不通过', summary: '策略只对宏观先转差的下跌有用；4 种按日刹车都不通过。', Component: LateCycleStudy },
  { id: 'lab-daily-execution', tab: 'trend', group: 'speed', title: '宏观攻守能不能按日执行', date: '2026-11-25', status: 'fail', statusText: '不通过', summary: '按日执行更差，维持按月。', Component: DailyExecutionStudy },
  { id: 'lab-crypto-l039', tab: 'trend', group: 'other', title: 'BTC 单币择时研究（L-039）', date: '2026-11-27', status: 'fail', statusText: '旧史不通过', summary: '趋势择时比同波动固定仓位的回撤浅约 9 个百分点，但 2012–2017 年牛市里多数时间满仓，波动只比持有低约 8%，未达到预定的 15%，美股规则保持现行口径。', Component: CryptoL039Study },
  { id: 'lab-defensive-trend', tab: 'vol', group: 'assets', title: '防守部分放趋势过滤的债券（14 国）', date: '2026-11-26', status: 'fail', statusText: '不通过', summary: '债券趋势择时有价值（14 国全改善、安慰剂 p 0.006），但利率上行期仍比现金每年少 1.4 个百分点；防守部分继续放现金。', Component: DefensiveTrendStudy },
  { id: 'lab-vol-confirm', tab: 'vol', group: 'cap', title: '降低波动：确认检验与决定', date: '2026-11-25', status: 'partial', statusText: '部分成立', summary: '波动率目标不纳入规则；最可靠的是美股上限取 80%。', Component: VolConfirmStudy },
  { id: 'lab-multi-asset', tab: 'vol', group: 'assets', title: '多资产降波动（股、债、金）', date: '2026-11-25', status: 'fail', statusText: '不通过', summary: '两个候选都不通过；降波动继续用调低上限。', Component: MultiAssetStudy },
  { id: 'lab-vol-target', tab: 'vol', group: 'cap', title: '波动率目标：市场越乱，仓位越低', date: '2026-11-25', status: 'fail', statusText: '不通过', summary: '回撤明显更浅，但按事先门槛差一点不通过。', Component: VolTargetStudy },
  { id: 'lab-tier-switch', tab: 'rotate', group: 'industry', title: '按宏观档位切换行业：偏防守买防守行业，偏进攻买进攻行业', date: '2026-11-28', status: 'fail', statusText: '不通过', summary: '防守侧换防守行业方向对，进攻侧换进攻行业在每段历史都拖后腿；合起来几乎没有好处，还不如一直放防守行业。股票部分维持全买宽基。', Component: TierSwitchStudy },
  { id: 'lab-spx-qqq-tilt', tab: 'rotate', group: 'industry', title: '股票部分 30% 大盘成长倾斜，与深度回调后有限加杠杆（1.3 倍）', date: '2026-11-28', status: 'fail', statusText: '不通过', summary: '成长倾斜的波动、回撤几乎和大盘一样（17.95% 对 17.96%，−83.7% 对 −84.1%），没降波动；回调后加到 1.3 倍回撤更深、风险调整后更差。代用品比纳指 100 温和，不能直接外推。两个都不通过，不改仓位规则。', Component: SpxQqqTiltStudy },
  { id: 'lab-trend-momentum', tab: 'rotate', group: 'multi', title: '多资产趋势 + 动量轮动（美股、海外股、国债、黄金）', date: '2026-11-26', status: 'partial', statusText: '不稳定', summary: '大熊市里明显少亏、时机显著；但趋势 + 动量晚一个月执行就变差，只看趋势 2010 年后一直落后。不新开页签，方案不变。', Component: TrendMomentumStudy },
  { id: 'lab-country-momentum', tab: 'rotate', group: 'country', title: '跨国动量轮动：美国与海外之间切换', date: '2026-11-26', status: 'fail', statusText: '不通过', summary: '美国 / 海外二选一和各持一半打平；挑最强 5 个市场 2001 年后反而更差；2014 年后只持有美国最好。方案不轮动。', Component: CountryMomentumStudy },
  { id: 'lab-liquidity-defense', tab: 'cn', group: 'timing', title: 'A 股流动性踩踏防守：跌停潮、冲击成本飙升时减仓', date: '2026-11-28', status: 'partial', statusText: '部分成立', summary: '跌停潮出现就减到半仓一个月：夏普 0.485 → 0.549、最大回撤 −72% → −59%，两段都有效，但时机检验不显著；冲击成本写法不稳定。不改仓位规则。', Component: LiquidityDefenseStudy },
  { id: 'lab-dead-cat-bounce', tab: 'cn', group: 'timing', title: 'A 股暴跌后反弹（死猫跳）回避', date: '2026-11-28', status: 'fail', statusText: '不晋级', summary: '反弹股之后 60 日确实跑输，但剔除它们回撤反而更深（−48.4% → −50.6%）、扣成本不赚，两个写法都不晋级；威科夫完整形态只出现 7 次，结案；截图里「做空胜率 77%」在原始资料中不存在。', Component: DeadCatBounceStudy },
  { id: 'lab-theme-pe-cn', tab: 'cn', group: 'timing', title: 'A 股主线行业 + 估值过滤', date: '2026-11-28', status: 'fail', statusText: '不通过', summary: '检验的是申万一级行业，不是概念题材。持续主线波动 26.0%（行业等权 22.8%）、夏普 0.11（0.24）；每月主线夏普 −0.02；估值过滤增量不稳健。两个都不通过。', Component: ThemePeCnStudy },
  { id: 'lab-etf-timing-confirm', tab: 'cn', group: 'timing', title: '朋友 ETF「择时 + 只认金叉」：2005–2010 年确认检验', date: '2026-11-28', status: 'partial', statusText: '部分确认', summary: '同样平均仓位下，2008 年回撤更浅（15 个指数里 13 个收益和回撤都不差，时机检验 p 0.0008），但波动没有比同仓位静态持有低（0/15），相对一直持有收益代价仍在；11/15 为回填指数。不改仓位规则，影子运行以同仓位静态组合为对照复核。', Component: EtfTimingConfirmStudy },
  { id: 'lab-etf-volume', tab: 'cn', group: 'timing', title: 'A 股 ETF 择时加成交量', date: '2026-11-25', status: 'fail', statusText: '不通过', summary: '三种成交量条件都没有帮助。', Component: EtfVolumeStudy },
]

const TAB_LABEL: Record<LabTab, string> = { overview: '总览', audit: '规则可信度', late: '牛市后期', trend: '防下跌', vol: '降低波动', rotate: '轮动', cn: 'A 股 ETF' }
const TAB_ORDER: LabTab[] = ['overview', 'audit', 'late', 'trend', 'vol', 'rotate', 'cn']
const isTab = (v: string | null): v is LabTab => v != null && (TAB_ORDER as string[]).includes(v)
const studyTab = (id: string): LabTab | null => (id === 'lab-v01' ? 'overview' : LAB_STUDIES.find(s => s.id === id)?.tab ?? null)
const groupLabel = (s: LabStudy): string => LAB_GROUPS[s.tab].find(g => g.id === s.group)?.label ?? ''

/** 页签内按子分组排好的研究；空分组不出现 */
export function groupedStudies(tab: StudyTab): Array<LabGroup & { studies: LabStudy[] }> {
  return LAB_GROUPS[tab]
    .map(g => ({ ...g, studies: LAB_STUDIES.filter(s => s.tab === tab && s.group === g.id) }))
    .filter(g => g.studies.length > 0)
}

function StudyCard({ study, onOpen }: { study: LabStudy; onOpen(): void }): JSX.Element {
  return (
    <li className="lab-rcard" data-status={study.status}>
      <button type="button" className="lab-rcard__btn" onClick={onOpen} data-testid={`lab-card-${study.id}`}>
        <span className="lab-rcard__meta">
          <span className="lab-pill" data-status={study.status}>{study.statusText}</span>
          <span className="lab-rcard__date">{study.date}</span>
          <span className="lab-rcard__tab">{TAB_LABEL[study.tab]} · {groupLabel(study)}</span>
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

  const moved = MOVED[hashId] ?? (paramTab === 'sector' ? MOVED['lab-sector-rotation'] : null)
  const groups = tab === 'overview' ? [] : groupedStudies(tab)
  const inTabCount = groups.reduce((n, g) => n + g.studies.length, 0)
  const latest = [...LAB_STUDIES].sort((a, b) => b.date.localeCompare(a.date))

  if (moved) return <Navigate to={moved} replace />

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
            {inTabCount > 1 ? (
              <nav className="lab-jump" aria-label="本页研究">
                {groups.map(g => (
                  <div key={g.id} className="lab-jump__group">
                    <span className="lab-jump__label">{g.label}</span>
                    {g.studies.map(s => (
                      <button key={s.id} type="button" className="lab-jump__btn" onClick={() => go(tab, s.id)}>
                        <span className="lab-pill" data-status={s.status}>{s.statusText}</span>
                        {s.title}
                      </button>
                    ))}
                  </div>
                ))}
              </nav>
            ) : null}
            {groups.map(g => {
              const headId = `lab-group-${tab}-${g.id}`
              return (
                <section key={g.id} className="lab-group" aria-labelledby={headId} data-testid={headId}>
                  <header className="lab-group__head">
                    <h2 id={headId} className="lab-group__title">
                      {g.label}
                      <span className="lab-group__count">{g.studies.length} 项</span>
                    </h2>
                    {g.note ? <p className="lab-group__note">{g.note}</p> : null}
                  </header>
                  {g.studies.map(({ id, Component }) => <Component key={id} />)}
                </section>
              )
            })}
          </>
        )}
      </div>

      <footer className="cs-footer" role="note">
        <p>
          每项研究先写预注册、再计算；通过门槛的移到「通过检验」页，也只进入影子跟踪，写入正式规则要另行检验。
          {' '}<Link to="/invest/strategy/spec">策略说明书</Link>{' · '}<Link to="/invest/factor-lab">因子实验室</Link>
        </p>
        <p>历史统计，不构成买卖建议。</p>
      </footer>
    </Page>
  )
}
