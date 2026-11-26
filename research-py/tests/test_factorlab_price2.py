"""R1 新增量价因子（factors/price2.py）：无前视（扰动未来价格、截到当日重算）与小样本数值核对。"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest
from scipy import stats

from factorlab import registry
from factorlab.calendar import month_end_dates, trading_days
from factorlab.factors.price2 import market_return_ew
from factorlab.registry import check_no_lookahead
from factorlab_synth import market, tmp_ledger  # noqa: F401

NEW = ["mom_6_1", "rev_5d", "high_52w", "idio_vol_60d", "beta_252d", "skew_60d", "turnover_abn",
       "turnover_vol_20d", "low_price"]

EXPECTED_DIRECTION = {"mom_6_1": 1, "rev_5d": 1, "high_52w": 1, "idio_vol_60d": -1, "beta_252d": -1,
                      "skew_60d": -1, "turnover_abn": -1, "turnover_vol_20d": -1, "low_price": -1}


def _perturb_after(panel, cut, seed=3):
    rng = np.random.default_rng(seed)
    out = {}
    for k, v in panel.items():
        v = v.copy()
        rows = v.index > cut
        if v.dtypes.iloc[0] == float and k not in ("limit_up", "limit_down", "is_suspended"):
            v.loc[rows] = v.loc[rows] * rng.uniform(0.5, 1.5, size=v.loc[rows].shape)
        out[k] = v
    return out


def test_registered_with_plan_metadata():
    for name in NEW:
        spec = registry.get(name)
        assert spec.direction == EXPECTED_DIRECTION[name], name
        assert spec.doc and spec.lookback >= 1, name


@pytest.mark.parametrize("name", NEW)
def test_perturbing_future_leaves_past_unchanged(name):
    panel, _ = market()
    dates = month_end_dates(trading_days(panel["close_adj"]))
    cut = dates[40]
    past = dates[dates <= cut]
    spec = registry.get(name)
    a = spec(panel, past)
    b = spec(_perturb_after(panel, cut), past)
    pd.testing.assert_frame_equal(a, b, check_exact=False, rtol=1e-12)
    assert a.loc[past[-6:]].notna().to_numpy().mean() > 0.5, name   # 不是靠全空通过的
    # 扰动确实会改变 cut 之后的值（等权市场收益依赖全部证券：同样必须只用当日以前）
    later = dates[(dates > cut)][:6]
    assert not spec(panel, later).equals(spec(_perturb_after(panel, cut), later)), name


@pytest.mark.parametrize("name", NEW)
def test_strict_recompute_matches(name):
    panel, _ = market(n=60, n_years=3)
    dates = month_end_dates(trading_days(panel["close_adj"]))[13:]
    assert check_no_lookahead(registry.get(name), panel, dates, n_check=3), name


def _tiny():
    days = pd.bdate_range("2020-01-01", periods=300)
    rng = np.random.default_rng(0)
    m = rng.normal(0, 0.01, len(days))
    codes = ["A", "B", "C", "D"]
    betas = np.array([0.5, 1.0, 1.5, 2.0])
    r = m[:, None] * betas[None, :] + rng.normal(0, 0.005, (len(days), 4))
    r[0] = 0
    close_adj = pd.DataFrame(10 * np.cumprod(1 + r, axis=0), index=days, columns=codes)
    close = close_adj / np.array([1.0, 2.0, 0.5, 4.0])
    turnover = pd.DataFrame(rng.uniform(0.005, 0.03, (len(days), 4)), index=days, columns=codes)
    return {"close_adj": close_adj, "close": close, "turnover": turnover}


def test_numeric_values():
    p = _tiny()
    c = p["close_adj"]
    d = c.index[-1]
    dates = pd.DatetimeIndex([d])
    r = c.pct_change()
    i = len(c) - 1

    v = registry.get("mom_6_1")(p, dates).loc[d]
    np.testing.assert_allclose(v, c.iloc[i - 21] / c.iloc[i - 126] - 1)
    v = registry.get("rev_5d")(p, dates).loc[d]
    np.testing.assert_allclose(v, -(c.iloc[i] / c.iloc[i - 5] - 1))
    v = registry.get("high_52w")(p, dates).loc[d]
    np.testing.assert_allclose(v, c.iloc[i] / c.iloc[i - 251:i + 1].max())
    assert (v <= 1 + 1e-12).all()
    v = registry.get("skew_60d")(p, dates).loc[d]
    win = r.iloc[i - 59:i + 1]
    np.testing.assert_allclose(v, win.apply(lambda s: stats.skew(s, bias=False)), rtol=1e-8)
    t = p["turnover"]
    v = registry.get("turnover_abn")(p, dates).loc[d]
    np.testing.assert_allclose(v, t.iloc[i - 19:i + 1].mean() / t.iloc[i - 249:i + 1].mean())
    v = registry.get("turnover_vol_20d")(p, dates).loc[d]
    np.testing.assert_allclose(v, t.iloc[i - 19:i + 1].std(ddof=1))
    v = registry.get("low_price")(p, dates).loc[d]
    np.testing.assert_allclose(v, np.log(p["close"].iloc[i]))

    # 贝塔、特质波动：与逐只单独 OLS（对当日等权市场收益）一致
    mkt = market_return_ew(r)
    bet = registry.get("beta_252d")(p, dates).loc[d]
    ivol = registry.get("idio_vol_60d")(p, dates).loc[d]
    for code in c.columns:
        y, x = r[code].iloc[i - 251:i + 1], mkt.iloc[i - 251:i + 1]
        np.testing.assert_allclose(bet[code], np.polyfit(x, y, 1)[0], rtol=1e-8)
        y, x = r[code].iloc[i - 59:i + 1], mkt.iloc[i - 59:i + 1]
        b1, b0 = np.polyfit(x, y, 1)
        e = y - (b0 + b1 * x)
        np.testing.assert_allclose(ivol[code], np.sqrt((e ** 2).sum() / (len(e) - 2)), rtol=1e-6)
    assert list(bet.sort_values().index) == ["A", "B", "C", "D"]   # 植入的贝塔顺序被找回


def test_regression_skips_missing_days_and_min_periods():
    p = _tiny()
    p = {k: v.copy() for k, v in p.items()}
    p["close_adj"].iloc[-30:, 0] = np.nan          # A 停牌 30 天：当日没有价格 → 因子为空
    p["close_adj"].iloc[-80:-30, 1] = np.nan       # B 窗口内缺 30 天以上 → 60 日窗口有效观测 < 40 → 为空
    d = pd.DatetimeIndex([p["close_adj"].index[-1]])
    v = registry.get("idio_vol_60d")(p, d).iloc[0]
    assert np.isnan(v["A"]) and np.isnan(v["B"]) and np.isfinite(v["C"])
