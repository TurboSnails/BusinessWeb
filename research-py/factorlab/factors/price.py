"""经典量价因子。全部只用调仓日收盘及以前的数据；窗口按「面板行 = 交易日」计。

共同口径：
- 日收益 r_t = close_adj_t / close_adj_{t-1} - 1（停牌日无价格 → 当日与复牌日收益为空，不跨停牌拼接）。
- 价格水平类（动量、反转）用 close_adj 向前填充至多 PRICE_FFILL 个交易日，容忍短暂停牌；
  当日没有价格的仍为空（由股票池剔除）。
- 窗口内有效观测不足 min_periods 时为空。
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..registry import factor

PRICE_FFILL = 10


def daily_returns(close_adj: pd.DataFrame) -> pd.DataFrame:
    return close_adj / close_adj.shift(1) - 1


def _at(df: pd.DataFrame, dates, close_adj: pd.DataFrame) -> pd.DataFrame:
    """取调仓日的值，并把当日没有价格的置空。"""
    return df.reindex(dates).where(close_adj.reindex(dates).notna())


def _past_return(close_adj: pd.DataFrame, far: int, near: int) -> pd.DataFrame:
    p = close_adj.ffill(limit=PRICE_FFILL)
    return p.shift(near) / p.shift(far) - 1


@factor("mom_12_1", needs=["close_adj"], lookback=253, direction=1,
        doc="12−1 月动量：close_adj[t-21] / close_adj[t-252] - 1（跳过最近一个月）")
def mom_12_1(panel, dates):
    c = panel["close_adj"]
    return _at(_past_return(c, 252, 21), dates, c)


@factor("rev_1m", needs=["close_adj"], lookback=22, direction=1,
        doc="1 月反转：-(close_adj[t] / close_adj[t-21] - 1)，已取负号，越大 = 过去一个月跌得越多")
def rev_1m(panel, dates):
    c = panel["close_adj"]
    return -_at(_past_return(c, 21, 0), dates, c)


@factor("vol_60d", needs=["close_adj"], lookback=61, direction=-1,
        doc="60 日波动：近 60 个交易日日收益的标准差（至少 40 个观测，不年化）")
def vol_60d(panel, dates):
    c = panel["close_adj"]
    return _at(daily_returns(c).rolling(60, min_periods=40).std(), dates, c)


@factor("size", needs=["mcap_float"], lookback=1, direction=-1,
        doc="规模：log(当日流通市值)；流通市值缺失即为空，不用其他字段代替")
def size(panel, dates):
    m = panel["mcap_float"].reindex(dates)
    return np.log(m.where(m > 0))


@factor("turnover_20d", needs=["turnover", "close_adj"], lookback=20, direction=-1,
        doc="20 日换手：近 20 个交易日换手率均值（至少 10 个观测）")
def turnover_20d(panel, dates):
    return _at(panel["turnover"].rolling(20, min_periods=10).mean(), dates, panel["close_adj"])


@factor("amihud_20d", needs=["close_adj", "amount"], lookback=21, direction=1,
        doc="Amihud 非流动性：近 20 个交易日 |日收益| / 成交额 的均值 × 1e6（成交额 ≤ 0 的日子不计）")
def amihud_20d(panel, dates):
    c, a = panel["close_adj"], panel["amount"]
    illiq = daily_returns(c).abs() / a.where(a > 0) * 1e6
    return _at(illiq.rolling(20, min_periods=10).mean(), dates, c)


@factor("max_ret_21d", needs=["close_adj"], lookback=22, direction=-1,
        doc="最大日收益：近 21 个交易日的最大日收益（至少 15 个观测）")
def max_ret_21d(panel, dates):
    c = panel["close_adj"]
    return _at(daily_returns(c).rolling(21, min_periods=15).max(), dates, c)
