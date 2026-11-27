import React, { useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Page } from '../components/ui'
import { PageTabs } from '../components/ui/PageTabs'
import TrioNav from '../features/combined-strategy/TrioNav'
import DailyRecheck from '../features/strategy-lab/DailyRecheck'
import DefensiveTiltStudy from '../features/strategy-lab/DefensiveTiltStudy'
import SectorRotationStudy from '../features/strategy-lab/SectorRotationStudy'
import '../styles/combined-strategy.css'
import '../styles/strategy-spec.css'
import '../styles/strategy-lab.css'
import '../styles/strategy-lab-tabs.css'

export const VERIFIED_LEAD =
  '预注册检验通过的策略放在这里。通过检验不等于写进仓位规则：下面每一项都没有加入综合策略，理由逐条写在各页签开头；目前都在做影子记录，期满后再决定。文中「L-0xx」是本站研究登记簿的编号，同一编号在说明书、研究中、通过检验三页指同一次检验。'

export type VerifiedTab = 'sector' | 'tilt'

interface VerifiedItem {
  id: VerifiedTab
  label: string
  /** 研究页原来的锚点，用于旧链接跳转 */
  anchor: string
  Component: () => JSX.Element
  reasons: string[]
  shadow: string
}

export const VERIFIED: VerifiedItem[] = [
  {
    id: 'sector',
    label: '板块轮动',
    anchor: 'lab-sector-rotation',
    Component: SectorRotationStudy,
    reasons: [
      '2011 年以后按夏普已经跑不赢大盘：年化只多约 0.8 个百分点，但波动更大；用真实板块 ETF，同期比 SPY 年化还少约 1 个百分点。',
      '证据不独立：板块数据和以前的 49 行业动量研究（L-012）是同一批股票，2000 年以后的结果当时已经看过，真正没见过的只有接下来的影子记录。',
      '成本敏感、国内难以照做：每年换手约 2.7–3 倍，交易成本提到 0.3% 时 2000 年以后的超额归零；QDII 能买到的美股板块产品不全，申赎费、溢价和额度会吃掉大部分超额。',
      '综合策略只决定美股放多少，板块轮动是决定买什么；要加进去，得先另行预注册它和宏观攻守叠加后的效果，再由你决定。',
    ],
    shadow: '2026-12 至 2027-11，9 只板块 SPDR 每月记录入选与收益，2027-12 复盘。',
  },
  {
    id: 'tilt',
    label: '防守倾斜',
    anchor: 'lab-defensive-tilt',
    Component: DefensiveTiltStudy,
    reasons: [
      '同等波动下大跌时并没有少跌（合并跌幅比约 1.00），好处只是效率：波动低一点、夏普高一点，更像「更聪明地把上限调低一点」。',
      '2012 年以后优势基本消失；1997–2000 年曾连续三年落后大盘约 15%，坚持起来很难。',
      '研究用的是行业组合，还没验证可交易 ETF 能不能跟上研究口径，所以先做 ETF 影子记录。',
    ],
    shadow: '2026-12 至 2027-11，XLP、XLV、XLU 等权与 USMV 各占股票部分 30%，只看执行与研究口径是否一致，2027-12 复盘。',
  },
]

const isTab = (v: string | null): v is VerifiedTab => VERIFIED.some(x => x.id === v)

export default function VerifiedStrategies(): JSX.Element {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const paramTab = params.get('tab')
  const tab: VerifiedTab = isTab(paramTab) ? paramTab : 'sector'
  const item = VERIFIED.find(x => x.id === tab) ?? VERIFIED[0]

  useEffect(() => {
    window.scrollTo?.({ top: 0 })
  }, [tab])

  return (
    <Page className="cs-page ss-page lab-page">
      <header className="page-head cs-head">
        <h1>通过检验</h1>
        <p className="cs-head__lead" data-testid="verified-lead">{VERIFIED_LEAD}</p>
        <TrioNav />
      </header>

      <PageTabs<VerifiedTab>
        label="通过检验的策略"
        value={tab}
        onChange={next => navigate({ search: next === 'sector' ? '' : `?tab=${next}` }, { replace: true })}
        items={VERIFIED.map(x => ({ id: x.id, label: x.label }))}
      />

      <div className="ss-body lab-panel" role="tabpanel" aria-label={item.label} data-testid={`verified-panel-${tab}`}>
        <section className="ss-section lab-study" aria-labelledby="verified-why-title" data-testid="verified-why">
          <h2 id="verified-why-title">为什么没有加入综合策略</h2>
          <ul className="ss-list">
            {item.reasons.map(r => <li key={r}>{r}</li>)}
          </ul>
          <p className="ss-p"><strong>影子记录：</strong>{item.shadow}现行仓位仍只按宏观攻守的档位定，股票部分仍买宽基。</p>
        </section>
        <DailyRecheck tab={item.id} />
        <item.Component />
      </div>

      <footer className="cs-footer" role="note">
        <p>
          每项都先写预注册、再计算，并有独立第二实现核对；没通过或结论不确定的研究见 <Link to="/invest/strategy-lab">研究中</Link>，现行规则见 <Link to="/invest/strategy/spec">策略说明书</Link>；多市场因子挖掘见 <Link to="/invest/factor-lab">因子实验室</Link>。
        </p>
        <p>历史统计，不构成买卖建议。</p>
      </footer>
    </Page>
  )
}
