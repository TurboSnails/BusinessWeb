#!/usr/bin/env python3
"""H3：机械化 Wyckoff 形态逐步计数（A 股 2005–2023-10）。只数个数，不算事后收益。

用法：cd research-py && uv run python ../docs/research/dead-cat-bounce-2026-11-28/count_h3.py
输出：counts_h3.json
"""
from __future__ import annotations

import json
import os
from collections import Counter, defaultdict
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass, asdict
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent / "counts_h3.json"
START, END = "2005-01-01", "2023-10-31"

# 主口径（LITERATURE.md H3 表）
P = dict(
    d=0.25, m=0.15, k_sc=2.0, a=1.5,
    W_ar=15, r_ar=0.10, p_ar=0.03,
    W_st=40, b_st=0.03, m_st=0.6,
    W_rng=120, u_max=0.05, R_rec=3, m_sp=1.0,
    W_sos=30, m_sos=1.5,
    W_lps=15, r_pb=0.03, h=0.03,
    C=60,
)

# 敏感性三档（文中给出的合理范围；主口径居中或取声明值）
SENS = {
    "d": [0.20, 0.25, 0.30],
    "m_sp": [0.50, 0.75, 1.00],
    "m_sos": [1.20, 1.50, 2.00],
}


@dataclass
class Stages:
    sc: int = 0
    ar: int = 0
    st: int = 0
    spring: int = 0
    sos: int = 0
    lps: int = 0


def _rolling_mean_prev(x: np.ndarray, win: int, min_count: int) -> np.ndarray:
    """t−win…t−1 的均值（不含当日）。"""
    s = pd.Series(x)
    return s.shift(1).rolling(win, min_periods=min_count).mean().to_numpy(dtype=np.float64)


def _indicators(h, l, c, v):
    """向量化 ATR20 / V20 / V50 / 250 日最高收盘。"""
    n = len(c)
    cprev = np.roll(c, 1)
    cprev[0] = c[0]
    tr = np.maximum(h - l, np.maximum(np.abs(h - cprev), np.abs(l - cprev)))
    bad = ~(np.isfinite(h) & np.isfinite(l) & np.isfinite(c))
    tr[bad] = np.nan
    atr = _rolling_mean_prev(tr, 20, 15)
    v20 = _rolling_mean_prev(v, 20, 15)
    v50 = _rolling_mean_prev(v, 50, 30)
    hi250 = pd.Series(c).rolling(250, min_periods=1).max().to_numpy(dtype=np.float64)
    return atr, v20, v50, hi250


def scan_stock(
    dates, o, h, l, c, v, susp, ld_ow, lu_ow, is_st_row, list_i0, params,
    collect_years=False, atr=None, v20=None, v50=None, hi250=None,
):
    """对单只股票扫描；返回 Stages 与（可选）LPS 确认年列表、一字跌停缩量剔除数。"""
    n = len(c)
    stg = Stages()
    lps_years = []
    skip_limit_vol = 0
    p = params

    if atr is None:
        atr, v20, v50, hi250 = _indicators(h, l, c, v)

    i = 60
    last_lps = -10**9
    while i < n:
        if i - last_lps < p["C"]:
            i += 1
            continue
        if i < list_i0 + 250:  # 上市不足 250 日
            i += 1
            continue
        if is_st_row[i]:
            i += 1
            continue
        if not (np.isfinite(c[i]) and np.isfinite(hi250[i]) and hi250[i] > 0):
            i += 1
            continue
        # D
        dd = 1.0 - c[i] / hi250[i]
        if i < 60 or not np.isfinite(c[i - 60]) or c[i - 60] <= 0:
            i += 1
            continue
        ret60 = c[i] / c[i - 60] - 1.0
        if dd < p["d"] or ret60 > -p["m"]:
            i += 1
            continue

        # 找 SC：从 i 起向前看一段，或当日即为 SC
        # 简化：以 i 为候选日，若满足 SC 则进入；否则 i+=1
        sc_i = None
        for j in range(i, min(n, i + 30)):
            if is_st_row[j] or not np.isfinite(c[j]):
                continue
            if ld_ow[j]:
                # 一字跌停造成的缩量：单独计，不当 SC
                if np.isfinite(v[j]) and np.isfinite(v50[j]) and v[j] < v50[j]:
                    skip_limit_vol += 1
                continue
            if susp[j]:
                continue
            # 60 日新低（最低价）
            lo = max(0, j - 59)
            window_low = l[lo : j + 1]
            window_low = window_low[np.isfinite(window_low)]
            if len(window_low) == 0 or l[j] > window_low.min() + 1e-12:
                continue
            if not (np.isfinite(v[j]) and np.isfinite(v50[j]) and v50[j] > 0):
                continue
            if v[j] < p["k_sc"] * v50[j]:
                continue
            if not (np.isfinite(atr[j]) and atr[j] > 0):
                continue
            amp = h[j] - l[j] if np.isfinite(h[j]) else 0
            if amp < p["a"] * atr[j]:
                continue
            # D still roughly holds at j
            if not (np.isfinite(hi250[j]) and hi250[j] > 0):
                continue
            if 1.0 - c[j] / hi250[j] < p["d"] * 0.8:  # 略放宽：仍在大回撤中
                continue
            sc_i = j
            break
        if sc_i is None:
            i += 1
            continue

        stg.sc += 1
        sc_low = l[sc_i]
        sc_vol = v[sc_i]

        # AR：SC 后 W_ar 日内最高价首次 ≥ sc_low*(1+r_ar)；之后滚动高点回落 ≥ p_ar 确认
        ar_hit = None
        for j in range(sc_i + 1, min(n, sc_i + 1 + p["W_ar"])):
            if np.isfinite(h[j]) and h[j] >= sc_low * (1.0 + p["r_ar"]):
                ar_hit = j
                break
        if ar_hit is None:
            i = sc_i + 1
            continue
        # 确认 AR 顶
        peak = h[ar_hit]
        peak_i = ar_hit
        ar_conf = None
        for j in range(ar_hit + 1, min(n, ar_hit + 1 + 40)):
            if np.isfinite(h[j]) and h[j] > peak:
                peak = h[j]
                peak_i = j
            if np.isfinite(c[j]) and peak > 0 and c[j] <= peak * (1.0 - p["p_ar"]):
                ar_conf = j
                break
        if ar_conf is None:
            i = sc_i + 1
            continue
        ar_top = peak
        stg.ar += 1

        # ST
        st_i = None
        for j in range(ar_conf + 1, min(n, ar_conf + 1 + p["W_st"])):
            if not np.isfinite(l[j]) or not np.isfinite(v[j]):
                continue
            if abs(l[j] - sc_low) / sc_low > p["b_st"]:
                continue
            if v[j] > p["m_st"] * sc_vol:
                continue
            st_i = j
            break
        if st_i is None:
            i = sc_i + 1
            continue
        stg.st += 1

        # Spring
        spring_conf = None
        spring_break = None
        for j in range(st_i + 1, min(n, sc_i + 1 + p["W_rng"])):
            if not np.isfinite(l[j]):
                continue
            if l[j] >= sc_low:
                continue
            if (sc_low - l[j]) / sc_low > p["u_max"]:
                continue
            if ld_ow[j] or lu_ow[j] or susp[j]:
                if ld_ow[j] and np.isfinite(v[j]) and np.isfinite(v20[j]) and v[j] < v20[j]:
                    skip_limit_vol += 1
                continue
            if not (np.isfinite(v[j]) and np.isfinite(v20[j]) and v20[j] > 0):
                continue
            if v[j] > p["m_sp"] * v20[j]:
                continue
            # recover within R_rec
            ok = False
            rec_i = None
            for k in range(j, min(n, j + 1 + p["R_rec"])):
                if ld_ow[k] or lu_ow[k] or susp[k]:
                    continue
                if np.isfinite(c[k]) and c[k] >= sc_low:
                    ok = True
                    rec_i = k
                    break
            if ok:
                spring_break = j
                spring_conf = rec_i
                break
        if spring_conf is None:
            i = sc_i + 1
            continue
        stg.spring += 1

        # SOS
        sos_i = None
        for j in range(spring_conf + 1, min(n, spring_conf + 1 + p["W_sos"])):
            if not (np.isfinite(c[j]) and np.isfinite(v[j]) and np.isfinite(v20[j])):
                continue
            if c[j] <= ar_top:
                continue
            if v20[j] <= 0 or v[j] < p["m_sos"] * v20[j]:
                continue
            sos_i = j
            break
        if sos_i is None:
            i = sc_i + 1
            continue
        stg.sos += 1

        # LPS
        lps_f = None
        for j in range(sos_i + 1, min(n, sos_i + 1 + p["W_lps"])):
            # look for pullback start
            if not np.isfinite(l[j]):
                continue
            if l[j] > c[sos_i] * (1.0 - p["r_pb"]):
                continue
            # pullback window from sos_i+1 to j
            pb_slice = slice(sos_i + 1, j + 1)
            pb_lows = l[pb_slice]
            pb_vols = v[pb_slice]
            if np.nanmin(pb_lows) < ar_top * (1.0 - p["h"]):
                break
            if np.nanmean(pb_vols) > (v20[sos_i] if np.isfinite(v20[sos_i]) else np.inf):
                continue
            # trigger: first close > previous high after pullback day j
            for k in range(j + 1, min(n, j + 1 + 10)):
                if not (np.isfinite(c[k]) and np.isfinite(h[k - 1])):
                    continue
                if c[k] > h[k - 1]:
                    lps_f = k
                    break
            if lps_f is not None:
                break
        if lps_f is None:
            i = sc_i + 1
            continue
        stg.lps += 1
        if collect_years:
            lps_years.append(int(str(dates[lps_f].date())[:4]))
        last_lps = lps_f
        i = lps_f + 1

    return stg, lps_years, skip_limit_vol


def load_arrays():
    import sys
    sys.path.insert(0, str(ROOT / "research-py"))
    from factorlab import store

    print("loading panel once…")
    fields = ["open", "high", "low", "close_adj", "volume", "is_suspended",
              "limit_down_oneword", "limit_up_oneword", "is_st"]
    panel = store.load_panel("cn", fields, start=START, end=END, raw=False)
    sec = store.read_securities("cn")
    list_date = {r.code: pd.Timestamp(r.list_date) for r in sec.itertuples() if pd.notna(r.list_date)}
    dates = panel["close_adj"].index
    codes = list(panel["close_adj"].columns)
    H = panel["high"].to_numpy(dtype=np.float64)
    L = panel["low"].to_numpy(dtype=np.float64)
    C = panel["close_adj"].to_numpy(dtype=np.float64)
    V = panel["volume"].to_numpy(dtype=np.float64)
    print("precomputing ATR/V20/V50/hi250…")
    n_days, n_codes = C.shape
    ATR = np.empty_like(C)
    V20 = np.empty_like(C)
    V50 = np.empty_like(C)
    HI = np.empty_like(C)
    for j in range(n_codes):
        ATR[:, j], V20[:, j], V50[:, j], HI[:, j] = _indicators(H[:, j], L[:, j], C[:, j], V[:, j])
        if (j + 1) % 1000 == 0:
            print(f"  indicators {j+1}/{n_codes}")
    return {
        "dates": dates,
        "codes": codes,
        "list_date": list_date,
        "O": panel["open"].to_numpy(dtype=np.float64),
        "H": H, "L": L, "C": C, "V": V,
        "ATR": ATR, "V20": V20, "V50": V50, "HI": HI,
        "SP": panel["is_suspended"].fillna(False).to_numpy(dtype=bool),
        "LD": panel["limit_down_oneword"].fillna(False).to_numpy(dtype=bool),
        "LU": panel["limit_up_oneword"].fillna(False).to_numpy(dtype=bool),
        "ST": panel["is_st"].fillna(False).to_numpy(dtype=bool),
    }


def _worker_chunk(args):
    """进程池 worker：扫描一段股票列。"""
    (dates, O, H, L, C, V, ATR, V20, V50, HI, SP, LD, LU, ST, list_i0s, params, collect_detail) = args
    tot = Stages()
    year_lps = Counter()
    stocks_with = 0
    skip_lim = 0
    n_codes = O.shape[1]
    for j in range(n_codes):
        stg, years, sk = scan_stock(
            dates, O[:, j], H[:, j], L[:, j], C[:, j], V[:, j],
            SP[:, j], LD[:, j], LU[:, j], ST[:, j], list_i0s[j], params,
            collect_years=collect_detail,
            atr=ATR[:, j], v20=V20[:, j], v50=V50[:, j], hi250=HI[:, j],
        )
        tot.sc += stg.sc
        tot.ar += stg.ar
        tot.st += stg.st
        tot.spring += stg.spring
        tot.sos += stg.sos
        tot.lps += stg.lps
        skip_lim += sk
        if stg.lps:
            stocks_with += 1
            for y in years:
                year_lps[y] += 1
    return asdict(tot), dict(year_lps), stocks_with, skip_lim


def run_universe(data, params, collect_detail=True, label="", n_workers=None):
    dates, codes = data["dates"], data["codes"]
    list_date = data["list_date"]
    list_i0s = []
    for code in codes:
        ld = list_date.get(code)
        list_i0s.append(0 if ld is None else int(dates.searchsorted(ld)))

    n_workers = n_workers or max(1, min(8, (os.cpu_count() or 4) - 1))
    n = len(codes)
    edges = [int(round(i * n / n_workers)) for i in range(n_workers + 1)]
    chunks = []
    for a, b in zip(edges, edges[1:]):
        if a >= b:
            continue
        chunks.append((
            dates,
            data["O"][:, a:b], data["H"][:, a:b], data["L"][:, a:b], data["C"][:, a:b], data["V"][:, a:b],
            data["ATR"][:, a:b], data["V20"][:, a:b], data["V50"][:, a:b], data["HI"][:, a:b],
            data["SP"][:, a:b], data["LD"][:, a:b], data["LU"][:, a:b], data["ST"][:, a:b],
            list_i0s[a:b], params, collect_detail,
        ))

    print(f"  [{label}] scanning {n} codes × {n_workers} workers…")
    tot = Stages()
    year_lps = Counter()
    stocks_lps = 0
    skip_lim = 0
    with ProcessPoolExecutor(max_workers=n_workers) as ex:
        futs = [ex.submit(_worker_chunk, ch) for ch in chunks]
        for fut in as_completed(futs):
            st, yl, sw, sk = fut.result()
            tot.sc += st["sc"]
            tot.ar += st["ar"]
            tot.st += st["st"]
            tot.spring += st["spring"]
            tot.sos += st["sos"]
            tot.lps += st["lps"]
            stocks_lps += sw
            skip_lim += sk
            for y, cnt in yl.items():
                year_lps[int(y)] += cnt

    return {
        "stages": asdict(tot),
        "n_stocks_with_lps": stocks_lps,
        "lps_by_year": dict(sorted(year_lps.items())),
        "skip_limit_down_volume_cases": skip_lim,
        "n_codes_scanned": len(codes),
        "n_days": len(dates),
    }


def main() -> None:
    data = load_arrays()
    base = run_universe(data, P, collect_detail=True, label="main")
    sens = {}
    for key, vals in SENS.items():
        sens[key] = {}
        for val in vals:
            if key in P and abs(float(P[key]) - float(val)) < 1e-12:
                sens[key][str(val)] = base["stages"]["lps"]
                print(f"sens {key}={val} → LPS {base['stages']['lps']} (main)")
                continue
            pp = dict(P)
            pp[key] = val
            r = run_universe(data, pp, collect_detail=False, label=f"{key}={val}")
            sens[key][str(val)] = r["stages"]["lps"]
            print(f"sens {key}={val} → LPS {r['stages']['lps']}")

    payload = {
        "definition": {"params_main": P, "sensitivity_grids": SENS, "sample": f"{START}…{END}"},
        "main": base,
        "sensitivity_lps_counts": sens,
        "notes": [
            "逐步过滤：SC→AR→ST→Spring→SOS→LPS；每步计数为该步成功次数（非互斥股票数）。",
            "排除 is_st、上市不足 250 日；一字跌停不当 SC/Spring，缩量跌停单独计数。",
            "成交量均值窗口不含当日（V20/V50 用 t-20…t-1）。",
        ],
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print("MAIN", base["stages"])
    print("wrote", OUT)


if __name__ == "__main__":
    main()
