import React, { useEffect, useState } from 'react'
import { loadPlanBundle, type PlanBundleBase } from './load-plans'
import { PlanPriceChart } from './PlanPriceChart'

type State = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; bundle: PlanBundleBase }

/** 按代码现场拉日线并画价格—信号图（择时页内嵌用；三方案页自己已有数据，直接用 PlanPriceChart）。 */
export function PlanChartLoader({ code, name }: { code: string; name: string }): JSX.Element {
  const [load, setLoad] = useState<State>({ state: 'loading' })
  useEffect(() => {
    let live = true
    setLoad({ state: 'loading' })
    loadPlanBundle(code)
      .then(bundle => { if (live) setLoad({ state: 'ok', bundle }) })
      .catch((e: unknown) => { if (live) setLoad({ state: 'error', message: e instanceof Error ? e.message : '加载失败' }) })
    return () => { live = false }
  }, [code])
  if (load.state === 'loading') return <p role="status" className="et-lead">正在拉取 {name}（{code}）日线…</p>
  if (load.state === 'error') return <p role="alert" className="et-lead">{name}（{code}）的行情暂时拉不到：{load.message}。可稍后重试，或到三方案回测页查看。</p>
  return (
    <>
      <PlanPriceChart bars={load.bundle.bars} plans={load.bundle.plans} name={name} />
      <p className="et-lead">行情：{load.bundle.source}。想看回测统计与逐年明细，<a href={`/lab/etf-signal-plans?code=${code}&name=${encodeURIComponent(name)}`}>到三方案回测页</a>。</p>
    </>
  )
}
