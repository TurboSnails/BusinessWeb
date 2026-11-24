import { SPEC_V1_0_0 } from './specs/v1.0.0'
import type { StrategySpec } from './types'

/**
 * 全部版本，新版本在前。升级时：新建 specs/vX.Y.Z.ts，把上一版 status 改为 archived，
 * 在这里加到最前面；章节 id 尽量沿用，便于逐章对比。
 */
export const STRATEGY_SPECS: StrategySpec[] = [SPEC_V1_0_0]

export function currentSpec(specs: StrategySpec[] = STRATEGY_SPECS): StrategySpec {
  return specs.find(spec => spec.status === 'current') ?? specs[0]
}

export function findSpec(version: string | null | undefined, specs: StrategySpec[] = STRATEGY_SPECS): StrategySpec | null {
  if (!version) return null
  return specs.find(spec => spec.version === version.replace(/^v/i, '')) ?? null
}
