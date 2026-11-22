#!/usr/bin/env python3
"""组合网格回测引擎（独立实现，对齐 BRIEF 约定）。"""
from __future__ import annotations

import itertools
import json
import math
import statistics
from datetime import date, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
PRICE_PATH = ROOT / "data-raw/portfolio-explore/prices-adjusted.json"
OUT_DIR = Path(__file__).resolve().parent

GROWTH = ["AVGO", "META", "MSFT", "NVDA", "AMZN", "GOOGL"]
HIGHVOL = ["RKLB", "SOFI", "PLTR", "TSLA", "COIN", "HOOD"]
STABLE = ["CB", "KO", "PG", "JNJ", "WMT", "COST", "GLD"]
W2_GROWTH = ["AVGO", "META", "MSFT", "AMZN", "GOOGL"]
W2_HIGHVOL = ["TSLA", "NVDA"]

W1_START, W1_END = "2021-08-25", "2026-11-20"
W2_START, W2_END = "2016-01-04", "2026-11-20"
COST = 0.001
BAND = 0.40


def load_prices():
    raw = json.loads(PRICE_PATH.read_text())["series"]
    out = {}
    for sym, s in raw.items():
        out[sym] = {d: c for d, c in zip(s["dates"], s["close"])}
    return out


P = load_prices()


def pairs(xs):
    return list(itertools.combinations(xs, 2))


def common_dates(syms, start, end):
    sets = [set(P[s]) for s in syms]
    common = set.intersection(*sets)
    return sorted(d for d in common if start <= d <= end)


def years_span(d0, d1):
    a = date.fromisoformat(d0)
    b = date.fromisoformat(d1)
    return (b - a).days / 365.25


def max_drawdown(eqs):
    peak = eqs[0]
    mdd = 0.0
    t0 = t1 = 0
    peak_i = 0
    for i, e in enumerate(eqs):
        if e > peak:
            peak = e
            peak_i = i
        dd = e / peak - 1.0
        if dd < mdd:
            mdd = dd
            t0, t1 = peak_i, i
    return mdd, t0, t1


def worst_calendar_year(dates, eqs):
    # eqs[i] is equity at dates[i]; daily return i corresponds to dates[i] for i>=1
    by_year = {}
    for i in range(1, len(dates)):
        y = dates[i][:4]
        r = eqs[i] / eqs[i - 1] - 1.0
        by_year.setdefault(y, []).append(1.0 + r)
    worst = None
    for y, factors in by_year.items():
        tot = 1.0
        for f in factors:
            tot *= f
        ret = tot - 1.0
        if worst is None or ret < worst[1]:
            worst = (y, ret)
    return worst


def run_backtest(stocks, tw, mode, start, end, band=BAND, cost=COST):
    """mode: 'bh' | 'band' | 'monthly'"""
    dates = common_dates(stocks, start, end)
    if len(dates) < 2:
        raise ValueError(f"too few dates for {stocks} {start}-{end}")
    k = len(stocks)
    tw = list(tw)
    assert abs(sum(tw) - 1.0) < 1e-9
    bands = [(t * (1 - band), t * (1 + band)) for t in tw]

    # month-start trading days for monthly mode
    month_first = set()
    if mode == "monthly":
        prev = None
        for d in dates:
            ym = d[:7]
            if ym != prev:
                month_first.add(d)
                prev = ym

    w = list(tw)
    eq = 1.0
    eqs = [1.0]
    rets = []
    pend = None
    trades = 0
    tot_cost = 0.0

    for i in range(1, len(dates)):
        r = [P[s][dates[i]] / P[s][dates[i - 1]] - 1.0 for s in stocks]
        eq *= 1.0 + sum(w[j] * r[j] for j in range(k))
        v = [w[j] * (1.0 + r[j]) for j in range(k)]
        sv = sum(v)
        w = [x / sv for x in v]

        if pend == i:
            t = 0.5 * sum(abs(w[j] - tw[j]) for j in range(k))
            eq *= 1.0 - t * cost
            trades += 1
            tot_cost += t * cost
            w = list(tw)
            pend = None

        dec = False
        if mode == "band":
            dec = any(not (bands[j][0] < w[j] < bands[j][1]) for j in range(k))
        elif mode == "monthly":
            # decide on first trading day of month (after drift), execute next day
            dec = dates[i] in month_first

        if dec and pend is None and i + 1 < len(dates):
            pend = i + 1

        rets.append(eq / eqs[-1] - 1.0)
        eqs.append(eq)

    n = len(rets)
    m = sum(rets) / n
    var = sum((x - m) ** 2 for x in rets) / n
    yrs = years_span(dates[0], dates[-1])
    final = eqs[-1]
    cagr = final ** (1.0 / yrs) - 1.0 if yrs > 0 else float("nan")
    vol = math.sqrt(var * 252)
    mdd, di0, di1 = max_drawdown(eqs)
    cer = 252.0 * (m - 1.5 * var)
    wy = worst_calendar_year(dates, eqs)

    return {
        "start": dates[0],
        "end": dates[-1],
        "final": round(final, 4),
        "cagr": round(cagr, 6),
        "vol": round(vol, 6),
        "mdd": round(mdd, 6),
        "mdd_start": dates[di0],
        "mdd_end": dates[di1],
        "cer": round(cer, 6),
        "trades": trades,
        "cost": round(tot_cost, 6),
        "worst_year": wy[0] if wy else None,
        "worst_year_ret": round(wy[1], 6) if wy else None,
        "n_days": n,
    }


def template_weights():
    # order: g1, g2, hv1, hv2, st
    return [0.25, 0.25, 0.125, 0.125, 0.25]


def equal_weights():
    return [0.2, 0.2, 0.2, 0.2, 0.2]


def combo_stocks(g, hv, st):
    return [g[0], g[1], hv[0], hv[1], st]


def verify_anchors():
    results = {}
    st = ["AVGO", "META", "CB", "SOFI", "RKLB"]
    tw = [0.25, 0.25, 0.25, 0.125, 0.125]
    # note: anchor uses order AVGO,META,CB,SOFI,RKLB with weights 25,25,25,12.5,12.5
    # Our template order is g,g,hv,hv,st — for anchor match use their order/weights.
    tw_a = [0.25, 0.25, 0.25, 0.125, 0.125]
    r1 = run_backtest(st, tw_a, "bh", W1_START, W1_END)
    r2 = run_backtest(st, tw_a, "band", W1_START, W1_END)
    s2 = ["AVGO", "META", "CB", "TSLA", "NVDA"]
    r3 = run_backtest(s2, tw_a, "bh", W2_START, W2_END)
    r4 = run_backtest(s2, tw_a, "band", W2_START, W2_END)
    r5 = run_backtest(["QQQ"], [1.0], "bh", W1_START, W1_END)
    results["A1"] = {"got_final": r1["final"], "got_trades": r1["trades"], "exp_final": 3.1020, "exp_trades": 0}
    results["A2"] = {"got_final": r2["final"], "got_trades": r2["trades"], "exp_final": 3.6138, "exp_trades": 17}
    results["A3"] = {"got_final": r3["final"], "got_trades": r3["trades"], "exp_final": 29.7227, "exp_trades": 0}
    results["A4"] = {"got_final": r4["final"], "got_trades": r4["trades"], "exp_final": 18.1600, "exp_trades": 16}
    results["A5"] = {"got_final": r5["final"], "got_trades": r5["trades"], "exp_final": 1.6234, "exp_trades": 0}
    results["detail"] = {"A1": r1, "A2": r2, "A3": r3, "A4": r4, "A5": r5}
    ok = all(
        results[k]["got_final"] == results[k]["exp_final"] and results[k]["got_trades"] == results[k]["exp_trades"]
        for k in ("A1", "A2", "A3", "A4", "A5")
    )
    results["pass"] = ok
    return results


def pct(xs, p):
    if not xs:
        return None
    s = sorted(xs)
    if p <= 0:
        return s[0]
    if p >= 100:
        return s[-1]
    k = (len(s) - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return s[int(k)]
    return s[f] * (c - k) + s[c] * (k - f)


def dist_stats(xs):
    if not xs:
        return None
    return {
        "n": len(xs),
        "mean": statistics.mean(xs),
        "median": pct(xs, 50),
        "q25": pct(xs, 25),
        "q75": pct(xs, 75),
        "pct_positive": sum(1 for x in xs if x > 0) / len(xs),
        "pct_nonneg": sum(1 for x in xs if x >= 0) / len(xs),
        "min": min(xs),
        "max": max(xs),
    }


def first_trading_day_on_or_after(all_dates, ymd):
    for d in all_dates:
        if d >= ymd:
            return d
    return None


def quarterly_starts(universe_dates, from_ym="2021-09", to_ym="2024-12"):
    """每季度第一个交易日：2021-09, 2021-12, ..., 2024-12。"""
    # quarter starts: Mar, Jun, Sep, Dec — but "从 2021-09 起"
    months = []
    y, m = int(from_ym[:4]), int(from_ym[5:7])
    ey, em = int(to_ym[:4]), int(to_ym[5:7])
    while (y, m) <= (ey, em):
        months.append(f"{y:04d}-{m:02d}-01")
        m += 3
        if m > 12:
            m -= 12
            y += 1
    starts = []
    for ymd in months:
        d = first_trading_day_on_or_after(universe_dates, ymd)
        if d and d <= "2024-12-31":
            starts.append(d)
    # unique preserve order
    seen = set()
    out = []
    for d in starts:
        if d not in seen:
            seen.add(d)
            out.append(d)
    return out


def corr(xs, ys):
    n = len(xs)
    if n < 2:
        return None
    mx = sum(xs) / n
    my = sum(ys) / n
    num = sum((xs[i] - mx) * (ys[i] - my) for i in range(n))
    dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    dy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if dx == 0 or dy == 0:
        return None
    return num / (dx * dy)


def daily_returns(sym, dates):
    return [P[sym][dates[i]] / P[sym][dates[i - 1]] - 1.0 for i in range(1, len(dates))]


if __name__ == "__main__":
    a = verify_anchors()
    print(json.dumps({k: a[k] for k in ("pass", "A1", "A2", "A3", "A4", "A5")}, indent=2, ensure_ascii=False))
