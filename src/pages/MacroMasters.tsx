import React from 'react'
import { Link } from 'react-router-dom'
import { Page } from '../components/ui'
import { buildCycleView } from '../features/macro-masters/cycleView'
import OverviewCompare from '../features/macro-masters/OverviewCompare'
import OverviewDimensions from '../features/macro-masters/OverviewDimensions'
import { OverviewJumpProvider } from '../features/macro-masters/OverviewJump'
import OverviewMasters from '../features/macro-masters/OverviewMasters'
import OverviewNav from '../features/macro-masters/OverviewNav'
import OverviewNow from '../features/macro-masters/OverviewNow'
import { useReadings } from '../features/macro-masters/readings'
import '../styles/macro-masters.css'

export const MACRO_MASTERS_FOOTER =
  '整理自公开访谈、演讲与书信，原话注明出处；各人观点会变，读数只是本站数据的映射，不代表他们本人的判断，也不构成买卖建议。'

export const MACRO_MASTERS_LEAD =
  '先看本站按公开数据归纳的当前位置，再对照九位宏观投资人各自的方法。不打总分；攻守判断是本站口径，未经回测证实，不构成买卖建议。'

export default function MacroMasters(): JSX.Element {
  const readings = useReadings()
  const loading = readings.state === 'loading'
  const errored = readings.state === 'error'
  const map = readings.state === 'ok' ? readings.readings : {}
  const failedSources = readings.state === 'ok' && Array.isArray(readings.failedSources)
    ? readings.failedSources
    : []
  const view = readings.state === 'ok' ? buildCycleView(map) : null

  return (
    <Page className="mm-overview">
      <header className="page-head mm-overview__head">
        <h1>宏观大师怎么看周期</h1>
        <p>{MACRO_MASTERS_LEAD}</p>
        <p><Link to="/invest/macro-posture">查看宏观攻守与备选指标</Link></p>
      </header>

      <OverviewJumpProvider>
        <OverviewNav />

        {loading && (
          <p className="mm-overview__status" role="status">读数加载中，当前位置稍后给出。</p>
        )}
        {errored && (
          <p className="mm-overview__error" role="alert">
            读数加载失败（{readings.message}）。本站暂不出当前位置结论，下方仍可看各位的方法与可靠性。
          </p>
        )}
        {view && <OverviewNow view={view} />}
        {view && failedSources.length > 0 && (
          <p className="mm-overview__partial" role="status">
            部分数据来源暂时不可用（{failedSources.join('、')}），相关维度按缺数据处理。
          </p>
        )}
        {view && <OverviewDimensions dimensions={view.dimensions} />}

        <OverviewMasters takes={view?.masters} staticOnly={!view} />

        <OverviewCompare
          map={map}
          loading={loading}
          failedSources={failedSources}
          dimensions={view?.dimensions}
        />
      </OverviewJumpProvider>

      <footer className="mm-overview__footer" role="note">
        <p>{MACRO_MASTERS_FOOTER}</p>
      </footer>
    </Page>
  )
}
