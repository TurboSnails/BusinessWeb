#!/usr/bin/env python3
"""Reproduce the frozen L-039 historical research using local inputs only."""
import csv
import hashlib
import json
import math
import re
from collections import deque
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
DATA = HERE.parents[2] / "data-raw/crypto-trend"
DAY = timedelta(days=1)
EPOCH = date(1970, 1, 1)
DAY_MS = 86_400_000
OLD = date(2012, 3, 5)
SPLIT = date(2015, 1, 1)
REPLAY = date(2018, 1, 1)
END = date(2026, 11, 26)
LEVELS = (0.0, 1 / 6, 1 / 3, 1 / 2)
BLOCK, DRAWS, SEED = 90, 20_000, 39027


def days(start, end):
    return [start + DAY * i for i in range((end - start).days)]


def utc_day(milliseconds):
    return EPOCH + DAY * (int(milliseconds) // DAY_MS)


def verify_sources():
    manifest = (DATA / "SOURCES.md").read_text()
    rows = [line for line in manifest.splitlines() if line.startswith("| `")]
    if not rows:
        raise ValueError("Empty source manifest")
    verified = {}
    for row in rows:
        match = re.fullmatch(r"\| `([^/`]+)`.*`([0-9a-f]{64})` \|", row)
        if match is None:
            raise ValueError(f"Malformed source manifest row: {row}")
        name, expected = match.groups()
        actual = hashlib.sha256((DATA / "raw" / name).read_bytes()).hexdigest()
        if actual != expected or name in verified:
            raise ValueError(f"Source checksum or duplicate entry: {name}")
        verified[name] = expected
    return verified


class FrozenData:
    def __init__(self):
        self.hashes = verify_sources()

    def rows(self, prefix, *keys):
        files = sorted(name for name in self.hashes if name.startswith(prefix))
        if not files:
            raise ValueError(f"No verified source for {prefix}")
        for name in files:
            value = json.loads((DATA / "raw" / name).read_bytes())
            for key in keys:
                value = value[key]
            yield from value


def unique(rows):
    result = {}
    for key, row in rows:
        if key in result and result[key] != row:
            raise ValueError(f"Conflicting duplicate record: {key}")
        result[key] = row
    return result


def number(value):
    if value in (None, "", "."):
        return None
    parsed = float(value)
    return parsed if math.isfinite(parsed) else None


@dataclass(frozen=True)
class Bar:
    opening: float | None
    closing: Decimal | None
    volume: float


def load_spot(raw):
    bitstamp = unique(
        (utc_day(int(row["timestamp"]) * 1000), row)
        for row in raw.rows("bitstamp-btcusd-", "data", "ohlc")
    )
    btc = {
        day: Bar(number(row["open"]), Decimal(row["close"]), float(row["volume"]))
        for day, row in bitstamp.items()
    }
    eth = unique(
        (utc_day(row[0]), Bar(number(row[1]), Decimal(row[4]), float(row[5])))
        for row in raw.rows("spot-ethusdt-")
    )
    cm = unique(
        (date.fromisoformat(row["time"][:10]), row)
        for row in raw.rows("cm-metrics-", "data") if row["asset"] == "btc"
    )
    return btc, eth, cm


def trend(bars, positive_only=False):
    window = deque()
    total = Decimal(0)
    states = {}
    state = (None, None)
    for day in days(min(bars), max(bars) + DAY):
        bar = bars.get(day)
        if bar and bar.closing is not None and (
            not positive_only or (day >= date(2012, 1, 1) and bar.volume > 0)
        ):
            if len(window) == 200:
                total -= window.popleft()
            window.append(bar.closing)
            total += bar.closing
            if len(window) == 200:
                state = (200 * bar.closing >= total, float(total / 200))
        states[day] = state
    return states


def lagged_rates(raw):
    name = "fred-DGS3MO.csv"
    if name not in raw.hashes:
        raise ValueError(f"Unverified source: {name}")
    with (DATA / "raw" / name).open(newline="") as source:
        observed = {
            date.fromisoformat(row["observation_date"]): value / 100 / 365
            for row in csv.DictReader(source)
            if (value := number(row["DGS3MO"])) is not None
        }
    rates = {}
    prior = 0.0
    for day in days(min(observed), END + DAY):
        prior = observed.get(day - DAY, prior)
        rates[day] = prior
    return rates


def unit_cost(day, market, multiple):
    if market in ("ETHUSDT", "perpetual"):
        fee, slip = 0.001, 0.001
    else:
        fee = 0.005 if day < date(2015, 3, 2) else 0.0025
        slip = 0.0025 if day.year == 2012 else 0.001
    return fee * multiple, slip * multiple


def sides(fee, slip):
    return (1 + slip) * (1 + fee), (1 - slip) * (1 - fee)


@dataclass
class Tape:
    dates: list
    prices: np.ndarray
    tradable: np.ndarray
    sources: list
    missing_valuation_streak: int
    monthly: np.ndarray
    rates: np.ndarray
    fees: np.ndarray
    slips: np.ndarray
    btc_gross: np.ndarray


def make_tape(start, end, bars, cm, market, multiple=1, rates=None):
    calendar = days(start, end + DAY)
    valuations, executable, sources = [], [], []
    missing = max_missing = 0
    previous = None
    # Prior dates only seed the valuation carry, never the portfolio.
    for day in days(start - 4 * DAY, end + DAY):
        bar = bars.get(day)
        tradable = bool(bar and bar.volume > 0 and bar.opening and bar.opening > 0)
        mark, source = None, "missing"
        if bar and bar.volume == 0 and bar.closing:
            mark, source = float(bar.closing), "zero_volume_close"
        elif bar and bar.opening and bar.opening > 0:
            mark, source = bar.opening, "venue_open"
        elif value := number(cm.get(day - DAY, {}).get("PriceUSD")):
            mark, source = value, "coin_metrics_e_minus_1"
        if mark is None:
            missing += 1
            if previous is not None and missing <= 3:
                mark, source = previous, "carry"
        else:
            previous, missing = mark, 0
        if day >= start:
            max_missing = max(max_missing, missing)
            valuations.append(mark)
            executable.append(tradable)
            sources.append(source)
    prices = np.asarray(valuations, dtype=float)
    tradable = np.asarray(executable[:-1], dtype=bool)
    monthly = np.zeros(len(tradable), dtype=bool)
    last_month = None
    for i, day in enumerate(calendar[:-1]):
        month = (day.year, day.month)
        if tradable[i] and month != last_month:
            monthly[i] = True
            last_month = month
    cost = np.array([unit_cost(day, market, multiple) for day in calendar[:-1]])
    return Tape(
        calendar, prices, tradable, sources, max_missing, monthly,
        np.asarray([(rates or {}).get(day, 0.0) for day in calendar[:-1]]),
        cost[:, 0], cost[:, 1], prices[1:] / prices[:-1] - 1,
    )


def trade(cash, quantity, price, target, fee, slip):
    """Solve the post-cost target weight on the actual trade side."""
    asset = quantity * price
    equity = cash + asset
    demand = target * equity - asset
    if abs(demand) <= equity * 1e-13:
        return cash, quantity, None
    buy, sell = sides(fee, slip)
    factor = buy if demand > 0 else sell
    notional = demand / (1 + target * (factor - 1))
    new_quantity = quantity + notional / price
    new_cash = cash - notional * factor
    if target == 0:
        new_quantity = 0.0
    if target == 1:
        new_cash = 0.0
    execution = price * (1 + slip if demand > 0 else 1 - slip)
    return new_cash, new_quantity, {
        "side": "buy" if demand > 0 else "sell",
        "quantity": abs(notional) / price,
        "open": price,
        "execution": execution,
        "fee": abs(notional) * (execution / price) * fee,
        "cashFlow": -notional * factor,
        "cost": notional * (factor - 1),
        "turnover": abs(notional) / equity,
        "target": target,
    }


def metrics(returns, equity=None):
    n = len(returns)
    variance = float(np.var(returns, ddof=1))
    mean = float(np.mean(returns))
    sigma = math.sqrt(365 * variance)
    equity = np.r_[1.0, np.cumprod(1 + returns)] if equity is None else np.asarray(equity)
    peaks = np.maximum.accumulate(equity)
    thirty = 1 - np.divide(equity[30:], equity[:-30],
                           out=np.ones_like(equity[30:]), where=equity[:-30] > 0)
    return {
        "days": n, "sigma": sigma, "mdd": float(np.max(1 - equity / peaks)),
        "cer": 365 * (mean - 1.5 * variance),
        "sharpe": 365 * mean / sigma if sigma else None,
        "cvar95": float(-np.mean(np.sort(returns)[:math.ceil(n / 20)])),
        "worst30": float(np.max(thirty)) if n >= 30 else None,
        "cagr": float(equity[-1] ** (365 / n) - 1),
        "endingEquity": float(equity[-1]),
    }


def signals(calendar, states, lag, cm=None):
    result = []
    count = ladder = 0
    previous = None
    for day in calendar[:-1]:
        signal_day = day - lag * DAY
        on, average = states.get(signal_day, (None, None))
        item = {"signalDay": signal_day.isoformat(), "trend": on, "ma200": average}
        if cm is None:
            item.update(target=float(on is True), order="exact")
        else:
            data_day = day - 2 * DAY
            read = cm.get(data_day, {}) if not on else {}
            mvrv = number(read.get("CapMVRVCur"))
            cap, supply = number(read.get("CapMrktCurUSD")), number(read.get("SplyCur"))
            realized = cap / mvrv / supply if cap and mvrv and supply else None
            closed = previous is True or not result
            prior_ladder = ladder
            exit_reason = None
            if on:
                exit_reason = "trend" if ladder else None
                count = ladder = 0
            else:
                if closed:
                    count = ladder = 0
                count = count + 1 if mvrv is not None and mvrv < 1 else 0
                if mvrv is not None and mvrv >= 1.25:
                    exit_reason = "mvrv" if ladder else None
                    count = ladder = 0
                else:
                    ladder = max(ladder, sum(count >= step for step in (1, 3, 7)))
            target = 1.0 if on else LEVELS[ladder]
            order = "exact" if target in (0, 1) or closed else "top_up" if ladder > prior_ladder else None
            item.update(
                target=target, order=order, ladder=ladder, count=count,
                mvrvDate=None if on else data_day.isoformat(), mvrv=mvrv,
                realizedPrice=realized, exitReason=exit_reason,
            )
        result.append(item)
        previous = on
    return result


def spot(tape, strategy, signal=None, weight=1.0, gross=False, audit=False):
    cash, quantity = 1.0, 0.0
    returns = np.empty(len(tape.tradable))
    equity_curve = [1.0]
    daily, trades, weights = [], [], []
    pending = None
    opened = False
    for i, day in enumerate(tape.dates[:-1]):
        price = tape.prices[i]
        before = cash + quantity * price
        item = signal[i] if signal is not None else {}
        if strategy == "B0":
            if not opened and pending is None:
                pending = (1.0, "exact", day, {})
        elif strategy == "M":
            pending = (weight, "exact", day, {}) if tape.monthly[i] else None
        elif strategy == "dailyReference":
            pending = (weight, "exact", day, {})
        elif item["order"] is not None:
            direction = item["order"]
            if direction == "top_up" and pending and pending[1] == "exact":
                # An outstanding transition can still require a net reduction
                # when its target is superseded by a higher ladder step.
                direction = "exact"
            pending = (item["target"], direction, day, item)
        execution = None
        if tape.tradable[i] and pending is not None:
            target, direction, due, due_signal = pending
            if direction == "exact" or quantity * price < target * before:
                fee, slip = (0.0, 0.0) if gross else (tape.fees[i], tape.slips[i])
                cash, quantity, execution = trade(cash, quantity, price, target, fee, slip)
                if execution is not None:
                    execution.update(date=day.isoformat(), dueDate=due.isoformat(), **due_signal)
                    trades.append(execution)
            pending = None
            opened = True
        marked_equity = cash + quantity * price
        exposure = quantity * price / marked_equity
        weights.append(exposure)
        cash_next = cash * (1 + tape.rates[i])
        after = cash_next + quantity * tape.prices[i + 1]
        returns[i] = after / before - 1
        equity_curve.append(after)
        if audit:
            daily.append({
                "date": day.isoformat(), "tradable": bool(tape.tradable[i]),
                "monthlyRebalance": bool(tape.monthly[i]),
                "mark": price, "markSource": tape.sources[i],
                "quantity": quantity, "cash": cash, "weight": exposure,
                "return": returns[i], "equityBeforeTrade": before,
                "equityAtNextOpen": after, "pending": pending[0] if pending else None,
                "tradeSide": execution["side"] if execution is not None else None, **item,
            })
        cash = cash_next
    if gross:
        return returns
    result = metrics(returns, equity_curve)
    result.update(
        trades=len(trades), turnover=sum(entry["turnover"] for entry in trades),
        exposure=float(np.mean(weights)),
    )
    if audit:
        result.update(daily=daily, ledger=trades)
    return result


def sigma(returns):
    return float(np.std(returns, ddof=1) * math.sqrt(365))


def match_weight(target, buy_hold, volatility):
    if target > buy_hold:
        return 10000, buy_hold, True
    low, high = 0, 10000
    while high - low > 1:
        mid = (low + high) // 2
        if volatility(mid / 10000) < target:
            low = mid
        else:
            high = mid
    # Monthly and daily references coincide with the all-cash and all-market paths at endpoints.
    lo, hi = volatility(low / 10000), volatility(high / 10000)
    selected, matched = (low, lo) if abs(lo - target) <= abs(hi - target) else (high, hi)
    return selected, matched, abs(matched - target) > 0.005


def coverage(tape):
    return {
        "start": tape.dates[0].isoformat(), "end": tape.dates[-1].isoformat(),
        "days": len(tape.tradable), "maxMissingValuationDays": tape.missing_valuation_streak,
        "valuations": {
            source: tape.sources.count(source) for source in sorted(set(tape.sources))
        },
        "terminalMark": float(tape.prices[-1]) if np.isfinite(tape.prices[-1]) else None,
        "terminalSource": tape.sources[-1],
    }


def compare(tape, state, lag=1, daily_reference=False):
    result = {"coverage": coverage(tape)}
    if tape.missing_valuation_streak >= 4 or not np.all(np.isfinite(tape.prices)):
        return result | {"verdict": "证据不足"}
    instructions = signals(tape.dates, state, lag)
    k1 = spot(tape, "K1", instructions, audit=True)
    b0 = spot(tape, "B0", audit=True)
    k1_gross = spot(tape, "K1", instructions, gross=True)
    b0_gross = spot(tape, "B0", gross=True)
    target, buy_hold = sigma(k1_gross), sigma(b0_gross)
    for model in ["M", "dailyReference"] if daily_reference else ["M"]:
        units, matched, mismatch = match_weight(
            target, buy_hold, lambda w: sigma(spot(tape, model, weight=w, gross=True))
        )
        ref = spot(tape, model, weight=units / 10000, audit=model == "M")
        ref.update(
            weight=units / 10000, weightUnits=units, sigmaGross=matched,
            matchError=abs(matched - target), mismatch=mismatch,
        )
        result[model] = ref
    ref = result["M"]
    deltas = {
        "cerVsM": k1["cer"] - ref["cer"], "mddVsM": ref["mdd"] - k1["mdd"],
        "mddVsB0": b0["mdd"] - k1["mdd"],
        "sigmaReductionVsB0": 1 - k1["sigma"] / b0["sigma"],
    }
    gates = {
        "match": not ref["mismatch"], "cerVsM": deltas["cerVsM"] >= 0,
        "mddVsM": deltas["mddVsM"] >= 0.05, "mddVsB0": deltas["mddVsB0"] >= 0.10,
        "sigmaReductionVsB0": deltas["sigmaReductionVsB0"] >= 0.15,
    }
    k1["sigmaGross"], b0["sigmaGross"] = target, buy_hold
    k1["executedDowncrosses"] = sum(
        row["side"] == "sell" and row["trend"] is False for row in k1["ledger"]
    )
    return result | {"K1": k1, "B0": b0, "deltas": deltas, "gates": gates, "pass": all(gates.values())}


def k2_report(tape, state, cm):
    instructions = signals(tape.dates, state, 1, cm)
    result = spot(tape, "K2", instructions, audit=True)
    reads = [item for item in instructions if item["mvrvDate"] is not None]
    missing = sum(item["mvrv"] is None for item in reads)
    clusters = []
    for day, row in sorted(cm.items()):
        value = number(row.get("CapMVRVCur"))
        if day + 2 * DAY >= tape.dates[-1] or value is None or value >= 1:
            continue
        if not clusters or (day - clusters[-1]["last"]).days > 90:
            clusters.append({"first": day, "last": day, "entries": [], "exits": []})
        clusters[-1]["last"] = day
    trades = {row["date"]: row for row in result["ledger"]}
    active = None
    inventory_cost = inventory_size = 0.0
    for daily in result["daily"]:
        executed = trades.get(daily["date"])
        if executed is None:
            continue
        size = executed["quantity"]
        is_buy = executed["side"] == "buy"
        if is_buy:
            inventory_cost -= executed["cashFlow"]
            inventory_size += size
        else:
            inventory_cost *= max(0.0, 1 - size / inventory_size)
            inventory_size = daily["quantity"]
        if 0 < executed["target"] < 1:
            read_day = date.fromisoformat(executed["mvrvDate"])
            active = next(c for c in reversed(clusters) if c["first"] <= read_day)
            active["entries"].append({
                "date": executed["date"], "ladder": executed["ladder"],
                "target": executed["target"], "side": executed["side"],
                "unitCost": -executed["cashFlow"] / size if is_buy else None,
                "inventoryAverageCost": inventory_cost / inventory_size,
                "realizedPrice": executed["realizedPrice"], "quantity": size,
            })
        if active and executed["target"] in (0, 1):
            active["exits"].append({
                "signalDate": executed["dueDate"],
                "reason": "trend" if executed["target"] == 1 else "mvrv",
                "executionDate": executed["date"],
            })
            active = None
    rendered = []
    for cluster in clusters:
        if cluster["last"] + 2 * DAY < tape.dates[0]:
            continue
        entries = cluster["entries"]
        buys = [row for row in entries if row["side"] == "buy"]
        size = sum(row["quantity"] for row in buys)
        rendered.append({
            "firstBelow": cluster["first"].isoformat(), "lastBelow": cluster["last"].isoformat(),
            "entries": entries,
            "averageCost": sum(row["unitCost"] * row["quantity"] for row in buys) / size if size else None,
            "exits": cluster["exits"],
        })
    return result | {
        "requiredMvrv": len(reads), "missingMvrv": missing,
        "incomplete": bool(reads and missing / len(reads) > 0.01), "clusters": rendered,
    }

def bootstrap_weight(underlier, monthly, tradable, fee, slip, k1_gross, k1_net):
    # Gross drift is independent of costs: every rebalance solves the same
    # post-cost weight. Between rebalances both portfolios have the same weights.
    n = underlier.shape[1]
    first_trade = tradable & (np.cumsum(tradable, axis=1) == 1)
    reset = (monthly & tradable) | first_trade
    indices = np.arange(n)
    anchor = np.maximum.accumulate(np.where(reset, indices, -1), axis=1)
    log_change = np.log1p(underlier)
    prior_log = np.cumsum(log_change, axis=1) - log_change
    growth = np.exp(prior_log - np.take_along_axis(prior_log, anchor.clip(0), axis=1))
    active = anchor >= 0
    target = np.std(k1_gross, axis=1, ddof=1)
    buy_hold = np.std(underlier * active, axis=1, ddof=1)
    low = np.zeros(len(target), dtype=int)
    high = np.full(len(target), 10000)

    def weights(units):
        w = units[:, None] / 10000
        btc = w * growth
        return np.where(active, btc / (1 - w + btc), 0)

    def volatility(units):
        return np.std(weights(units) * underlier, axis=1, ddof=1)

    while np.any(high - low > 1):
        mid = (low + high) // 2
        searching = high - low > 1
        below = volatility(mid) < target
        low = np.where(searching & below, mid, low)
        high = np.where(searching & ~below, mid, high)
    selected = np.where(abs(volatility(low) - target) <= abs(volatility(high) - target), low, high)
    selected[target > buy_hold] = 10000
    w = selected[:, None] / 10000
    after = weights(selected)
    gross = after * underlier
    before = np.column_stack((np.zeros(len(after)), (
        after[:, :-1] * (1 + underlier[:, :-1]) / (1 + gross[:, :-1])
    )))
    demand = w - before
    buy, sell = sides(fee, slip)
    factor = np.where(demand > 0, buy, sell)
    cost = np.where(reset, demand * (factor - 1) / (1 + w * (factor - 1)), 0)
    net = (1 + gross) * (1 - cost) - 1

    def cer(values):
        return 365 * (np.mean(values, axis=1) - 1.5 * np.var(values, ddof=1, axis=1))

    return cer(k1_net) - cer(net), selected


def historical_bootstrap(tape, state, comparison):
    n = len(tape.tradable)
    blocks = math.ceil(n / BLOCK)
    starts = np.random.Generator(np.random.PCG64(SEED)).integers(0, n, size=(DRAWS, blocks))
    offsets = np.arange(BLOCK)
    gross = spot(tape, "K1", signals(tape.dates, state, 1), gross=True)
    net = np.asarray([row["return"] for row in comparison["K1"]["daily"]])
    deltas, selected = [], []
    for low in range(0, DRAWS, 200):
        ix = ((starts[low:low + 200, :, None] + offsets) % n).reshape(-1, blocks * BLOCK)[:, :n]
        delta, weights = bootstrap_weight(
            tape.btc_gross[ix], tape.monthly[ix], tape.tradable[ix], tape.fees[ix],
            tape.slips[ix], gross[ix], net[ix],
        )
        deltas.extend(delta.tolist())
        selected.extend(weights.tolist())
    return {
        "indexFile": "bootstrap-indices.json", "method": "circular moving block",
        "resamples": DRAWS, "blockDays": BLOCK, "seed": SEED,
        "historicalDisclosureOnly": True,
        "cerDeltaLower95": float(np.quantile(deltas, 0.05, method="linear")),
        "weightUnitsMin": min(selected), "weightUnitsMax": max(selected),
    }, {
        "sourceStart": tape.dates[0].isoformat(),
        "sourceEndExclusive": tape.dates[-1].isoformat(),
        "sourceDayCount": n, "blockLength": BLOCK, "generator": "NumPy PCG64",
        "seed": SEED, "indexBase": 0,
        "encoding": "For each draw expand each start to 90 consecutive indices modulo sourceDayCount, concatenate and truncate to sourceDayCount.",
        "blockStarts": starts.tolist(),
    }


def leverage_data(raw):
    trades = unique((utc_day(row[0]), row) for row in raw.rows("perp-btcusdt-"))
    marks = unique((utc_day(row[0]), row) for row in raw.rows("mark-btcusdt-"))
    marks8h = unique((row[0], row) for row in raw.rows("mark8h-btcusdt-"))
    funding = unique(
        ((row["fundingTime"] + 30_000) // 60_000 * 60_000, row)
        for row in raw.rows("funding-btcusdt-")
    )
    funding_marks = {}
    for slot, row in funding.items():
        event_mark = number(row.get("markPrice"))
        source = "funding_event_mark"
        if event_mark is None and slot in marks8h:
            event_mark = float(marks8h[slot][1])
            source = "mark_8h_open"
        if event_mark is not None:
            funding_marks[slot] = (float(row["fundingRate"]), event_mark, source)
    full = []
    for day in sorted(trades.keys() & marks.keys()):
        opened = (day - EPOCH).days * DAY_MS
        if all(opened + hours * 3_600_000 in funding_marks for hours in (0, 8, 16)):
            full.append(day)
    if not full or full != days(full[0], END + DAY):
        raise ValueError("BTC perpetual joint coverage is missing or discontinuous")
    return full[0], trades, marks, funding_marks


class IsolatedLeg:
    def __init__(self, leverage, capital):
        self.leverage = leverage
        self.initial = self.cash = capital
        self.margin = self.qty = self.basis = 0.0
        self.funding = 0.0
        self.trades = []
        self.liquidations = []

    def isolated_equity(self, mark):
        return self.margin + self.qty * mark - self.basis

    def equity(self, mark):
        return self.cash + self.isolated_equity(mark)

    def liquidates(self, mark, funding_adjustment=0.0):
        return self.qty > 0 and self.isolated_equity(mark) + funding_adjustment <= 0.005 * self.qty * mark

    def liquidate(self, day, phase, mark):
        self.liquidations.append({
            "date": day.isoformat(), "phase": phase, "mark": mark,
            "cashRemaining": self.cash, "quantity": self.qty,
            "postedMarginAfterFunding": self.margin,
        })
        self.qty = self.basis = self.margin = 0.0

    def settle(self, event):
        rate, mark, _ = event
        amount = -self.qty * mark * rate
        self.margin += amount
        self.funding += amount

    def rebalance(self, day, price, mark, target, cost_multiple):
        fee, slip = unit_cost(day, "perpetual", cost_multiple)
        if target == 0 and self.qty:
            execution = price * (1 - slip)
            charge = self.qty * execution * fee
            self.cash += max(0.0, self.isolated_equity(execution) - charge)
            self.trades.append({"date": day.isoformat(), "side": "sell", "quantity": self.qty,
                                "price": execution, "fee": charge, "target": target})
            self.margin = self.qty = self.basis = 0.0
        elif target > 0 and self.cash > 0:
            execution = price * (1 + slip)
            marked_margin = self.isolated_equity(mark)
            # Posted collateral is sized from equity after execution cost.
            # Opening spread from the valuation mark is unrealized P&L.
            cost_per_unit = execution * fee + execution - mark
            per_unit_margin = execution / self.leverage
            gap = target * self.equity(mark) - marked_margin
            allocation_per_unit = per_unit_margin - (1 - target) * (execution - mark) + target * execution * fee
            quantity = min(
                max(0.0, gap / allocation_per_unit),
                self.cash / (per_unit_margin + execution * fee),
            )
            if quantity > 0:
                charge = quantity * execution * fee
                collateral = quantity * per_unit_margin
                self.cash = max(0.0, self.cash - collateral - charge)
                self.margin += collateral
                self.qty += quantity
                self.basis += quantity * execution
                self.trades.append({"date": day.isoformat(), "side": "buy", "quantity": quantity,
                                    "price": execution, "fee": charge, "target": target,
                                    "markRelativeCost": quantity * cost_per_unit})


def leveraged_path(first, market, trend_state, cm, legs, cost_multiple, low_order):
    _, trades, marks, funding = market
    calendar = days(first, END + DAY)
    # All overlapping perpetual valuation dates are verified by leverage_data.
    instructions = signals(calendar, trend_state, 1, cm)
    participants = {name: IsolatedLeg(leverage, weight) for name, leverage, weight in legs}
    curves = {name: [leg.initial] for name, leg in participants.items()}
    total_curve = [sum(curve[0] for curve in curves.values())]
    targets = dict.fromkeys(participants, 0.0)
    for day, instruction in zip(calendar[:-1], instructions, strict=True):
        opening, mark_open, mark_low = float(trades[day][1]), float(marks[day][1]), float(marks[day][3])
        slot = (day - EPOCH).days * DAY_MS
        midnight, morning, afternoon = (funding[slot + h * 3_600_000] for h in (0, 8, 16))
        next_slot = slot + DAY_MS
        next_mark = float(marks[day + DAY][1])
        next_midnight = funding[next_slot]
        for name, leg in participants.items():
            if leg.liquidates(midnight[1]):
                leg.liquidate(day, "before_00_funding", midnight[1])
            leg.settle(midnight)
            if leg.liquidates(mark_open) or leg.liquidates(midnight[1]):
                leg.liquidate(day, "after_00_funding", min(mark_open, midnight[1]))
            target = (
                LEVELS[instruction["ladder"]] if name == "bottom"
                else float(instruction["trend"] is True)
            )
            if target == 0 or target > targets[name]:
                leg.rebalance(day, opening, mark_open, target, cost_multiple)
            targets[name] = target

            # The low can fall before either of the remaining settlements or
            # after both. Compare the most and least conservative low ordering.
            funding_steps = np.r_[0.0, np.cumsum([
                -leg.qty * event[0] * event[1] for event in (morning, afternoon)
            ])]
            choose = np.argmin if low_order == "minFundingBalance" else np.argmax
            low_index = int(choose(funding_steps))
            for phase, event in enumerate((morning, afternoon, None)):
                if phase == low_index and leg.liquidates(mark_low):
                    leg.liquidate(day, f"day_low_after_{phase}_intraday_settlements", mark_low)
                if event is not None:
                    if leg.liquidates(event[1]):
                        leg.liquidate(day, "settlement_mark_before_funding", event[1])
                    leg.settle(event)
                    if leg.liquidates(event[1]):
                        leg.liquidate(day, "settlement_mark_after_funding", event[1])

            # Next-open pre-trade marks incorporate the incoming 00:00 funding.
            # Evaluate it here without mutating holdings before the next loop.
            incoming = -leg.qty * next_midnight[0] * next_midnight[1]
            terminal_touch = (
                leg.liquidates(next_midnight[1])
                or leg.liquidates(next_midnight[1], incoming)
                or leg.liquidates(next_mark, incoming)
            )
            value = leg.cash if terminal_touch else leg.equity(next_mark) + incoming
            if day + DAY == END:
                # Record liquidation/funding through the terminal valuation without trading.
                if leg.liquidates(next_midnight[1]):
                    leg.liquidate(END, "before_terminal_funding", next_midnight[1])
                leg.settle(next_midnight)
                if leg.liquidates(next_mark) or leg.liquidates(next_midnight[1]):
                    leg.liquidate(END, "terminal_valuation", min(next_mark, next_midnight[1]))
            curves[name].append(value)
        total_curve.append(sum(curve[-1] for curve in curves.values()))
    def evaluate(curve):
        standardized = np.asarray(curve) / curve[0]
        relative = np.divide(standardized[1:], standardized[:-1],
                             out=np.ones(len(curve) - 1), where=standardized[:-1] > 0)
        return metrics(relative - 1, standardized)
    return evaluate(total_curve) | {"legs": {
        name: evaluate(curves[name]) | {
            "initialCapital": leg.initial, "fundingCashFlow": leg.funding,
            "touches": len(leg.liquidations), "liquidations": leg.liquidations,
            "trades": len(leg.trades), "ledger": leg.trades,
        }
        for name, leg in participants.items()
    }}


def leverage_report(raw, trend_state, cm):
    market = leverage_data(raw)
    first, _, _, funding = market
    strategies = {
        "trend2x": [("trend", 2, 1.0)],
        "trend3x": [("trend", 3, 1.0)],
        "halfEquityProxy": [("trend", 2, 0.5), ("bottom", 1, 0.5)],
    }
    start_slot = (first - EPOCH).days * DAY_MS
    end_slot = (END - EPOCH).days * DAY_MS
    return {
        "start": first.isoformat(), "end": END.isoformat(), "maintenanceMargin": 0.005,
        "fundingMarkSources": {
            source: sum(start_slot <= slot <= end_slot and row[2] == source for slot, row in funding.items())
            for source in ("funding_event_mark", "mark_8h_open")
        },
        "wholeAccountLiquidation": None,
        "lowOrdering": "Place the day's mark low at the minimum or maximum intraday cumulative funding balance. Known settlement marks are checked in both paths.",
        "scenarios": {
            scenario: {
                name: {
                    ordering: leveraged_path(first, market, trend_state, cm, legs, multiple, ordering)
                    for ordering in ("minFundingBalance", "maxFundingBalance")
                }
                for name, legs in strategies.items()
            }
            for scenario, multiple in (("base", 1), ("doubleCost", 2))
        },
    }


def dump(path, payload):
    path.write_text(json.dumps(payload, allow_nan=False, ensure_ascii=False, separators=(",", ":")) + "\n")


def split_results(result):
    """Keep the same sample paths in the summary and detail files."""
    summary, detail = {}, {}
    for key, value in result.items():
        if key in {"daily", "ledger", "liquidations"}:
            detail[key] = value
        elif isinstance(value, dict):
            summary[key], nested_detail = split_results(value)
            if nested_detail:
                detail[key] = nested_detail
        else:
            summary[key] = value
    return summary, detail


def run():
    raw = FrozenData()
    print(f"SHA-256 verified: {len(raw.hashes)} frozen inputs", flush=True)
    btc, eth, cm = load_spot(raw)
    btc_state, eth_state = trend(btc), trend(eth)

    def btc_tape(start, end, multiple=1, rates=None):
        return make_tape(start, end, btc, cm, "BTCUSD", multiple, rates)

    old_tape = btc_tape(OLD, REPLAY)
    historical = {
        "base": compare(old_tape, btc_state, daily_reference=True),
        "lateOneDay": compare(old_tape, btc_state, lag=2),
        "doubleCost": compare(btc_tape(OLD, REPLAY, multiple=2), btc_state),
    }
    if any(row.get("verdict") == "证据不足" for row in historical.values()):
        verdict = "证据不足"
        bootstrap, index = None, None
    else:
        verdict = (
            "旧史方向一致，未经干净数据确认" if all(row["pass"] for row in historical.values())
            else "旧史不通过"
        )
        bootstrap, index = historical_bootstrap(old_tape, btc_state, historical["base"])
    clean_tape = btc_tape(date(2012, 7, 19), REPLAY)
    replay_tape = btc_tape(REPLAY, END)
    eth_tape = make_tape(date(2018, 3, 5), END, eth, {}, "ETHUSDT")
    eth_replay = {
        "coverage": coverage(eth_tape),
        "K1": spot(eth_tape, "K1", signals(eth_tape.dates, eth_state, 1), audit=True),
        "B0": spot(eth_tape, "B0", audit=True),
    }
    payload = {
        "study": "L-039", "title": "BTC 单币择时研究（L-039）",
        "frozenPreregCommit": "844bd10f", "verifiedSourceCount": len(raw.hashes),
        "units": "Rates are decimal fractions, rebalancing weightUnits are 1/10000, equity begins at 1.",
        "history": historical, "verdict": verdict, "bootstrap": bootstrap,
        "segments": {
            "early": compare(btc_tape(OLD, SPLIT), btc_state),
            "late": compare(btc_tape(SPLIT, REPLAY), btc_state),
        },
        "sensitivities": {
            "positiveVolume": {
                "standard": compare(clean_tape, btc_state),
                "positiveOnly": compare(clean_tape, trend(btc, positive_only=True)),
            },
            "cashRate": compare(btc_tape(OLD, REPLAY, rates=lagged_rates(raw)), btc_state),
        },
        "K2": {"history": k2_report(old_tape, btc_state, cm), "replay": k2_report(replay_tape, btc_state, cm)},
        "replay": {"BTC": compare(replay_tape, btc_state), "ETH": eth_replay,
                   "fiveCoinExactReplication": False},
        "leverage": leverage_report(raw, btc_state, cm),
        "asOf": {
            "marketDate": END.isoformat(), "trend": btc_state[END][0],
            "ma200": btc_state[END][1], "close": float(btc[END].closing),
            "marketSource": "Bitstamp BTC/USD", "mvrvDate": END.isoformat(),
            "mvrv": number(cm[END]["CapMVRVCur"]), "mvrvSource": "Coin Metrics",
        },
        "forward": {
            "start": "2026-12-01", "end": "2029-12-01", "state": "awaiting_archive",
            "revealed": False,
        },
    }
    if index is not None:
        dump(HERE / "bootstrap-indices.json", index)
    summary, detail = split_results(payload)
    dump(HERE / "results.json", summary)
    dump(HERE / "results-daily.json", detail)
    print(verdict)


if __name__ == "__main__":
    run()
