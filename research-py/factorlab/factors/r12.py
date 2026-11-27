"""第十二轮（R12）A 股股息率（docs/research/factorlab/rounds/R12-2026-11-28.md，计划在跑之前提交）。

只用日线面板（close、ref_close、total_shares），不碰 L-038 / L-043 / L-045 冻结文件。
除息日 e：ref_close[e] < close[e−1]（相对差 > 1e-4）。每股现金分红 = close[e−1] − ref_close[e]，但以下情况不算现金分红（记 0）：
  - 同期股本变动：调仓日 d 已知的总股本 total_shares[d] ÷ total_shares[e−1] > 1.05（送转、配股、增发）；
  - 单次推算股息率 (close[e−1] − ref_close[e]) / close[e−1] > 15%。
股息率 = 调仓日前 252 个交易日（含当日）内现金分红之和 ÷ close[d]（不复权）。期间没有除息的 = 0（不是空值）；
当日没有收盘价的为空。总股本缺失时只用 15% 规则。
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..registry import factor

WINDOW = 252
SHARE_JUMP = 1.05
MAX_EVENT_YIELD = 0.15
REL_TOL = 1e-4


@factor("cn_dy_ttm", needs=["close", "ref_close", "total_shares"], lookback=WINDOW + 2, markets=("cn",), direction=1,
        doc="R12 股息率 TTM：近 252 个交易日除息推算的每股现金分红之和 ÷ 当日收盘（送转 / 配股 / 增发与单次 > 15% 的除权不计）")
def cn_dy_ttm(panel, dates):
    close = panel["close"]
    ref = panel["ref_close"].reindex_like(close)
    shares = panel["total_shares"].reindex_like(close)
    prev = close.shift(1)
    with np.errstate(invalid="ignore", divide="ignore"):
        cash = (prev - ref)
        ev = (ref < prev * (1 - REL_TOL)) & prev.notna() & ref.notna()
        ev_yield = cash / prev
        cash = cash.where(ev & (ev_yield <= MAX_EVENT_YIELD), 0.0)
    shares_before = shares.shift(1)
    dates = pd.DatetimeIndex(dates)
    idx = close.index
    out = pd.DataFrame(np.nan, index=dates, columns=close.columns)
    C, S0, S = cash.to_numpy(float), shares_before.to_numpy(float), shares.ffill().to_numpy(float)
    P = close.to_numpy(float)
    for d in dates:
        i = idx.searchsorted(d, side="right") - 1
        if i < 0 or idx[i] != d:
            continue
        lo = max(0, i - WINDOW + 1)
        c = C[lo:i + 1].copy()
        with np.errstate(invalid="ignore", divide="ignore"):
            jump = S[i][None, :] / S0[lo:i + 1] > SHARE_JUMP
        c[jump & (c > 0)] = 0.0
        tot = np.nansum(c, axis=0)
        with np.errstate(invalid="ignore", divide="ignore"):
            out.loc[d] = np.where(np.isfinite(P[i]) & (P[i] > 0), tot / P[i], np.nan)
    return out
