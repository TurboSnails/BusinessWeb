#!/usr/bin/env python3
"""H2 按 PREREG 修订口径只数事件（底池 + 第 9 条排除 + C2 上下界）。不算收益。

用法：cd research-py && uv run python ../docs/research/dead-cat-bounce-2026-11-28/count_h2_filtered.py
输出：counts_h2_filtered.json
"""
from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent / "counts_h2_filtered.json"

CRASH_DAYS = 10
CRASH_RET = -0.25
BOUNCE_WINDOW = 20
BOUNCE = 0.10
COOLDOWN = 120
HOLD = 60
END = "2023-10-31"
START = "2005-01-01"


def month_end_mask(dates: pd.DatetimeIndex) -> np.ndarray:
    """交易日面板上的月末调仓日（该月最后一个有行情日）。"""
    s = pd.Series(np.arange(len(dates)), index=dates)
    last = s.groupby([dates.year, dates.month]).max()
    m = np.zeros(len(dates), dtype=bool)
    m[last.to_numpy()] = True
    return m


def main() -> None:
    import sys
    sys.path.insert(0, str(ROOT / "research-py"))
    from factorlab import store
    from factorlab.sources.cn_fin import load_fin_pit
    from factorlab.universe import UniverseSpec, build_universe

    print("loading panel…")
    fields = [
        "close_adj", "is_suspended", "limit_down_oneword", "no_limit_inferred",
        "is_st", "mcap_float", "amount",
    ]
    panel = store.load_panel("cn", fields, start=START, end=END, raw=False)
    sec = store.read_securities("cn")
    dates = panel["close_adj"].index
    codes = list(panel["close_adj"].columns)
    print(f"days={len(dates)} codes={len(codes)}")

    print("building month-end universe mask…")
    # 每日成员资格：用月末调仓结果向前填充（与「月末调仓」主口径一致的近似；信号日取最近月末及以前的池）
    me = month_end_mask(dates)
    me_dates = dates[me]
    uni = build_universe(
        panel, me_dates, "cn", securities=sec,
        spec=UniverseSpec(),  # resolved(cn)：drop_small 30%、min_list 120
    )
    # uni: DataFrame index=me_dates, columns=codes, bool
    uni_daily = uni.reindex(dates).ffill().fillna(False).astype(bool)
    # 首段 ffill 前无月末：用 False
    uni_v = uni_daily.to_numpy(dtype=bool)

    close = panel["close_adj"].to_numpy(dtype=np.float64)
    # 停牌：当日无有效行情（审稿第 10 条）
    valid = np.isfinite(close) & (close > 0)
    # 一字跌停仍用字段（信号日排除）
    ow = panel["limit_down_oneword"].fillna(False).to_numpy(dtype=bool)
    nli = panel["no_limit_inferred"].fillna(False).to_numpy(dtype=bool)
    susp_field = panel["is_suspended"].fillna(False).to_numpy(dtype=bool)

    print("loading st_pit delisting + terminate…")
    st = pd.read_parquet(store.market_dir("cn") / "st_pit.parquet")
    st["start_date"] = pd.to_datetime(st["start_date"])
    st["end_date"] = pd.to_datetime(st["end_date"])
    # delisting 区间；终止上市用 event
    delist_iv = st[st["flag"] == "delisting"]
    # 也收集「终止上市」事件日（点时：vary/start 日起）
    term_ev = st[st["event"].astype(str).str.contains("终止", na=False)]

    # code -> list of (start, end) for delisting
    delist_map: dict[str, list[tuple[pd.Timestamp, pd.Timestamp]]] = defaultdict(list)
    for r in delist_iv.itertuples():
        end = r.end_date if pd.notna(r.end_date) else pd.Timestamp(END)
        delist_map[r.code].append((r.start_date, end))
    term_map: dict[str, list[pd.Timestamp]] = defaultdict(list)
    for r in term_ev.itertuples():
        term_map[r.code].append(r.start_date)

    delisted_codes = set(sec.loc[sec["status"] == "delisted", "code"].astype(str))

    print("loading fin_pit via cn_fin.load_fin_pit…")
    fin = load_fin_pit("cn", raw=False)
    fin = fin[
        (fin["doc_type"] == "periodic")
        & (fin["announce_rule"].isin(["declared", "declared_same_report"]))
        & fin["announce_date"].notna()
    ].copy()
    fin["announce_date"] = pd.to_datetime(fin["announce_date"])
    ann_by_code: dict[str, np.ndarray] = {
        c: np.sort(g["announce_date"].drop_duplicates().to_numpy())
        for c, g in fin.groupby("code", sort=False)
    }

    # 长期停牌：连续无行情 ≥60 日后的复牌首日
    print("scanning events…")
    events = []
    skip_nli = skip_resump = skip_delist = skip_uni = 0

    for j, code in enumerate(codes):
        px = close[:, j]
        v = valid[:, j]
        owj = ow[:, j]
        nlij = nli[:, j]
        unij = uni_v[:, j]
        last_signal = -10**9
        i = CRASH_DAYS
        n = len(px)
        # 预计算复牌首日集合（停牌≥60 后）
        resump = set()
        run = 0
        for t in range(n):
            if not v[t]:
                run += 1
            else:
                if run >= 60:
                    resump.add(t)
                run = 0

        while i < n:
            if i - last_signal < COOLDOWN:
                i += 1
                continue
            if not v[i] or not v[i - CRASH_DAYS]:
                i += 1
                continue
            crash_ret = px[i] / px[i - CRASH_DAYS] - 1.0
            if crash_ret > CRASH_RET:
                i += 1
                continue
            crash_end = i
            crash_start = i - CRASH_DAYS
            roll_min = px[crash_end]
            trough_i = crash_end
            signal_i = None
            for k in range(crash_end + 1, min(n, crash_end + 1 + BOUNCE_WINDOW)):
                if not v[k]:
                    continue
                if px[k] < roll_min:
                    roll_min = px[k]
                    trough_i = k
                if roll_min > 0 and px[k] >= roll_min * (1.0 + BOUNCE):
                    # 信号日：无行情视为停牌；一字跌停排除
                    if not v[k] or owj[k]:
                        break
                    signal_i = k
                    break
            if signal_i is None:
                i += 1
                continue

            # 第 9 条排除（不计入、不占冷却）
            excluded = False
            if nlij[crash_start : signal_i + 1].any():
                skip_nli += 1
                excluded = True
            if not excluded and any(crash_start <= r <= signal_i for r in resump):
                skip_resump += 1
                excluded = True
            if not excluded:
                s_date = dates[signal_i]
                for a, b in delist_map.get(code, []):
                    if a <= s_date <= b:
                        skip_delist += 1
                        excluded = True
                        break
                if not excluded:
                    for td in term_map.get(code, []):
                        if td <= s_date:
                            # 已公告终止：保守，终止日起排除
                            skip_delist += 1
                            excluded = True
                            break
            if excluded:
                i += 1  # 不占冷却
                continue

            # 冷却：接受信号
            last_signal = signal_i

            # 底池：s 日成员
            if not unij[signal_i]:
                skip_uni += 1
                i = signal_i + 1
                continue

            # C2：announce_date ∈ [crash_start, crash_end]
            t0 = dates[crash_start]
            t1 = dates[crash_end]
            anns = ann_by_code.get(code)
            has_c2 = False
            if anns is not None and len(anns):
                a = np.searchsorted(anns, np.datetime64(t0), side="left")
                b = np.searchsorted(anns, np.datetime64(t1), side="right")
                has_c2 = b > a

            is_delisted = code in delisted_codes
            # 下界：退市股一律非 C2；上界：退市股一律 C2；在市股用实际
            c2_lo = False if is_delisted else has_c2
            c2_hi = True if is_delisted else has_c2

            s_date = dates[signal_i]
            # 层归属
            end_hold_i = signal_i + HOLD
            if end_hold_i >= n:
                end_hold_ok = False
            else:
                end_hold_ok = True
            y = int(s_date.year)
            if s_date <= pd.Timestamp("2014-12-31"):
                layer = "explore"
                # 2014Q4 跨入 2015：hold 越过年末
                cross_2015 = dates[min(end_hold_i, n - 1)] >= pd.Timestamp("2015-01-01") if end_hold_ok or end_hold_i < n else False
            elif s_date <= pd.Timestamp("2023-10-31"):
                # 验证：s+60 ≤ 2023-10-31
                if end_hold_ok and dates[end_hold_i] <= pd.Timestamp("2023-10-31"):
                    layer = "validate"
                else:
                    layer = "validate_truncated"  # 窗口被截断，不计入验证主表
                cross_2015 = False
            else:
                layer = "lockbox_out_of_scope"
                cross_2015 = False

            events.append({
                "code": code,
                "signal": str(s_date.date()),
                "crash_start": str(t0.date()),
                "crash_end": str(t1.date()),
                "year": y,
                "layer": layer,
                "cross_2015": bool(cross_2015) if layer == "explore" else False,
                "c2_lo": bool(c2_lo),
                "c2_hi": bool(c2_hi),
                "is_delisted_stock": bool(is_delisted),
            })
            i = signal_i + 1

        if (j + 1) % 500 == 0:
            print(f"  …{j+1}/{len(codes)} kept={len(events)}")

    def summarize(subset):
        n_ev = len(subset)
        months = sorted({e["signal"][:7] for e in subset})
        c2_lo = sum(1 for e in subset if e["c2_lo"])
        c2_hi = sum(1 for e in subset if e["c2_hi"])
        by_year = Counter(e["year"] for e in subset)
        return {
            "n_events": n_ev,
            "n_stocks": len({e["code"] for e in subset}),
            "n_signal_days": len({e["signal"] for e in subset}),
            "n_signal_months": len(months),
            "c2_lo_n": c2_lo,
            "c2_hi_n": c2_hi,
            "c2_lo_pct": round(c2_lo / n_ev, 4) if n_ev else None,
            "c2_hi_pct": round(c2_hi / n_ev, 4) if n_ev else None,
            "by_year": dict(sorted(by_year.items())),
        }

    explore = [e for e in events if e["layer"] == "explore"]
    validate = [e for e in events if e["layer"] == "validate"]
    validate_trunc = [e for e in events if e["layer"] == "validate_truncated"]
    explore_cross = [e for e in explore if e["cross_2015"]]

    payload = {
        "definition": {
            "base": "count_h2.py 79–141 逻辑 + PREREG 修订（底池、第9条、C2 收窄）",
            "universe": "UniverseSpec(cn) 月末调仓 ffill 至日；信号日须在池",
            "exclude_rule9": "no_limit_inferred in [crash_start,s]; 停牌≥60后复牌首日 in window; s 在 delisting 或已终止",
            "c2": "doc_type=periodic, announce_rule∈{declared,declared_same_report}, announce_date∈[crash_start,crash_end]; 退市股 lo=非C2 hi=C2",
            "layers": "explore s∈2005–2014; validate s∈2015–2023-10 & s+60≤2023-10-31",
            "sample": f"{START}…{END}",
        },
        "skips": {
            "no_limit_inferred": skip_nli,
            "long_suspend_resumption": skip_resump,
            "delisting_or_terminate": skip_delist,
            "not_in_universe_on_s": skip_uni,
        },
        "all_kept": summarize(events),
        "explore": summarize(explore),
        "explore_cross_into_2015": {
            "n_events": len(explore_cross),
            "note": "信号在 2014、持有窗跨入 2015；计入探索并单列",
        },
        "validate": summarize(validate),
        "validate_truncated_excluded": summarize(validate_trunc),
        "note": "只数个数，无收益。锁箱层未解封故不计数。",
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({k: payload[k] if k == "skips" else {kk: vv for kk, vv in payload[k].items() if kk != "by_year"}
                      for k in ("skips", "all_kept", "explore", "validate", "validate_truncated_excluded")},
                     ensure_ascii=False, indent=2))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
