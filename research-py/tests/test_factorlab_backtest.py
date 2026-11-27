"""factorlab 回测：A 股涨跌停 / 一字板 / 停牌 / 退市规则、市值加权、成本表与日期切换、最低佣金与整手、滑点。"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from factorlab.backtest import CostModel, SlippageModel, allocate, cost_model, perf_stats
from factorlab.backtest import _backtest as backtest
from factorlab.backtest import _backtest_vs_universe as backtest_vs_universe
from factorlab_synth import market, tmp_ledger  # noqa: F401

ZERO = CostModel(commission=0.0)
CODES = list("ABCD")


def tiny(n_days: int = 14, start: str = "2023-08-14"):
    days = pd.bdate_range(start, periods=n_days)
    one = pd.DataFrame(1.0, index=days, columns=CODES)
    p = {"close_adj": one * 10, "close": one * 10, "open": one * 10, "high": one * 10.1, "low": one * 9.9,
         "volume": one * 1e6, "amount": one * 1e9, "mcap_float": one * 1e10,
         "limit_up": (one * 0 > 0).astype(object), "limit_down": (one * 0 > 0).astype(object),
         "is_suspended": (one * 0 > 0).astype(object)}
    p["open_adj"] = p["open"].copy()
    return days, p


def fac(days, rows: dict) -> pd.DataFrame:
    return pd.DataFrame.from_dict({days[i]: v for i, v in rows.items()}, orient="index", columns=CODES).astype(float)


def run(f, p, **kw):
    kw = {"market": "cn", "top_n": 1, "weighting": "equal", "execution": "close", "costs": ZERO,
          "slippage": None, **kw}
    return backtest(f, p, **kw)


def test_limit_up_blocks_buy_close_execution():
    days, p = tiny()
    f = fac(days, {4: [4, 3, 2, 1]})
    p["limit_up"].loc[days[4], "A"] = True
    r = run(f, p)
    assert r.weights[days[4]].empty                        # 买不进、不替补，持现金
    r2 = run(f, p, constraints=False)
    assert r2.weights[days[4]].to_dict() == {"A": 1.0}
    r3 = run(f, p, market="us")                            # 非 A 股不启用涨跌停约束
    assert r3.weights[days[4]].to_dict() == {"A": 1.0}


def test_limit_down_blocks_sell_then_sold_next_day():
    days, p = tiny()
    f = fac(days, {4: [4, 3, 2, 1], 6: [1, 4, 3, 2]})
    p["limit_down"].loc[days[6], "A"] = True
    p["close_adj"].loc[days[9]:, "A"] = 12.0               # A 在已卖出之后上涨，不应计入
    r = run(f, p)
    assert r.weights[days[6]].to_dict() == {"A": 1.0}      # 卖不出，锁定；资金不足买 B
    assert days[7] in r.turnover.index and r.turnover[days[7]] == pytest.approx(0.5)
    assert r.returns.loc[days[9]] == 0.0


def test_suspended_held_until_resumption():
    days, p = tiny()
    f = fac(days, {4: [4, 3, 2, 1], 6: [1, 4, 3, 2]})
    for k in ("close_adj", "close", "open", "open_adj", "high", "low", "volume", "amount"):
        p[k].loc[days[6]:days[7], "A"] = np.nan             # 停牌（当日无行）
    p["is_suspended"].loc[days[6]:days[7], "A"] = np.nan
    for k in ("close_adj", "close", "open", "open_adj", "high", "low"):
        p[k].loc[days[8]:, "A"] = 12.0                      # 复牌跳涨 20%
    r = run(f, p)
    assert r.weights[days[6]].to_dict() == {"A": 1.0}
    assert r.returns.loc[days[8]] == pytest.approx(0.2)     # 持有到复牌、复牌当日收盘卖出
    assert r.turnover[days[8]] == pytest.approx(0.5)
    p["close_adj"].loc[days[10]:, "A"] = 15.0
    assert run(f, p).returns.loc[days[10]] == 0.0


def test_one_word_limit_rules_open_execution():
    days, p = tiny()
    f = fac(days, {4: [4, 3, 2, 1]})
    e = days[5]
    p["limit_up"].loc[e, "A"] = True
    r = run(f, p, execution="open")
    assert days[5] in r.weights and r.weights[e].to_dict() == {"A": 1.0}   # 有涨停但不是一字，开盘能买
    for k in ("high", "low"):
        p[k].loc[e, "A"] = 10.0
    r = run(f, p, execution="open")
    assert r.weights[e].empty                                              # 一字涨停买不进
    # 一字跌停卖不出
    days, p = tiny()
    f = fac(days, {4: [4, 3, 2, 1], 7: [1, 4, 3, 2]})
    p["limit_down"].loc[days[8], "A"] = True
    for k in ("high", "low"):
        p[k].loc[days[8], "A"] = 10.0
    r = run(f, p, execution="open")
    assert r.weights[days[8]].to_dict() == {"A": 1.0}
    assert r.turnover[days[9]] == pytest.approx(0.5)


def test_open_execution_return_split():
    days, p = tiny()
    f = fac(days, {4: [4, 3, 2, 1]})
    p["open_adj"].loc[days[5], "A"] = 11.0     # 次日高开 10%：买在开盘，赚不到隔夜
    p["close_adj"].loc[days[5]:, "A"] = 11.0
    p["open_adj"].loc[days[6]:, "A"] = 11.0
    r = run(f, p, execution="open")
    assert r.returns.loc[days[5]] == pytest.approx(0.0)
    rc = run(f, p, execution="close")
    assert rc.returns.loc[days[5]] == pytest.approx(0.1)


def test_delisting_return():
    days, p = tiny()
    f = fac(days, {4: [4, 3, 2, 1]})
    for k in p:
        if p[k].dtypes.iloc[0] == float:
            p[k].loc[days[8]:, "A"] = np.nan
    sec = pd.DataFrame({"code": CODES, "delist_date": [days[8], pd.NaT, pd.NaT, pd.NaT]})
    r = run(f, p, top_n=2, securities=sec)
    assert r.returns.loc[days[8]] == pytest.approx(-0.5)
    r = run(f, p, top_n=2, securities=sec, delist_return=-0.3)
    assert r.returns.loc[days[8]] == pytest.approx(-0.15)


def test_cap_weighting_and_allocation():
    days, p = tiny()
    p["mcap_float"].loc[:, "A"] = 3e10
    f = fac(days, {4: [4, 3, 2, 1]})
    r = run(f, p, top_n=2, weighting="cap")
    assert r.weights[days[4]].round(10).to_dict() == {"A": 0.75, "B": 0.25}
    # 已持有但不能加仓：以原权重为上限，多出的给其他目标
    w = allocate(np.array([True, True, False]), np.ones(3), np.array([0.2, 0.0, 0.8]),
                 np.array([False, False, False]), np.array([False, True, True]))
    assert w.tolist() == pytest.approx([0.2, 0.8, 0.0])


def test_cost_tables_and_date_switches():
    cn, hk, us = cost_model("cn"), cost_model("hk"), cost_model("us")
    base = 0.00025 + 0.00001
    assert cn.rates("2023-08-25") == pytest.approx((base, base + 0.001))
    assert cn.rates("2023-08-28") == pytest.approx((base, base + 0.0005))
    assert cn.rates("2008-09-18") == pytest.approx((base + 0.001, base + 0.001))
    assert cn.rates("2008-09-19") == pytest.approx((base, base + 0.001))
    assert cn.rates("2008-04-23") == pytest.approx((base + 0.003, base + 0.003))
    assert cn.rates("2008-04-24") == pytest.approx((base + 0.001, base + 0.001))
    hb = 0.0003 + 0.0001
    assert hk.rates("2021-07-30") == pytest.approx((hb + 0.001, hb + 0.001))
    assert hk.rates("2021-08-01") == pytest.approx((hb + 0.0013, hb + 0.0013))
    assert hk.rates("2023-11-16") == pytest.approx((hb + 0.0013, hb + 0.0013))
    assert hk.rates("2023-11-17") == pytest.approx((hb + 0.001, hb + 0.001))
    assert us.rates("2010-01-04") == pytest.approx((0.0001, 0.0001))


def test_backtest_charges_costs_with_stamp_switch():
    days, p = tiny(start="2023-08-21")      # days[4] = 2023-08-25（周五），days[5] = 2023-08-28（印花税减半当日）
    assert days[5] == pd.Timestamp("2023-08-28")
    f = fac(days, {4: [4, 3, 2, 1], 5: [1, 4, 3, 2]})
    r = run(f, p, costs=cost_model("cn"))
    base = 0.00025 + 0.00001
    assert r.returns.loc[days[4]] == pytest.approx(-base)
    assert r.costs[days[5]] == pytest.approx(base + 0.0005 + base)
    f2 = fac(days, {3: [4, 3, 2, 1], 4: [1, 4, 3, 2]})     # 在 08-25 卖出：卖出印花税 0.1%
    assert run(f2, p, costs=cost_model("cn")).costs[days[4]] == pytest.approx(base + 0.001 + base)


def test_min_commission_lots_and_slippage():
    days, p = tiny(n_days=30)
    f = fac(days, {20: [4, 3, 2, 1]})
    r = run(f, p, top_n=3, costs=cost_model("cn"), capital=10_000)
    w = r.weights[days[20]]
    assert w.round(10).tolist() == [0.3, 0.3, 0.3]          # 3333 元 → 300 股（整手）
    assert r.costs[days[20]] == pytest.approx(3 * 5 / 10_000 + 0.9 * 0.00001)
    r2 = run(f, p, top_n=3, costs=cost_model("cn"))         # 只算收益：不取整、不计最低佣金
    assert r2.weights[days[20]].round(10).tolist() == pytest.approx([1 / 3] * 3)
    sl = SlippageModel(((5e8, 0.001), (0.0, 0.01)))
    r3 = run(f, p, top_n=3, slippage=sl)
    assert r3.costs[days[20]] == pytest.approx(0.001)       # 日均成交额 1e9 → 0.1%
    p["amount"] = p["amount"] / 100
    assert run(f, p, top_n=3, slippage=sl).costs[days[20]] == pytest.approx(0.01)
    assert r3.capacity["median"] == pytest.approx(1e8 / 3 / 1e9)


def test_perf_stats_and_vs_universe():
    r = pd.Series([0.01, -0.02, 0.03, 0.0, 0.01])
    s = perf_stats(r)
    assert s["maxdd"] == pytest.approx(-0.02) and s["n"] == 5
    assert s["cagr"] == pytest.approx(((1.01 * 0.98 * 1.03 * 1.01) ** (252 / 5)) - 1)
    panel, sec = market()
    from factorlab.calendar import month_end_dates, trading_days
    from factorlab.universe import build_universe
    dates = month_end_dates(trading_days(panel["close_adj"]))[13:40]
    mask = build_universe(panel, dates, "cn", sec)
    f = panel["signal"].reindex(dates)
    out = backtest_vs_universe(f, panel, "cn", mask, securities=sec)
    assert out["stats"]["excess_cagr"] > 0
    assert out["universe"].stats["turnover_per_rebalance"] < out["top"].stats["turnover_per_rebalance"]


# ---------------------------------------------------------------- 回测起点与截面不足
def test_backtest_starts_at_first_formable_date():
    """因子前几个调仓日没有值：组合与基准都从第一个能选出前组的调仓日开始；所有股票同涨同跌时超额 ≈ 0
    （修正前组合在前几期持现金、基准持股票池，超额被压成很大的负数）。"""
    days, p = tiny(n_days=60)
    up = pd.Series(1.01 ** np.arange(60), index=days)               # 每天都涨 1%，四只股票相同
    for k in ("close_adj", "close", "open", "open_adj", "high", "low"):
        p[k] = p[k].mul(up, axis=0)
    rb = [0, 10, 20, 30, 40, 50]
    rows = {i: [np.nan] * 4 for i in rb[:3]}
    rows.update({i: [4.0, 3.0, 2.0, 1.0] for i in rb[3:]})
    f = fac(days, rows)
    mask = pd.DataFrame(True, index=f.index, columns=CODES)
    kw = {"top_n": 1, "weighting": "equal", "execution": "close", "costs": ZERO, "slippage": None}
    out = backtest_vs_universe(f, p, "cn", mask, **kw)
    start = days[30]
    assert out["stats"]["start"] == str(start.date())
    assert out["top"].returns.index[0] == out["universe"].returns.index[0] == start
    assert out["stats"]["excess_cagr"] == pytest.approx(0.0, abs=1e-9)
    # min_names：有效值不足 min_names 的调仓日不算「能选出前组」
    rows2 = {**rows, 30: [4.0, np.nan, np.nan, np.nan]}
    out2 = backtest_vs_universe(fac(days, rows2), p, "cn", mask, min_names=2, **kw)
    assert out2["stats"]["start"] == str(days[40].date())
    # 股票池外的值不算
    mask3 = mask.copy()
    mask3.loc[days[30]] = False
    assert backtest_vs_universe(f, p, "cn", mask3, **kw)["stats"]["start"] == str(days[40].date())
    with pytest.raises(ValueError):
        backtest_vs_universe(fac(days, {i: [np.nan] * 4 for i in rb}), p, "cn", mask, **kw)


def test_missing_cross_section_holds_previous_portfolio():
    """中途某个调仓日因子截面不足：不调仓、继续持有上期组合（不清仓持现金），记在 skipped_rebalances。"""
    days, p = tiny(n_days=30)
    p["close_adj"].loc[days[12]:, "A"] = 11.0                      # A 在第 12 天涨 10%
    p["close"] = p["close_adj"].copy()
    f = fac(days, {0: [4.0, 3.0, 2.0, 1.0], 10: [np.nan] * 4, 20: [1.0, 2.0, 3.0, 4.0]})
    r = run(f, p)
    assert r.stats["skipped_rebalances"] == [str(days[10].date())]
    assert days[10] not in r.weights and days[20] in r.weights
    assert r.returns.loc[days[12]] == pytest.approx(0.1)          # 第 10 天之后仍持有 A
    assert list(r.weights[days[20]].index) == ["D"]
    r2 = run(fac(days, {0: [4.0, 3.0, 2.0, 1.0], 10: [np.nan, np.nan, np.nan, 1.0], 20: [1.0, 2.0, 3.0, 4.0]}), p,
             min_names=2)
    assert r2.stats["skipped_rebalances"] == [str(days[10].date())] and r2.returns.loc[days[12]] == pytest.approx(0.1)
