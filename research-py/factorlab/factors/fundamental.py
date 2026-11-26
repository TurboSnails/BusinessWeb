"""美股基本面因子（SEC 点时财报；字段由 fundamentals_us 经 data.load_market 提供，行 = 月末交易日）。

字段口径见 factorlab/fundamentals_us.py：每个月末 d 的值只用生效日 ≤ d 的申报，所用期末日早于 d 超过
15 个月即为空；mcap_total = 拆股调整后股本 × d 日不复权收盘。分母 ≤ 0 的比值一律为空（账面权益 ≤ 0 时
账面市值比、ROE 为空）。方向为 R1 计划（docs/research/factorlab/rounds/R1-2026-11-27.md）事先写定的。
"""

from __future__ import annotations

import pandas as pd

from ..registry import factor

US = ("us",)


def _pos(x: pd.DataFrame) -> pd.DataFrame:
    return x.where(x > 0)


@factor("bm", needs=["fund_be", "mcap_total"], lookback=1, markets=US, direction=1,
        doc="账面市值比：最新股东权益 / 当日市值；权益 ≤ 0 为空（Fama–French 1992）")
def bm(panel, dates):
    return (_pos(panel["fund_be"]) / _pos(panel["mcap_total"])).reindex(dates)


@factor("ep_ttm", needs=["fund_ni_ttm", "mcap_total"], lookback=1, markets=US, direction=1,
        doc="盈利收益率：最近 12 个月净利润 / 当日市值（Basu 1977）")
def ep_ttm(panel, dates):
    return (panel["fund_ni_ttm"] / _pos(panel["mcap_total"])).reindex(dates)


@factor("cfp_ttm", needs=["fund_cfo_ttm", "mcap_total"], lookback=1, markets=US, direction=1,
        doc="经营现金流收益率：最近 12 个月经营现金流 / 当日市值（Lakonishok–Shleifer–Vishny 1994）")
def cfp_ttm(panel, dates):
    return (panel["fund_cfo_ttm"] / _pos(panel["mcap_total"])).reindex(dates)


@factor("roe", needs=["fund_ni_ttm", "fund_be"], lookback=1, markets=US, direction=1,
        doc="ROE：最近 12 个月净利润 / 最新股东权益；权益 ≤ 0 为空（Haugen–Baker 1996、Hou–Xue–Zhang 2015）")
def roe(panel, dates):
    return (panel["fund_ni_ttm"] / _pos(panel["fund_be"])).reindex(dates)


@factor("gpa", needs=["fund_gp_ttm", "fund_assets"], lookback=1, markets=US, direction=1,
        doc="毛利 / 总资产：最近 12 个月毛利 / 最新总资产（Novy-Marx 2013）；只用 GrossProfit 科目，覆盖率约一半")
def gpa(panel, dates):
    return (panel["fund_gp_ttm"] / _pos(panel["fund_assets"])).reindex(dates)


@factor("asset_growth", needs=["fund_assets", "fund_assets_lag"], lookback=1, markets=US, direction=-1,
        doc="资产增长：最新总资产 / 约一年前期末总资产 − 1（Cooper–Gulen–Schill 2008）")
def asset_growth(panel, dates):
    return (panel["fund_assets"] / _pos(panel["fund_assets_lag"]) - 1).reindex(dates)


@factor("accruals", needs=["fund_accruals"], lookback=1, markets=US, direction=-1,
        doc="应计：(TTM 净利润 − TTM 经营现金流) / 平均总资产（Sloan 1996 的现金流量表口径）")
def accruals(panel, dates):
    return panel["fund_accruals"].reindex(dates)


@factor("net_issuance", needs=["fund_net_issuance"], lookback=1, markets=US, direction=-1,
        doc="净发行：log(拆股调整后股本 / 12 个月前的拆股调整后股本)（Pontiff–Woodgate 2008）")
def net_issuance(panel, dates):
    return panel["fund_net_issuance"].reindex(dates)
