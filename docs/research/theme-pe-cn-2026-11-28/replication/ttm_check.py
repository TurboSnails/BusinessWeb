#!/usr/bin/env python3
"""边界清单「fin_ni_ttm」独立核对：从 fin_pit 原始长表自算严格 TTM（PREREG 括注：最近一期累计 + 上年年报 −
上年同期；缺任一项则无；陈旧 > 456 天则无），与 fundamentals_cn.fin_ni_ttm 逐格比较。

只读 avail_date < 2023-11-01 的行（锁箱起点）。输出 replication/ttm-check.json。
用法：cd research-py && uv run python ../docs/research/theme-pe-cn-2026-11-28/replication/ttm_check.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import signals as S  # noqa: E402
from factorlab import fundamentals_cn as fc  # noqa: E402
from factorlab import store  # noqa: E402


def strict_ttm(fin: pd.DataFrame, dates: pd.DatetimeIndex, codes: pd.Index) -> pd.DataFrame:
    f = fin[fin["item"] == "net_income_parent"].copy()
    rp = pd.to_datetime(f["report_period"])
    f = f[rp.dt.is_quarter_end & f["value"].notna()]
    f["q"] = pd.to_datetime(f["report_period"]).dt.year * 4 + (pd.to_datetime(f["report_period"]).dt.month - 1) // 3
    f = f.sort_values("avail_date", kind="stable")
    out = pd.DataFrame(np.nan, index=dates, columns=codes)
    cpos = {c: i for i, c in enumerate(codes)}
    arr = out.to_numpy()
    for t, d in enumerate(dates):
        g = f[f["avail_date"] <= d]
        g = g.drop_duplicates(["code", "q"], keep="last")          # 当时最新版本
        dq = d.year * 4 + (d.month - 1) // 3
        g = g[(g["q"] >= dq - 12) & (g["q"] <= dq)]
        val = dict(zip(zip(g["code"], g["q"]), g["value"]))
        latest = g.groupby("code")["q"].max()
        for c, P in latest.items():
            if c not in cpos:
                continue
            qend = pd.Period(year=P // 4, quarter=P % 4 + 1, freq="Q").end_time.normalize()
            if (d - qend).days > fc.STALE_DAYS:
                continue
            ytd = val[(c, P)]
            if P % 4 == 3:
                v = ytd
            else:
                fy = val.get((c, P - P % 4 - 1))
                sp = val.get((c, P - 4))
                if fy is None or sp is None:
                    continue
                v = ytd + fy - sp
            arr[t, cpos[c]] = v
    return pd.DataFrame(arr, index=dates, columns=codes)


def main():
    cut = store.lockbox_start("cn")
    close = store.load_panel("cn", ["close"], start=S.WARM_START, end=S.END)["close"]
    dates = fc.month_rows(close.index)
    dates = dates[dates >= pd.Timestamp("2005-01-01")]
    codes = close.columns
    fin = fc.guard_fin(fc.read_fin(codes), cut, None)
    mine = strict_ttm(fin, dates, pd.Index([str(c) for c in codes]))
    core = fc.core_cached(cut, None, fc.month_rows(close.index), codes)["ni_ttm"].reindex(index=dates)
    core.columns = [str(c) for c in core.columns]
    A, B = mine.to_numpy(), core.reindex(columns=mine.columns).to_numpy()
    both = np.isfinite(A) & np.isfinite(B)
    rel = np.abs(A[both] - B[both]) / np.maximum(1.0, np.abs(B[both]))
    res = {
        "cells_monthEnds": int(A.size), "months": int(len(dates)),
        "bothFinite": int(both.sum()),
        "bothFinite_maxRelDiff": float(rel.max()) if rel.size else None,
        "bothFinite_nRelDiffGt1e-9": int((rel > 1e-9).sum()),
        "onlyFundamentalsCn(fallbackToLastAnnual)": int((~np.isfinite(A) & np.isfinite(B)).sum()),
        "onlyStrict": int((np.isfinite(A) & ~np.isfinite(B)).sum()),
        "byYear_onlyFundamentalsCn": {str(y): int(((~np.isfinite(A) & np.isfinite(B))[dates.year == y]).sum())
                                      for y in sorted(set(dates.year))},
    }
    # 严格 TTM 代入信号层：持仓是否改变
    d = S.load()
    ind = S.industry_series(d)
    sig0 = S.build_signals(d, ind)
    base = {"C1a": S.run_persistent(sig0), "C1b": S.run_monthly(sig0, sig0.rank_b),
            "B2p": S.run_persistent(sig0, rule=S.Rule("none")), "B4": S.run_monthly(sig0, sig0.rank_a)}
    d.NI = mine.reindex(index=d.month_ends).set_axis(d.codes, axis=1) if list(map(str, d.codes)) == list(mine.columns) else None
    sig1 = S.build_signals(d, ind)
    alt = {"C1a": S.run_persistent(sig1), "C1b": S.run_monthly(sig1, sig1.rank_b),
           "B2p": S.run_persistent(sig1, rule=S.Rule("none")), "B4": S.run_monthly(sig1, sig1.rank_a)}
    res["strictTtmHoldingDiffMonths"] = {}
    for k in base:
        dm = [str(m.date()) for m in sig0.mes if set(base[k][m][0]) != set(alt[k][m][0])]
        res["strictTtmHoldingDiffMonths"][k] = {"n": len(dm),
                                                "nValidate": sum(1 for x in dm if x >= "2015-01-01"),
                                                "months": dm}
    (HERE / "ttm-check.json").write_text(json.dumps(res, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps(res, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
