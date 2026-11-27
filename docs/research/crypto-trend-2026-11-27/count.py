"""Audit L-039 input data and count observed price states. No performance calculations."""

from collections import Counter, defaultdict, deque
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import json
from statistics import median

from fetch import CUTOFF, DAY, RAW, iso

START = date(2011, 1, 1)
SPLIT = date(2018, 1, 1)
HOUR_MS = 3_600_000


def load(pattern, keys=()):
    for path in sorted(RAW.glob(pattern)):
        rows = json.loads(path.read_text())
        for key in keys:
            rows = rows[key]
        yield from rows


def day_of(ms):
    return date.fromisoformat(iso(ms)[:10])


def audit_days(label, dates, start=None, end=CUTOFF):
    counts = Counter(dates)
    if not counts:
        raise ValueError(f"Empty data for {label}")
    start = start or min(counts)
    expected = {start + offset * DAY for offset in range((end - start).days + 1)}
    missing = sorted(expected - counts.keys())
    duplicates = sorted(d for d, n in counts.items() if n > 1)
    extra = sorted(counts.keys() - expected)
    print(f"{label}: {len(dates)} rows, {min(counts)} → {max(counts)}, "
          f"{len(missing)} missing, {len(duplicates)} duplicate dates, {len(extra)} outside range")
    if missing:
        print("  Missing:", ", ".join(map(str, missing)))
    if duplicates or extra:
        print("  First/last duplicate dates:", duplicates[:1], duplicates[-1:], "Outside:", extra)
    return missing


def coin_metrics():
    rows_by_asset = defaultdict(list)
    for row in load("cm-metrics-*.json", ("data",)):
        rows_by_asset[row["asset"]].append(row)
    prices, mvrvs = {}, {}
    fields = ("PriceUSD", "CapMVRVCur", "CapMrktCurUSD", "SplyCur")
    for asset, rows in sorted(rows_by_asset.items()):
        print(f"Coin Metrics {asset}: {len(rows)} total source rows")
        by_field = {}
        for field in fields:
            dated = [(date.fromisoformat(row["time"][:10]), Decimal(row[field]))
                     for row in rows if row.get(field) is not None]
            expected_start = {
                "btc": "2009-01-03" if field == "SplyCur" else "2010-07-18",
                "eth": "2015-07-30" if field == "SplyCur" else "2015-08-08",
            }[asset]
            audit_days(f"  {field}", [day for day, _ in dated], date.fromisoformat(expected_start))
            by_field[field] = dict(dated)
        bad_price = [day for day, price in by_field["PriceUSD"].items() if not price > 0]
        print(f"  Nonpositive PriceUSD: {len(bad_price)}")
        prices[asset] = {day: p for day, p in by_field["PriceUSD"].items() if p > 0}
        ratios = {}
        equivalence_error = []
        for day, price in prices[asset].items():
            values = [by_field[field].get(day) for field in fields[1:]]
            if all(value is not None and value > 0 for value in values):
                mvrv, market_cap, supply = values
                ratios[day] = market_cap / mvrv / supply
                equivalence_error.append(abs(market_cap / supply / price - 1))
        mvrvs[asset] = by_field["CapMVRVCur"]
        disagreements = sum((prices[asset][day] < realized) != (mvrvs[asset][day] < 1)
                            for day, realized in ratios.items())
        print(f"  MVRV < 1 vs price below derived realized price: {disagreements} disagreements")
        if disagreements:
            raise ValueError(f"Unexpected MVRV identity disagreement for {asset}")
        print(f"  Valid realized prices: {len(ratios)}, {min(ratios)} → {max(ratios)}")
        print(f"  Max relative error CapMrktCurUSD / SplyCur vs PriceUSD: {max(equivalence_error):.6g}")
        lags = []
        for row in rows:
            if row.get("AssetEODCompletionTime") is not None and row.get("PriceUSD"):
                day = date.fromisoformat(row["time"][:10])
                if day >= date(2025, 1, 1):
                    close = datetime.combine(day + DAY, datetime.min.time(), timezone.utc).timestamp()
                    lags.append((day, (int(row["AssetEODCompletionTime"]) - close) / 3600))
        if lags:
            print(f"  EOD completion since 2025-01-01: {len(lags)} rows, "
                  f"median {median(h for _, h in lags):.2f}h after UTC close, "
                  f"latest {max(lags, key=lambda item: item[1])}, "
                  f"{sum(h > 24 for _, h in lags)} above 24h")
    return prices, mvrvs


def audit_ohlc(label, ohlc, start=None):
    audit_days(label, [day for day, _ in ohlc], start)
    broken = []
    for day, values in ohlc:
        op, hi, low, close = map(Decimal, values)
        if not 0 < low <= min(op, close) <= max(op, close) <= hi:
            broken.append(day)
    print(f"  Invalid OHLC: {len(broken)}", *broken)
    by_day = {}
    for day, values in ohlc:
        if day in by_day and by_day[day] != values:
            raise ValueError(f"Conflicting OHLC for {label} on {day}")
        by_day[day] = values
    return {day: Decimal(values[-1]) for day, values in by_day.items()}


def audit_funding(symbol):
    marks = [row[0] for row in load(f"mark8h-{symbol}-*.json")]
    mark_slots = set(marks)
    rows = list(load(f"funding-{symbol}-*.json"))
    timestamps = [row["fundingTime"] for row in rows]
    # The exchange sends millisecond jitter around settlement. Preserve timestamps
    # in raw responses and round to the nearest minute solely for cadence checks.
    minute = 60_000
    slots = [(stamp + minute // 2) // minute * minute for stamp in timestamps]
    gaps = Counter((b - a) / HOUR_MS for a, b in zip(slots, slots[1:]))
    long_gaps = [(iso(a), iso(b), (b - a) / HOUR_MS)
                 for a, b in zip(slots, slots[1:]) if b - a > 8 * HOUR_MS]
    off_grid = [stamp for stamp in slots if stamp % (8 * HOUR_MS)]
    missing_grid = set(range(slots[0], slots[-1] + 1, 8 * HOUR_MS)) - set(slots)
    print(f"Funding {symbol}: {len(rows)} rows {iso(timestamps[0])} → {iso(timestamps[-1])}, "
          f"{len(timestamps) - len(set(timestamps))} exact duplicates, "
          f"{len(slots) - len(set(slots))} duplicate minutes, {len(off_grid)} off-grid records, "
          f"{len(missing_grid)} missing nominal 8h grid points, "
          f"{sum(not row.get('markPrice') for row in rows)} empty mark prices")
    if marks:
        missing_open_marks = [s for s, row in zip(slots, rows)
                              if not row.get("markPrice") and s not in mark_slots]
        print(f"  Mark8h: {len(marks)} rows {iso(marks[0])} → {iso(marks[-1])}, "
              f"{len(marks) - len(mark_slots)} duplicates, "
              f"{len(missing_open_marks)} funding events without event mark or 8h opening mark")
        if missing_open_marks:
            print("  First/last uncovered:", iso(missing_open_marks[0]), iso(missing_open_marks[-1]))
    print("  Interval hours:", dict(sorted(gaps.items())), "Spacings > 8h:", long_gaps[:20])
    print("  First/last missing nominal grid points:", [iso(d) for d in sorted(missing_grid)[:4]],
          [iso(d) for d in sorted(missing_grid)[-4:]])


def catalogue():
    caps = {}
    for row in load("cm-catalog-*.json", ("data",)):
        dates = [f for m in row["metrics"] if m["metric"] == "CapMrktCurUSD"
                 for f in m["frequencies"] if f["frequency"] == "1d" and f["community"]]
        if dates:
            caps[row["asset"]] = dates[0]
    print(f"Coin Metrics Community CapMrktCurUSD ({len(caps)} assets):", ", ".join(sorted(caps)))


def compare(label, reference, independent, samples):
    print(label)
    differences = []
    for day in samples:
        other = independent.get(day)
        if day not in reference or other is None:
            print(f"  {day}: unavailable")
            continue
        value = reference[day]
        diff = (value / other - 1) * 100
        differences.append(abs(diff))
        print(f"  {day} | {value:.8f} | {other:.8f} | {diff:+.4f}%")
    print(f"  Matched {len(differences)}/{len(samples)}, "
          f"median absolute {median(differences):.4f}%, max {max(differences):.4f}%")


def stretches(mvrv):
    runs = []
    first = last = None
    for day, ratio in sorted(mvrv.items()):
        if 0 < ratio < 1:
            if last and day != last + DAY:
                runs.append((first, last))
                first = None
            first = first or day
            last = day
        elif last:
            runs.append((first, last))
            first = last = None
    if last:
        runs.append((first, last))
    return runs


def ma_switches(prices):
    window = deque(maxlen=200)
    downs, ups = Counter(), Counter()
    previous_state = first_signal = None
    for day, value in sorted(prices.items()):
        window.append(value)
        if len(window) < 200:
            continue
        first_signal = first_signal or day
        below = value < sum(window) / 200
        if previous_state is not None and below != previous_state:
            (downs if below else ups)[day.year] += 1
        previous_state = below
    print(f"  First MA200 state: {first_signal}")
    return downs, ups


def inspect_bitstamp(rows):
    dates = sorted(rows)
    prior = None
    groups = defaultdict(Counter)
    zero_days = []
    for day in dates:
        row = rows[day]
        close = Decimal(row["close"])
        zero = Decimal(row["volume"]) == 0
        flat = prior is not None and close == prior
        range_flat = Decimal(row["high"]) == Decimal(row["low"])
        if zero:
            zero_days.append(day)
        labels = [str(day.year)]
        if date(2011, 8, 18) <= day <= date(2012, 3, 4):
            labels.append("MA200 warmup")
        for label in labels:
            groups[label].update({"zero_volume": zero, "unchanged_close": flat,
                                  "flat_range": range_flat, "days": 1})
        prior = close
    print("Bitstamp zero-volume, unchanged-close and flat-range days:")
    for label, result in groups.items():
        print(f"  {label}: {dict(result)}")
    print("  Zero-volume dates:", ", ".join(map(str, zero_days)))


def main():
    prices, mvrvs = coin_metrics()
    spot = {}
    for asset in ("btc", "eth"):
        rows = list(load(f"spot-{asset}usdt-*.json"))
        spot[asset] = audit_ohlc(f"Binance spot {asset}", [(day_of(r[0]), r[1:5]) for r in rows],
                                 date(2017, 8, 17))
    stamp_rows = {
        day_of(int(row["timestamp"]) * 1000): row
        for row in load("bitstamp-btcusd-*.json", ("data", "ohlc"))
    }
    stamp_btc = audit_ohlc("Bitstamp BTCUSD", [
        (day_of(int(row["timestamp"]) * 1000), [row[k] for k in ("open", "high", "low", "close")])
        for row in load("bitstamp-btcusd-*.json", ("data", "ohlc"))
    ])
    inspect_bitstamp(stamp_rows)
    volume_only = {day: close for day, close in stamp_btc.items()
                   if day >= date(2012, 1, 1) and Decimal(stamp_rows[day]["volume"]) > 0}
    stamp_eth = {
        day_of(int(row["timestamp"]) * 1000): Decimal(row["close"])
        for row in load("bitstamp-ethusd-*.json", ("data", "ohlc"))
    }
    modern = [date(year, 8, 17) for year in range(2017, 2027)]
    early = [date.fromisoformat(value) for value in (
        "2011-09-13", "2011-12-31", "2012-03-31", "2012-12-31", "2013-03-31",
        "2013-12-31", "2014-12-31", "2015-12-31", "2016-12-31", "2017-08-16",
    )]
    compare("Coin Metrics BTC USD vs Bitstamp BTCUSD", prices["btc"], stamp_btc, early)
    compare("Binance BTCUSDT vs Bitstamp BTCUSD", spot["btc"], stamp_btc, modern)
    compare("Binance ETHUSDT vs Bitstamp ETHUSD", spot["eth"], stamp_eth, modern)
    for symbol in ("btcusdt", "ethusdt", "zecusdt"):
        audit_funding(symbol)
        for kind in ("mark", "perp"):
            ohlc = [(day_of(r[0]), r[1:5]) for r in load(f"{kind}-{symbol}-*.json")]
            if ohlc:
                audit_ohlc(f"Binance {kind} {symbol}", ohlc)
    catalogue()
    print("BTC below realized price, first/last below, inclusive days:")
    runs = stretches(mvrvs["btc"])
    for lo, hi in runs:
        if hi >= START:
            print(f"  {lo} | {hi} | {(hi - lo).days + 1}")
    for lo, hi in ((START, SPLIT - DAY), (SPLIT, CUTOFF)):
        overlap = sum(a <= hi and b >= lo for a, b in runs)
        censored = sum(a <= hi and b >= lo and (a < lo or b >= hi) for a, b in runs)
        subset = [(a, b) for a, b in runs if a <= hi and b >= lo]
        clusters = sum(i == 0 or (a - subset[i - 1][1]).days >= 91
                       for i, (a, _) in enumerate(subset))
        print(f"  {lo} → {hi}: {overlap} runs, {censored} censored, "
              f"{clusters} clusters after requiring 90 full days between runs")
    tables = {}
    for name, series in (("CM BTC", prices["btc"]), ("CM ETH", prices["eth"]),
                         ("Binance BTC", spot["btc"]), ("Binance ETH", spot["eth"]),
                         ("Bitstamp BTC", stamp_btc), ("Bitstamp BTC volume-only from 2012", volume_only)):
        print(name)
        tables[name] = ma_switches(series)
    print("Year | " + " | ".join(tables))
    for year in range(START.year, CUTOFF.year + 1):
        print(str(year) + " | " + " | ".join(f"{down[year]}/{up[year]}" for down, up in tables.values()))


if __name__ == "__main__":
    main()
