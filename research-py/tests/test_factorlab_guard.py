"""factorlab 护栏：锁箱截断与 embargo、批量解封（一次、预算、季度）、多重检验、有效试验数、PBO（合成数据）。"""

from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import pytest
from statsmodels.stats.multitest import multipletests

from factorlab.data import guard_panel
from factorlab.evaluate import evaluate_factor
from factorlab.guard import (Lockbox, TrialLedger, benjamini_hochberg, deflated_sharpe, effective_trials,
                             expected_max_sharpe, holm, holm_batch, pbo_cscv, probabilistic_sharpe, unseal)
from factorlab_synth import market, tmp_ledger  # noqa: F401


@pytest.fixture
def lockbox_file(tmp_path, monkeypatch):
    p = tmp_path / "lockbox.json"
    p.write_text(json.dumps({"embargo_months": 1, "budget_candidates": 3, "explore_frac": 0.7,
                             "markets": {"cn": {"start": "2016-01-01", "end": "2017-12-31"}}}))
    monkeypatch.setenv("FACTORLAB_LOCKBOX", str(p))
    return p


@pytest.fixture
def repo(tmp_path):
    d = tmp_path / "repo"
    d.mkdir()
    g = ["git", "-c", "user.email=t@example.com", "-c", "user.name=t"]
    subprocess.run(["git", "init", "-q"], cwd=d, check=True)
    hashes = []
    for i in range(4):
        subprocess.run([*g, "commit", "-q", "--allow-empty", "-m", f"prereg {i}"], cwd=d, check=True)
        hashes.append(subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=d, capture_output=True,
                                     text=True, check=True).stdout.strip())
    return d, hashes


def test_default_lockbox_config():
    lb = Lockbox(path=None)
    for m in ("cn", "hk", "us", "us_kf"):
        assert lb.interval(m) == (pd.Timestamp("2023-11-01"), pd.Timestamp("2026-11-30"))
    assert lb.budget == 24 and lb.explore_frac == 0.7


def test_lockbox_truncates_panel_and_forward_returns(tmp_ledger, lockbox_file):
    panel, sec = market()
    g = guard_panel(panel, "cn", "explore")
    assert g["close_adj"].index.max() < pd.Timestamp("2016-01-01")
    res = evaluate_factor("cn", "size", panel=panel, securities=sec, run_backtest=True)
    assert pd.Timestamp(res.summary["last_period_end"]) < pd.Timestamp("2015-12-01")   # 按结束日截断 + 1 个月间隔
    assert res.factor.index.max() < pd.Timestamp("2016-01-01")
    assert res.series.index.max() < pd.Timestamp("2015-12-01")
    for b in res.backtests.values():
        assert b["top"].returns.index.max() < pd.Timestamp("2016-01-01")
    with pytest.raises(PermissionError):
        guard_panel(panel, "cn", "confirm")
    with pytest.raises(PermissionError):
        evaluate_factor("cn", "size", panel=panel, securities=sec, mode="confirm")
    with pytest.raises(PermissionError):
        evaluate_factor("cn", "size", panel=panel, securities=sec, mode="forward")


def test_unseal_batch_once_logged_and_confirm(tmp_ledger, lockbox_file, repo):
    d, h = repo
    panel, sec = market()
    led = TrialLedger()
    q1 = datetime(2027, 2, 1, tzinfo=timezone.utc)
    with pytest.raises(ValueError):
        unseal("cn", "B1", ["deadbeef"], ["size"], repo=d, now=q1)          # 提交不存在
    tok = unseal("cn", "B1", [h[0]], ["size", "mom_12_1"], repo=d, now=q1)
    with pytest.raises(PermissionError):
        unseal("cn", "B1", [h[1]], ["vol_60d"], repo=d, now=datetime(2027, 5, 1, tzinfo=timezone.utc))  # 批次重复
    with pytest.raises(PermissionError):
        unseal("cn", "B2", [h[0]], ["vol_60d"], repo=d, now=datetime(2027, 5, 1, tzinfo=timezone.utc))  # 预注册重复
    with pytest.raises(PermissionError):
        unseal("cn", "B2", [h[1]], ["vol_60d"], repo=d, now=datetime(2027, 3, 1, tzinfo=timezone.utc))  # 同一季度
    with pytest.raises(PermissionError):
        unseal("cn", "B2", [h[1]], ["a", "b"], repo=d, now=datetime(2027, 5, 1, tzinfo=timezone.utc))   # 超预算（3）
    rows = json.loads((tmp_ledger / "unseals.json").read_text())
    assert len(rows) == 1 and rows[0]["batch_id"] == "B1" and rows[0]["quarter"] == "2027Q1"
    assert [r["event"] for r in led.read("cn")] == ["unseal"]

    res = evaluate_factor("cn", "size", panel=panel, securities=sec, mode="confirm", token=tok)
    assert pd.Timestamp(res.summary["last_period_end"]) <= pd.Timestamp("2017-12-31")
    first_end = res.series.index.min()
    assert first_end >= pd.Timestamp("2016-01-01")
    assert res.factor.index.max() <= pd.Timestamp("2017-12-31")
    assert res.record["batch_id"] == "B1"
    evaluate_factor("cn", "mom_12_1", panel=panel, securities=sec, mode="confirm", token=Lockbox().token("cn", "B1"))
    with pytest.raises(PermissionError):   # 不在本批候选里
        evaluate_factor("cn", "vol_60d", panel=panel, securities=sec, mode="confirm", token=tok)
    adj = holm_batch("cn", "B1")
    assert set(adj) == {"size", "mom_12_1"} and all(0 <= v <= 1 for v in adj.values())
    # 第三个候选用完预算后锁箱作废
    unseal("cn", "B2", [h[1]], ["vol_60d"], repo=d, now=datetime(2027, 5, 1, tzinfo=timezone.utc))
    assert Lockbox().is_void("cn")
    with pytest.raises(PermissionError):
        unseal("cn", "B3", [h[2]], ["x"], repo=d, now=datetime(2027, 8, 1, tzinfo=timezone.utc))
    assert sum(r["event"] == "unseal" for r in led.read("cn")) == 2
    # 前推区：给出存在的预注册才行
    res_f = evaluate_factor("cn", "size", panel=panel, securities=sec, mode="forward", prereg=h[3], repo=d,
                            run_backtest=False)
    assert pd.Timestamp(res_f.summary["first_period"]) >= pd.Timestamp("2017-12-24")


def test_forged_token_rejected(tmp_ledger, lockbox_file):
    from factorlab.guard import UnsealToken

    panel, sec = market()
    fake = UnsealToken("cn", "BX", ("0" * 40,), ("size",), "2027-01-01")
    with pytest.raises(PermissionError):
        evaluate_factor("cn", "size", panel=panel, securities=sec, mode="confirm", token=fake)


def test_multiple_testing_helpers():
    p = np.array([0.01, 0.04, 0.03, 0.005, 0.2])
    a, r = benjamini_hochberg(p, 0.05)
    a2 = multipletests(p, 0.05, "fdr_bh")[1]
    assert np.allclose(a, a2)
    h, hr = holm(p, 0.05)
    assert np.allclose(h, multipletests(p, 0.05, "holm")[1])
    assert hr.tolist() == multipletests(p, 0.05, "holm")[0].tolist()
    # DSR：一次试验 = PSR(0)；试验越多 DSR 越低
    assert deflated_sharpe(0.2, 1, 0.01, 120) == pytest.approx(probabilistic_sharpe(0.2, 0.0, 120))
    assert deflated_sharpe(0.2, 100, 0.01, 120) < deflated_sharpe(0.2, 10, 0.01, 120) < deflated_sharpe(0.2, 1, 0.01, 120)
    assert expected_max_sharpe(1, 0.01) == 0.0 and expected_max_sharpe(50, 0.01) > 0.2


def test_effective_trials_and_pbo():
    rng = np.random.default_rng(3)
    T = 240
    base = rng.standard_normal((T, 3))
    cols = {}
    for k in range(3):
        for j in range(4):
            cols[f"c{k}_{j}"] = base[:, k] + 0.2 * rng.standard_normal(T) * (1 if j % 2 else -1)
    cols["c0_neg"] = -base[:, 0]                       # 反号视为同一信号
    m = pd.DataFrame(cols, index=pd.date_range("2000-01-31", periods=T, freq="ME"))
    e = effective_trials(matrix=m)
    assert e["n_raw"] == 13 and e["n_effective"] == 3
    noise = pd.DataFrame(rng.standard_normal((T, 20)) * 0.04)
    assert 0.25 < pbo_cscv(noise, 10)["pbo"] < 0.75
    good = noise.copy()
    good[0] = good[0] + 0.03
    assert pbo_cscv(good, 10)["pbo"] < 0.1


def test_effective_trials_from_ledger(tmp_ledger):
    panel, sec = market()
    for name in ("mom_12_1", "rev_1m", "size"):
        evaluate_factor("cn", name, panel=panel, securities=sec, run_backtest=False)
    evaluate_factor("cn", "mom_12_1", panel=panel, securities=sec, run_backtest=False, params={})
    led = TrialLedger()
    mat = led.series_matrix("cn")
    assert mat.shape[1] == 3
    e = effective_trials("cn", led)
    assert 1 <= e["n_effective"] <= 3
