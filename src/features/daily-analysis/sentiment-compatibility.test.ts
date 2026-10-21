import { describe, expect, it } from 'vitest'
import { buildDailyAnalysis } from '../../../server/daily-analysis.mjs'
// @ts-expect-error Raw network fixture is intentionally shared with node:test.
import { fixtureFetch } from '../../../scripts/fixtures/market-sentiment.mjs'
import { snapshotSchema } from './data'
import { dailySnapshot } from './fixtures'

describe('optional sentiment preserves existing snapshot validation', () => {
  it('accepts old snapshots with no sentiment', () => {
    expect(snapshotSchema.safeParse(dailySnapshot()).success).toBe(true)
  })
  it('accepts a complete backend fixture without expanding the seven legacy sources', async () => {
    const snapshot = await buildDailyAnalysis({ fetchImpl: fixtureFetch(), now: new Date('2026-10-21T08:00:00Z'), history: [] })
    expect(snapshot.sentiment?.breadth.status).toBe('ready')
    expect(snapshot.sentiment?.sources.length).toBeGreaterThan(0)
    expect(snapshotSchema.safeParse(snapshot).success).toBe(true)
  })
})
