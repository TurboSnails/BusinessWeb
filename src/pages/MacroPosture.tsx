import React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Page, Segmented } from '../components/ui'
import LegacyMarketView from '../features/macro-posture/composite/LegacyMarketView'
import UsCompositeView from '../features/macro-posture/composite/UsCompositeView'
import { useCompositePosture } from '../features/macro-posture/composite/load'
import { useMacroPostureData } from '../features/macro-posture/data'
import { buildMacroView, POSTURE_RULE_VERSION } from '../features/macro-posture/model'
import type { Market } from '../features/macro-posture/types'
import '../styles/macro-posture.css'

export const MACRO_POSTURE_LEAD =
  '参考九位宏观投资人的公开方法提炼的可回测综合指标。规则先验设定并公开回测，描述风险状态与仓位档位，不构成买卖建议。'

/** A股 / 港股仍用观察版导语 */
export const MACRO_POSTURE_LEAD_LEGACY =
  '按公开宏观读数归纳当前经济周期与股票攻守位置。四个子指数是本站口径，仅作观察、未经回测，不构成买卖建议。'

export const MACRO_POSTURE_FOOTER =
  '参考九位宏观投资人的公开方法，提炼成可回测的规则；九位中只有一位给过可机械执行的规则，其余为本站按其方法选取的指标。综合指标规则公开、可回测；A 股与港股仍为观察版。读数来自公开数据源。不构成买卖建议。'

const MARKETS: Array<{ id: Market; label: string }> = [
  { id: 'us', label: '美国' },
  { id: 'cn', label: 'A股' },
  { id: 'hk', label: '港股' },
]

function parseMarket(raw: string | null): Market {
  return raw === 'cn' || raw === 'hk' || raw === 'us' ? raw : 'us'
}

export default function MacroPosture(): JSX.Element {
  const [params, setParams] = useSearchParams()
  const market = parseMarket(params.get('market'))
  const composite = useCompositePosture()
  const legacy = useMacroPostureData()

  const setMarket = (next: Market): void => {
    setParams(prev => {
      const copy = new URLSearchParams(prev)
      copy.set('market', next)
      return copy
    }, { replace: true })
  }

  const legacyView = market !== 'us' && legacy.status === 'ready'
    ? buildMacroView(market, legacy.data[market])
    : null
  const asOf = market === 'us'
    ? (composite.status === 'ready' ? composite.data.current.asOf : null)
    : (legacyView?.asOf ?? (legacy.status === 'ready' ? legacy.data[market].asOf : null))

  return (
    <Page className="mp-page">
      <header className="page-head mp-head">
        <h1>宏观攻守</h1>
        <p className="mp-head__lead" data-testid="mp-head-lead">
          {market === 'us' ? MACRO_POSTURE_LEAD : MACRO_POSTURE_LEAD_LEGACY}
        </p>
        <ul className="mp-head__links">
          <li><Link to="/monitor">宏观温度</Link></li>
          <li><Link to="/invest/macro-masters">宏观大师</Link></li>
          {market !== 'us' ? (
            <li><a href="#macro-posture-candidates">回测备选</a></li>
          ) : (
            <li><a href="#mp-backtest">公开回测</a></li>
          )}
        </ul>
      </header>

      <div className="mp-toolbar">
        <Segmented
          label="市场"
          items={MARKETS}
          value={market}
          onChange={setMarket}
        />
        {asOf ? <p className="mp-asof">最新指标观测日 {asOf}</p> : null}
      </div>

      {market === 'us' ? (
        <UsCompositeView state={composite} />
      ) : (
        <LegacyMarketView
          market={market}
          view={legacyView}
          status={legacy.status === 'ready' ? 'ready' : legacy.status}
        />
      )}

      <footer className="mp-footer" role="note">
        <p>{market === 'us' && composite.status === 'ready'
          ? `规则版本 ${composite.data.ruleVersion}`
          : POSTURE_RULE_VERSION}
        </p>
        <p>{MACRO_POSTURE_FOOTER}</p>
      </footer>
    </Page>
  )
}
