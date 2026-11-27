import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recordDay } from './crypto-forward-record.mjs';

const DAY = 86_400_000;
const clockAt = (day) => () => new Date(`${day}T01:30:00.000Z`);

function candle(day, close, volume = 2) {
  return { timestamp: String(Date.parse(day) / 1000), open: String(close + 1),
    close: String(close), volume: String(volume) };
}

function makeFetch(candles, readings) {
  return async (url) => {
    if (new URL(url).hostname === 'www.bitstamp.net') {
      return Response.json({ data: { ohlc: candles } });
    }
    return Response.json({ data: readings.map(([date, mvrv]) => ({
      asset: 'btc', time: `${date}T00:00:00.000000000Z`, CapMVRVCur: mvrv, PriceUSD: '123',
    })) });
  };
}

const warmup = Array.from({ length: 200 }, (_, i) =>
  candle(new Date(Date.parse('2026-11-30') - (200 - i) * DAY).toISOString().slice(0, 10), 100));

async function useLedger(t) {
  const directory = await mkdtemp(join(tmpdir(), 'l039-forward-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return join(directory, 'l039.jsonl');
}

async function ledgerRows(path) {
  const utf8 = await readFile(path, 'utf8');
  const lines = utf8.trimEnd().split('\n');
  return { utf8, lines, rows: lines.map((line) => JSON.parse(line)) };
}

test('records only inside the window, then appends once per day with exact-byte hash links', async (t) => {
  const path = await useLedger(t);
  const unexpectedFetch = async () => assert.fail('No request expected');
  assert.equal(await recordDay({ path, clock: clockAt('2026-11-30'), fetchImpl: unexpectedFetch }),
    'outside-window');
  await assert.rejects(readFile(path), { code: 'ENOENT' });
  assert.equal(await recordDay({ path, clock: clockAt('2029-12-02'), fetchImpl: unexpectedFetch }),
    'outside-window');

  assert.equal(await recordDay({ path, clock: () => new Date('2026-12-01T01:29:59Z'),
    fetchImpl: unexpectedFetch }), 'before-scheduled-time');
  await assert.rejects(readFile(path), { code: 'ENOENT' });

  const first = makeFetch([...warmup, candle('2026-11-30', 80), candle('2026-12-01', 95)],
    [['2026-11-29', '0.99']]);
  assert.equal(await recordDay({ path, clock: clockAt('2026-12-01'), fetchImpl: first }), 'recorded');
  const { utf8: before, rows: [row] } = await ledgerRows(path);
  assert.equal(row.previousSha256, null);
  assert.equal(row.marketDate, '2026-11-30');
  assert.equal(row.effectiveDate, '2026-12-02');
  assert.equal(row.close, 80);
  assert.equal(row.openingUsd, 96);
  assert.equal(row.ma200, 99.9);
  assert.equal(row.k1Signal, 'cash');
  assert.equal(row.k1OnTime, true);
  assert.equal(row.warmupCandles.length, 200);
  assert.equal(row.mvrv, 0.99);
  assert.equal(row.mvrvDate, '2026-11-29');
  assert.equal(row.k2Report.target, 0);
  assert.equal(row.k2Report.mvrv, null);
  assert.equal(row.sources.bitstamp.readAt, '2026-12-01T01:30:00.000Z');

  assert.equal(await recordDay({ path, clock: clockAt('2026-12-01'), fetchImpl: unexpectedFetch }),
    'already-recorded');
  assert.equal(await readFile(path, 'utf8'), before);

  const second = makeFetch([candle('2026-11-30', 500), candle('2026-12-01', 75, 0)],
    [['2026-12-01', '0.85']]);
  await recordDay({ path, clock: clockAt('2026-12-02'), fetchImpl: second });
  const { utf8, lines, rows } = await ledgerRows(path);
  assert.ok(utf8.startsWith(before));
  assert.equal(rows[1].previousSha256, createHash('sha256').update(lines[0]).digest('hex'));
  assert.equal(rows[1].bitstampCandle.volume, 0);
  assert.equal(rows[1].ma200, (198 * 100 + 80 + 75) / 200);
  assert.equal(rows[1].k2Report.target, 1 / 6);
  assert.equal(rows[1].referenceUsd, 123);

  await writeFile(path, utf8.replace('"close":80', '"close":85'));
  await assert.rejects(recordDay({ path, clock: clockAt('2026-12-03'), fetchImpl: unexpectedFetch }),
    /Invalid L-039 ledger chain/);
});

test('keeps the MA state through a missing candle, resets the streak on missing MVRV, and exits at 1.25',
  async (t) => {
    const path = await useLedger(t);
    const signals = [
      ['2026-12-01', '2026-11-30', 80, '0.9'],
      ['2026-12-02', '2026-12-01', 80, '0.9'],
      ['2026-12-03', '2026-12-02', 80, '0.9'],
      ['2026-12-04', '2026-12-03', null, null],
      ['2026-12-05', '2026-12-04', 80, '0.9'],
      ['2026-12-06', '2026-12-05', 80, '1.25'],
      ['2026-12-07', '2026-12-06', 80, '0.9'],
      ['2026-12-08', '2026-12-07', 120, '0.9'],
    ];
    for (const [date, marketDate, close, mvrv] of signals) {
      const candles = close === null ? [] : [...warmup, candle(marketDate, close)];
      const reads = mvrv === null ? [] : [[marketDate, mvrv]];
      await recordDay({ path, clock: clockAt(date), fetchImpl: makeFetch(candles, reads) });
    }
    const { rows } = await ledgerRows(path);
    assert.deepEqual(rows.map((row) => row.k2Report.target), [1 / 6, 1 / 6, 1 / 3, 1 / 3, 1 / 3, 0, 1 / 6, 1]);
    assert.deepEqual(rows.map((row) => row.k2Report.count), [1, 2, 3, 0, 1, 0, 1, 0]);
    assert.equal(rows[3].close, null);
    assert.equal(rows[3].ma200, rows[2].ma200);
    assert.equal(rows[3].k1Signal, rows[2].k1Signal);
  });

test('keeps a timestamped partial record when a provider fails', async (t) => {
  const path = await useLedger(t);
  const fetchImpl = async (url) => {
    if (new URL(url).hostname === 'www.bitstamp.net') return new Response(null, { status: 503 });
    return makeFetch([], [['2026-11-30', '1.139']])(url);
  };
  await recordDay({ path, clock: clockAt('2026-12-01'), fetchImpl });
  const { rows: [row] } = await ledgerRows(path);
  assert.equal(row.close, null);
  assert.equal(row.k1Signal, null);
  assert.equal(row.mvrv, 1.139);
  assert.equal(row.sources.bitstamp.error, 'HTTP 503');
  assert.equal(row.sources.coinMetrics.error, null);
});

test('records a request that crosses midnight as late for the next-open decision', async (t) => {
  const path = await useLedger(t);
  let reads = 0;
  const clock = () => new Date(reads++ === 0
    ? '2026-12-01T23:59:00Z' : '2026-12-02T00:00:15Z');
  const fetchImpl = makeFetch([...warmup, candle('2026-11-30', 80)], [['2026-11-30', '0.9']]);
  await recordDay({ path, clock, fetchImpl });
  const { rows: [row] } = await ledgerRows(path);
  assert.equal(row.date, '2026-12-01');
  assert.equal(row.k1Signal, 'cash');
  assert.equal(row.k1OnTime, false);
  assert.equal(row.mvrv, 0.9);
  assert.equal(row.k2Report.mvrv, null);
});
