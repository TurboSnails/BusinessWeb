"""R14 趋势因子：无前视（月、周调仓日都核对）、信号定义。"""
import numpy as np
import pandas as pd

import factorlab.factors  # noqa: F401
from factorlab.calendar import month_end_dates, week_end_dates
from factorlab.factors import r14
from factorlab.registry import FACTORS, check_no_lookahead


def _panel(seed=5, n=150, days=1400):
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range("2015-01-01", periods=days)
    cols = [f"S{i:03d}" for i in range(n)]
    px = pd.DataFrame(50 * np.exp(np.cumsum(rng.normal(0.0003, 0.02, (days, n)), 0)), idx, cols)
    amt = pd.DataFrame(rng.lognormal(16, 0.5, (days, n)), idx, cols)
    cap = pd.DataFrame(rng.lognormal(22, 1, (days, n)), idx, cols)
    return {"close_adj": px, "amount": amt, "mcap_float": cap}, idx


def test_signal_definition():
    panel, idx = _panel()
    s = r14._signals(panel["close_adj"], panel["amount"])
    d = idx[500]
    c = panel["close_adj"].iloc[:, 7]
    assert abs(s["P20"].loc[d].iloc[7] - c.loc[:d].iloc[-20:].mean() / c.loc[d]) < 1e-12
    a = panel["amount"].iloc[:, 7]
    assert abs(s["V5"].loc[d].iloc[7] - a.loc[:d].iloc[-5:].mean() / a.loc[d]) < 1e-12


def test_no_lookahead_monthly_and_weekly():
    panel, idx = _panel()
    m = month_end_dates(idx)[-6:]
    w = week_end_dates(idx)[-6:]
    assert check_no_lookahead(FACTORS["cn_trend"], panel, m)
    assert check_no_lookahead(FACTORS["cn_trend"], panel, w)
    assert FACTORS["cn_trend"](panel, m).iloc[-1].notna().sum() > 100
