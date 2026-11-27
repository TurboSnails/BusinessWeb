import { describe, expect, it } from 'vitest'
import { executableInstruction, resolveExecutable, TIER_EQUITY_SHARE } from './labels'
import { TIERS } from '../../../scripts/lib/macro-posture/model.mjs'

const base = {
  instruction: '股票仓位保持在你上限的 85%，本月不用调。',
  equityShare: 0.85 as number | null,
  cap: 80,
}

describe('resolveExecutable', () => {
  it('情况 1：档位未变 → 绝对仓位 + 本月不用调', () => {
    const r = resolveExecutable({
      ...base,
      macroTier: 'lean-offense',
      official: { tier: 'lean-offense', previousTier: 'lean-offense' },
    })
    expect(r.kind).toBe('hold')
    expect(r.text).toBe('美股股票仓位约 68%（你的上限 80% × 当前档位 85%），本月不用调。')
    expect(r.holdShare).toBe(0.85)
    expect(r.pendingImplied).toBeNull()
  })

  it('情况 2：本月换档 → 调到 + 上月绝对值', () => {
    const r = resolveExecutable({
      instruction: '股票仓位调到你上限的 85%（上月是 70%），本月内完成。',
      macroTier: 'lean-offense',
      equityShare: 0.85,
      official: { tier: 'lean-offense', previousTier: 'neutral' },
      cap: 80,
    })
    expect(r.kind).toBe('adjust')
    expect(r.text).toBe('本月内把美股股票仓位调到约 68%（上限 80% × 新档位 85%），上月约 56%。')
    expect(r.holdShare).toBe(0.85)
    expect(r.holdShareLabel).toBe('新档位')
  })

  it('情况 3：读数≠官方 → 先按官方档持有，注明可能变为读数档', () => {
    const r = resolveExecutable({
      instruction: '股票仓位先保持在你上限的 70%；按目前数据，月底可能变为 85%，等月底定档再调。',
      macroTier: 'lean-offense',
      equityShare: 0.85,
      official: { tier: 'neutral', previousTier: 'neutral' },
      cap: 80,
    })
    expect(r.kind).toBe('provisional')
    expect(r.text).toBe(
      '美股股票仓位先保持约 56%（上限 80% × 官方档位 70%）；按目前数据，月底可能变为约 68%，等月底定档再调。',
    )
    expect(r.holdShare).toBe(0.7)
    expect(r.holdShareLabel).toBe('官方档位')
    expect(r.pendingImplied).toBe(68)
  })

  it('缺档位 / 缺比例 → 回退原 instruction', () => {
    expect(
      resolveExecutable({
        instruction: '宏观攻守读数暂缺，暂不给出仓位。',
        macroTier: null,
        equityShare: null,
        official: null,
        cap: 80,
      }).text,
    ).toBe('宏观攻守读数暂缺，暂不给出仓位。')
  })

  it('改上限后绝对值跟着变', () => {
    const opts = {
      ...base,
      macroTier: 'lean-offense' as const,
      official: { tier: 'lean-offense' as const, previousTier: 'lean-offense' as const },
    }
    expect(executableInstruction({ ...opts, cap: 80 })).toContain('约 68%')
    expect(executableInstruction({ ...opts, cap: 100 })).toContain('约 85%')
    expect(executableInstruction({ ...opts, cap: 100 })).toContain('你的上限 100%')

    const provisional = {
      instruction: base.instruction,
      macroTier: 'lean-offense' as const,
      equityShare: 0.85,
      official: { tier: 'neutral' as const, previousTier: 'neutral' as const },
      cap: 100,
    }
    const r = resolveExecutable(provisional)
    expect(r.text).toContain('先保持约 70%')
    expect(r.text).toContain('变为约 85%')
    expect(r.pendingImplied).toBe(85)
  })
})

describe('TIER_EQUITY_SHARE', () => {
  it('与脚本侧档位表一致（防止两份比例漂移）', () => {
    const fromScripts = Object.fromEntries(
      (TIERS as Array<{ id: string; equityShare: number }>).map(t => [t.id, t.equityShare]),
    )
    expect(TIER_EQUITY_SHARE).toEqual(fromScripts)
  })
})
