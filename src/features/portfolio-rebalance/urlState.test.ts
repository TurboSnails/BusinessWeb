import { describe, expect, it } from 'vitest'
import { createDefaultInput, decode, encode } from './urlState'
import type { RunInput } from './types'

const known = ['AVGO', 'META', 'CB', 'SOFI', 'RKLB', 'QQQ', 'QQEW', 'BRK-B', 'AAPL']

describe('组合回测网址参数', () => {
  it('往返一致', () => {
    const input = createDefaultInput()
    expect(decode(encode(input), known)).toEqual({ input, invalid: false })
  })

  it('完整恢复大跌切换与日历规则', () => {
    const input: RunInput = {
      ...createDefaultInput(),
      rule: { kind: 'calendar', every: 'quarter' },
      switch: { stable: 'CB', entry: 0.2, gap: 0.05, step: 0.25, recover: 0.05, cap: 0.5, timeoutMonths: 18 },
      start: '2022-01-03',
      end: '2026-11-20',
    }
    expect(decode(encode(input), known)).toEqual({ input, invalid: false })
  })

  it('未知代码或非数字回退默认并标 invalid', () => {
    for (const query of ['s=AVGO:25,NOPE:75', 's=AVGO:abc,META:75', 'cost=-1', 'cost=abc', 'rule=relative:nope']) {
      const decoded = decode(new URLSearchParams(query), known)
      expect(decoded.input).toEqual(createDefaultInput())
      expect(decoded.invalid).toBe(true)
    }
  })

  it('空网址使用默认方案，非法权重与重复代码回退', () => {
    expect(decode(new URLSearchParams(), known)).toEqual({ input: createDefaultInput(), invalid: false })
    for (const query of ['s=AVGO:50,META:40', 's=AVGO:50,AVGO:50', 's=AVGO:100', 'sw=QQQ:20:5:25:5']) {
      expect(decode(new URLSearchParams(query), known).invalid).toBe(true)
    }
  })

  it('带连字符代码 BRK-B 可解析', () => {
    const decoded = decode(new URLSearchParams('s=BRK-B:50,AAPL:50'), known)
    expect(decoded.invalid).toBe(false)
    expect(decoded.input.symbols).toEqual(['BRK-B', 'AAPL'])
    expect(decoded.input.weights).toEqual([0.5, 0.5])
  })
})
