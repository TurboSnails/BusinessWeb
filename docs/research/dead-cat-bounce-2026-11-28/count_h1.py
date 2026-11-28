#!/usr/bin/env python3
"""H1：指数「252 日高点回撤≥20% 后第一次反弹≥10%」事件计数。只数事件，不算事后收益。

用法：cd research-py && uv run python ../docs/research/dead-cat-bounce-2026-11-28/count_h1.py
输出：同目录 counts_h1.json
"""
from __future__ import annotations

import json
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent / "counts_h1.json"
FF_ZIP = ROOT / "data-raw/spx-qqq-tilt/raw/F-F_Research_Data_Factors_daily_CSV.zip"
INTL = ROOT / "docs/research/vol-target-confirm-2026-11-25/inputs-intl.json"

# 口径（LITERATURE.md H1）：写死后再跑
DD = 0.20          # 相对 252 日收盘高点回撤
BOUNCE = 0.10      # 相对急跌态滚动最低收盘反弹
LOOKBACK = 252
MAX_STRESS = 504   # 急跌态最长交易日


def count_events(dates: pd.DatetimeIndex, close: np.ndarray) -> list[dict]:
    n = len(close)
    if n < LOOKBACK + 2:
        return []
    hi = np.empty(n)
    for i in range(n):
        lo = max(0, i - LOOKBACK + 1)
        hi[i] = close[lo : i + 1].max()

    events: list[dict] = []
    in_stress = False
    i = 0
    while i < n:
        if not in_stress:
            if i >= LOOKBACK - 1 and close[i] <= hi[i] * (1.0 - DD):
                in_stress = True
                stress_start = i
                prior_high = hi[i]
                lo = max(0, i - LOOKBACK + 1)
                prior_high_i = lo + int(np.argmax(close[lo : i + 1]))
                roll_min = close[i]
                trough_i = i
                got_signal = False
                stress_end_cap = i + MAX_STRESS
            i += 1
            continue
        if close[i] < roll_min:
            roll_min = close[i]
            trough_i = i
        if (not got_signal) and roll_min > 0 and close[i] >= roll_min * (1.0 + BOUNCE):
            events.append({
                "prior_high_date": str(dates[prior_high_i].date()),
                "trough_date": str(dates[trough_i].date()),
                "signal_date": str(dates[i].date()),
                "stress_start_date": str(dates[stress_start].date()),
                "drawdown_to_trough": float((prior_high - roll_min) / prior_high),
                "bounce_from_trough": float(close[i] / roll_min - 1.0),
                "days_stress_to_signal": int(i - stress_start),
            })
            got_signal = True
        if close[i] >= prior_high or i >= stress_end_cap:
            in_stress = False
        i += 1
    return events


def load_ff_total_return(start: str, end: str) -> pd.DataFrame:
    """Ken French 日度 Mkt-RF + RF → 含息总收益指数（起点=1）。"""
    with zipfile.ZipFile(FF_ZIP) as zf:
        text = zf.read("F-F_Research_Data_Factors_daily.csv").decode("latin1")
    rows = []
    for line in text.splitlines():
        if not line[:8].isdigit():
            continue
        p = [x.strip() for x in line.split(",")]
        rows.append((p[0], float(p[1]), float(p[4])))
    df = pd.DataFrame(rows, columns=["ymd", "mkt_rf", "rf"])
    df["date"] = pd.to_datetime(df["ymd"])
    df = df[(df["date"] >= start) & (df["date"] <= end)].reset_index(drop=True)
    df["ret"] = (df["mkt_rf"] + df["rf"]) / 100.0
    df["close"] = (1.0 + df["ret"]).cumprod()
    return df[["date", "close"]]


def load_intl() -> dict[str, pd.DataFrame]:
    raw = json.loads(INTL.read_text())
    out = {}
    for key, meta in raw["indexes"].items():
        rows = meta["rows"]
        df = pd.DataFrame(rows, columns=["date", "close"])
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values("date").drop_duplicates("date").reset_index(drop=True)
        out[key] = df
    return out


def decade_bucket(iso: str) -> str:
    y = int(iso[:4])
    return f"{y // 10 * 10}s"


def main() -> None:
    us = load_ff_total_return("1928-01-01", "1949-12-31")
    us_events = count_events(pd.DatetimeIndex(us["date"]), us["close"].to_numpy(dtype=float))

    intl = load_intl()
    intl_out = {}
    for key, df in intl.items():
        ev = count_events(pd.DatetimeIndex(df["date"]), df["close"].to_numpy(dtype=float))
        by_decade: dict[str, int] = {}
        for e in ev:
            by_decade[decade_bucket(e["signal_date"])] = by_decade.get(decade_bucket(e["signal_date"]), 0) + 1
        intl_out[key] = {
            "symbol": json.loads(INTL.read_text())["indexes"][key]["symbol"],
            "start": str(df["date"].iloc[0].date()),
            "end": str(df["date"].iloc[-1].date()),
            "n_events": len(ev),
            "by_decade": dict(sorted(by_decade.items())),
            "events": ev,
        }

    # 全球同步：信号日落在同一日历月的多市场事件
    month_hits: dict[str, list[str]] = {}
    for key, block in intl_out.items():
        for e in block["events"]:
            m = e["signal_date"][:7]
            month_hits.setdefault(m, []).append(key)
    for e in us_events:
        m = e["signal_date"][:7]
        month_hits.setdefault(m, []).append("us_ff")
    multi = {m: sorted(set(v)) for m, v in month_hits.items() if len(set(v)) >= 2}

    payload = {
        "definition": {
            "drawdown_from_252d_high": DD,
            "first_bounce_from_rolling_trough": BOUNCE,
            "stress_max_days": MAX_STRESS,
            "one_signal_per_stress": True,
            "note": "低点为急跌态内截至当日的滚动最低收盘，无事后底部。",
        },
        "us_1928_1949": {
            "source": "Ken French F-F Research Data Factors daily（Mkt-RF+RF 复利指数）",
            "file": str(FF_ZIP.relative_to(ROOT)),
            "n_events": len(us_events),
            "events": us_events,
            "by_decade": {},
        },
        "international": intl_out,
        "overlap_months_ge2_markets": multi,
        "yahoo_gspc": {
            "used": False,
            "reason": "本地 GSPC 缓存仅自 1985；本计数用 Ken French 含息日度（1926 起）覆盖 1928–1949。",
        },
    }
    bd: dict[str, int] = {}
    for e in us_events:
        bd[decade_bucket(e["signal_date"])] = bd.get(decade_bucket(e["signal_date"]), 0) + 1
    payload["us_1928_1949"]["by_decade"] = dict(sorted(bd.items()))

    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(f"US 1928–1949 events: {len(us_events)}")
    for e in us_events:
        print(" ", e["prior_high_date"], "→", e["trough_date"], "→", e["signal_date"])
    print("intl:", {k: v["n_events"] for k, v in intl_out.items()})
    print("overlap months (≥2 mkts):", len(multi))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
