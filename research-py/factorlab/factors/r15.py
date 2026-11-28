"""第十五轮（R15）价值回归（docs/research/factorlab/rounds/R15-2026-11-28.md，计划在跑之前提交）。

只用已有点时字段（fundamentals_cn 提供的 fin_* 与日线），不改任何冻结文件。
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from ..calendar import month_end_dates
from ..registry import factor
from .price import PRICE_FFILL, _at

HIST_MONTHS, HIST_MIN = 60, 36
YEAR = 252


def _hist_pct(x: pd.DataFrame, dates) -> pd.DataFrame:
    """调仓日 d 的值在自身过去 60 个月末（严格早于 d 的月末）取值中的百分位（≤ 当前值的比例），至少 36 个。"""
    idx = x.index
    mends = month_end_dates(idx, drop_incomplete_last=False)
    hist = x.reindex(mends)
    dates = pd.DatetimeIndex(dates)
    out = pd.DataFrame(np.nan, index=dates, columns=x.columns)
    H = hist.to_numpy(float)
    for d in dates:
        if d not in idx:
            continue
        j = mends.searchsorted(d, side="left")             # 严格早于 d 的月末个数
        lo = max(0, j - HIST_MONTHS)
        h = H[lo:j]
        cur = x.loc[d].to_numpy(float)
        n = np.isfinite(h).sum(0)
        with np.errstate(invalid="ignore"):
            le = (h <= cur[None, :]).sum(0)
        pct = np.where((n >= HIST_MIN) & np.isfinite(cur), le / np.maximum(n, 1), np.nan)
        out.loc[d] = pct
    return out


def _ep(panel):
    m = panel["fin_mcap"]
    return panel["fin_ni_ttm"] / m.where(m > 0)


def _bp(panel):
    m, be = panel["fin_mcap"], panel["fin_be"]
    return (be.where(be > 0)) / m.where(m > 0)


@factor("cn_ep_hist_pct", needs=["fin_ni_ttm", "fin_mcap", "close_adj"], lookback=HIST_MONTHS * 21 + 30, markets=("cn",),
        direction=1, doc="R15 V1 盈利收益率相对自身历史：当前 EP 在自身过去 60 个月末 EP 中的百分位（至少 36 个），越高 = 相对自己越便宜")
def cn_ep_hist_pct(panel, dates):
    return _at(_hist_pct(_ep(panel), dates), dates, panel["close_adj"])


@factor("cn_bp_hist_pct", needs=["fin_be", "fin_mcap", "close_adj"], lookback=HIST_MONTHS * 21 + 30, markets=("cn",),
        direction=1, doc="R15 V2 账面市值比相对自身历史：当前 BP 在自身过去 60 个月末 BP 中的百分位（权益 ≤ 0 为空）")
def cn_bp_hist_pct(panel, dates):
    return _at(_hist_pct(_bp(panel), dates), dates, panel["close_adj"])


def _fscore8(panel) -> pd.DataFrame:
    """Piotroski F 分的 8 项（缺负债、流动比率）：ROE>0、CFO>0、ΔROE>0、CFO>净利润、ΔGPA>0、Δ毛利率>0、Δ资产周转>0、
    总股本一年内没有增加（≤ 1.01 倍）。财报字段由提供方按月末给出，所以在月末面板上计算，Δ = 当月末已知值减 12 个月前月末已知值；
    任一项缺失时该项记 0，有效项 < 6 为空。（2026-11-28 修正：初版误用 252 行作为一年，月末面板上即 252 个月，导致全空。）"""
    roe, gpa = panel["fin_roe"], panel["fin_gpa"]
    idx = roe.index
    ni, cfo = panel["fin_ni_ttm"].reindex(idx), panel["fin_cfo_ttm"].reindex(idx)
    gp, rev = panel["fin_gp_ttm"].reindex(idx), panel["fin_rev_ttm"].reindex(idx)
    gpa = gpa.reindex(idx)
    sh = panel["total_shares"].ffill().reindex(idx)
    with np.errstate(invalid="ignore", divide="ignore"):
        gm = gp / rev.where(rev > 0)
        assets = gp / gpa.where(gpa != 0)
        at = rev / assets.where(assets > 0)
    lag = lambda x: x.shift(12)
    items = [roe > 0, cfo > 0, roe > lag(roe), cfo > ni, gpa > lag(gpa), gm > lag(gm), at > lag(at), sh <= lag(sh) * 1.01]
    valid = [roe.notna(), cfo.notna(), roe.notna() & lag(roe).notna(), cfo.notna() & ni.notna(),
             gpa.notna() & lag(gpa).notna(), gm.notna() & lag(gm).notna(), at.notna() & lag(at).notna(),
             sh.notna() & lag(sh).notna()]
    score = sum((i & v).astype(float) for i, v in zip(items, valid))
    nvalid = sum(v.astype(float) for v in valid)
    return score.where(nvalid >= 6)


@factor("cn_fscore_cheap", needs=["fin_roe", "fin_gpa", "fin_ni_ttm", "fin_cfo_ttm", "fin_gp_ttm", "fin_rev_ttm",
                                   "fin_be", "fin_mcap", "total_shares", "close_adj"],
        lookback=YEAR + 60, markets=("cn",), direction=1,
        doc="R15 V3 便宜 + 基本面改善（Piotroski 2000）：仅在当日 BP 位于截面前 40% 的股票里给分，分数 = F8 + BP 截面百分位（作同分排序）；其余为空")
def cn_fscore_cheap(panel, dates):
    dates = pd.DatetimeIndex(dates)
    f = _fscore8(panel).reindex(dates)
    bp = _bp(panel).reindex(dates).where(panel["close_adj"].reindex(dates).notna())   # 非月末调仓日为空（财报字段只有月末值）
    pct = bp.rank(axis=1, pct=True)
    return (f + pct).where(pct > 0.6)


@factor("ltrev_60_13", needs=["close_adj"], lookback=1261, direction=-1,
        doc="R15 V4 长期反转（De Bondt–Thaler 1985）：t−1260 至 t−252 交易日的累计收益，越低越好")
def ltrev_60_13(panel, dates):
    c = panel["close_adj"].ffill(limit=PRICE_FFILL)
    return _at(c.shift(YEAR) / c.shift(1260) - 1, dates, panel["close_adj"])
