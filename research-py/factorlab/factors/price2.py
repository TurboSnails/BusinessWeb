"""第一轮（R1）新增量价因子（docs/research/factorlab/rounds/R1-2026-11-27.md）。

口径同 price.py：窗口按「面板行 = 交易日」计；日收益不跨停牌拼接；调仓日没有价格的置空；
有效观测不足 min_periods 时为空。全部只用调仓日收盘及以前的数据。

市场收益（特质波动、贝塔用）：每个交易日对当日有日收益的全部证券取等权平均——只用当日数据，
不用未来信息；面板是哪些证券（explore 层 70% / validate 层 30%）就用哪些证券。
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..registry import factor
from .price import PRICE_FFILL, _at, _past_return, daily_returns


def market_return_ew(ret: pd.DataFrame) -> pd.Series:
    """等权市场日收益：当日有收益的证券的算术平均（当日没有任何收益时为空）。"""
    return ret.mean(axis=1, skipna=True)


def _rolling_market_regression(ret: pd.DataFrame, window: int, min_periods: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    """逐只证券对等权市场收益做滚动 OLS（r_i = a + b·m + e），只用两者同时有值的日子。

    返回（贝塔，残差标准差（自由度 n − 2））。用滚动和实现，等价于每个窗口单独回归。"""
    m = market_return_ew(ret)
    M = pd.DataFrame(np.repeat(m.to_numpy()[:, None], ret.shape[1], 1), index=ret.index, columns=ret.columns)
    ok = ret.notna() & M.notna()
    y = ret.where(ok)
    x = M.where(ok)
    roll = dict(window=window, min_periods=1)
    n = ok.astype(float).rolling(**roll).sum()
    sx = x.rolling(**roll).sum()
    sy = y.rolling(**roll).sum()
    sxx = (x * x).rolling(**roll).sum()
    sxy = (x * y).rolling(**roll).sum()
    syy = (y * y).rolling(**roll).sum()
    with np.errstate(invalid="ignore", divide="ignore"):
        vxx = sxx - sx * sx / n
        vxy = sxy - sx * sy / n
        vyy = syy - sy * sy / n
        beta = vxy / vxx
        rss = (vyy - beta * vxy).clip(lower=0)
        resid_sd = np.sqrt(rss / (n - 2))
    good = (n >= min_periods) & (vxx > 1e-14)
    return beta.where(good), resid_sd.where(good)


@factor("mom_6_1", needs=["close_adj"], lookback=127, direction=1,
        doc="6−1 月动量：close_adj[t-21] / close_adj[t-126] - 1（跳过最近一个月）")
def mom_6_1(panel, dates):
    c = panel["close_adj"]
    return _at(_past_return(c, 126, 21), dates, c)


@factor("rev_5d", needs=["close_adj"], lookback=6, direction=1,
        doc="5 日反转：-(close_adj[t] / close_adj[t-5] - 1)，已取负号，越大 = 过去一周跌得越多")
def rev_5d(panel, dates):
    c = panel["close_adj"]
    return -_at(_past_return(c, 5, 0), dates, c)


@factor("high_52w", needs=["close_adj"], lookback=252, direction=1,
        doc="52 周高点距离（George–Hwang）：close_adj[t] / 近 252 个交易日 close_adj 最高值（至少 200 个观测），"
            "越接近 1 = 越靠近高点")
def high_52w(panel, dates):
    c = panel["close_adj"]
    hi = c.rolling(252, min_periods=200).max()
    return _at(c.ffill(limit=PRICE_FFILL) / hi, dates, c)


@factor("idio_vol_60d", needs=["close_adj"], lookback=61, direction=-1,
        doc="60 日特质波动：近 60 个交易日日收益对当日等权市场收益回归的残差标准差（至少 40 个观测，不年化）")
def idio_vol_60d(panel, dates):
    c = panel["close_adj"]
    _, sd = _rolling_market_regression(daily_returns(c), 60, 40)
    return _at(sd, dates, c)


@factor("beta_252d", needs=["close_adj"], lookback=253, direction=-1,
        doc="252 日贝塔：近 252 个交易日日收益对当日等权市场收益回归的斜率（至少 150 个观测），低贝塔更好")
def beta_252d(panel, dates):
    c = panel["close_adj"]
    b, _ = _rolling_market_regression(daily_returns(c), 252, 150)
    return _at(b, dates, c)


@factor("skew_60d", needs=["close_adj"], lookback=61, direction=-1,
        doc="60 日偏度：近 60 个交易日日收益的样本偏度（至少 40 个观测）")
def skew_60d(panel, dates):
    c = panel["close_adj"]
    return _at(daily_returns(c).rolling(60, min_periods=40).skew(), dates, c)


@factor("turnover_abn", needs=["turnover", "close_adj"], lookback=250, direction=-1,
        doc="异常换手：近 20 日换手率均值 ÷ 近 250 日换手率均值（各至少 10 / 120 个观测；分母 ≤ 0 为空），"
            "近似 CH-4 的 PMO")
def turnover_abn(panel, dates):
    t = panel["turnover"]
    short = t.rolling(20, min_periods=10).mean()
    long = t.rolling(250, min_periods=120).mean()
    return _at(short / long.where(long > 0), dates, panel["close_adj"])


@factor("turnover_vol_20d", needs=["turnover", "close_adj"], lookback=20, direction=-1,
        doc="换手波动：近 20 个交易日日换手率的标准差（至少 10 个观测）")
def turnover_vol_20d(panel, dates):
    return _at(panel["turnover"].rolling(20, min_periods=10).std(), dates, panel["close_adj"])


@factor("low_price", needs=["close", "close_adj"], lookback=1, direction=-1,
        doc="低价：log(当日不复权收盘价)；当日没有价格为空，越小 = 股价越低")
def low_price(panel, dates):
    c = panel["close"].reindex(dates)
    return np.log(c.where(c > 0)).where(panel["close_adj"].reindex(dates).notna())
