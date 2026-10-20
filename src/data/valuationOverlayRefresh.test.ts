import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseDetails } from './detailParser'

const read = (path: string) => JSON.parse(readFileSync(path, 'utf8'))
const snapshot = read('src/data/companyMarketSnapshot.json')
const withoutNotes = (text: string) => text.split('\n').filter(line => !line.startsWith('x:')).join('\n')

for (const market of ['hk', 'adr'] as const) {
  describe(`${market} unattended valuation refresh`, () => {
    it('is deterministic, freezes earnings and rerates changed prices with per-company dates', () => {
      const temp = mkdtempSync(join(tmpdir(), `${market}-valuation-`))
      const snapshotPath = join(temp, 'snapshot.json')
      const out = join(temp, 'output')
      const run = (input: typeof snapshot) => {
        writeFileSync(snapshotPath, JSON.stringify(input))
        execFileSync('python3', [`scripts/review-${market}-valuation-2026-10-20.py`], {
          env: { ...process.env, SNAPSHOT_PATH: snapshotPath, OUT_DIR: out },
        })
        const files = Object.fromEntries(readdirSync(out).sort().map(file => [file, readFileSync(join(out, file), 'utf8')]))
        const audit = JSON.parse(files[market === 'hk' ? 'audit.json' : 'valuation.json'])
        return { files, audit, details: parseDetails(files[`${market}Valuation.ts`]) }
      }
      try {
        const baseline = run(snapshot)
        expect(run(snapshot).files).toEqual(baseline.files)
        // Publishing to OUT_DIR redirects the TS file too; these runs never touch repository outputs.
        expect(withoutNotes(baseline.files[`${market}Valuation.ts`])).toBe(
          withoutNotes(readFileSync(`src/data/details/${market}Valuation.ts`, 'utf8')),
        )
        expect(baseline.audit.version).toBe('2026-10-20')
        expect(baseline.audit).not.toHaveProperty('date')
        const up = `${market}:${market === 'hk' ? '00300' : 'NVO'}`
        const down = `${market}:${market === 'hk' ? '00016' : 'NVS'}`
        const modified = structuredClone(snapshot)
        modified[up] = { ...modified[up], price: snapshot[up].price * 1.3, date: '2026-11-20', trailingPE: 999, forwardPE: 999 }
        modified[down] = { ...modified[down], price: snapshot[down].price * 0.7, date: '2026-10-01' }
        const changed = run(modified)
        expect(changed.audit.priceDate).toBe('2026-10-01～2026-11-20')
        expect(baseline.details[up].rating).toBe('条件关注')
        expect(changed.details[up].rating).toBe('观察')
        expect(baseline.details[down].rating).toBe('观察')
        expect(changed.details[down].rating).toBe('条件关注')
        for (const key of Object.keys(baseline.details)) {
          const company = changed.details[key]
          if (key !== up && key !== down) {
            expect(company, key).toEqual(baseline.details[key])
            const code = key.split(':')[1]
            if (market === 'hk') expect(changed.files[`${code}.md`]).toBe(baseline.files[`${code}.md`])
            continue
          }
          expect(company.ratioNote, key).not.toBe(baseline.details[key].ratioNote)
          const notes = company.pitfalls!.join('\n')
          expect(notes).toContain('盈利输入冻结于 2026-10-20')
          expect(notes).toContain(`价格日期与盈利输入冻结日相差 ${key === up ? 31 : 19} 天`)
          expect(notes).toContain(modified[key].date)
          const baseRow = baseline.audit.companies.find((r: { code: string }) => r.code === key.split(':')[1])
          const row = changed.audit.companies.find((r: { code: string }) => r.code === key.split(':')[1])
          expect(row.priceDate).toBe(modified[key].date)
          expect(row.ratio).not.toBe(baseRow.ratio)
          if (market === 'hk') {
            expect(row.scenarios.map((s: { price: number }) => s.price)).toEqual(baseRow.scenarios.map((s: { price: number }) => s.price))
            expect(changed.files[`${row.code}.md`]).toContain(modified[key].date)
          } else {
            expect(row.model).toEqual(baseRow.model)
            expect(row.epsTTM).toBe(baseRow.epsTTM)
            expect(row.epsForward).toBe(baseRow.epsForward)
          }
        }
        expect(run(modified).files).toEqual(changed.files)

        // Exactly 14 days is allowed silently; the next day is diagnosed without aborting.
        for (const [date, warning] of [['2026-11-03', false], ['2026-11-04', true]] as const) {
          const dated = structuredClone(snapshot)
          dated[up].date = date
          const result = run(dated)
          expect(result.details[up].rating).toBe(baseline.details[up].rating)
          expect(result.details[up].ratioNote).toBe(baseline.details[up].ratioNote)
          expect(result.details[up].pitfalls!.join('\n').includes('价格日期与盈利输入冻结日相差')).toBe(warning)
        }

        // A missing quote must use the original vendor/model path and explain the fallback.
        const missing = structuredClone(snapshot)
        delete missing[up]
        const fallback = run(missing)
        expect(fallback.details[up].pitfalls!.join('\n')).toContain('快照缺失')
        expect(fallback.audit.companies.find((r: { code: string }) => r.code === up.split(':')[1]).price).toBeGreaterThan(0)

        // Dividend models remain available when market price diverges from the frozen yield quote.
        if (market === 'hk') {
          const dividend = structuredClone(snapshot)
          dividend['hk:02601'].price *= 0.7
          const refreshed = run(dividend)
          const before = baseline.audit.companies.find((r: { code: string }) => r.code === '02601')
          const after = refreshed.audit.companies.find((r: { code: string }) => r.code === '02601')
          expect(after.scenarios).toHaveLength(3)
          expect(after.scenarios.map((s: { price: number }) => s.price)).toEqual(before.scenarios.map((s: { price: number }) => s.price))
          expect(after.rating).toBe('观察') // price below Bear: existing anomaly cap still applies
        }
      } finally {
        rmSync(temp, { recursive: true, force: true })
      }
    }, 30_000)
  })
}
