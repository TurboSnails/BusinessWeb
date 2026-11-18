import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { asJixingTable } from './model'

describe('live jixing-table.json', () => {
  it('passes runtime validator and PB industry rows have status', () => {
    const body = JSON.parse(readFileSync(resolve(__dirname, '../../../public/data/jixing-table.json'), 'utf8'))
    const parsed = asJixingTable(body)
    expect(parsed).not.toBeNull()
    expect(parsed!.rows).toHaveLength(44)
    const pb = parsed!.rows.filter(r => r.basis === 'pb')
    expect(pb).toHaveLength(5)
    expect(pb.every(r => r.status !== null && r.pbKind === 'industry' && (r.pbHistory.count ?? 0) >= 250)).toBe(true)
    expect(parsed!.rows.every(r => r.peSeries.length === 0)).toBe(true)
  })
})
