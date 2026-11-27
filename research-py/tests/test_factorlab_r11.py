"""R11 量价因子：无前视（全量 vs 截到当日）、手算一致。"""
import numpy as np
import pandas as pd

import factorlab.factors  # noqa: F401
from factorlab.registry import FACTORS, check_no_lookahead


def _panel(n_days=1500, n=25, seed=1):
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range("2015-01-01", periods=n_days)
    cols = [f"{i:06d}" for i in range(n)]
    m = rng.normal(0, 0.01, n_days)
    r = m[:, None] * rng.uniform(0.5, 1.5, n) + rng.normal(0, 0.02, (n_days, n))
    px = pd.DataFrame(100 * np.exp(np.cumsum(r, 0)), idx, cols)
    px.iloc[:50, 0] = np.nan
    ind = pd.DataFrame(np.tile(np.array([f"I{i % 4}" for i in range(n)]), (n_days, 1)), idx, cols)
    ends = px.groupby(px.index.to_period("M")).apply(lambda x: x.index[-1])
    return {"close_adj": px, "industry": ind}, pd.DatetimeIndex(ends.values[-12:])


def test_no_lookahead():
    panel, dates = _panel()
    for f in ("resmom_12_1", "cn_ind_mom", "season_hs"):
        assert check_no_lookahead(FACTORS[f], panel, dates), f


def test_resmom_manual():
    panel, dates = _panel()
    d = dates[-1]
    c = panel["close_adj"]
    ret = c / c.shift(1) - 1
    m = ret.mean(axis=1)
    i = ret.index.get_loc(d)
    y, x = ret.iloc[i - 251:i - 20, 3], m.iloc[i - 251:i - 20]
    b = np.cov(x, y, ddof=1)[0, 1] / np.var(x, ddof=1)
    e = (y - y.mean()) - b * (x - x.mean())
    want = (y - b * x).sum() / np.sqrt((e ** 2).sum() / (len(y) - 2))
    got = FACTORS["resmom_12_1"](panel, dates).loc[d].iloc[3]
    assert abs(got - want) < 1e-9


def test_season_and_industry_manual():
    panel, dates = _panel()
    d = dates[-1]
    c = panel["close_adj"]
    mc = c.groupby(c.index.to_period("M")).last()
    mr = mc / mc.shift(1) - 1
    hold = pd.Period(d, "M") + 1
    want = mr.reindex([hold - 12 * k for k in range(1, 6)]).iloc[:, 5].mean()
    assert abs(FACTORS["season_hs"](panel, dates).loc[d].iloc[5] - want) < 1e-12
    mom = c.shift(21) / c.shift(252) - 1
    members = [k for k in range(25) if k % 4 == 2]
    want = mom.loc[d].iloc[members].mean()
    assert abs(FACTORS["cn_ind_mom"](panel, dates).loc[d].iloc[2] - want) < 1e-12
