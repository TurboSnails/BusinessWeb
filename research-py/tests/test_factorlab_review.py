"""2026-11-26 代码审查后的回归测试：每个测试对应审查报告的一个缺陷（复现脚本 t_*.py 转写），修复前失败、修复后通过。

全部用合成数据；登记簿与锁箱配置经测试钩子（guard.set_test_overrides）指向临时目录。
"""

from __future__ import annotations

import inspect
import json
import subprocess
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import pytest

from factorlab import data as data_mod
from factorlab import evaluate as ev
from factorlab import guard, store
from factorlab.backtest import _backtest as backtest
from factorlab.backtest import quantile_labels, select_top, tie_keys
from factorlab.calendar import month_end_dates, trading_days
from factorlab.evaluate import _forward_returns, _ic_series, candidate_spec, cumulative_forward, evaluate_factor
from factorlab.guard import Lockbox, TrialLedger, effective_trials, deflated_sharpe_from_ledger, split_codes, unseal
from factorlab.preprocess import standard_pipeline, winsorize_mad, zscore
from factorlab.report import to_markdown
from factorlab.universe import AdvCache, UniverseSpec, build_universe, rolling_median_at
from factorlab_synth import make_prereg_repo, market, tmp_ledger, to_long, use_lockbox  # noqa: F401

LB_2016 = {"embargo_months": 1, "budget_candidates": 24, "explore_frac": 0.7,
           "markets": {"cn": {"start": "2016-01-01", "end": "2017-12-31"}}}


@pytest.fixture
def lockbox_2016(tmp_path, tmp_ledger):
    p = tmp_path / "lockbox.json"
    p.write_text(json.dumps(LB_2016))
    use_lockbox(p)
    return p


@pytest.fixture
def data_root(tmp_path, monkeypatch):
    d = tmp_path / "data"
    monkeypatch.setenv("FACTORLAB_DATA", str(d))
    return d


@pytest.fixture
def repo(tmp_path):
    d = tmp_path / "repo"
    h = make_prereg_repo(d, [
        ("docs/research/factorlab/PREREG-2027Q1.md", "# 预注册\n候选：size、mom_12_1\n功效计算：……\n"),
        (None, ""),                                                      # 空提交（没有预注册文件）
        ("docs/research/notes.md", "size mom_12_1"),                    # 文件名不含 PREREG
        ("docs/research/factorlab/PREREG-2027Q2.md", "候选：vol_60d\n"),  # 没列 size
        ("docs/research/factorlab/PREREG-fwd.md", "前推：size\n"),
    ])
    return d, h


def at(monkeypatch, *ymd):
    monkeypatch.setattr(guard, "_now", lambda: datetime(*ymd, tzinfo=timezone.utc))


# ---------------------------------------------------------------- 1. 衰减 h ≥ 2 的前视（t_decay.py）
def _crash_panel():
    """每个调仓日因子最低 20% 的股票在下一期线性跌 60%：它们随后市值变小、掉出「剔除最小 30%」的股票池。"""
    panel, sec = market(n=400, n_years=6, seed=3)
    days = trading_days(panel["close_adj"])
    dates = month_end_dates(days)
    rng = np.random.default_rng(0)
    F = pd.DataFrame(rng.standard_normal((len(dates), panel["close_adj"].shape[1])), index=dates,
                     columns=panel["close_adj"].columns)
    ca = panel["close_adj"].copy()
    for k in range(len(dates) - 1):
        d0, d1 = dates[k], dates[k + 1]
        low = F.loc[d0] < F.loc[d0].quantile(0.2)
        seg = (ca.index > d0) & (ca.index <= d1)
        fac = np.ones(len(ca))
        fac[seg] = np.linspace(1, 0.4, seg.sum())
        fac[ca.index > d1] = 0.4
        ca.loc[:, low] = ca.loc[:, low].mul(fac, axis=0)
    for k in ("close", "open", "high", "low", "mcap_float"):
        panel[k] = panel[k] * (ca / panel["close_adj"])
    panel["close_adj"] = ca
    return panel, sec, F


def test_decay_uses_formation_date_universe_only(tmp_ledger):
    panel, sec, F = _crash_panel()
    res = evaluate_factor("cn", F, name="crash", panel=panel, securities=sec, execution="close",
                          universe=UniverseSpec(min_amount=0), run_backtest=False, max_horizon=3)
    g = data_mod.guard_panel(panel, "cn", "explore")
    sg = data_mod.guard_securities(sec, "explore", pd.Timestamp("2023-11-01"), None, 0.7)
    dates = res.factor.index
    fwd, ends = _forward_returns(g, dates, "close", sg)
    in_zone = Lockbox().period_in_zone(dates, ends, "cn", "explore")
    zdates = res.ic.index
    fz, mask = res.factor.loc[zdates], res.universe
    zone = pd.DataFrame(np.repeat(in_zone[:, None], fwd.shape[1], 1), index=fwd.index, columns=fwd.columns)
    fixed = _ic_series(fz, cumulative_forward(fwd.where(zone), 2).loc[zdates].where(mask.loc[zdates]))
    buggy = _ic_series(fz, cumulative_forward(fwd.where(zone).where(mask), 2).loc[zdates])
    assert res.decay.loc[2, "rank_ic_mean"] == pytest.approx(fixed["rank_ic"].mean(), abs=1e-12)
    # 旧写法（用 d+1 的股票池掩码）把下一期掉出池的股票剔掉，系统性低估 h=2 的 IC
    assert fixed["rank_ic"].mean() - buggy["rank_ic"].mean() > 0.02
    assert res.decay.loc[1, "rank_ic_mean"] == pytest.approx(res.summary["rank_ic_mean"], abs=1e-12)


# ---------------------------------------------------------------- 2. forward 模式要预注册（t_guard.py D1）
def test_forward_requires_prereg_and_hides_lockbox_without_token(tmp_ledger, lockbox_2016, repo, data_root,
                                                                 monkeypatch):
    d, h = repo
    panel, sec = market()
    with pytest.raises(PermissionError):
        data_mod.guard_panel(panel, "cn", "forward")                      # 旧代码：直接返回全部数据
    with pytest.raises(ValueError):
        data_mod.guard_panel(panel, "cn", "forward", prereg="HEAD", repo=d)
    with pytest.raises(ValueError):
        data_mod.guard_panel(panel, "cn", "forward", prereg=h[1], repo=d)  # 提交里没有预注册文件
    g = data_mod.guard_panel(panel, "cn", "forward", prereg=h[4], repo=d)
    idx = g["close_adj"].index
    assert idx.max() > pd.Timestamp("2018-06-01") and idx.min() < pd.Timestamp("2015-12-01")
    assert not ((idx >= pd.Timestamp("2016-01-01")) & (idx <= pd.Timestamp("2017-12-31"))).any()
    # 有本市场有效凭证（已解封）时才看得到锁箱区间
    at(monkeypatch, 2027, 2, 1)
    tok = unseal("cn", "B1", [h[0]], [candidate_spec("cn", "size")], repo=d)
    full = data_mod.guard_panel(panel, "cn", "forward", token=tok, prereg=h[4], repo=d)
    assert len(full["close_adj"]) == len(panel["close_adj"])
    # 直接走数据层读 forward 也记账
    store.write_securities("cn", sec)
    store.write_prices("cn", to_long(panel))
    data_mod.load_market("cn", ["close_adj"], mode="forward", prereg=h[4], repo=d)
    ev_ = [r for r in TrialLedger().read("cn") if r["event"] == "data_access"]
    assert ev_ and ev_[-1]["mode"] == "forward" and ev_[-1]["hidden"] == ["2016-01-01", "2018-01-01"]
    # 评估层：forward 只接受预注册里列出的已注册因子
    with pytest.raises(ValueError):
        evaluate_factor("cn", "mom_12_1", panel=panel, securities=sec, mode="forward", prereg=h[4], repo=d,
                        run_backtest=False)


# ---------------------------------------------------------------- 3. 锁箱 / 登记簿不可调包（t_guard.py D2/D3）
def test_lockbox_and_ledger_paths_cannot_be_swapped(tmp_ledger, tmp_path, monkeypatch, data_root):
    assert store.LOCKBOX_FILE.resolve() == guard.DEFAULT_LOCKBOX.resolve()
    for call in (lambda: Lockbox(path=tmp_path / "x.json"), lambda: TrialLedger(tmp_path),
                 lambda: unseal("cn", "B", ["0" * 40], [], ledger=None)):
        with pytest.raises(TypeError):
            call()
    assert "lockbox" not in inspect.signature(evaluate_factor).parameters
    assert "ledger" not in inspect.signature(evaluate_factor).parameters
    monkeypatch.setenv("FACTORLAB_LOCKBOX", str(tmp_path / "empty.json"))
    with pytest.raises(RuntimeError):
        Lockbox()
    monkeypatch.delenv("FACTORLAB_LOCKBOX")
    monkeypatch.setenv("FACTORLAB_LEDGER", str(tmp_path / "elsewhere"))
    with pytest.raises(RuntimeError):
        TrialLedger()
    monkeypatch.delenv("FACTORLAB_LEDGER")

    # 测试钩子换成「没有任何市场」的锁箱：记录里写明路径与 test_override
    empty = tmp_path / "lb_none.json"
    empty.write_text('{"markets": {}}')
    use_lockbox(empty)
    panel, sec = market()
    res = evaluate_factor("cn", "size", panel=panel, securities=sec, run_backtest=False)
    rec = res.record
    assert rec["test_override"] is True and rec["lockbox_path"].endswith("lb_none.json")
    assert rec["ledger_root"] == str(tmp_ledger.resolve())
    # 钩子 + 仓库数据目录：confirm / forward 拒绝，explore 仍截在包内锁箱起点（2023-11-01）以前
    p2, s2 = market(n=60, n_years=6, start="2019-01-01")
    store.write_securities("cn", s2)
    store.write_prices("cn", to_long(p2))
    monkeypatch.setattr(data_mod, "repo_data", lambda: True)
    md = data_mod.load_market("cn", ["close_adj"], mode="explore")
    assert md.panel["close_adj"].index.max() < pd.Timestamp("2023-11-01")
    for mode in ("confirm", "forward"):
        with pytest.raises(PermissionError):
            data_mod.load_market("cn", ["close_adj"], mode=mode, prereg="0" * 40)


# ---------------------------------------------------------------- 4. 解封后冻结候选（t_guard.py D4）
def test_unseal_freezes_candidates_and_confirm_once(tmp_ledger, lockbox_2016, repo, monkeypatch):
    d, h = repo
    panel, sec = market()
    assert "now" not in inspect.signature(unseal).parameters
    at(monkeypatch, 2027, 2, 1)
    size = candidate_spec("cn", "size")
    assert set(size) == {"factor", "source_hash", "params_hash", "config_hash"}
    with pytest.raises(ValueError):
        unseal("cn", "B1", ["HEAD"], [size], repo=d)                     # 符号引用
    with pytest.raises(ValueError):
        unseal("cn", "B1", [h[1]], [size], repo=d)                       # 没有预注册文件
    with pytest.raises(ValueError):
        unseal("cn", "B1", [h[2]], [size], repo=d)                       # 文件名不含 PREREG
    with pytest.raises(ValueError):
        unseal("cn", "B1", [h[3]], [size], repo=d)                       # 预注册没列 size
    with pytest.raises(TypeError):
        unseal("cn", "B1", [h[0]], ["size"], repo=d)                     # 只给名字不行
    with pytest.raises(TypeError):
        candidate_spec("cn", pd.DataFrame())
    tok = unseal("cn", "B1", [h[0]], [size, candidate_spec("cn", "mom_12_1")], repo=d)
    assert tok.names == ("size", "mom_12_1")

    dates = month_end_dates(trading_days(panel["close_adj"]))
    fwd, _ = _forward_returns(panel, dates, "open", sec)
    with pytest.raises(PermissionError):                                 # 冒名的 DataFrame（偷看未来收益）
        evaluate_factor("cn", fwd, name="size", mode="confirm", token=tok, panel=panel, securities=sec,
                        run_backtest=False)
    with pytest.raises(PermissionError):                                 # 换口径 = 不同写法
        evaluate_factor("cn", "size", mode="confirm", token=tok, panel=panel, securities=sec,
                        run_backtest=False, preprocess={"method": "rank"})
    with pytest.raises(PermissionError):                                 # 换执行时点也不行
        evaluate_factor("cn", "size", mode="confirm", token=tok, panel=panel, securities=sec, execution="close")
    evaluate_factor("cn", "size", mode="confirm", token=tok, panel=panel, securities=sec)
    with pytest.raises(PermissionError):                                 # 每个候选只能确认一次
        evaluate_factor("cn", "size", mode="confirm", token=tok, panel=panel, securities=sec)
    led = TrialLedger()
    conf = [r for r in led.read("cn") if r.get("mode") == "confirm"]
    assert [r["status"] for r in conf] == ["refused", "refused", "refused", "ok", "refused"]
    assert led.count_trials("cn", mode="confirm") == 1
    assert "确认过一次" in conf[-1]["error"]


# ---------------------------------------------------------------- 5. 同名不同内容的试验不能合并（t_trials.py）
def test_trial_identity_includes_source_hash(tmp_ledger):
    panel, sec = market()
    dates = month_end_dates(trading_days(panel["close_adj"]))
    best = None
    for k in range(10):
        df = pd.DataFrame(np.random.default_rng(k).standard_normal((len(dates), 200)), index=dates,
                          columns=panel["close_adj"].columns)
        r = evaluate_factor("cn", df, name="expr", panel=panel, securities=sec, run_backtest=False)
        if best is None or r.summary["tmu_cap_t_nw"] > best[0]:
            best = (r.summary["tmu_cap_t_nw"], r.series["tmu_cap"])
    # 同一内容再评估一次不算新写法
    evaluate_factor("cn", df, name="expr", panel=panel, securities=sec, run_backtest=False)
    led = TrialLedger()
    assert led.count_trials("cn") == 11 and led.count_trials("cn", distinct=True) == 10
    assert len({r["source_hash"] for r in led.trials("cn")}) == 10
    assert effective_trials("cn", led)["n_effective"] >= 8
    d = deflated_sharpe_from_ledger("cn", best[1], led)
    assert d["n_effective"] >= 8 and d["dsr"] < d["psr"]


# ---------------------------------------------------------------- 6. 证券表泄露锁箱信息（t_sec.py）
def test_securities_censored_by_visible_end(tmp_ledger, tmp_path, data_root):
    p = tmp_path / "lb.json"
    p.write_text(json.dumps({"markets": {"cn": {"start": "2017-01-01", "end": "2018-06-30"}}}))
    use_lockbox(p)
    panel, sec = market(n=200, n_years=8, seed=7)
    store.write_securities("cn", sec)
    store.write_prices("cn", to_long(panel))
    assert (sec["delist_date"] >= "2017-01-01").sum() > 0                 # 合成数据里确有锁箱期退市
    for mode in ("explore", "validate"):
        s = data_mod.load_market("cn", ["close_adj"], mode=mode).securities
        assert not (s["delist_date"] >= "2017-01-01").any()
        assert not (s["list_date"] >= "2017-01-01").any()
        assert set(s["code"]) <= set(split_codes(sec["code"], mode))
        hidden = set(sec.loc[sec["delist_date"] >= "2017-01-01", "code"]) & set(s["code"])
        assert (s.set_index("code").loc[sorted(hidden), "status"] == "listed").all()


# ---------------------------------------------------------------- 7. MAD = 0 抹平截面（t_mad.py）
def test_mad_zero_does_not_wipe_cross_section():
    x = pd.DataFrame([[0, 0, 0, 0, 0, 0, 1, 1, 2, 5.0]])                # 例如「过去 20 日涨停次数」
    assert winsorize_mad(x).iloc[0].nunique() > 1
    z = standard_pipeline(x)
    assert z.notna().all().all() and z.iloc[0].idxmax() == 9
    y = pd.DataFrame([np.r_[np.zeros(60), np.arange(1, 41)]])          # 60% 相同值的连续因子
    assert standard_pipeline(y).notna().sum().sum() == 100
    const = pd.DataFrame([[3.0] * 10])
    assert standard_pipeline(const).isna().all().all()                  # 真常数才置空
    assert zscore(pd.DataFrame([[1.0, 1.0, 2.0]])).notna().all().all()
    # 正常截面仍按 MAD 截
    rng = np.random.default_rng(0)
    df = pd.DataFrame(rng.standard_normal((1, 100)))
    df.iloc[0, 0] = 100.0
    med = df.iloc[0].median()
    assert winsorize_mad(df).iloc[0, 0] == pytest.approx(med + 5 * (df.iloc[0] - med).abs().median())


# ---------------------------------------------------------------- 8. 并列值：分组与回测选出同一批（t_ties.py）
def test_tie_breaking_shared_between_grouping_and_backtest():
    panel, sec = market(n=100, n_years=2, seed=1)
    dates = month_end_dates(trading_days(panel["close_adj"]))[:3]
    codes = panel["close_adj"].columns
    f = pd.DataFrame(0.0, index=dates, columns=codes)
    f.iloc[:, :5] = 1.0                                                 # 5 只真正的高值，其余并列
    f = f.where(panel["close_adj"].reindex(dates).notna())             # 只比较当日有价格（可成交）的
    x = f.loc[dates[0]].to_numpy()
    q_top = set(codes[quantile_labels(x, tie_keys(codes), 5) == 5])
    bt = backtest(f, panel, "cn", None, top_q=0.2, weighting="equal", slippage=None, execution="close",
                  constraints=False)
    bt_top = set(bt.weights[dates[0]].index)
    k = int(np.isfinite(x).sum())
    assert len(q_top) == round(k / 5) and q_top == bt_top
    assert set(codes[:5]) <= bt_top
    # 与列顺序无关
    rev = codes[::-1]
    bt2 = backtest(f[rev], {c: v[rev] for c, v in panel.items()}, "cn", None, top_q=0.2, weighting="equal",
                   slippage=None, execution="close", constraints=False)
    assert set(bt2.weights[dates[0]].index) == bt_top
    # evaluate 的分组均值与回测选出的名单一致
    fwd = pd.DataFrame(np.random.default_rng(2).standard_normal(f.shape), index=dates, columns=codes)
    _, sd = ev.quantile_analysis(f, fwd, None, 5)
    assert sd.loc[dates[0], "top_ew"] == pytest.approx(fwd.loc[dates[0], sorted(bt_top)].mean())
    assert select_top(x, tie_keys(codes), 0.2).sum() == len(bt_top)


# ---------------------------------------------------------------- 9. 空股票池 / 缺市值（t_us.py）
def test_us_without_mcap_uses_liquidity_screen_and_empty_universe_errors(tmp_ledger):
    panel, sec = market(n=200, n_years=8, seed=7)
    panel["mcap_float"] = panel["mcap_float"] * np.nan
    for k in ("limit_up", "limit_down"):
        panel[k] = panel[k] * np.nan
    r = evaluate_factor("us", "mom_12_1", panel=panel, securities=sec, run_backtest=True)
    assert r.summary["universe_size_mean"] >= 30 and np.isfinite(r.summary["rank_ic_mean"])
    assert r.record["universe_applied"]["size_screen"]["amount"] > 0
    assert r.record["universe_applied"]["size_screen"]["mcap"] == 0
    assert r.record["weighting_applied"]["adv_proxy"] > 0
    assert r.record["config"]["universe"]["mcap_fallback"] == "amount"
    assert np.isfinite(r.summary["tmu_cap_mean"]) and np.isfinite(r.summary["bt_cap_excess_cagr"])
    # 股票池为空 → 明确报错并记 status='error'
    with pytest.raises(ValueError, match="min_universe"):
        evaluate_factor("us", "mom_12_1", panel=panel, securities=sec, run_backtest=False,
                        universe=UniverseSpec(min_price=1e9))
    last = TrialLedger().read("us")[-1]
    assert last["status"] == "error" and "min_universe" in last["error"]
    # 覆盖率太低同样报错
    dates = month_end_dates(trading_days(panel["close_adj"]))
    sparse = pd.DataFrame(np.nan, index=dates, columns=panel["close_adj"].columns)
    sparse.iloc[:, :3] = 1.0
    with pytest.raises(ValueError, match="覆盖率"):
        evaluate_factor("us", sparse, name="sparse", panel=panel, securities=sec, run_backtest=False)


# ---------------------------------------------------------------- 10. 70/30 在数据层强制；底层工具不公开
def test_split_enforced_at_data_layer_and_helpers_private(tmp_ledger):
    panel, _ = market()
    codes = panel["close_adj"].columns
    gx = data_mod.guard_panel(panel, "cn", "explore")
    gv = data_mod.guard_panel(panel, "cn", "validate")
    assert set(gx["close_adj"].columns) == set(split_codes(codes, "explore"))
    assert set(gv["close_adj"].columns) == set(split_codes(codes, "validate"))
    assert all(set(v.columns) == set(gx["close_adj"].columns) for v in gx.values())
    for name in ("forward_returns", "ic_series"):
        assert not hasattr(ev, name)
    import factorlab.backtest as bt_mod
    assert not hasattr(bt_mod, "backtest_vs_universe") and not hasattr(bt_mod, "backtest")


# ---------------------------------------------------------------- 回测手算核对（t_bt.py，原本就对，转为永久测试）
def test_backtest_hand_calculation():
    days = pd.DatetimeIndex(["2020-01-30", "2020-01-31", "2020-02-03", "2020-02-04", "2020-02-27", "2020-02-28",
                             "2020-03-02", "2020-03-03"])
    a_c, a_o = [10, 10, 12, 9, 9, 9, 10, 10], [10, 10, 11, 12, 9, 9, 9.5, 10]
    b_c, b_o = [20, 20, 20, 20, 20, 20, 22, 22], [20, 20, 20, 20, 20, 20, 21, 22]

    def w(a, b):
        return pd.DataFrame({"A": a, "B": b}, index=days, dtype=float)

    panel = {"close_adj": w(a_c, b_c), "close": w(a_c, b_c), "open": w(a_o, b_o), "open_adj": w(a_o, b_o),
             "high": w(a_c, b_c) * 1.01, "low": w(a_c, b_c) * 0.99, "volume": w([1e6] * 8, [1e6] * 8),
             "amount": w([1e7] * 8, [1e7] * 8), "mcap_float": w([1e9] * 8, [1e9] * 8)}
    f = pd.DataFrame({"A": [1.0, 0.0], "B": [0.0, 1.0]}, index=pd.DatetimeIndex(["2020-01-31", "2020-02-28"]))
    r = backtest(f, panel, "cn", None, top_q=0.5, weighting="equal", slippage=None)
    c_b = 0.00025 + 0.00001
    c_s = c_b + 0.001
    exp = {"2020-02-03": (12 / 11) * (1 - c_b) - 1, "2020-02-04": 9 / 12 - 1,
           "2020-03-02": (9.5 / 9) * (1 - c_s - c_b) * (22 / 21) - 1}
    for d, e in exp.items():
        assert r.returns[d] == pytest.approx(e, abs=1e-10)
    assert r.turnover.to_dict() == {pd.Timestamp("2020-02-03"): 0.5, pd.Timestamp("2020-03-02"): 1.0}
    r2 = backtest(f.iloc[:1], panel, "cn", None, top_q=0.5, weighting="equal", slippage=None, capital=10000)
    assert r2.weights[pd.Timestamp("2020-02-03")].to_dict() == pytest.approx({"A": 900 * 11 / 10000})
    assert r2.costs.iloc[0] == pytest.approx(5 / 10000 + 0.99 * 0.00001)


# ---------------------------------------------------------------- 股票池基准 = 全部入池证券（与回测一致）
def test_universe_benchmark_is_full_universe():
    dates = pd.DatetimeIndex(["2020-01-31"])
    codes = [f"{i:06d}" for i in range(40)]
    rng = np.random.default_rng(5)
    fwd = pd.DataFrame(rng.standard_normal((1, 40)) * 0.1, index=dates, columns=codes)
    f = pd.DataFrame(rng.standard_normal((1, 40)), index=dates, columns=codes)
    f.iloc[0, 20:] = np.nan                                             # 因子只覆盖一半
    w = pd.DataFrame(rng.uniform(1, 10, (1, 40)), index=dates, columns=codes)
    _, sd = ev.quantile_analysis(f, fwd, w, 5)
    assert sd.loc[dates[0], "univ_ew"] == pytest.approx(fwd.iloc[0].mean())
    assert sd.loc[dates[0], "univ_cap"] == pytest.approx((fwd.iloc[0] * w.iloc[0]).sum() / w.iloc[0].sum())


# ---------------------------------------------------------------- 报告措辞随口径
def test_report_wording_follows_config(tmp_ledger):
    panel, sec = market()
    res = evaluate_factor("cn", "size", panel=panel, securities=sec, execution="close", n_quantiles=4, top_q=0.1)
    md = to_markdown(res)
    assert "当日收盘成交" in md and "次日开盘成交" not in md
    assert "前 25%" in md and "前 10%" in md and "前 20%" not in md
    md2 = to_markdown(evaluate_factor("cn", "size", panel=panel, securities=sec))
    assert "次日开盘成交" in md2 and "前 20%" in md2


# ---------------------------------------------------------------- 登记簿并发写入（文件锁）
WRITER = r"""
import sys
from factorlab import guard
guard.set_test_overrides(ledger_root=sys.argv[1])
led = guard.TrialLedger()
print("ready", flush=True)
for i in range(int(sys.argv[3])):
    led.append("cn", {"event": "note", "w": sys.argv[2], "i": i, "pad": "x" * 200_000})
print("done", flush=True)
"""


def _writer(root, k, n):
    import os

    env = {key: v for key, v in os.environ.items() if not key.startswith("FACTORLAB_")}
    env["PYTHONPATH"] = os.pathsep.join([str(guard.RESEARCH_DIR), env.get("PYTHONPATH", "")])
    return subprocess.Popen([sys.executable, "-c", WRITER, str(root), str(k), str(n)], env=env,
                            stdout=subprocess.PIPE, text=True)


def test_ledger_append_takes_file_lock(tmp_ledger):
    import time

    with guard._file_lock(tmp_ledger):                                  # 别的进程持锁时，append 必须等待
        p = _writer(tmp_ledger, 0, 1)
        assert p.stdout.readline().strip() == "ready"
        time.sleep(1.0)
        assert p.poll() is None and not (tmp_ledger / "cn.jsonl").exists()
    assert p.wait(timeout=60) == 0 and p.stdout.readline().strip() == "done"
    procs = [_writer(tmp_ledger, k, 15) for k in range(1, 5)]          # 多进程同时追加：行不交错、不丢
    assert all(q.wait(timeout=120) == 0 for q in procs)
    recs = [json.loads(x) for x in (tmp_ledger / "cn.jsonl").read_text(encoding="utf-8").splitlines()]
    assert len(recs) == 61 and len({(r["w"], r["i"]) for r in recs}) == 61


# ---------------------------------------------------------------- 成交额中位数只算需要的日子，结果与 pandas 一致
def test_rolling_median_at_matches_pandas():
    panel, _ = market()
    amt = panel["amount"]
    dates = month_end_dates(trading_days(amt))
    ref = amt.shift(1).rolling(20, min_periods=10).median().reindex(dates)
    got = rolling_median_at(amt, dates, 20)
    pd.testing.assert_frame_equal(got, ref, check_freq=False, check_names=False)
    cache = AdvCache(amt, 20)
    pd.testing.assert_frame_equal(cache.at(dates), ref, check_freq=False, check_names=False)
    spec = UniverseSpec(min_amount=1e7)
    m1 = build_universe(panel, dates, "cn", None, spec)
    m2 = build_universe(panel, dates, "cn", None, spec, adv=cache)
    pd.testing.assert_frame_equal(m1, m2)
