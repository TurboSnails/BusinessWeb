import { fetchPlanBars } from './bars'
import { bullLookup } from './kd10-signals'
import { cybPlan, hsPlan, macdPlan, type PlanBar, type PlanResult } from './plan-trades'
import { H1_CODES, R2_CODES, styleRatio } from './ratio'

export type PlanBundleBase = {
  source: string
  bars: PlanBar[]
  plans: PlanResult[]
  /** 创业板 / 沪深300 择时比值的牛熊查询，回测复用 */
  bullR2: (date: string) => boolean | undefined
  bullH1: (date: string) => boolean | undefined
}

/** 拉目标 ETF 与两组择时比值的腾讯后复权日线，算出三方案信号（三方案页与择时页共用）。 */
export async function loadPlanBundle(code: string): Promise<PlanBundleBase> {
  const [target, cyb, div, hs300] = await Promise.all([
    fetchPlanBars(code), fetchPlanBars(R2_CODES.growth), fetchPlanBars(R2_CODES.defensive), fetchPlanBars(H1_CODES.growth),
  ])
  const r2 = styleRatio(cyb.bars, div.bars)
  const h1 = styleRatio(hs300.bars, div.bars)
  return {
    source: target.source, bars: target.bars,
    plans: [cybPlan(target.bars, r2), hsPlan(target.bars, h1), macdPlan(target.bars)],
    bullR2: bullLookup(r2), bullH1: bullLookup(h1),
  }
}
