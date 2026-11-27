import { createHash } from 'node:crypto';
import { appendFile, mkdir, open, readFile, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const START = '2026-12-01';
const END = '2029-12-01';
const DAY_MS = 86_400_000;
const MA_LENGTH = 200;
const WARMUP_LIMIT = 1000;
const BITSTAMP = 'https://www.bitstamp.net/api/v2/ohlc/btcusd/';
const COIN_METRICS = 'https://community-api.coinmetrics.io/v4/timeseries/asset-metrics';
const OUTPUT = fileURLToPath(new URL('../public/data/crypto-forward/l039.jsonl', import.meta.url));

function dateOf(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function shiftDay(day, offset) {
  return dateOf(Date.parse(day) + offset * DAY_MS);
}

function sha256(line) {
  return createHash('sha256').update(line, 'utf8').digest('hex');
}

async function readLedger(path) {
  const contents = await readFile(path, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  if (!contents) return { records: [], previousSha256: null };

  if (!contents.endsWith('\n')) throw new Error('L-039 ledger has an incomplete final line');
  const records = [];
  let previousSha256 = null;
  for (const line of contents.slice(0, -1).split('\n')) {
    const row = JSON.parse(line);
    if (row.previousSha256 !== previousSha256 || row.date < START || row.date > END
        || (records.length && row.date <= records.at(-1).date)) {
      throw new Error(`Invalid L-039 ledger chain or order at ${row.date}`);
    }
    records.push(row);
    previousSha256 = sha256(line);
  }
  return { records, previousSha256 };
}

function bitstampCandles(body, through) {
  if (!Array.isArray(body.data?.ohlc)) throw new Error('Invalid Bitstamp OHLC response');
  const indexed = new Map();
  for (const candle of body.data.ohlc) {
    const time = Number(candle.timestamp) * 1000;
    const open = Number(candle.open);
    const close = Number(candle.close);
    const volume = Number(candle.volume);
    if (!Number.isFinite(time) || time % DAY_MS || !Number.isFinite(open) || open <= 0
        || !Number.isFinite(close) || close <= 0 || candle.volume == null || String(candle.volume).trim() === ''
        || !Number.isFinite(volume) || volume < 0) {
      throw new Error('Invalid Bitstamp day candle');
    }
    const date = dateOf(time);
    if (date > through) continue;
    const entry = { date, open, close, volume };
    if (indexed.has(date) && JSON.stringify(indexed.get(date)) !== JSON.stringify(entry)) {
      throw new Error(`Conflicting Bitstamp candle for ${date}`);
    }
    indexed.set(date, entry);
  }
  return [...indexed.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function coinMetricsReadings(body, through) {
  if (!Array.isArray(body.data)) throw new Error('Invalid Coin Metrics response');
  return body.data
    .filter((row) => row.asset === 'btc' && /^\d{4}-\d{2}-\d{2}T00:00:00(?:\.0+)?Z$/.test(row.time))
    .map((row) => ({
      date: row.time.slice(0, 10),
      mvrv: positive(row.CapMVRVCur),
      priceUsd: positive(row.PriceUSD),
    }))
    .filter((row) => row.date <= through)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function nextBottomState(isOn, previous, reading, adjacent) {
  if (isOn === null) return { count: 0, ladder: 0, target: null };
  if (isOn) return { count: 0, ladder: 0, target: 1 };

  const prior = previous?.ma200State === 'below' ? previous.k2Report : null;
  const count = reading !== null && reading < 1 ? (adjacent ? prior?.count ?? 0 : 0) + 1 : 0;
  let ladder = prior?.ladder ?? 0;
  if (reading !== null && reading >= 1.25) ladder = 0;
  else if (count >= 7) ladder = 3;
  else if (count >= 3) ladder = Math.max(ladder, 2);
  else if (count >= 1) ladder = Math.max(ladder, 1);
  return { count, ladder, target: [0, 1 / 6, 1 / 3, 1 / 2][ladder] };
}

async function readSource(url, parse, fetchImpl, clock) {
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const value = parse(await response.json());
    return { url, readAt: clock().toISOString(), error: null, value };
  } catch (error) {
    return { url, readAt: clock().toISOString(), error: error.message, value: [] };
  }
}

async function collect(date, records, fetchImpl, clock) {
  const marketDate = shiftDay(date, -1);
  const effectiveDate = shiftDay(date, 1);
  const previous = records.at(-1);
  const hasWarmup = records.some((row) => row.warmupCandles?.length);
  const bitstampUrl = new URL(BITSTAMP);
  bitstampUrl.search = new URLSearchParams({
    step: '86400',
    limit: hasWarmup ? '2' : String(WARMUP_LIMIT),
    end: String(Date.parse(effectiveDate) / 1000 - 1),
    exclude_current_candle: 'false',
  });
  const cmUrl = new URL(COIN_METRICS);
  cmUrl.search = new URLSearchParams({
    assets: 'btc', metrics: 'CapMVRVCur,PriceUSD', frequency: '1d',
    start_time: shiftDay(marketDate, -7), end_time: marketDate, page_size: '10',
  });

  const [bitstamp, coinMetrics] = await Promise.all([
    readSource(bitstampUrl.href, (body) => bitstampCandles(body, date), fetchImpl, clock),
    readSource(cmUrl.href, (body) => coinMetricsReadings(body, marketDate), fetchImpl, clock),
  ]);

  const candle = bitstamp.value.find((row) => row.date === marketDate) ?? null;
  const warmupCandles = hasWarmup ? [] : bitstamp.value
    .filter((row) => row.date < shiftDay(START, -1)).slice(-MA_LENGTH);
  const warmup = records.find((row) => row.warmupCandles?.length)?.warmupCandles ?? warmupCandles;
  const history = [...warmup, ...records.map((row) => row.bitstampCandle).filter(Boolean)];
  if (candle) history.push(candle);
  const window = history.slice(-MA_LENGTH);
  const ma200 = window.length === MA_LENGTH
    ? window.reduce((total, row) => total + row.close, 0) / MA_LENGTH
    : null;
  const close = candle?.close ?? null;
  const isOn = ma200 === null ? null : window.at(-1).close >= ma200;
  const ma200State = isOn === null ? null : isOn ? 'at-or-above' : 'below';
  const latest = coinMetrics.value.findLast((row) => row.mvrv !== null);
  const exact = coinMetrics.value.find((row) => row.date === marketDate);
  const onTime = coinMetrics.readAt < `${effectiveDate}T00:00:00.000Z`;
  const k2Mvrv = onTime ? exact?.mvrv ?? null : null;

  return {
    date,
    marketDate,
    effectiveDate,
    close,
    ma200,
    ma200State,
    k1Signal: isOn === null ? null : isOn ? 'btc' : 'cash',
    k1OnTime: isOn !== null && bitstamp.readAt < `${effectiveDate}T00:00:00.000Z`,
    mvrv: latest?.mvrv ?? null,
    mvrvDate: latest?.date ?? null,
    openingUsd: bitstamp.value.find((row) => row.date === date)?.open ?? null,
    referenceUsd: exact?.priceUsd ?? null,
    bitstampCandle: candle,
    ...(warmupCandles.length ? { warmupCandles } : {}),
    k2Report: {
      ...nextBottomState(isOn, previous, k2Mvrv, previous?.date === shiftDay(date, -1)),
      mvrv: k2Mvrv,
      mvrvDate: k2Mvrv === null ? null : marketDate,
    },
    sources: {
      bitstamp: { url: bitstamp.url, readAt: bitstamp.readAt, error: bitstamp.error },
      coinMetrics: { url: coinMetrics.url, readAt: coinMetrics.readAt, error: coinMetrics.error },
    },
  };
}

export async function recordDay({ path = OUTPUT, clock = () => new Date(), fetchImpl = fetch } = {}) {
  const startedAt = clock().toISOString();
  const date = dateOf(startedAt);
  if (date < START || date > END) return 'outside-window';
  if (startedAt < `${date}T01:30:00.000Z`) return 'before-scheduled-time';

  await mkdir(dirname(path), { recursive: true });
  const lockPath = `${path}.lock`;
  const lock = await open(lockPath, 'wx');
  try {
    const { records, previousSha256 } = await readLedger(path);
    if (records.some((row) => row.date === date)) return 'already-recorded';
    if (records.at(-1)?.date > date) throw new Error('Cannot backdate L-039 ledger');
    const row = await collect(date, records, fetchImpl, clock);
    await appendFile(path, `${JSON.stringify({ ...row, previousSha256 })}\n`, 'utf8');
    return 'recorded';
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(await recordDay());
}
