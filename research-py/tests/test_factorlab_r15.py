"""R15 价值回归因子：无前视、手算一致。"""
import numpy as np
import pandas as pd

import factorlab.factors  # noqa: F401
from factorlab.calendar import month_end_dates
from factorlab.registry import FACTORS, check_no_lookahead


def _panel(seed=7, n=40, days=1700):
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range("2012-01-02", periods=days)
    cols = [f"S{i:02d}" for i in range(n)]
    px = pd.DataFrame(20 * np.exp(np.cumsum(rng.normal(0, 0.02, (days, n)), 0)), idx, cols)
    step = lambda scale: pd.DataFrame(np.repeat(rng.normal(1, scale, (days // 60 + 1, n)), 60, 0)[:days], idx, cols)
    ni = step(0.5) * 1e8
    p = {"close_adj": px, "fin_mcap": px * 1e7, "fin_ni_ttm": ni, "fin_be": step(0.3).abs() * 1e9,
         "fin_roe": ni / 1e9, "fin_gpa": step(0.2).abs() * 0.3, "fin_cfo_ttm": step(0.5) * 1e8,
         "fin_gp_ttm": step(0.2).abs() * 3e8, "fin_rev_ttm": step(0.2).abs() * 1e9,
         "total_shares": pd.DataFrame(1e8, idx, cols)}
    return p, idx


def test_no_lookahead():
    p, idx = _panel()
    ends = month_end_dates(idx)[-8:]
    for f in ("cn_ep_hist_pct", "cn_bp_hist_pct", "cn_fscore_cheap", "ltrev_60_13"):
        assert check_no_lookahead(FACTORS[f], p, ends), f


def test_hist_pct_manual():
    p, idx = _panel()
    ends = month_end_dates(idx)
    d = ends[-1]
    ep = p["fin_ni_ttm"] / p["fin_mcap"]
    hist = ep.reindex(ends[ends < d][-60:]).iloc[:, 3]
    want = (hist <= ep.loc[d].iloc[3]).mean()
    got = FACTORS["cn_ep_hist_pct"](p, ends[-3:]).loc[d].iloc[3]
    assert abs(got - want) < 1e-12


def test_fscore_cheap_only_top40_bp():
    p, idx = _panel()
    ends = month_end_dates(idx)[-3:]
    f = FACTORS["cn_fscore_cheap"](p, ends)
    bp = (p["fin_be"] / p["fin_mcap"]).reindex(ends)
    pct = bp.rank(axis=1, pct=True)
    assert f.notna().equals((pct > 0.6) & f.notna())
    assert f.notna().sum(axis=1).max() <= int(0.4 * 40) + 1
    assert ((f.stack() >= 0) & (f.stack() <= 9)).all()
