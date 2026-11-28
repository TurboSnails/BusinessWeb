"""第十三轮（R13）技术形态：趋势突破与高点回落（docs/research/factorlab/rounds/R13-2026-11-28.md，计划在跑之前提交）。

全部只用日线（复权收盘 close_adj、成交量 volume），按月末调仓评估。价格先前向填充最多 10 个交易日（停牌）。
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..registry import factor
from .composite import _prep, combine
from .price import PRICE_FFILL, _at


def _c(panel):
    return panel["close_adj"].ffill(limit=PRICE_FFILL)


def _breakout_margin(c):
    """收盘价相对「前一年高点」（t−260 至 t−21 交易日的最高收盘，至少 200 个观测）的幅度：> 0 即已突破。"""
    prior_high = c.shift(21).rolling(240, min_periods=200).max()
    return c / prior_high - 1


def _dd60(c):
    """距 60 日最高收盘的回落幅度（≥ 0）。"""
    return 1 - c / c.rolling(60, min_periods=40).max()


# ---------------------------------------------------------------- 趋势突破
@factor("brk_250", needs=["close_adj"], lookback=262, direction=1,
        doc="R13 B1 年线突破幅度：close / 前一年（t−260 至 t−21）最高收盘 − 1，越大越强")
def brk_250(panel, dates):
    c = _c(panel)
    return _at(_breakout_margin(c), dates, panel["close_adj"])


@factor("brk_250_vol", needs=["close_adj", "volume"], lookback=262, direction=1,
        doc="R13 B2 放量突破：zscore(年线突破幅度) 与 zscore(log(近 20 日均量 / 之前 120 日均量)) 等权（两个都要有值）")
def brk_250_vol(panel, dates):
    c = _c(panel)
    v = panel["volume"].where(panel["volume"] > 0)
    vr = np.log(v.rolling(20, min_periods=15).mean() / v.shift(20).rolling(120, min_periods=80).mean())
    dates = pd.DatetimeIndex(dates)
    alive = panel["close_adj"].reindex(dates).notna()
    a = _prep(_breakout_margin(c).reindex(dates).where(alive))
    b = _prep(vr.reindex(dates).where(alive))
    return combine([a, b], 2)


@factor("donchian_60", needs=["close_adj"], lookback=61, direction=1,
        doc="R13 B3 60 日通道位置：(close − 60 日最低) / (60 日最高 − 60 日最低)，1 = 正在创 60 日新高")
def donchian_60(panel, dates):
    c = _c(panel)
    hi, lo = c.rolling(60, min_periods=40).max(), c.rolling(60, min_periods=40).min()
    with np.errstate(invalid="ignore", divide="ignore"):
        pos = (c - lo) / (hi - lo)
    return _at(pos.where(hi > lo), dates, panel["close_adj"])


# ---------------------------------------------------------------- 高点回落
@factor("uptrend_pullback", needs=["close_adj"], lookback=271, direction=1,
        doc="R13 P1 上升趋势中的回调：仅当 close > 250 日均线且 250 日均线高于 20 日前时，取距 60 日高点的回落幅度（越深越大）；否则为空")
def uptrend_pullback(panel, dates):
    c = _c(panel)
    ma = c.rolling(250, min_periods=200).mean()
    up = (c > ma) & (ma > ma.shift(20))
    return _at(_dd60(c).where(up), dates, panel["close_adj"])


@factor("dd_60", needs=["close_adj"], lookback=61, direction=1,
        doc="R13 P2 距 60 日高点回落幅度（不加趋势条件），越深越大")
def dd_60(panel, dates):
    c = _c(panel)
    return _at(_dd60(c), dates, panel["close_adj"])


@factor("peak_fall", needs=["close_adj"], lookback=262, direction=1,
        doc="R13 P3 冲高回落：近 60 日内创过 250 日新高（60 日最高 = 250 日最高）且已从该高点回落 ≥ 10% 的，取回落幅度；否则为空")
def peak_fall(panel, dates):
    c = _c(panel)
    p60 = c.rolling(60, min_periods=40).max()
    p250 = c.rolling(250, min_periods=200).max()
    dd = 1 - c / p60
    cond = (p60 >= p250 * (1 - 1e-12)) & (dd >= 0.10)
    return _at(dd.where(cond), dates, panel["close_adj"])
