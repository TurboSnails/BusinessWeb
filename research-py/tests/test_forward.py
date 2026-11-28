"""前推记账 forward.py：只前推区、冻结行、哈希核对、撤下、Holm 三档（合成数据）。"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from factorlab import forward
from factorlab.evaluate import candidate_spec, evaluate_factor, nw_tstat
from factorlab.forward import (CANDIDATES, TIER_FAIL, TIER_PASS, TIER_WEAK, build_rows_from_series,
                               empty_doc, frozen_violations, holm_judge, run_forward, save_forward,
                               tier_verdict, verify_frozen, withdraw_triggered)
from factorlab.guard import Lockbox, truncate_panel
from factorlab_synth import make_prereg_repo, market, tmp_ledger, use_lockbox  # noqa: F401


@pytest.fixture
def lockbox_file(tmp_path, tmp_ledger):
    p = tmp_path / "lockbox.json"
    p.write_text(json.dumps({
        "embargo_months": 1, "budget_candidates": 24, "explore_frac": 0.7,
        "markets": {"cn": {"start": "2016-01-01", "end": "2017-12-31"}},
    }))
    use_lockbox(p)
    return p


@pytest.fixture
def repo(tmp_path):
    d = tmp_path / "repo"
    hashes = make_prereg_repo(d, [
        ("docs/research/factorlab/PREREG-fwd.md",
         "# 预注册\n候选：size mom_12_1 cn_sue cn_sur turnover_vol_20d\n"),
    ])
    return d, hashes


def test_verify_frozen_ok_against_live_code():
    """当前仓库因子源码哈希应与 PREREG / CANDIDATES 一致。"""
    assert verify_frozen("cn") == []


def test_verify_frozen_rejects_mismatch(monkeypatch):
    bad = [{**CANDIDATES[0], "source_hash": "deadbeefdead"}]
    monkeypatch.setattr(forward, "CANDIDATES", bad)
    errs = verify_frozen("cn")
    assert errs and "source_hash" in errs[0] and "cn_sue" in errs[0]
    with pytest.raises(SystemExit, match="哈希"):
        run_forward("cn", dry_run=True)


def test_withdraw_triggered():
    assert withdraw_triggered(23, -2.0) is False
    assert withdraw_triggered(24, -1.0) is False
    assert withdraw_triggered(24, -1.01) is True
    assert withdraw_triggered(24, None) is False
    assert withdraw_triggered(30, -0.5) is False


def test_build_rows_and_withdraw_after_24_negative_months():
    """24 期持续负收益 → 累计 NW t < −1 → 末行 withdraw_trigger。"""
    rng = np.random.default_rng(0)
    # 均值约 −2%，噪声小，24 期 NW t 应远小于 −1
    idx = pd.date_range("2027-01-31", periods=24, freq="ME")
    rets = pd.Series(-0.02 + rng.normal(0, 0.002, 24), index=idx)
    rows = build_rows_from_series(rets)
    assert len(rows) == 24
    assert rows[0]["n_periods"] == 1 and rows[0]["withdraw_trigger"] is False
    assert rows[2]["nw_t"] is not None  # ≥3 期才有 t
    last = rows[-1]
    assert last["n_periods"] == 24
    assert last["nw_t"] < -1
    assert last["withdraw_trigger"] is True
    # 与引擎 nw_tstat 一致
    assert last["nw_t"] == pytest.approx(nw_tstat(rets), rel=1e-9)


def test_frozen_violations_detect_rewrite_and_delete():
    prev = empty_doc("cn", "x")
    prev["candidates"]["cn_sue"]["rows"] = [{
        "month": "2027-01", "period_end": "2027-01-29", "ret": 0.01,
        "n_periods": 1, "cum_mean": 0.01, "nw_t": None,
        "withdraw_trigger": False, "frozen_at": "t0",
    }]
    nxt = json.loads(json.dumps(prev))
    assert frozen_violations(prev, nxt) == []
    nxt["candidates"]["cn_sue"]["rows"][0]["ret"] = 0.02
    assert any("改写" in x for x in frozen_violations(prev, nxt))
    nxt2 = json.loads(json.dumps(prev))
    nxt2["candidates"]["cn_sue"]["rows"] = []
    assert any("删除" in x for x in frozen_violations(prev, nxt2))


def test_save_forward_rejects_rewrite(tmp_path):
    path = tmp_path / "forward.json"
    doc = empty_doc("cn", "init")
    doc["candidates"]["cn_sue"]["rows"] = [{
        "month": "2027-01", "period_end": "2027-01-29", "ret": 0.01,
        "n_periods": 1, "cum_mean": 0.01, "nw_t": None,
        "withdraw_trigger": False, "frozen_at": "t0",
    }]
    save_forward(doc, path, previous=None)
    prev = json.loads(path.read_text())
    bad = json.loads(json.dumps(prev))
    bad["candidates"]["cn_sue"]["rows"][0]["cum_mean"] = 99.0
    with pytest.raises(SystemExit, match="冻结行"):
        save_forward(bad, path, previous=prev)


def test_holm_three_tiers():
    # ½·m* 用 CANDIDATES 表：K1=0.00137, K2=0.00153, K3=0.00226
    means = {"cn_sue": 0.0020, "cn_sur": 0.0020, "turnover_vol_20d": 0.0010}  # K3 不过 ½m*
    pvals = {"cn_sue": 0.01, "cn_sur": 0.04, "turnover_vol_20d": 0.02}
    res = holm_judge(means, pvals)
    assert res["turnover_vol_20d"]["verdict"] == TIER_FAIL
    # Holm：排序 p=0.01,0.02,0.04；adj ≈ 0.03, 0.04, 0.04 → 仅最小可能显著
    assert res["cn_sue"]["verdict"] in (TIER_PASS, TIER_WEAK)
    assert tier_verdict(0.002, 0.00137, 0.01) == TIER_PASS
    assert tier_verdict(0.002, 0.00137, 0.10) == TIER_WEAK
    assert tier_verdict(0.001, 0.00137, 0.01) == TIER_FAIL


def test_holm_cli_manual(capsys, tmp_path):
    code = forward.main([
        "holm", "--batch", "B-test",
        "--mean", "cn_sue=0.002", "--mean", "cn_sur=0.002", "--mean", "turnover_vol_20d=0.003",
        "--p", "cn_sue=0.01", "--p", "cn_sur=0.02", "--p", "turnover_vol_20d=0.03",
        "--json", str(tmp_path / "holm.json"),
    ])
    assert code == 0
    out = json.loads((tmp_path / "holm.json").read_text())
    assert set(out) == {"cn_sue", "cn_sur", "turnover_vol_20d"}
    assert all(v["verdict"] in (TIER_PASS, TIER_WEAK, TIER_FAIL) for v in out.values())


def test_forward_zone_only_no_lockbox_rows(tmp_ledger, lockbox_file, repo):
    """evaluate_factor(mode=forward) 的序列期末全在锁箱 end 之后；面板锁箱区间被删。"""
    d, h = repo
    panel, sec = market()
    lb = Lockbox()
    lo, hi = lb.interval("cn")
    end_ex, hidden = lb.window("cn", "forward", token=None, prereg_ok=True)
    clipped = truncate_panel(panel, end_ex, hidden)
    idx = clipped["close_adj"].index
    assert not ((idx >= lo) & (idx <= hi)).any()

    res = evaluate_factor("cn", "size", panel=panel, securities=sec, mode="forward",
                          prereg=h[0], repo=d, run_backtest=False)
    assert (res.series.index > hi).all()
    assert pd.Timestamp(res.summary["first_period"]) >= hi - pd.Timedelta(days=7)


def test_run_forward_appends_and_freezes(tmp_path, tmp_ledger, lockbox_file, repo, monkeypatch):
    d, h = repo
    panel, sec = market()
    spec = candidate_spec("cn", "size")
    monkeypatch.setattr(forward, "CANDIDATES", [{
        "id": "T1", "factor": "size", "metric": "tmu_cap",
        **{k: spec[k] for k in ("source_hash", "params_hash", "config_hash")},
        "half_m_star": 0.001, "m_star": 0.002,
    }])
    out = tmp_path / "forward.json"
    doc1 = run_forward("cn", prereg=h[0], out=out, panel=panel, securities=sec, repo=d)
    assert out.exists()
    n1 = len(doc1["candidates"]["size"]["rows"])
    assert n1 >= 3
    assert all(r["period_end"] > "2017-12-31" for r in doc1["candidates"]["size"]["rows"])

    # 再跑一次：行数不变（无新月份），旧行原样
    doc2 = run_forward("cn", prereg=h[0], out=out, panel=panel, securities=sec, repo=d)
    assert len(doc2["candidates"]["size"]["rows"]) == n1
    assert doc2["candidates"]["size"]["rows"] == json.loads(out.read_text())["candidates"]["size"]["rows"]

    # 篡改后写入应失败
    tampered = json.loads(out.read_text())
    tampered["candidates"]["size"]["rows"][0]["ret"] = -999
    with pytest.raises(SystemExit, match="冻结行"):
        save_forward(tampered, out, previous=json.loads(out.read_text()))


def test_run_forward_empty_when_no_forward_months(tmp_path, tmp_ledger, lockbox_file, repo, monkeypatch):
    """锁箱 end 贴近面板末尾 → 前推期不足 → 空结构 + 说明。"""
    d, h = repo
    panel, sec = market()
    # 把锁箱推到面板末尾附近，前推区不够 3 期
    end = str(panel["close_adj"].index.max().date())
    start = str((panel["close_adj"].index.max() - pd.Timedelta(days=400)).date())
    p = tmp_path / "lb2.json"
    p.write_text(json.dumps({
        "embargo_months": 1, "budget_candidates": 24, "explore_frac": 0.7,
        "markets": {"cn": {"start": start, "end": end}},
    }))
    use_lockbox(p)
    spec = candidate_spec("cn", "size")
    monkeypatch.setattr(forward, "CANDIDATES", [{
        "id": "T1", "factor": "size", "metric": "tmu_cap",
        **{k: spec[k] for k in ("source_hash", "params_hash", "config_hash")},
        "half_m_star": 0.001, "m_star": 0.002,
    }])
    out = tmp_path / "fwd-empty.json"
    doc = run_forward("cn", prereg=h[0], out=out, panel=panel, securities=sec, repo=d)
    assert doc["candidates"]["size"]["rows"] == []
    assert "前推" in doc["note"] or "不足" in doc["note"] or "ValueError" in doc["note"]


def test_status_and_cli_help(capsys):
    assert forward.main(["status", "--market", "cn", "--out", "/tmp/no-such-forward-l038.json"]) in (0, 1)
    # argparse help
    with pytest.raises(SystemExit):
        forward.main(["--help"])


def test_hk_status_reads_hk_record_and_checks_h1(tmp_path, monkeypatch, capsys):
    cn_out = tmp_path / "forward.json"
    hk_out = tmp_path / "forward-hk.json"
    cn_out.write_text(json.dumps({"market": "cn", "note": "cn marker"}))
    hk_out.write_text(json.dumps({
        "market": "hk",
        "prereg": "6dc801f9",
        "note": "hk marker",
        "candidates": {"hk_vqs52": {"rows": [
            {"month": "2026-12", "n_periods": 1, "cum_mean": 0.005, "nw_t": None},
        ]}},
    }))
    monkeypatch.setattr(forward, "DEFAULT_OUT", cn_out)
    monkeypatch.setattr(forward, "HK_STATUS_OUT", hk_out)
    assert forward.main(["status", "--market", "hk"]) == 0
    out = capsys.readouterr().out
    assert "哈希核对 OK" in out
    assert "hk marker" in out and "cn marker" not in out and "cn_sue" not in out
    assert "H1 hk_vqs52 metric=tmu_ew rows=1" in out

    assert forward.main(["status", "--market", "hk", "--out", str(cn_out)]) == 1
    captured = capsys.readouterr()
    assert "市场 'cn'" in captured.err and "cn marker" not in captured.out


def test_market_status_reports_frozen_candidates_without_record(tmp_path, monkeypatch, capsys):
    hk_out = tmp_path / "forward-hk.json"
    monkeypatch.setattr(forward, "HK_STATUS_OUT", hk_out)
    assert forward.main(["status", "--market", "hk"]) == 0
    out = capsys.readouterr().out
    assert "尚无本市场的前推记录" in out
    assert "H1 hk_vqs52 metric=tmu_ew rows=0" in out
    assert not hk_out.exists()

    assert forward.main(["status", "--market", "cn", "--out", str(tmp_path / "cn.json")]) == 0
    out = capsys.readouterr().out
    assert "K1 cn_sue" in out and "K4 cn_multi4" in out
    assert "hk_vqs52" not in out
