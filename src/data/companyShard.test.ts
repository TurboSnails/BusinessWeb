import { describe, expect, it } from 'vitest'
import { parseCompanyShardPayload } from './companyShard'

describe('parseCompanyShardPayload', () => {
  const base = {
    market: 'cn' as const,
    code: '600519',
    company: { code: '600519', name: '贵州茅台' },
    valuationDoc: null,
    lynch: null,
  }

  it('接受字段齐全的分片', () => {
    expect(parseCompanyShardPayload(base, 'cn', '600519')).toEqual(base)
  })

  it('拒绝 HTML 壳或字段残缺（模拟 SPA 回退）', () => {
    expect(parseCompanyShardPayload('<!doctype html>', 'cn', '600519')).toBeNull()
    expect(parseCompanyShardPayload({ market: 'cn', code: '600519' }, 'cn', '600519')).toBeNull()
    expect(parseCompanyShardPayload({ ...base, market: 'us' }, 'cn', '600519')).toBeNull()
    expect(parseCompanyShardPayload({ ...base, code: '000001' }, 'cn', '600519')).toBeNull()
  })
})
