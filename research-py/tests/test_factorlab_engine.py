"""factorlab 引擎：无前视、找回植入信号、空因子、登记簿、股票池、截面留出（合成数据）。"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from factorlab import registry
from factorlab.calendar import month_end_dates, shift_days, trading_days
from factorlab.evaluate import _forward_returns as forward_returns
from factorlab.evaluate import evaluate_factor, nw_tstat, spanning_regression
from factorlab.guard import TrialLedger, code_bucket, split_codes
from factorlab.preprocess import neutralize, rank_normalize, winsorize_mad, zscore
from factorlab.registry import check_no_lookahead, factor
from factorlab.report import to_dict, to_markdown
from factorlab.universe import UniverseSpec, build_universe
from factorlab_synth import market, tmp_ledger  # noqa: F401


@factor("planted", needs=["signal"], lookback=1, markets=("cn",), doc="测试：植入的可观测信号")
def _planted(panel, dates):
    return panel["signal"].reindex(dates)


@factor("peek", needs=["close_adj"], lookback=1, doc="测试：故意偷看未来 5 天收益（前视陷阱）")
def _peek(panel, dates):
    c = panel["close_adj"]
    return (c.shift(-5) / c - 1).reindex(dates)


BUILTIN = ["mom_12_1", "rev_1m", "vol_60d", "size", "turnover_20d", "amihud_20d", "max_ret_21d"]


def _perturb_after(panel, cut):
    rng = np.random.default_rng(1)
    out = {}
    for k, v in panel.items():
        v = v.copy()
        rows = v.index > cut
        if v.dtypes.iloc[0] == float and k not in ("limit_up", "limit_down", "is_suspended"):
            v.loc[rows] = v.loc[rows] * rng.uniform(0.5, 1.5, size=v.loc[rows].shape)
        out[k] = v
    return out


# ---------------------------------------------------------------- 日历
def test_calendar():
    days = pd.bdate_range("2020-01-01", "2020-03-31")
    me = month_end_dates(days)
    assert list(me.strftime("%m-%d")) == ["01-31", "02-28", "03-31"]
    assert shift_days(days, "2020-01-31", 1) == pd.Timestamp("2020-02-03")
    assert shift_days(days, "2020-02-01", 1) == pd.Timestamp("2020-02-03")  # 周六 → 下一个交易日
    assert shift_days(days, "2020-02-03", -1) == pd.Timestamp("2020-01-31")
    assert shift_days(days, "2020-03-31", 1) is None


# ---------------------------------------------------------------- (1) 无前视
def test_factors_have_no_lookahead():
    panel, _ = market()
    dates = month_end_dates(trading_days(panel["close_adj"]))[14:]
    for name in BUILTIN + ["planted"]:
        assert check_no_lookahead(registry.get(name), panel, dates, n_check=3), name
    assert not check_no_lookahead(registry.get("peek"), panel, dates, n_check=3)


def test_perturbing_future_prices_leaves_past_unchanged():
    panel, sec = market()
    days = trading_days(panel["close_adj"])
    dates = month_end_dates(days)
    cut = dates[50]
    pert = _perturb_after(panel, cut)
    past = dates[dates <= cut]
    for name in BUILTIN:
        a = registry.get(name)(panel, past)
        b = registry.get(name)(pert, past)
        pd.testing.assert_frame_equal(a, b, check_exact=False, rtol=1e-12)
        assert not registry.get("peek")(panel, past).equals(registry.get("peek")(pert, past))
    # 前瞻收益：结束（含卖出成交日）在 cut 之前的期不变
    for ex in ("open", "close"):
        fa, ends = forward_returns(panel, dates, ex, sec)
        fb, _ = forward_returns(pert, dates, ex, sec)
        ok = dates[(ends < dates[49]).to_numpy()]
        pd.testing.assert_frame_equal(fa.loc[ok], fb.loc[ok])
        assert not fa.loc[dates[50:60]].equals(fb.loc[dates[50:60]])
    # 股票池同样只用当日及以前
    ma = build_universe(panel, past, "cn", sec)
    mb = build_universe(pert, past, "cn", sec)
    pd.testing.assert_frame_equal(ma, mb)


def test_forward_return_definition():
    panel, sec = market()
    dates = month_end_dates(trading_days(panel["close_adj"]))
    fwd, ends = forward_returns(panel, dates, "close", sec)
    c = panel["close_adj"]
    code = c.columns[0]
    d0, d1 = dates[30], dates[31]
    if pd.notna(c.loc[d0, code]) and pd.notna(c.loc[d1, code]):
        assert fwd.loc[d0, code] == pytest.approx(c.loc[d1, code] / c.loc[d0, code] - 1)
    assert fwd.iloc[-1].isna().all() and ends.iloc[-1] is pd.NaT
    # 开盘执行：下一交易日开盘买、下一期下一交易日开盘卖
    po = dict(panel)
    po["open_adj"] = panel["open"] * panel["close_adj"] / panel["close"]
    fo, _ = forward_returns(po, dates, "open", sec)
    days = trading_days(c)
    e0, e1 = days[days.searchsorted(d0, "right")], days[days.searchsorted(d1, "right")]
    oa = po["open_adj"]
    if pd.notna(oa.loc[e0, code]) and pd.notna(oa.loc[e1, code]):
        assert fo.loc[d0, code] == pytest.approx(oa.loc[e1, code] / oa.loc[e0, code] - 1)
    # 期间退市 → 默认 −100%
    dl = sec.dropna(subset=["delist_date"]).iloc[0]
    i = dates.searchsorted(dl["delist_date"]) - 1
    if i >= 1 and pd.notna(c.loc[dates[i], dl["code"]]):
        assert fwd.loc[dates[i], dl["code"]] == pytest.approx(-1.0)


# ---------------------------------------------------------------- (2)(3) 信号与空因子
def test_planted_signal_is_recovered(tmp_ledger):
    panel, sec = market()
    res = evaluate_factor("cn", "planted", panel=panel, securities=sec, run_backtest=True)
    s = res.summary
    assert s["rank_ic_mean"] > 0.08
    assert s["rank_ic_t_nw"] > 4
    assert s["tmu_cap_mean"] > 0 and s["tmu_ew_mean"] > 0 and s["tmb_ew_mean"] > 0
    assert res.decay.loc[1, "rank_ic_mean"] > 0
    q = res.quantiles.mean()
    assert q.iloc[-1] > q.iloc[0]
    assert s["bt_cap_excess_cagr"] > 0 and s["bt_equal_excess_cagr"] > 0
    assert set(res.tiers) == {"small", "mid", "large"}
    assert len(res.segments) == 2 and sum(v["n_periods"] for v in res.segments.values()) == len(res.ic)  # 2017 前后
    r2 = evaluate_factor("cn", "planted", panel=panel, securities=sec, run_backtest=False,
                         segments=["2015-01-01", "2017-01-01"])
    assert len(r2.segments) == 3 and "分段" in to_markdown(r2)
    md = to_markdown(res)
    assert "RankIC" in md and "市值三档" in md
    json.dumps(to_dict(res))


def test_null_factor_has_no_ic(tmp_ledger):
    panel, sec = market()
    dates = month_end_dates(trading_days(panel["close_adj"]))
    rng = np.random.default_rng(42)
    noise = pd.DataFrame(rng.standard_normal((len(dates), panel["close_adj"].shape[1])), index=dates,
                         columns=panel["close_adj"].columns)
    res = evaluate_factor("cn", noise, name="noise", panel=panel, securities=sec, run_backtest=False)
    assert abs(res.summary["rank_ic_mean"]) < 0.04   # 约 95 只 × 85 期，标准误约 0.011
    assert abs(res.summary["rank_ic_t_nw"]) < 3
    assert abs(res.summary["tmu_cap_t_nw"]) < 3


# ---------------------------------------------------------------- (5) 登记簿
def test_every_evaluate_is_logged(tmp_ledger):
    panel, sec = market()
    led = TrialLedger()
    assert led.root == tmp_ledger
    evaluate_factor("cn", "mom_12_1", panel=panel, securities=sec, run_backtest=False)
    evaluate_factor("cn", "mom_12_1", panel=panel, securities=sec, run_backtest=False)
    evaluate_factor("cn", "rev_1m", panel=panel, securities=sec, run_backtest=False, motivation="literature")
    evaluate_factor("cn", "mom_12_1", panel=panel, securities=sec, run_backtest=False, mode="validate")
    with pytest.raises(PermissionError):
        evaluate_factor("cn", "mom_12_1", panel=panel, securities=sec, mode="confirm")
    assert led.count_trials("cn") == 4
    assert led.count_trials("cn", distinct=True) == 2          # validate 与 explore 配置相同 → 同一写法
    assert led.count_trials("cn", mode="validate") == 1
    assert len(led.trials("cn", include_errors=True)) == 5      # 报错的那次也记了
    r = led.trials("cn")[2]
    for key in ("ts", "git_commit", "git_dirty", "factor", "version", "params_hash", "source_hash", "config",
                "config_hash", "data_snapshot", "zone", "sample", "stats", "series_path", "family", "motivation"):
        assert key in r, key
    assert r["motivation"] == "literature" and r["zone"] == "explore"
    s = led.load_series(r["series_path"])
    assert {"tmu_cap", "tmu_ew", "rank_ic"} <= set(s.columns) and len(s) == r["sample"]["n_periods"]
    assert led.path("cn").parent == tmp_ledger and (tmp_ledger / r["series_path"]).exists()


# ---------------------------------------------------------------- 截面留出
def test_holdout_split_is_deterministic_and_disjoint(tmp_ledger):
    codes = [f"{i:06d}" for i in range(5000)]
    a, b = split_codes(codes, "explore"), split_codes(codes, "validate")
    assert len(set(a) & set(b)) == 0 and len(a) + len(b) == 5000
    assert 0.67 < len(a) / 5000 < 0.73
    assert code_bucket("600000") == code_bucket("600000")
    panel, sec = market()
    rx = evaluate_factor("cn", "size", panel=panel, securities=sec, run_backtest=False)
    rv = evaluate_factor("cn", "size", panel=panel, securities=sec, run_backtest=False, mode="validate")
    ux = set(rx.universe.columns[rx.universe.any()])
    uv = set(rv.universe.columns[rv.universe.any()])
    assert ux and uv and not (ux & uv)
    assert ux <= set(split_codes(panel["close_adj"].columns, "explore"))


# ---------------------------------------------------------------- 股票池
def test_universe_rules():
    panel, sec = market()
    days = trading_days(panel["close_adj"])
    dates = month_end_dates(days)
    spec = UniverseSpec(drop_small_pct=0.0, min_amount=0.0)
    m = build_universe(panel, dates, "cn", sec, spec)
    late = sec[sec["list_date"] > days[0]].iloc[0]
    d_list = pd.Timestamp(late["list_date"])
    pos = days.searchsorted(d_list)
    early = dates[(dates >= d_list) & (dates < days[pos + 115])]
    assert not m.loc[early, late["code"]].any()                 # 上市不满 120 天
    gone = sec.dropna(subset=["delist_date"]).iloc[0]
    assert not m.loc[dates[dates >= gone["delist_date"]], gone["code"]].any()
    assert not (m & panel["close_adj"].reindex(dates).isna()).any().any()   # 无价格不入池
    # 流动性只用 t 之前：改当日成交额不影响
    p2 = dict(panel)
    p2["amount"] = panel["amount"].copy()
    p2["amount"].loc[dates[40]] = 0.0
    spec_l = UniverseSpec(drop_small_pct=0.0, min_amount=1.0)
    assert build_universe(panel, dates[40:41], "cn", sec, spec_l).equals(build_universe(p2, dates[40:41], "cn", sec, spec_l))
    # 剔除最小 30%
    m30 = build_universe(panel, dates[30:31], "cn", sec, UniverseSpec(min_amount=0.0))
    assert m30.sum(axis=1).iloc[0] == pytest.approx(0.7 * m.loc[dates[30]].sum(), abs=1)
    kept = panel["mcap_float"].loc[dates[30], m30.iloc[0]]
    dropped = panel["mcap_float"].loc[dates[30], m.loc[dates[30]] & ~m30.iloc[0]]
    assert kept.min() > dropped.max()
    # 港股 / 美股：前 N 大、股价 ≥ 1
    mh = build_universe(panel, dates[30:31], "hk", sec, UniverseSpec(top_n_mcap=50, min_amount=0.0))
    assert mh.sum(axis=1).iloc[0] == 50
    p3 = dict(panel)
    p3["close"] = panel["close"].copy()
    c0 = panel["close"].columns[mh.iloc[0].to_numpy()][0]
    p3["close"].loc[dates[30], c0] = 0.5
    assert not build_universe(p3, dates[30:31], "hk", sec, UniverseSpec(top_n_mcap=50, min_amount=0.0)).loc[dates[30], c0]


# ---------------------------------------------------------------- 预处理与统计工具
def test_preprocess_and_stats():
    rng = np.random.default_rng(0)
    df = pd.DataFrame(rng.standard_normal((5, 100)))
    df.iloc[0, 0] = 100.0
    w = winsorize_mad(df, 5)
    med = df.iloc[0].median()
    mad = (df.iloc[0] - med).abs().median()
    assert w.iloc[0, 0] == pytest.approx(med + 5 * mad)
    z = zscore(w)
    assert np.allclose(z.mean(axis=1), 0) and np.allclose(z.std(axis=1), 1)
    r = rank_normalize(df)
    assert r.min().min() > -0.5 and r.max().max() < 0.5
    size = pd.DataFrame(rng.standard_normal((5, 100)))
    y = 2 * size + rng.standard_normal((5, 100)) * 0.1
    res = neutralize(y, size)
    for i in range(5):
        assert abs(np.corrcoef(res.iloc[i], size.iloc[i])[0, 1]) < 1e-8
    ind = pd.DataFrame(np.tile(np.repeat(["a", "b"], 50), (5, 1)))
    res2 = neutralize(y + (ind == "a") * 5.0, size, ind)
    assert abs(res2.iloc[0][:50].mean() - res2.iloc[0][50:].mean()) < 1e-8
    # NW t 与 spanning
    x = pd.Series(rng.standard_normal(300) * 0.02 + 0.01)
    assert nw_tstat(x, 0) == pytest.approx(x.mean() / (x.std(ddof=0) / np.sqrt(len(x))), rel=1e-6)
    f1 = pd.Series(rng.standard_normal(200))
    yv = 0.5 * f1 + rng.standard_normal(200) * 0.1
    sp = spanning_regression(yv, pd.DataFrame({"f1": f1}))
    assert abs(sp["alpha_t_nw"]) < 3 and sp["betas"]["f1"] == pytest.approx(0.5, abs=0.05)
    sp2 = spanning_regression(yv + 0.3, pd.DataFrame({"f1": f1}))
    assert sp2["alpha_t_nw"] > 10
