"""R3 组合因子（factors/composite.py）：无前视（扰动未来、截到当日重算、只用同一调仓日的成分值）、
取号、最少成分数规则、C4 残差与回归变量逐日正交。全部合成数据。"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from factorlab import registry
from factorlab.calendar import month_end_dates, trading_days
from factorlab.factors import composite as cp
from factorlab.preprocess import winsorize_mad, zscore
from factorlab.registry import check_no_lookahead
from factorlab_synth import market, tmp_ledger  # noqa: F401

# 计划（R3-2026-11-27.md）里的定义：组合名 → (市场, [(成分, 取号)])；取号 = 成分事先写定的方向
PLAN = {
    "cn_value_lowvol": ("cn", [("cn_ep_ttm", 1), ("cn_bp", 1), ("vol_60d", -1)]),
    "cn_value_rev_lowvol": ("cn", [("cn_ep_ttm", 1), ("rev_1m", 1), ("vol_60d", -1), ("turnover_20d", -1)]),
    "cn_quality": ("cn", [("cn_roe_ttm", 1), ("cn_gpa_ttm", 1), ("cn_accruals", -1)]),
    "us_value_profit": ("us", [("bm", 1), ("roe", 1)]),
    "us_investment": ("us", [("asset_growth", -1), ("net_issuance", -1)]),
}
ALL = [*PLAN, "cn_ep_resid"]
FIN = ["fin_ni_ttm", "fin_mcap", "fin_be", "fin_roe", "fin_gpa", "fin_accruals",
       "fund_be", "fund_ni_ttm", "mcap_total", "fund_assets", "fund_assets_lag", "fund_net_issuance"]


def _panel(n=80, n_years=4, seed=11):
    """合成量价面板 + 月末财报字段（A 股 fin_*、美股 fund_*，各自 AR(1) 演化、带缺失）。"""
    panel, _ = market(n=n, n_years=n_years)
    rng = np.random.default_rng(seed)
    days = trading_days(panel["close_adj"])
    me = month_end_dates(days)
    cols = panel["close_adj"].columns
    T, N = len(me), len(cols)

    def ar(mu, sd, phi=0.9):
        x = np.zeros((T, N))
        x[0] = rng.normal(mu, sd, N)
        for t in range(1, T):
            x[t] = mu + phi * (x[t - 1] - mu) + rng.normal(0, sd * np.sqrt(1 - phi ** 2), N)
        x[rng.random((T, N)) < 0.05] = np.nan
        return pd.DataFrame(x, index=me, columns=cols)

    mcap = panel["mcap_float"].reindex(me) * 1.3
    panel.update({
        "fin_mcap": mcap, "fin_ni_ttm": ar(0.05, 0.05) * mcap, "fin_be": ar(0.6, 0.3) * mcap,
        "fin_roe": ar(0.08, 0.06), "fin_gpa": ar(0.2, 0.1), "fin_accruals": ar(0.0, 0.05),
        "mcap_total": mcap, "fund_be": ar(0.5, 0.3) * mcap, "fund_ni_ttm": ar(0.04, 0.04) * mcap,
        "fund_assets": ar(2.0, 0.5) * mcap, "fund_net_issuance": ar(0.0, 0.05),
    })
    panel["fund_assets_lag"] = panel["fund_assets"] / (1 + ar(0.08, 0.1))
    return panel, me


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


def _prep(x):
    return zscore(winsorize_mad(x, 5.0))


def _manual(panel, dates, comps, min_k):
    alive = panel["close_adj"].reindex(dates).notna()
    zs = [_prep((s * registry.get(n)(panel, dates)).where(alive)) for n, s in comps]
    stack = np.stack([z.to_numpy() for z in zs])
    cnt = np.isfinite(stack).sum(0)
    with np.errstate(invalid="ignore"):
        m = np.nansum(stack, 0) / cnt
    return pd.DataFrame(np.where(cnt >= min_k, m, np.nan), index=dates, columns=zs[0].columns)


# ------------------------------------------------------------------ 登记
def test_registered_metadata():
    for name in ALL:
        spec = registry.get(name)
        assert spec.direction == 1, name
        assert spec.markets == (("us",) if name.startswith("us_") else ("cn",)), name
    for name, (_, comps) in PLAN.items():
        spec = registry.get(name)
        for c, sign in comps:
            assert sign == registry.get(c).direction, (name, c)   # 取号 = 成分事先写定的方向
            assert set(registry.get(c).needs) <= set(spec.needs), (name, c)
            assert spec.lookback >= registry.get(c).lookback
    assert {"fin_ni_ttm", "fin_mcap", "close_adj"} <= set(registry.get("cn_ep_resid").needs)


# ------------------------------------------------------------------ 无前视
@pytest.mark.parametrize("name", ALL)
def test_perturbing_future_leaves_past_unchanged(name):
    panel, me = _panel()
    cut = me[30]
    past = me[(me <= cut) & (me >= me[4])]
    spec = registry.get(name)
    a = spec(panel, past)
    b = spec(_perturb_after(panel, cut), past)
    pd.testing.assert_frame_equal(a, b, check_exact=False, rtol=1e-12)
    assert a.loc[past[-6:]].notna().to_numpy().mean() > 0.5, name
    later = me[me > cut][:6]
    assert not spec(panel, later).equals(spec(_perturb_after(panel, cut), later)), name


@pytest.mark.parametrize("name", ALL)
def test_strict_recompute_matches(name):
    panel, me = _panel(n=50, n_years=3)
    assert check_no_lookahead(registry.get(name), panel, me[4:], n_check=3), name


@pytest.mark.parametrize("name", ["cn_quality", "us_value_profit", "us_investment"])
def test_only_same_date_component_values(name):
    """纯财报组合：把其他月末的财报字段全部打乱，d 日的组合分数不变（只用同一调仓日的成分值）。"""
    panel, me = _panel()
    d = me[20]
    rng = np.random.default_rng(5)
    keep = lambda v: pd.DataFrame(np.repeat((v.index == d)[:, None], v.shape[1], 1), index=v.index, columns=v.columns)
    q = {k: (v.where(keep(v), v * rng.uniform(-3, 3, v.shape)) if k in FIN else v) for k, v in panel.items()}
    spec = registry.get(name)
    pd.testing.assert_frame_equal(spec(panel, [d]), spec(q, [d]))
    assert not spec(panel, [me[21]]).equals(spec(q, [me[21]]))


# ------------------------------------------------------------------ 取号与等权
@pytest.mark.parametrize("name", list(PLAN))
def test_matches_manual_with_plan_signs(name):
    panel, me = _panel()
    dates = me[5:]
    _, comps = PLAN[name]
    want = _manual(panel, dates, comps, 2 if len(comps) >= 3 else len(comps))
    got = registry.get(name)(panel, dates)
    pd.testing.assert_frame_equal(got, want, check_exact=False, rtol=1e-10, atol=1e-12)
    # 取号方向：组合与「方向调整后的成分」截面正相关
    for c, s in comps:
        x = s * registry.get(c)(panel, dates)
        rho = got.T.corrwith(x.T, method="spearman").mean()
        assert rho > 0.2, (name, c, rho)


def test_sign_flip_changes_ranking():
    """取号确实起作用：把 −vol_60d 写成 +vol_60d，与低波的相关从正变负。"""
    panel, me = _panel()
    dates = me[5:]
    vol = registry.get("vol_60d")(panel, dates)
    good = cp.composite(panel, dates, (("cn_ep_ttm", 1), ("cn_bp", 1), ("vol_60d", -1)))
    bad = cp.composite(panel, dates, (("cn_ep_ttm", 1), ("cn_bp", 1), ("vol_60d", 1)))
    assert good.T.corrwith(vol.T, method="spearman").mean() < -0.2
    assert bad.T.corrwith(vol.T, method="spearman").mean() > 0.2


# ------------------------------------------------------------------ 最少成分数
def test_min_components_rule():
    assert [cp.min_components(k) for k in (2, 3, 4)] == [2, 2, 2]
    idx, cols = pd.DatetimeIndex(["2020-01-31"]), list("ABCDE")
    a = pd.DataFrame([[1.0, 1.0, np.nan, np.nan, 1.0]], index=idx, columns=cols)
    b = pd.DataFrame([[3.0, np.nan, np.nan, 2.0, np.nan]], index=idx, columns=cols)
    c = pd.DataFrame([[5.0, 2.0, 4.0, np.nan, np.nan]], index=idx, columns=cols)
    out = cp.combine([a, b, c], 2).iloc[0]
    assert out["A"] == pytest.approx(3.0)            # 3 个都有
    assert out["B"] == pytest.approx(1.5)            # 2 个有：只平均有值的两个
    assert np.isnan(out["C"]) and np.isnan(out["D"]) and np.isnan(out["E"])   # 只有 1 个
    two = cp.combine([a, b], 2).iloc[0]
    assert two["A"] == pytest.approx(2.0) and two[["B", "C", "D", "E"]].isna().all()


def test_min_components_in_registered_factor():
    panel, me = _panel()
    dates = me[10:12]
    full = pd.concat([registry.get(c)(panel, dates).notna().all() for c in
                      ("cn_ep_ttm", "cn_bp", "vol_60d", "bm", "roe", "asset_growth", "net_issuance")], axis=1).all(1)
    code = full[full].index[0]                                        # 各成分都有值的一只
    q = {k: v.copy() for k, v in panel.items()}
    q["fin_be"].loc[:, code] = np.nan                                 # C1：cn_bp 缺、ep 与 vol 在 → 有值
    assert registry.get("cn_value_lowvol")(q, dates)[code].notna().all()
    q["fin_ni_ttm"].loc[:, code] = np.nan                             # 再缺 ep：只剩 vol → 空
    assert registry.get("cn_value_lowvol")(q, dates)[code].isna().all()
    q["fund_be"].loc[:, code] = np.nan                                # C5：bm、roe 都依赖权益 → 空
    assert registry.get("us_value_profit")(q, dates)[code].isna().all()
    q2 = {k: v.copy() for k, v in panel.items()}
    q2["fund_net_issuance"].loc[:, code] = np.nan                     # C6：两个成分缺一个 → 空
    assert registry.get("us_investment")(q2, dates)[code].isna().all()
    assert registry.get("us_investment")(panel, dates)[code].notna().all()
    q3 = {k: v.copy() for k, v in panel.items()}
    q3["fund_ni_ttm"].loc[:, code] = np.nan                           # C5：roe 缺、bm 在 → 两个成分要求 → 空
    assert registry.get("us_value_profit")(q3, dates)[code].isna().all()


# ------------------------------------------------------------------ C4 残差
def test_ep_resid_orthogonal_to_regressors_per_date():
    panel, me = _panel()
    dates = me[5:]
    res = registry.get("cn_ep_resid")(panel, dates)
    alive = panel["close_adj"].reindex(dates).notna()
    m = panel["fin_mcap"].reindex(dates)
    lsize = winsorize_mad(np.log(m.where(m > 0)).where(alive), 5.0)
    vol = winsorize_mad(registry.get("vol_60d")(panel, dates).where(alive), 5.0)
    ep = _prep(registry.get("cn_ep_ttm")(panel, dates).where(alive))
    n_ok = 0
    for d in dates:
        r = res.loc[d]
        ok = r.notna()
        if ok.sum() == 0:
            continue
        n_ok += 1
        # 有值的恰好是三者都有值的证券
        assert (ok == (ep.loc[d].notna() & lsize.loc[d].notna() & vol.loc[d].notna())).all()
        sc = float(np.abs(r[ok]).sum())
        assert abs(r[ok].sum()) < 1e-9 * max(sc, 1)
        assert abs((r[ok] * lsize.loc[d][ok]).sum()) < 1e-8 * max(sc * float(np.abs(lsize.loc[d][ok]).max()), 1)
        assert abs((r[ok] * vol.loc[d][ok]).sum()) < 1e-8 * max(sc * float(np.abs(vol.loc[d][ok]).max()), 1)
    assert n_ok > 20


def test_ep_resid_removes_exact_linear_exposure():
    """EP 若恰好是 log 市值与波动的线性组合，残差为 0。"""
    idx, cols = pd.DatetimeIndex(["2020-01-31", "2020-02-28"]), [f"S{i}" for i in range(30)]
    rng = np.random.default_rng(0)
    x1 = pd.DataFrame(rng.normal(size=(2, 30)), index=idx, columns=cols)
    x2 = pd.DataFrame(rng.normal(size=(2, 30)), index=idx, columns=cols)
    y = 0.3 + 2 * x1 - 0.5 * x2
    r = cp.cross_section_resid(y, [x1, x2])
    assert np.nanmax(np.abs(r.to_numpy())) < 1e-10
    y2 = y + pd.DataFrame(rng.normal(size=(2, 30)), index=idx, columns=cols)
    y2.iloc[0, :25] = np.nan                                           # 有效样本 < 10：整行为空
    r2 = cp.cross_section_resid(y2, [x1, x2])
    assert r2.iloc[0].isna().all() and r2.iloc[1].notna().all()
