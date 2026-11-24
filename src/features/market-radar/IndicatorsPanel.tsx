import React from 'react'
import IndicatorTable from './IndicatorTable'
import { useRadarView } from './useRadarView'
import type { RadarFile } from './types'

/** @deprecated 由 RadarView 直接编排；保留给旧导入路径 */
export default function IndicatorsPanel({ data }: { data: RadarFile }): JSX.Element {
  const view = useRadarView(data.indicators)
  return <IndicatorTable allIndicators={data.indicators} view={view} />
}
