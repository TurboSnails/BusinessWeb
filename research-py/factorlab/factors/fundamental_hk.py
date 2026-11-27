"""港股基本面因子（R7：docs/research/factorlab/rounds/R7-2026-11-27.md；字段由 fundamentals_hk 经 data.load_market
提供，行 = 月末交易日）。

口径见 factorlab/fundamentals_hk.py：只用年报与中报；每个月末 d 只用 avail_date ≤ d 的财报；所用报告期末早于 d
超过 300 天即为空；hkf_mcap = 隐含股本（归母净利润 ÷ 基本每股收益，按复权因子跳变调整拆合股）× 当日不复权收盘；
估值类分子按 fx_hkd 折成港元，比率类不折算。方向为 R7 计划事先写定的。因子名加 hk_ 前缀（注册表按名字全局唯一）。
"""

from __future__ import annotations

import pandas as pd

from ..registry import factor

HK = ("hk",)


def _pos(x: pd.DataFrame) -> pd.DataFrame:
    return x.where(x > 0)


@factor("hk_ep_ttm", needs=["hkf_ni_ttm", "hkf_mcap"], lookback=1, markets=HK, direction=1,
        doc="盈利收益率：归母净利润 TTM（港元）/ 隐含股本总市值（Basu 1977）")
def hk_ep_ttm(panel, dates):
    return (panel["hkf_ni_ttm"] / _pos(panel["hkf_mcap"])).reindex(dates)


@factor("hk_bp", needs=["hkf_be", "hkf_mcap"], lookback=1, markets=HK, direction=1,
        doc="账面市值比：最新归母权益（港元，≤ 0 为空）/ 隐含股本总市值（Fama–French 1992）")
def hk_bp(panel, dates):
    return (_pos(panel["hkf_be"]) / _pos(panel["hkf_mcap"])).reindex(dates)


@factor("hk_roe_ttm", needs=["hkf_roe"], lookback=1, markets=HK, direction=1,
        doc="ROE：归母净利润 TTM / 平均归母权益（TTM 期末与 12 个月前），两端 ≤ 0 为空（Haugen–Baker 1996）")
def hk_roe_ttm(panel, dates):
    return panel["hkf_roe"].reindex(dates)


@factor("hk_gpa_ttm", needs=["hkf_gpa"], lookback=1, markets=HK, direction=1,
        doc="毛利 / 总资产：毛利 TTM / 同期末总资产；银行、保险为空（Novy-Marx 2013）")
def hk_gpa_ttm(panel, dates):
    return panel["hkf_gpa"].reindex(dates)


@factor("hk_asset_growth", needs=["hkf_asset_growth"], lookback=1, markets=HK, direction=-1,
        doc="资产增长：最新期末总资产 / 12 个月前期末总资产 − 1（Cooper–Gulen–Schill 2008）")
def hk_asset_growth(panel, dates):
    return panel["hkf_asset_growth"].reindex(dates)


@factor("hk_sue_h", needs=["hkf_sue"], lookback=1, markets=HK, direction=1,
        doc="半年度盈余惊喜：单半年归母净利润同比差 / 最近 6 个同比差的标准差（Bernard–Thomas 1989）")
def hk_sue_h(panel, dates):
    return panel["hkf_sue"].reindex(dates)
