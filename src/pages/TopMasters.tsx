import React, { useMemo } from 'react'
import { Page } from '../components/ui'
import { buildCycleView } from '../features/macro-masters/cycleView'
import { useReadings } from '../features/macro-masters/readings'
import { TOP_MASTERS } from '../features/macro-masters/top'
import {
  ConsensusPanel,
  MasterSection,
  TopFooter,
  TopHeader,
  TopNav,
  sortTopMasters,
} from '../features/macro-masters/top/index'
import '../styles/macro-masters.css'
import '../styles/top-masters.css'

export default function TopMasters(): JSX.Element {
  const readings = useReadings()
  const masters = useMemo(() => sortTopMasters(TOP_MASTERS), [])
  const view = readings.state === 'ok' ? buildCycleView(readings.readings) : null
  const takes = view
    ? masters.flatMap(m => {
      const take = view.masters.find(item => item.slug === m.slug)
      return take ? [take] : []
    })
    : null

  return (
    <Page className="tm-page">
      <TopHeader />
      {masters.length > 0 && <TopNav masters={masters} />}
      <ConsensusPanel masters={masters} takes={takes} readings={readings} />
      {masters.map(master => (
        <MasterSection
          key={master.slug}
          master={master}
          take={takes?.find(t => t.slug === master.slug)}
          readings={readings}
        />
      ))}
      <TopFooter masters={masters} />
    </Page>
  )
}
