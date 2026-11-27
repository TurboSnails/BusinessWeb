"""第十一轮（R11）量价因子：残差动量、行业动量、同月季节性（docs/research/factorlab/rounds/R11-2026-11-28.md，计划在跑之前提交）。

只用日线面板，不碰任何 L-038 / L-043 / L-045 冻结文件。
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..registry import factor
from .price import PRICE_FFILL, _at, _past_return, daily_returns
from .price2 import market_return_ew

RES_FAR, RES_NEAR, RES_MIN = 252, 21, 150
SEASON_YEARS, SEASON_MIN = 5, 3
IND_MIN = 5


def _residual_momentum(close_adj: pd.DataFrame, dates) -> pd.DataFrame:
    """Blitz–Huij–Martens（2011）：调仓日 t 前第 252 至第 22 个交易日（共 231 天）的日收益，对同期等权市场日收益 OLS，
    残差之和 ÷ 残差标准差（ddof = 2）。两者同时有值的天数 < 150 为空。"""
    ret = daily_returns(close_adj)
    m = market_return_ew(ret)
    idx = ret.index
    out = pd.DataFrame(np.nan, index=pd.DatetimeIndex(dates), columns=ret.columns)
    R = ret.to_numpy(float)
    M = m.to_numpy(float)
    for d in out.index:
        i = idx.searchsorted(d, side="right") - 1          # 调仓日（或之前最近交易日）的位置
        if i < 0 or idx[i] != d:
            continue
        lo, hi = i - RES_FAR + 1, i - RES_NEAR + 1         # 窗口 [i-251, i-21]，不含最近 21 天
        if lo < 0:
            continue
        y = R[lo:hi]
        x = np.repeat(M[lo:hi, None], y.shape[1], 1)
        ok = np.isfinite(y) & np.isfinite(x)
        n = ok.sum(0)
        yv, xv = np.where(ok, y, 0.0), np.where(ok, x, 0.0)
        with np.errstate(invalid="ignore", divide="ignore"):
            mx, my = xv.sum(0) / n, yv.sum(0) / n
            dx, dy = np.where(ok, x - mx, 0.0), np.where(ok, y - my, 0.0)
            b = (dx * dy).sum(0) / (dx * dx).sum(0)
            e = np.where(ok, dy - b * dx, 0.0)          # 含截距 OLS 的残差，用于标准差
            sd = np.sqrt((e * e).sum(0) / (n - 2))
            # 含截距 OLS 的残差之和恒为 0，所以分子用不扣截距的 r − β·m（即截距 × n 加残差和，衡量剔除市场后的累计超额）
            score = np.where(ok, y - b * x, 0.0).sum(0) / sd
        score[(n < RES_MIN) | ~np.isfinite(score)] = np.nan
        out.loc[d] = score
    return out


@factor("resmom_12_1", needs=["close_adj"], lookback=RES_FAR + 1, direction=1,
        doc="R11 残差动量（Blitz–Huij–Martens 2011）：t−251 至 t−21 交易日日收益对等权市场回归，(Σ(r − β·m)) ÷ 残差标准差")
def resmom_12_1(panel, dates):
    c = panel["close_adj"]
    return _at(_residual_momentum(c, dates), dates, c)


@factor("cn_ind_mom", needs=["close_adj", "industry"], lookback=253, markets=("cn",), direction=1,
        doc="R11 行业动量（Moskowitz–Grinblatt 1999）：调仓日所属点时行业内，各股 12−1 月收益的等权平均（成员 ≥ 5），赋给行业内每只股票")
def cn_ind_mom(panel, dates):
    c = panel["close_adj"]
    mom = _at(_past_return(c, 252, 21), dates, c)
    ind = panel["industry"].reindex(index=pd.DatetimeIndex(dates), columns=c.columns)
    out = pd.DataFrame(np.nan, index=mom.index, columns=mom.columns)
    for d in mom.index:
        s, g = mom.loc[d], ind.loc[d]
        ok = s.notna() & g.notna()
        if not ok.any():
            continue
        grp = s[ok].groupby(g[ok])
        mean, cnt = grp.transform("mean"), grp.transform("count")
        out.loc[d, mean.index] = mean.where(cnt >= IND_MIN)
    return out.where(c.reindex(mom.index).notna())


def _monthly_close(close_adj: pd.DataFrame) -> pd.DataFrame:
    p = close_adj.ffill(limit=PRICE_FFILL)
    return p.groupby(p.index.to_period("M")).last()


@factor("season_hs", needs=["close_adj"], lookback=SEASON_YEARS * 252 + 30, direction=1,
        doc="R11 同月季节性（Heston–Sadka 2008）：持有月 m+1 的分数 = 过去 5 年同一日历月（m+1−12k，k=1…5）月收益的平均，至少 3 个有值")
def season_hs(panel, dates):
    c = panel["close_adj"]
    mc = _monthly_close(c)
    mret = mc / mc.shift(1) - 1                       # 月 X 的收益（月末对上月末）
    out = pd.DataFrame(np.nan, index=pd.DatetimeIndex(dates), columns=c.columns)
    for d in out.index:
        hold = pd.Period(d, "M") + 1
        rows = [hold - 12 * k for k in range(1, SEASON_YEARS + 1)]
        sub = mret.reindex(rows)
        cnt = sub.notna().sum()
        out.loc[d] = sub.mean().where(cnt >= SEASON_MIN)
    return _at(out, dates, c)
