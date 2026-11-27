"""盈余惊喜因子（R5：docs/research/factorlab/rounds/R5-2026-11-27.md）。字段由 fundamentals_cn / fundamentals_us
经 data.load_market 提供，行 = 月末交易日。

SUE = (X_q − X_{q−4}) / σ，X = 单季值（由累计值还原），σ = 最近 8 个同比差 X_{q−j} − X_{q−4−j}（j = 0…7）的
样本标准差，至少 4 个有值；q = 调仓日已公告的最新季度，期末距调仓日超过 200 天、σ = 0 → 空。原值，不除股本。
A 股：归母净利润 / 营业收入，可用日 = avail_date（公告日后第一个交易日）；美股：SEC NetIncomeLoss / 营业收入
（Revenues → RevenueFromContractWithCustomerExcludingAssessedTax → SalesRevenueNet，逐季取第一个有值的），
可用日 = 申报生效日。方向为 R5 计划事先写定的（都为 +）。
"""

from __future__ import annotations

from ..registry import factor

CN = ("cn",)
US = ("us",)


@factor("cn_sue", needs=["fin_ni_sue"], lookback=1, markets=CN, direction=1,
        doc="标准化未预期盈余：单季归母净利润同比差 / 最近 8 个同比差的标准差（Bernard–Thomas 1989）")
def cn_sue(panel, dates):
    return panel["fin_ni_sue"].reindex(dates)


@factor("cn_sur", needs=["fin_rev_sur"], lookback=1, markets=CN, direction=1,
        doc="标准化未预期营收：单季营业收入同比差 / 最近 8 个同比差的标准差（Jegadeesh–Livnat 2006）")
def cn_sur(panel, dates):
    return panel["fin_rev_sur"].reindex(dates)


@factor("us_sue", needs=["fund_ni_sue"], lookback=1, markets=US, direction=1,
        doc="标准化未预期盈余：SEC NetIncomeLoss 单季同比差 / 最近 8 个同比差的标准差（Bernard–Thomas 1989）")
def us_sue(panel, dates):
    return panel["fund_ni_sue"].reindex(dates)


@factor("us_sur", needs=["fund_rev_sur"], lookback=1, markets=US, direction=1,
        doc="标准化未预期营收：SEC 营业收入单季同比差 / 最近 8 个同比差的标准差（Jegadeesh–Livnat 2006）")
def us_sur(panel, dates):
    return panel["fund_rev_sur"].reindex(dates)
