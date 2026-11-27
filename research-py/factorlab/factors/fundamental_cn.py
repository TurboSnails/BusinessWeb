"""A 股基本面因子（R2：docs/research/factorlab/rounds/R2-2026-11-27.md；字段由 fundamentals_cn 经 data.load_market
提供，行 = 月末交易日）。

口径见 factorlab/fundamentals_cn.py：每个月末 d 只用 avail_date ≤ d 的财报版本；所用报告期末早于 d 超过 15 个月
即为空；fin_mcap = 点时总市值（退市股用实收资本后备）。分母 ≤ 0 的比值为空。方向为 R2 计划事先写定的。
因子名加 cn_ 前缀：美股同名因子（ep_ttm、cfp_ttm、accruals、asset_growth）已注册，注册表按名字全局唯一。
"""

from __future__ import annotations

import pandas as pd

from ..registry import factor

CN = ("cn",)


def _pos(x: pd.DataFrame) -> pd.DataFrame:
    return x.where(x > 0)


@factor("cn_ep_ttm", needs=["fin_ni_ttm", "fin_mcap"], lookback=1, markets=CN, direction=1,
        doc="盈利收益率：归母净利润 TTM / 总市值（Liu–Stambaugh–Yuan 2019 CH-3 的 EP）")
def cn_ep_ttm(panel, dates):
    return (panel["fin_ni_ttm"] / _pos(panel["fin_mcap"])).reindex(dates)


@factor("cn_ep_ded_ttm", needs=["fin_nided_ttm", "fin_mcap"], lookback=1, markets=CN, direction=1,
        doc="扣非盈利收益率：扣非归母净利润 TTM / 总市值")
def cn_ep_ded_ttm(panel, dates):
    return (panel["fin_nided_ttm"] / _pos(panel["fin_mcap"])).reindex(dates)


@factor("cn_bp", needs=["fin_be", "fin_mcap"], lookback=1, markets=CN, direction=1,
        doc="账面市值比：最新归母权益 / 总市值；权益 ≤ 0 为空（Fama–French 1992）")
def cn_bp(panel, dates):
    return (_pos(panel["fin_be"]) / _pos(panel["fin_mcap"])).reindex(dates)


@factor("cn_sp_ttm", needs=["fin_rev_ttm", "fin_mcap"], lookback=1, markets=CN, direction=1,
        doc="营收市值比：营业收入 TTM / 总市值（Barbee–Mukherji–Raines 1996）")
def cn_sp_ttm(panel, dates):
    return (panel["fin_rev_ttm"] / _pos(panel["fin_mcap"])).reindex(dates)


@factor("cn_cfp_ttm", needs=["fin_cfo_ttm", "fin_mcap"], lookback=1, markets=CN, direction=1,
        doc="经营现金流收益率：经营现金流 TTM / 总市值（Lakonishok–Shleifer–Vishny 1994）")
def cn_cfp_ttm(panel, dates):
    return (panel["fin_cfo_ttm"] / _pos(panel["fin_mcap"])).reindex(dates)


@factor("cn_roe_ttm", needs=["fin_roe"], lookback=1, markets=CN, direction=1,
        doc="ROE：归母净利润 TTM / 平均归母权益（同一期末与 4 个季度前），两端权益 ≤ 0 为空")
def cn_roe_ttm(panel, dates):
    return panel["fin_roe"].reindex(dates)


@factor("cn_gpa_ttm", needs=["fin_gpa"], lookback=1, markets=CN, direction=1,
        doc="毛利 / 总资产：毛利 TTM / 同期末总资产（Novy-Marx 2013）；金融业（点时申万一级）为空")
def cn_gpa_ttm(panel, dates):
    return panel["fin_gpa"].reindex(dates)


@factor("cn_accruals", needs=["fin_accruals"], lookback=1, markets=CN, direction=-1,
        doc="应计：(归母净利润 TTM − 经营现金流 TTM) / 平均总资产（Sloan 1996 的现金流量表口径）")
def cn_accruals(panel, dates):
    return panel["fin_accruals"].reindex(dates)


@factor("cn_asset_growth", needs=["fin_asset_growth"], lookback=1, markets=CN, direction=-1,
        doc="资产增长：最新期末总资产 / 4 个季度前期末总资产 − 1（Cooper–Gulen–Schill 2008）")
def cn_asset_growth(panel, dates):
    return panel["fin_asset_growth"].reindex(dates)


@factor("cn_np_growth_yoy", needs=["fin_nided_yoy"], lookback=1, markets=CN, direction=1,
        doc="扣非归母净利润单季同比：(本季 − 上年同季) / |上年同季|")
def cn_np_growth_yoy(panel, dates):
    return panel["fin_nided_yoy"].reindex(dates)
