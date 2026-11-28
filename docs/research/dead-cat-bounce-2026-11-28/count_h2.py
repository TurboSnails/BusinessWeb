#!/usr/bin/env python3
"""H2：A 股个股「10 日累计跌≥25% 后 20 日内反弹≥10%」事件计数（至 2023-10）。

不算事后收益。announce_date 来自 fin_pit，只判断窗口内有无公告。
用法：cd research-py && uv run python ../docs/research/dead-cat-bounce-2026-11-28/count_h2.py
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent / "counts_h2.json"

CRASH_DAYS = 10
CRASH_RET = -0.25
BOUNCE_WINDOW = 20
BOUNCE = 0.10
COOLDOWN = 120
END = "2023-10-31"
START = "2005-01-01"


def main() -> None:
    import sys
    sys.path.insert(0, str(ROOT / "research-py"))
    from factorlab import store

    print("loading prices…")
    panel = store.load_panel(
        "cn",
        ["close_adj", "is_suspended", "limit_down_oneword"],
        start=START,
        end=END,
        raw=False,  # 默认截锁箱；end 已到 2023-10-31
    )
    close = panel["close_adj"]
    susp = panel["is_suspended"].fillna(False).astype(bool)
    oneword = panel["limit_down_oneword"].fillna(False).astype(bool)
    dates = close.index
    codes = list(close.columns)
    print(f"days={len(dates)} codes={len(codes)}")

    print("loading fin_pit announce_date…")
    fin = pd.read_parquet(
        store.market_dir("cn") / "fin_pit.parquet",
        columns=["code", "announce_date"],
    )
    fin["announce_date"] = pd.to_datetime(fin["announce_date"])
    fin = fin.dropna(subset=["announce_date"])
    fin = fin[(fin["announce_date"] >= START) & (fin["announce_date"] <= END)]
    ann_by_code: dict[str, np.ndarray] = {
        c: g["announce_date"].drop_duplicates().sort_values().to_numpy()
        for c, g in fin.groupby("code", sort=False)
    }

    events = []
    by_year = Counter()
    with_ann = 0
    without_ann = 0
    skipped_oneword_or_susp = 0

    close_v = close.to_numpy(dtype=np.float64)
    susp_v = susp.to_numpy(dtype=bool)
    one_v = oneword.to_numpy(dtype=bool)

    for j, code in enumerate(codes):
        px = close_v[:, j]
        sp = susp_v[:, j]
        ow = one_v[:, j]
        valid = np.isfinite(px) & (px > 0)
        last_signal = -10**9
        i = CRASH_DAYS
        n = len(px)
        while i < n:
            if i - last_signal < COOLDOWN:
                i += 1
                continue
            if not valid[i] or not valid[i - CRASH_DAYS]:
                i += 1
                continue
            # 10 日累计（含当日）：close[i]/close[i-10]-1
            crash_ret = px[i] / px[i - CRASH_DAYS] - 1.0
            if crash_ret > CRASH_RET:  # 不够跌
                i += 1
                continue
            crash_end = i
            crash_start = i - CRASH_DAYS
            # 在之后 BOUNCE_WINDOW 日内找第一次反弹≥10%（相对滚动最低）
            roll_min = px[crash_end]
            trough_i = crash_end
            signal_i = None
            for k in range(crash_end + 1, min(n, crash_end + 1 + BOUNCE_WINDOW)):
                if not valid[k]:
                    continue
                if px[k] < roll_min:
                    roll_min = px[k]
                    trough_i = k
                if roll_min > 0 and px[k] >= roll_min * (1.0 + BOUNCE):
                    # 信号日不能停牌 / 一字跌停
                    if sp[k] or ow[k]:
                        skipped_oneword_or_susp += 1
                        break
                    signal_i = k
                    break
            if signal_i is None:
                i += 1
                continue
            # 公告：暴跌起点到信号日窗口内是否有 announce_date
            has_ann = False
            anns = ann_by_code.get(code)
            if anns is not None and len(anns):
                t0 = dates[crash_start]
                t1 = dates[signal_i]
                # searchsorted
                a = np.searchsorted(anns, np.datetime64(t0), side="left")
                b = np.searchsorted(anns, np.datetime64(t1), side="right")
                has_ann = b > a
            y = int(str(dates[signal_i].date())[:4])
            by_year[y] += 1
            if has_ann:
                with_ann += 1
            else:
                without_ann += 1
            events.append({
                "code": code,
                "crash_start": str(dates[crash_start].date()),
                "crash_end": str(dates[crash_end].date()),
                "trough": str(dates[trough_i].date()),
                "signal": str(dates[signal_i].date()),
                "crash_ret": float(crash_ret),
                "bounce": float(px[signal_i] / roll_min - 1.0),
                "has_announce_in_window": bool(has_ann),
            })
            last_signal = signal_i
            i = signal_i + 1

        if (j + 1) % 500 == 0:
            print(f"  …{j+1}/{len(codes)} events={len(events)}")

    # 有效独立日期
    sig_dates = sorted({e["signal"] for e in events})
    payload = {
        "definition": {
            "crash_window_days": CRASH_DAYS,
            "crash_ret_max": CRASH_RET,
            "bounce_window_days": BOUNCE_WINDOW,
            "bounce_min": BOUNCE,
            "cooldown_days": COOLDOWN,
            "signal_excludes": "is_suspended or limit_down_oneword",
            "sample": f"{START} … {END}（store raw=False，锁箱起点前）",
            "announce": "fin_pit.announce_date 落在 [crash_start, signal] 闭区间",
        },
        "n_events": len(events),
        "n_stocks_with_event": len({e["code"] for e in events}),
        "n_unique_signal_dates": len(sig_dates),
        "by_year": dict(sorted(by_year.items())),
        "with_announce": with_ann,
        "without_announce": without_ann,
        "skipped_signal_oneword_or_susp": skipped_oneword_or_susp,
        "events_sample_head": events[:30],
        "events_sample_tail": events[-10:],
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print("n_events", len(events), "stocks", payload["n_stocks_with_event"],
          "unique dates", len(sig_dates))
    print("by_year", dict(sorted(by_year.items())))
    print("announce", with_ann, "/", without_ann)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
