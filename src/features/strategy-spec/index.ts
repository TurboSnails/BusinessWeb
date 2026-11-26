import { SPEC_V1_0_0 } from './specs/v1.0.0'
import { SPEC_V1_0_1 } from './specs/v1.0.1'
import { SPEC_V1_0_2 } from './specs/v1.0.2'
import { SPEC_V1_0_3 } from './specs/v1.0.3'
import { SPEC_V1_0_4 } from './specs/v1.0.4'
import { SPEC_V1_0_5 } from './specs/v1.0.5'
import { SPEC_V1_0_6 } from './specs/v1.0.6'
import { SPEC_V1_0_7 } from './specs/v1.0.7'
import { SPEC_V1_1_0 } from './specs/v1.1.0'
import { SPEC_V1_2_0 } from './specs/v1.2.0'
import { SPEC_V1_2_1 } from './specs/v1.2.1'
import type { StrategySpec } from './types'

/**
 * 全部版本，新版本在前。升级时：新建 specs/vX.Y.Z.ts，把上一版 status 改为 archived，
 * 在这里加到最前面；章节 id 尽量沿用，便于逐章对比。
 */
export const STRATEGY_SPECS: StrategySpec[] = [SPEC_V1_2_1, SPEC_V1_2_0, SPEC_V1_1_0, SPEC_V1_0_7, SPEC_V1_0_6, SPEC_V1_0_5, SPEC_V1_0_4, SPEC_V1_0_3, SPEC_V1_0_2, SPEC_V1_0_1, SPEC_V1_0_0]

export function currentSpec(specs: StrategySpec[] = STRATEGY_SPECS): StrategySpec {
  return specs.find(spec => spec.status === 'current') ?? specs[0]
}

export function findSpec(version: string | null | undefined, specs: StrategySpec[] = STRATEGY_SPECS): StrategySpec | null {
  if (!version) return null
  return specs.find(spec => spec.version === version.replace(/^v/i, '')) ?? null
}
