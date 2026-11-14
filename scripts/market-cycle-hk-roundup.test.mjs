import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parseRoundup, roundupCandidates, collectLatestRoundup, ROUNDUP_BASE } from './market-cycle-hk-roundup.mjs'

// Lines as pypdf extracts them from the real Hang Seng Monthly Roundups (page 1, PE tables on pages 6–7).
const pages = ({ asAt = 'As at 30 October', hsi = '13.04', tech = '25.43', extraTech = '' } = {}) => [
  `Highlights\n• ${asAt}, assets under management (‘AUM’) in products passively tracking indexes in the Hang Seng Family of Indexes`,
  `Change\nIndex Name 1-Month 3-Month 12-Month YTD\nHang Seng Index and its related indexes\nHang Seng Index -5.36% -10.01% -10.08% -9.11% ${hsi} 3.14%\nHang Seng Index - Finance -3.24% -5.00% 16.40% 9.48% 9.46 4.08%`,
  `Change\nIndex Name 1-Month 3-Month 12-Month YTD\nPE Ratio \n(Times)\nDividend \nYield\nHang Seng TECH Index and its related indexes\nHang Seng TECH Index -11.73% -22.25% -36.44% -31.93% ${tech} 1.23%\nHSTECH SCHK Index -12.02% -21.45% -36.88% -31.25% 25.00 1.39%\nHSTECH Short Index 12.78% 27.89% 51.06% 41.24% - -${extraTech}`,
]
const url = d => `${ROUNDUP_BASE}${d}.pdf`

test('real October 2026 roundup layout yields the official month-end HSI/HSTECH PE and report date', () => {
  assert.deepEqual(parseRoundup(pages(), url('20261102T000000')), { date: '2026-10-30', hsi: 13.04, hstech: 25.43, url: url('20261102T000000') })
})

test('loss-month negative PE is kept; a December report published in January belongs to the previous year', () => {
  const r = parseRoundup(pages({ asAt: 'As at 30 December', hsi: '15.47', tech: '-141.52' }), url('20220103T000000'))
  assert.deepEqual([r.date, r.hstech], ['2021-12-30', -141.52])
  assert.equal(parseRoundup(pages({ tech: '-1,234.56' }), url('20261102T000000')).hstech, -1234.56)
})

test('Biotech Monthly, missing/duplicated rows, empty PE, off-month dates and foreign URLs fail closed', () => {
  assert.throws(() => parseRoundup(['Hang Seng Biotech Monthly | October 2026 | Key Highlights'], url('20261103T000000')), /As at/)
  assert.throws(() => parseRoundup(pages({ extraTech: '\nHang Seng TECH Index -1.00% -1.00% -1.00% -1.00% 20.00 1.00%' }), url('20261102T000000')), /重复/)
  assert.throws(() => parseRoundup(pages({ tech: '-' }), url('20261102T000000')), /PE为空/)
  assert.throws(() => parseRoundup(pages({ asAt: 'As at 15 October' }), url('20261102T000000')), /最后7天/)
  // A report cannot describe the month it is published in or a later one.
  assert.throws(() => parseRoundup(pages({ asAt: 'As at 30 November' }), url('20261102T000000')), /发布时间/)
  assert.throws(() => parseRoundup(pages(), 'https://www.hsi.com.hk.evil.test/content/dam/wpb/hsil/en_hk/monthly_roundup/content/20261102T000000.pdf'), /白名单/)
  const noHeader = pages(); noHeader[2] = noHeader[2].replace('PE Ratio \n(Times)', '')
  assert.throws(() => parseRoundup(noHeader, url('20261102T000000')), /PE Ratio/)
})

test('candidates cover the first seven publication days, T000000 first, never after today', () => {
  const c = roundupCandidates('2026-11', '2026-11-03')
  assert.deepEqual(c.slice(0, 3), [url('20261101T000000'), url('20261102T000000'), url('20261103T000000')])
  assert.ok(c.includes(url('20261102T160000')))
  assert.ok(!c.some(u => u.includes('20261104')))
  assert.equal(roundupCandidates('2026-11', '2026-11-20').length, 7 * 6)
})

const pdf = () => Buffer.concat([Buffer.from('%PDF-1.7'), Buffer.alloc(2000)])
function ctxFor(existing, now = '2026-11-14T08:00:00.000Z') {
  const calls = []
  return { calls, now, parsePdf: async buf => buf.texts, get: async (u, opts) => {
    calls.push(u)
    assert.equal(opts.redirect, 'manual')
    if (!existing[u]) throw new Error('HTTP 302')
    return Object.assign(pdf(), { texts: existing[u] })
  } }
}

test('collector finds the next roundup after the newest held month and skips the Biotech Monthly', async () => {
  const ctx = ctxFor({ [url('20261102T000000')]: pages(), [url('20261103T000000')]: ['Hang Seng Biotech Monthly'] })
  const { rows } = await collectLatestRoundup(ctx, { latestDate: '2026-09-30' })
  assert.deepEqual(rows.map(r => [r.date, r.hstech]), [['2026-10-30', 25.43]])
  assert.equal(ctx.calls.indexOf(url('20261102T000000')), 1, 'stops at the first valid report')
})

test('before the next report is published the collector re-reads the cited roundup instead of failing', async () => {
  const ctx = ctxFor({ [url('20261102T000000')]: pages() })
  const { rows } = await collectLatestRoundup(ctx, { latestDate: '2026-10-30', knownUrl: url('20261102T000000') })
  assert.deepEqual(rows.map(r => r.date), ['2026-10-30'])
  assert.deepEqual(ctx.calls, [url('20261102T000000')])
  const none = await collectLatestRoundup(ctxFor({}), { latestDate: '2026-09-30' })
  assert.deepEqual(none.rows, [])
})

test('PDF text helper refuses non-PDF input before importing pypdf', () => {
  const script = fileURLToPath(new URL('./market-cycle-pdf-text.py', import.meta.url))
  const r = spawnSync('python3', ['-I', script], { input: Buffer.from('<html>404</html>') })
  assert.equal(r.status, 2)
  assert.match(String(r.stderr), /not a pdf/)
})
