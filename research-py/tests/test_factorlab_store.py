"""factorlab 数据仓库：FACTORLAB_DATA 指向临时目录时的读写往返、受护栏的读取入口（合成数据）。"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from factorlab import store
from factorlab.cli import main as cli_main
from factorlab.data import load_market, snapshot_hash
from factorlab.guard import TrialLedger
from factorlab.schema import Manifest
from factorlab.guard import split_codes
from factorlab_synth import make_prereg_repo, market, tmp_ledger, to_long, use_lockbox  # noqa: F401


@pytest.fixture
def data_root(tmp_path, monkeypatch):
    d = tmp_path / "data"
    monkeypatch.setenv("FACTORLAB_DATA", str(d))
    return d


def _write(panel, sec, codes):
    sub = {k: v[codes] for k, v in panel.items()}
    long = to_long(sub)
    store.write_securities("cn", sec[sec["code"].isin(codes)])
    store.write_prices("cn", long)
    store.write_manifest(Manifest(market="cn", source="synthetic", survivorship="A",
                                  downloaded_at="2026-11-26T00:00:00Z",
                                  coverage=(str(long["date"].min().date()), str(long["date"].max().date())),
                                  rows=len(long), securities=len(codes), sha256={}))
    return sub, long


def test_store_round_trip(data_root):
    panel, sec = market()
    codes = list(panel["close_adj"].columns[:30])
    sub, long = _write(panel, sec, codes)
    assert (data_root / "cn" / "prices.parquet").exists()
    back = store.load_panel("cn", ["close_adj", "amount", "limit_up"], raw=True)
    exp = sub["close_adj"].dropna(how="all")
    pd.testing.assert_frame_equal(back["close_adj"][codes], exp, check_names=False, check_freq=False,
                                  check_column_type=False)
    s2 = store.read_securities("cn")
    assert set(s2["code"]) == set(codes)
    assert pd.api.types.is_datetime64_any_dtype(s2["delist_date"])
    m = store.read_manifest("cn")
    assert set(m["sha256"]) == {"prices.parquet", "securities.parquet"}
    h = snapshot_hash("cn")
    assert h and len(h) == 16


def test_guarded_loader_truncates_and_adds_open_adj(data_root, tmp_path):
    lb = tmp_path / "lockbox.json"
    lb.write_text(json.dumps({"markets": {"cn": {"start": "2016-01-01", "end": "2017-12-31"}}}))
    use_lockbox(lb)
    panel, sec = market()
    codes = list(panel["close_adj"].columns[:40])
    _write(panel, sec, codes)
    md = load_market("cn", ["close_adj", "open_adj", "mcap_float"])
    assert md.panel["close_adj"].index.max() < pd.Timestamp("2016-01-01")
    assert md.visible_end == pd.Timestamp("2016-01-01")
    assert set(md.panel["close_adj"].columns) == set(split_codes(codes, "explore"))   # 数据层只给 70%
    oa = md.panel["open_adj"]
    expected = md.panel["open"] * md.panel["close_adj"] / md.panel["close"]
    pd.testing.assert_frame_equal(oa, expected)
    assert md.securities is not None and md.snapshot
    with pytest.raises(PermissionError):
        load_market("cn", ["close_adj"], mode="confirm")
    with pytest.raises(PermissionError):
        load_market("cn", ["close_adj"], mode="forward")          # 没有预注册
    d = tmp_path / "repo"
    h = make_prereg_repo(d, [("docs/research/PREREG-1.md", "size")])
    fw = load_market("cn", ["close_adj"], mode="forward", prereg=h[0], repo=d)
    idx = fw.panel["close_adj"].index
    assert idx.max() > pd.Timestamp("2018-01-01")
    assert not ((idx >= pd.Timestamp("2016-01-01")) & (idx <= pd.Timestamp("2017-12-31"))).any()  # 锁箱区间被删


def test_cli_eval_and_ledger_from_store(data_root, tmp_ledger, capsys, tmp_path, monkeypatch):
    panel, sec = market()
    _write(panel, sec, list(panel["close_adj"].columns))
    assert cli_main(["list-factors"]) == 0
    assert cli_main(["eval", "--market", "cn", "--factor", "rev_1m", "--no-backtest",
                     "--json", str(tmp_path / "out.json")]) == 0
    out = capsys.readouterr().out
    assert "rev_1m" in out and "RankIC" in out
    rec = TrialLedger().trials("cn")[-1]
    assert rec["data_snapshot"] == snapshot_hash("cn")
    assert json.loads((tmp_path / "out.json").read_text())["summary"]["n_periods"] > 10
    assert cli_main(["ledger", "--market", "cn"]) == 0
    assert "评估 1 次" in capsys.readouterr().out


def test_store_reads_hide_lockbox_by_default(data_root, tmp_path):
    """直接读 store（不经 data.load_market）也看不到锁箱起点及以后的数据。"""
    dates = pd.to_datetime(["2023-10-30", "2023-10-31", "2023-11-01", "2024-06-03"])
    long = pd.DataFrame({"date": dates, "code": "600000", "close": 10.0, "close_adj": 10.0})
    store.write_prices("cn", long)
    cut = store.lockbox_start("cn")
    assert cut == pd.Timestamp("2023-11-01")
    assert store.read_prices("cn")["date"].max() < cut
    assert store.load_panel("cn", ["close_adj"])["close_adj"].index.max() < cut
    assert store.read_prices("cn", raw=True)["date"].max() == pd.Timestamp("2024-06-03")
