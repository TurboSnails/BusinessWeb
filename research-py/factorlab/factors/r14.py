"""第十四轮（R14）中国趋势因子（Liu–Zhou–Zhu 2024, Review of Asset Pricing Studies 14(2)），
计划 docs/research/factorlab/rounds/R14-2026-11-28.md（跑之前提交）。

按论文：
- 价格均线 MP_L = 近 L 日复权收盘均值 ÷ 当日复权收盘；成交额均线 MV_L = 近 L 日成交额（元）均值 ÷ 当日成交额；
  L ∈ {3, 5, 10, 20, 50, 100, 200, 300, 400}；停牌日价格沿用停牌前收盘（前向填充）。
- 每个月末 t：用月 t 的个股收益（月末复权收盘之比）对月 t−1 月末的 18 个信号做截面 OLS（含截距），得 β_t。
  样本只用月 t−1 末流通市值不在最小 30% 的股票（LSY 口径）；各信号截面 1% / 99% 缩尾（实现细节，计划里写明）。
- 系数预测 E_t = (1 − λ)E_{t−1} + λβ_t，λ = 0.02；第一个可得的 β 作为初值。
- 分数（预期收益）= Σ E · 信号（不含截距；截距对截面排序无影响）。调仓日 d（月、周或日）的分数 = 用 d 当日的信号 × 截至 d 已知的最新 E
  （E 只用月末已经实现的收益，所以周 / 日调仓不会前视）。
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..registry import factor
from ..calendar import month_end_dates
from .price import PRICE_FFILL

LAGS = (3, 5, 10, 20, 50, 100, 200, 300, 400)
LAMBDA = 0.02
WINSOR = 0.01
SMALL_DROP = 0.30
MIN_STOCKS = 100


def _signals(close: pd.DataFrame, amount: pd.DataFrame) -> dict[str, pd.DataFrame]:
    c = close.ffill()
    a = amount.where(amount > 0)
    out = {}
    for L in LAGS:
        out[f"P{L}"] = c.rolling(L, min_periods=L).mean() / c
        out[f"V{L}"] = a.rolling(L, min_periods=max(1, L // 2 + 1)).mean() / a
    return out


def _winsor(x: np.ndarray) -> np.ndarray:
    lo, hi = np.nanquantile(x, [WINSOR, 1 - WINSOR])
    return np.clip(x, lo, hi)


def _trend_scores(close: pd.DataFrame, amount: pd.DataFrame, mcap: pd.DataFrame | None, dates) -> pd.DataFrame:
    sig = _signals(close, amount)
    names = list(sig)
    idx = close.index
    mends = month_end_dates(idx)                           # 只用已经结束的月份（数据截在月中时不把半个月当一个月）
    cm = close.ffill(limit=PRICE_FFILL).reindex(mends)
    ret = cm / cm.shift(1) - 1                             # 月 t 收益，索引为月 t 的月末
    E, known = None, {}                                    # known[月末] = 该月末已知的系数预测
    for k in range(1, len(mends)):
        t0, t1 = mends[k - 1], mends[k]
        X = np.column_stack([sig[n].loc[t0].to_numpy(float) for n in names])
        y = ret.loc[t1].to_numpy(float)
        ok = np.isfinite(X).all(1) & np.isfinite(y)
        if mcap is not None:
            m = mcap.reindex(index=[t0]).iloc[0].to_numpy(float)
            okm = ok & np.isfinite(m) & (m > 0)
            if okm.sum() >= MIN_STOCKS:
                cut = np.nanquantile(m[okm], SMALL_DROP)
                ok = okm & (m > cut)
        if ok.sum() >= MIN_STOCKS:
            Xo = np.column_stack([_winsor(X[ok, j]) for j in range(X.shape[1])])
            A = np.column_stack([np.ones(ok.sum()), Xo])
            beta = np.linalg.lstsq(A, y[ok], rcond=None)[0][1:]
            E = beta if E is None else (1 - LAMBDA) * E + LAMBDA * beta
        if E is not None:
            known[t1] = E.copy()
    dates = pd.DatetimeIndex(dates)
    out = pd.DataFrame(np.nan, index=dates, columns=close.columns)
    kd = pd.DatetimeIndex(sorted(known))
    for d in dates:
        j = kd.searchsorted(d, side="right") - 1
        if j < 0 or d not in idx:
            continue
        Ed = known[kd[j]]
        X = np.column_stack([sig[n].loc[d].to_numpy(float) for n in names])
        out.loc[d] = X @ Ed
    return out.where(close.reindex(dates).notna())


@factor("cn_trend", needs=["close_adj", "amount", "mcap_float"], lookback=420, markets=("cn",), direction=1,
        doc="R14 中国趋势因子（Liu–Zhou–Zhu 2024）：9 个价格均线与 9 个成交额均线（3–400 日），月度截面回归系数的 EMA（λ=0.02）预测的预期收益")
def cn_trend(panel, dates):
    return _trend_scores(panel["close_adj"], panel["amount"], panel.get("mcap_float"), dates)
