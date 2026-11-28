"""A 股行情增量更新（cn_update）离线测试：合成数据 + mock http，不联网。"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from requests import exceptions as request_errors

from factorlab import store
from factorlab.schema import Manifest
from factorlab.sources import cn, cn_pit, cn_update, http

T = pd.Timestamp


def _bars(dates, close0=10.0, vol=1_000_000.0, turn=0.01, factor=1.0):
    """合成不复权日线 + 常复权因子（无除权）。chg 用昨收差，便于涨跌停基准价。"""
    dates = pd.to_datetime(dates)
    n = len(dates)
    close = close0 * (1 + 0.001 * np.arange(n))
    open_ = close * 0.999
    high = close * 1.002
    low = close * 0.998
    prev = np.r_[close[0], close[:-1]]
    chg = close - prev
    df = pd.DataFrame({
        "date": dates, "open": open_, "close": close, "high": high, "low": low,
        "volume": vol, "amount": close * vol, "amplitude": 0.004, "pct_chg": chg / prev,
        "chg": chg, "turnover": turn,
    })
    return df, np.full(n, float(factor))


def _sina_text(dates, factors) -> str:
    data = [{"d": str(pd.Timestamp(d).date()), "f": float(f)} for d, f in zip(dates, factors)]
    return "var x=" + json.dumps({"total": len(data), "data": data}) + ";"


def _securities(*rows) -> pd.DataFrame:
    cols = {
        "code": "string", "name": "string", "market": "string", "exchange": "string", "board": "string",
        "list_date": "datetime64[ns]", "delist_date": "datetime64[ns]", "status": "string",
        "currency": "string", "source": "string",
    }
    df = pd.DataFrame(list(rows))
    for c in cols:
        if c not in df.columns:
            df[c] = pd.NA
    df["market"] = "cn"
    df["currency"] = "CNY"
    df["source"] = "test"
    df["exchange"] = df["code"].map(cn.exchange_of)
    df["board"] = df["code"].map(cn.board_of)
    return df


def _tencentize(raw: pd.DataFrame) -> pd.DataFrame:
    """腾讯日线不提供振幅/涨跌幅/涨跌额 → 与 cn.tencent_rows_to_klines 一致。"""
    out = raw.copy()
    out["amplitude"] = np.nan
    out["pct_chg"] = np.nan
    out["chg"] = np.nan
    return out


def _full_build_one(code: str, raw: pd.DataFrame, F: np.ndarray, sec_row: dict,
                    shares_steps: pd.DataFrame | None = None,
                    industry_iv: pd.DataFrame | None = None,
                    st_pit=None, changes=None) -> pd.DataFrame:
    """对齐 cn.load_code + pit 增补的离线全量构建（单只，腾讯口径）。"""
    raw = cn.fix_volume_unit(_tencentize(raw), code)
    df = cn.adjust_from_factor(raw, F)
    list_date = sec_row.get("list_date")
    list_date = pd.Timestamp(list_date) if list_date is not None and pd.notna(list_date) else None
    if list_date is not None:
        df = df[df["date"] >= list_date].reset_index(drop=True)
    df = df[df["volume"] > 0].reset_index(drop=True)
    first = df["date"].iloc[0]
    is_ipo_start = (list_date is not None and first <= list_date + pd.Timedelta(days=15)) or \
                   (list_date is None and first > pd.Timestamp("2005-01-31"))
    df["is_st"] = cn.st_flags(code, df["date"], changes, st_pit).to_numpy()
    lim = cn.compute_limits(df, cn.board_of(code), list_date, df["is_st"],
                            trade_offset=0 if is_ipo_start else 1000)
    df = pd.concat([df, lim], axis=1)
    df["float_shares"] = cn.float_shares_estimate(df)
    df["mcap_float"] = df["float_shares"] * df["close"]
    df["mcap_total"] = np.nan
    df["total_shares"] = np.nan
    df["industry"] = pd.array([pd.NA] * len(df), dtype="string")
    df["is_suspended"] = False
    df["code"] = code
    df["src"] = "tencent+sina_factor"
    if shares_steps is not None and not shares_steps.empty:
        ts = cn_pit.shares_asof(df[["code", "date"]], shares_steps)
        df["total_shares"] = ts.to_numpy()
        df["mcap_total"] = df["total_shares"] * df["close"]
    if industry_iv is not None and not industry_iv.empty:
        df["industry"] = cn_pit.sw_level1_lookup(df[["code", "date"]], industry_iv).to_numpy()
    return cn_update._ensure_columns(df)


def _seed_store(tmp_path, monkeypatch, prices: pd.DataFrame, securities: pd.DataFrame,
                fin_bytes: bytes = b"FIN_PIT_FROZEN_BYTES"):
    monkeypatch.setenv("FACTORLAB_DATA", str(tmp_path))
    http._DEFAULT.pop("cn", None)
    store.write_securities("cn", securities)
    # 直接原子写，绕过 lockbox 截断问题（测试用 raw 全历史）
    cn_update.atomic_write_prices("cn", cn_update._ensure_columns(prices))
    fin = store.market_dir("cn") / "fin_pit.parquet"
    fin.write_bytes(fin_bytes)
    m = Manifest(market="cn", source="test", survivorship="A",
                 downloaded_at="2026-11-01T00:00:00+00:00",
                 coverage=(str(prices["date"].min().date()), str(prices["date"].max().date())),
                 rows=int(len(prices)), securities=int(prices["code"].nunique()),
                 sha256={"prices.parquet": "", "securities.parquet": ""}, notes="seed")
    store.write_manifest(m)
    return fin


def _dates(n=30, start="2024-01-02"):
    # 合成交易日：跳过周末
    out, d = [], pd.Timestamp(start)
    while len(out) < n:
        if d.weekday() < 5:
            out.append(d)
        d += pd.Timedelta(days=1)
    return out


# ---------------- 重叠校验 / 因子稳定性 ----------------
def test_validate_overlap_ok_and_mismatch():
    dates = _dates(5)
    raw, F = _bars(dates)
    adj = cn.adjust_from_factor(raw, F)
    adj["close_adj"] = adj["close"] * adj["adj_factor"]
    stored = adj[["date", "close", "close_adj"]].copy()
    rebuilt = stored.copy()
    assert cn_update.validate_overlap(stored, rebuilt) is None
    bad = rebuilt.copy()
    bad.loc[2, "close"] = bad.loc[2, "close"] + 1.0
    assert "close" in cn_update.validate_overlap(stored, bad)
    bad2 = rebuilt.copy()
    bad2.loc[1, "close_adj"] = bad2.loc[1, "close_adj"] * 1.05
    assert "close_adj" in cn_update.validate_overlap(stored, bad2)


def test_sina_hfq_historical_factors_stable_when_new_exdiv_appended():
    """后复权：旧日因子不变，新除权只影响新行（apply_factor 按日期 asof）。"""
    dates = _dates(10)
    fac_old = pd.DataFrame({"date": pd.to_datetime(dates[:6]), "factor": [1.0] * 5 + [1.1]})
    fac_new = pd.concat([fac_old, pd.DataFrame({"date": [pd.to_datetime(dates[8])], "factor": [1.21]})],
                        ignore_index=True)
    d_all = pd.Series(pd.to_datetime(dates))
    f_old = cn.apply_factor(d_all, fac_old)
    f_new = cn.apply_factor(d_all, fac_new)
    # 除权日前历史一致
    assert np.allclose(f_old[:8], f_new[:8])
    # 新除权日后因子变大
    assert f_new[8] == pytest.approx(1.21) and f_old[8] == pytest.approx(1.1)


# ---------------- 增量 = 全量 ----------------
def test_incremental_matches_full_build(tmp_path, monkeypatch):
    dates = _dates(40)
    code = "600000"
    raw, F = _bars(dates, close0=10.0, factor=1.5)
    # 中途一次除权：后半段因子 1.65
    F = np.where(np.arange(len(dates)) >= 25, 1.65, 1.5)
    sec_row = {"code": code, "list_date": T("1999-11-10"), "status": "listed", "name": "浦发"}
    total_shares = 2.0e10
    steps = pd.DataFrame({"code": [code], "date": [T("2020-01-01")], "total_shares": [total_shares]})
    # 行业区间：全程「银行」
    ind_iv = pd.DataFrame({
        "code": [code], "system": ["sw2021"], "system_code": ["008003"],
        "start_date": [T("2021-07-30")], "end_date": [pd.NaT],
        "avail_date": [T("2021-07-30")], "backfilled": [False],
        "level1_code": ["S48"], "level1_name": ["银行"],
        "industry_code": ["S480301"], "level2_name": ["银行"], "level3_name": ["银行"], "level4_name": ["银行"],
    })
    pit = {"st_pit": None, "changes": None, "shares_steps": steps, "industry_iv": ind_iv}

    full = _full_build_one(code, raw, F, sec_row, steps, ind_iv)
    # 截掉最后 5 个交易日作为「已存」
    cut = 5
    stored = full.iloc[:-cut].copy()
    sec = _securities({"code": code, "name": "浦发", "list_date": T("1999-11-10"),
                       "delist_date": pd.NaT, "status": "listed"})
    fin = _seed_store(tmp_path, monkeypatch, stored, sec)
    fin_sha = hashlib.sha256(fin.read_bytes()).hexdigest()

    # mock：返回从 overlap 起的 raw；因子全表
    fac_df = pd.DataFrame({"date": pd.to_datetime(dates), "factor": F})

    def fake_bars(c, start, end):
        assert c == code
        s = pd.Timestamp(start)
        part = _tencentize(raw[raw["date"] >= s].copy())
        if end:
            part = part[part["date"] <= pd.Timestamp(end)]
        return part.reset_index(drop=True)

    def fake_fac(c):
        return fac_df

    rep = cn_update.update_cn(codes=[code], dry_run=False, fetch_bars=fake_bars,
                              fetch_factors=fake_fac, pit=pit, progress=False)
    assert rep["added_rows"] == cut
    assert rep["codes_skipped"] == []
    assert hashlib.sha256(fin.read_bytes()).hexdigest() == fin_sha

    got = store.read_prices("cn", raw=True)
    got = cn_update._ensure_columns(got).sort_values(["code", "date"]).reset_index(drop=True)
    exp = full.sort_values(["code", "date"]).reset_index(drop=True)
    assert len(got) == len(exp)
    # 逐列相等（浮点容差）
    for col in exp.columns:
        a, b = got[col], exp[col]
        if pd.api.types.is_numeric_dtype(exp[col]) or col in (
                "open", "high", "low", "close", "close_adj", "open_adj", "adj_factor",
                "volume", "amount", "turnover", "mcap_float", "mcap_total", "float_shares",
                "total_shares", "ref_close", "limit_ratio", "pct_chg"):
            aa = pd.to_numeric(a, errors="coerce").to_numpy(float)
            bb = pd.to_numeric(b, errors="coerce").to_numpy(float)
            # 两边同为 NaN 视为相等
            both_nan = np.isnan(aa) & np.isnan(bb)
            ok = both_nan | np.isclose(aa, bb, rtol=1e-9, atol=1e-9, equal_nan=True)
            assert ok.all(), f"列 {col} 不一致：\n{pd.DataFrame({'got': aa, 'exp': bb})[~ok].head()}"
        elif pd.api.types.is_bool_dtype(exp[col]) or str(exp[col].dtype) == "boolean":
            assert list(a.astype("boolean")) == list(b.astype("boolean")), col
        else:
            assert list(a.astype("string").fillna("<NA>")) == list(b.astype("string").fillna("<NA>")), col


def test_overlap_mismatch_skips_stock(tmp_path, monkeypatch):
    dates = _dates(20)
    code = "000001"
    raw, F = _bars(dates)
    sec_row = {"code": code, "list_date": T("1991-04-03"), "status": "listed", "name": "平安"}
    full = _full_build_one(code, raw, F, sec_row)
    stored = full.iloc[:-3].copy()
    sec = _securities({"code": code, "name": "平安", "list_date": T("1991-04-03"),
                       "delist_date": pd.NaT, "status": "listed"})
    fin = _seed_store(tmp_path, monkeypatch, stored, sec)
    sha = hashlib.sha256(fin.read_bytes()).hexdigest()

    # 返回的 close 在重叠区被改坏
    bad = raw.copy()
    bad.loc[bad["date"] == stored["date"].max(), "close"] = 999.0

    rep = cn_update.update_cn(
        codes=[code], fetch_bars=lambda c, s, e: bad[bad["date"] >= pd.Timestamp(s)].reset_index(drop=True),
        fetch_factors=lambda c: pd.DataFrame({"date": pd.to_datetime(dates), "factor": F}),
        pit={"st_pit": None, "changes": None, "shares_steps": None, "industry_iv": None},
        progress=False,
    )
    assert rep["added_rows"] == 0
    assert any(s["code"] == code and "close" in s["reason"] for s in rep["codes_skipped"])
    # prices 未改
    got = store.read_prices("cn", raw=True)
    assert len(got) == len(stored)
    assert hashlib.sha256(fin.read_bytes()).hexdigest() == sha


def test_delisted_not_requested(tmp_path, monkeypatch):
    dates = _dates(15)
    listed, F1 = _bars(dates)
    delisted, F2 = _bars(dates)
    full_l = _full_build_one("600519", listed, F1, {"list_date": T("2001-08-27"), "status": "listed"})
    full_d = _full_build_one("000002", delisted, F2, {"list_date": T("1991-01-29"), "status": "delisted"})
    # 退市股截到更早，制造「有缺口」——但仍不应请求
    prices = pd.concat([full_l.iloc[:-4], full_d.iloc[:-4]], ignore_index=True)
    sec = _securities(
        {"code": "600519", "name": "茅台", "list_date": T("2001-08-27"), "delist_date": pd.NaT, "status": "listed"},
        {"code": "000002", "name": "退市股", "list_date": T("1991-01-29"),
         "delist_date": T("2020-01-01"), "status": "delisted"},
    )
    _seed_store(tmp_path, monkeypatch, prices, sec)
    requested = []

    def fake_bars(c, s, e):
        requested.append(c)
        return listed[listed["date"] >= pd.Timestamp(s)].reset_index(drop=True)

    cn_update.update_cn(
        fetch_bars=fake_bars,
        fetch_factors=lambda c: pd.DataFrame({"date": pd.to_datetime(dates), "factor": F1}),
        pit={"st_pit": None, "changes": None, "shares_steps": None, "industry_iv": None},
        progress=False,
    )
    assert "000002" not in requested
    assert requested == ["600519"]


def test_fin_pit_bytes_unchanged(tmp_path, monkeypatch):
    dates = _dates(12)
    code = "300750"
    raw, F = _bars(dates)
    full = _full_build_one(code, raw, F, {"list_date": T("2018-06-11"), "status": "listed"})
    stored = full.iloc[:-2].copy()
    sec = _securities({"code": code, "name": "宁德", "list_date": T("2018-06-11"),
                       "delist_date": pd.NaT, "status": "listed"})
    payload = b"\x00\x01FROZEN_FIN_PIT\xff" * 50
    fin = _seed_store(tmp_path, monkeypatch, stored, sec, fin_bytes=payload)
    before = fin.read_bytes()
    cn_update.update_cn(
        codes=[code],
        fetch_bars=lambda c, s, e: raw[raw["date"] >= pd.Timestamp(s)].reset_index(drop=True),
        fetch_factors=lambda c: pd.DataFrame({"date": pd.to_datetime(dates), "factor": F}),
        pit={"st_pit": None, "changes": None, "shares_steps": None, "industry_iv": None},
        progress=False,
    )
    assert fin.read_bytes() == before


def test_failed_write_leaves_original(tmp_path, monkeypatch):
    """模拟写 parquet 中途失败：原 prices 仍在，不留半写文件。"""
    dates = _dates(12)
    code = "601318"
    raw, F = _bars(dates)
    full = _full_build_one(code, raw, F, {"list_date": T("2007-03-01"), "status": "listed"})
    stored = full.iloc[:-2].copy()
    sec = _securities({"code": code, "name": "平安", "list_date": T("2007-03-01"),
                       "delist_date": pd.NaT, "status": "listed"})
    _seed_store(tmp_path, monkeypatch, stored, sec)
    p = store.market_dir("cn") / "prices.parquet"
    original = p.read_bytes()

    real_to_parquet = pd.DataFrame.to_parquet

    def boom(self, path, *a, **k):
        Path(path).write_bytes(b"HALF_WRITTEN")
        raise OSError("disk full")

    monkeypatch.setattr(pd.DataFrame, "to_parquet", boom)
    with pytest.raises(OSError):
        cn_update.update_cn(
            codes=[code],
            fetch_bars=lambda c, s, e: raw[raw["date"] >= pd.Timestamp(s)].reset_index(drop=True),
            fetch_factors=lambda c: pd.DataFrame({"date": pd.to_datetime(dates), "factor": F}),
            pit={"st_pit": None, "changes": None, "shares_steps": None, "industry_iv": None},
            progress=False,
        )
    monkeypatch.setattr(pd.DataFrame, "to_parquet", real_to_parquet)
    assert p.read_bytes() == original
    assert not (p.with_suffix(".parquet.tmp")).exists()


def test_dry_run_no_network_no_write(tmp_path, monkeypatch):
    dates = _dates(10)
    code = "600000"
    raw, F = _bars(dates)
    full = _full_build_one(code, raw, F, {"list_date": T("1999-11-10"), "status": "listed"})
    stored = full.iloc[:-3].copy()
    sec = _securities({"code": code, "name": "浦发", "list_date": T("1999-11-10"),
                       "delist_date": pd.NaT, "status": "listed"})
    _seed_store(tmp_path, monkeypatch, stored, sec)
    before = (store.market_dir("cn") / "prices.parquet").read_bytes()
    calls = []

    def boom(*a, **k):
        calls.append(1)
        raise AssertionError("dry-run 不应联网")

    monkeypatch.setattr(cn_update, "fetch_tencent_range", boom)
    monkeypatch.setattr(cn_update, "fetch_sina_factor_update", boom)
    rep = cn_update.update_cn(codes=[code], dry_run=True, until="2024-03-01")
    assert rep["dry_run"] is True
    assert rep["est_requests"] >= 0
    assert any(r["code"] == code for r in rep["per_code"])
    assert calls == []
    assert (store.market_dir("cn") / "prices.parquet").read_bytes() == before


def test_ffill_shares_and_industry_when_no_pit(tmp_path, monkeypatch):
    dates = _dates(20)
    code = "600000"
    raw, F = _bars(dates)
    full = _full_build_one(code, raw, F, {"list_date": T("1999-11-10"), "status": "listed"})
    # 人为写入最后已知股本/行业
    full["total_shares"] = 1.0e10
    full["mcap_total"] = full["total_shares"] * full["close"]
    full["industry"] = "银行"
    stored = full.iloc[:-3].copy()
    sec = _securities({"code": code, "name": "浦发", "list_date": T("1999-11-10"),
                       "delist_date": pd.NaT, "status": "listed"})
    _seed_store(tmp_path, monkeypatch, stored, sec)
    rep = cn_update.update_cn(
        codes=[code],
        fetch_bars=lambda c, s, e: raw[raw["date"] >= pd.Timestamp(s)].reset_index(drop=True),
        fetch_factors=lambda c: pd.DataFrame({"date": pd.to_datetime(dates), "factor": F}),
        pit={"st_pit": None, "changes": None, "shares_steps": None, "industry_iv": None},
        progress=False,
    )
    assert code in rep["ffill_shares_codes"] and code in rep["ffill_industry_codes"]
    got = store.read_prices("cn", raw=True).sort_values("date")
    tail = got.tail(3)
    assert (tail["total_shares"] == 1.0e10).all()
    assert (tail["industry"].astype(str) == "银行").all()
    assert np.allclose(tail["mcap_total"], tail["total_shares"] * tail["close"])


def test_cli_dry_run(tmp_path, monkeypatch, capsys):
    dates = _dates(8)
    code = "600000"
    raw, F = _bars(dates)
    full = _full_build_one(code, raw, F, {"list_date": T("1999-11-10"), "status": "listed"})
    sec = _securities({"code": code, "name": "浦发", "list_date": T("1999-11-10"),
                       "delist_date": pd.NaT, "status": "listed"})
    _seed_store(tmp_path, monkeypatch, full, sec)
    cn_update.main(["--dry-run", "--codes", code])
    out = json.loads(capsys.readouterr().out)
    assert out["dry_run"] is True


@pytest.mark.parametrize("error", [
    request_errors.ChunkedEncodingError, request_errors.ConnectionError,
    request_errors.ReadTimeout, request_errors.ContentDecodingError,
])
def test_network_errors_retry_per_stock(tmp_path, monkeypatch, error):
    codes = ["600000", "600001"]
    raw, factors = _bars(_dates(12))
    listed = {"list_date": T("1999-11-10"), "status": "listed"}
    prices = pd.concat([_full_build_one(code, raw, factors, listed).iloc[:-2] for code in codes])
    _seed_store(tmp_path, monkeypatch, prices, _securities(*[dict(code=code, **listed) for code in codes]))
    calls = []
    delays = []

    def fetch_bars(code, start, end):
        calls.append(code)
        if code == codes[0] or calls.count(code) == 1:
            raise error("fake interruption")
        return raw

    monkeypatch.setattr(cn_update, "sleep", delays.append)
    report = cn_update.update_cn(
        fetch_bars=fetch_bars,
        fetch_factors=lambda _: pd.DataFrame({"date": raw["date"], "factor": factors}),
        pit={},
        progress=False,
    )
    assert calls == [codes[0]] * 3 + [codes[1]] * 2
    assert delays == [1, 2, 1]
    assert [row["code"] for row in report["codes_failed"]] == codes[:1]
    assert error.__name__ in report["codes_failed"][0]["reason"]
    assert report["codes_updated"] == codes[1:]
    assert report["added_rows"] == 2


def test_cli_resumes_after_interruption_using_atomic_download_cache(tmp_path, monkeypatch, capsys):
    codes = ["600000", "600001"]
    raw, factors = _bars(_dates(12))
    listed = {"list_date": T("1999-11-10"), "status": "listed"}
    prices = pd.concat([_full_build_one(code, raw, factors, listed).iloc[:-2] for code in codes])
    fin = _seed_store(tmp_path, monkeypatch, prices, _securities(*[dict(code=code, **listed) for code in codes]))
    market = store.market_dir("cn")
    before = {name: (market / name).read_bytes() for name in ("prices.parquet", "MANIFEST.json")}
    tencent_rows = [
        [str(r.date.date()), str(r.open), str(r.close), str(r.high), str(r.low),
         str(r.volume / 100), {}, str(r.turnover * 100), str(r.amount / 10_000)]
        for r in raw.itertuples()
    ]
    calls = []
    symbols = [cn.tencent_symbol(code) for code in codes]
    interrupted = False

    def fetch(_client, url, params=None, headers=None):
        nonlocal interrupted
        if url == cn.TENCENT_URL:
            sym = params["param"].split(",")[0]
            calls.append(("bars", sym))
            return json.dumps({"data": {sym: {"day": tencent_rows}}}).encode()
        sym = url.split("/")[-2]
        assert url == cn.SINA_HFQ_URL.format(sym=sym)
        calls.append(("factor", sym))
        if sym == symbols[1] and not interrupted:
            interrupted = True
            raise KeyboardInterrupt
        return _sina_text(raw["date"], factors).encode()

    monkeypatch.setattr(http.Client, "fetch", fetch)
    monkeypatch.setattr(cn_update, "_load_pit_helpers", lambda _: {})
    until = str(raw["date"].iloc[-1].date())
    args = ["--until", until]
    with pytest.raises(KeyboardInterrupt):
        cn_update.main(args)
    assert calls == [(source, sym) for sym in symbols for source in ("bars", "factor")]
    assert all((market / name).read_bytes() == content for name, content in before.items())

    cn_update.main([*args, "--resume"])
    report = json.loads(capsys.readouterr().out)
    assert calls[4:] == [("factor", symbols[1])]
    assert report["codes_updated"] == codes
    assert report["added_rows"] == 4
    assert store.read_manifest("cn")["rows"] == len(prices) + 4
    assert not store.read_prices("cn", raw=True).duplicated(["code", "date"]).any()
    assert fin.read_bytes() == b"FIN_PIT_FROZEN_BYTES"

    # A later cutoff requires fresh inputs even when --resume is passed.
    calls.clear()
    later = str((pd.Timestamp(until) + pd.Timedelta(days=1)).date())
    cn_update.main(["--until", later, "--resume"])
    assert calls == [(source, sym) for sym in symbols for source in ("bars", "factor")]


# ======================== 真实全量流程对照（返工 1） ========================

def _write_tencent_fqt0(code: str, raw: pd.DataFrame) -> Path:
    """写成 cn.load_code 读取的腾讯日线缓存：raw/kline/fqt0/{code}.json。
    volume 按「手」写入（parse_kline 会 ×100）；振幅/涨跌幅/涨跌额留空。"""
    klines = []
    for r in raw.itertuples(index=False):
        d = pd.Timestamp(r.date).strftime("%Y-%m-%d")
        vol_hand = float(r.volume) / 100.0
        turn_pct = "" if pd.isna(r.turnover) else f"{float(r.turnover) * 100:.4g}"
        amt = "" if pd.isna(r.amount) else f"{float(r.amount):.2f}"
        klines.append(",".join([
            d, f"{float(r.open):.4f}", f"{float(r.close):.4f}", f"{float(r.high):.4f}",
            f"{float(r.low):.4f}", f"{vol_hand:.2f}", amt, "", "", "", turn_pct,
        ]))
    payload = {"source": "tencent", "data": {"code": code, "klines": klines}}
    p = http.raw_dir("cn", "kline", "fqt0") / f"{code}.json"
    p.write_text(json.dumps(payload, ensure_ascii=False))
    return p


def _write_sina_hfq(code: str, dates, factors) -> Path:
    p = http.raw_dir("cn", "kline", "sina_hfq") / f"{code}.js"
    p.write_text(_sina_text(dates, factors))
    return p


def _write_pit_tables(code: str, total_shares: float = 2.0e10, industry_name: str = "银行",
                      st_iv: pd.DataFrame | None = None):
    """写 shares_pit / industry_pit / st_pit，供 cn.build_cn → add_pit_columns / load_st_pit。"""
    sh = pd.DataFrame({
        "code": [code], "declare_date": [T("2020-01-01")], "vary_date": [T("2020-01-01")],
        "reason": ["test"], "total_shares": [total_shares], "float_shares": [total_shares * 0.8],
        "float_a_shares": [total_shares * 0.8], "b_shares": [np.nan], "h_shares": [np.nan],
        "avail_date": [T("2020-01-01")], "avail_rule": ["declare"],
    })
    sh.to_parquet(cn_pit.pit_path("shares_pit"), index=False)
    ind = pd.DataFrame({
        "code": [code], "system": ["sw2021"], "system_code": ["008003"],
        "start_date": [T("2021-07-30")], "end_date": [pd.NaT],
        "avail_date": [T("2021-07-30")], "backfilled": [False],
        "level1_code": ["S48"], "level1_name": [industry_name],
        "industry_code": ["S480301"], "level2_name": [industry_name],
        "level3_name": [industry_name], "level4_name": [industry_name],
    })
    ind.to_parquet(cn_pit.pit_path("industry_pit"), index=False)
    if st_iv is None:
        st_iv = pd.DataFrame(columns=["code", "start_date", "end_date", "flag", "declare_date",
                                      "event", "reason", "source"])
    st_iv.to_parquet(cn_pit.pit_path("st_pit"), index=False)
    return sh, ind, st_iv


def _patch_master_no_network(monkeypatch, sec: pd.DataFrame, covered: set[str]):
    """绕开 security_master / szse_name_changes / status_covered_codes 联网。"""
    monkeypatch.setattr(cn, "security_master", lambda refresh=False: sec.copy())
    monkeypatch.setattr(cn, "szse_name_changes",
                        lambda refresh=False: pd.DataFrame(columns=["date", "code", "before", "after"]))
    monkeypatch.setattr(cn_pit, "status_covered_codes", lambda market="cn": set(covered))


def _assert_prices_equal(got: pd.DataFrame, exp: pd.DataFrame, rtol=1e-9, atol=1e-9):
    got = cn_update._ensure_columns(got).sort_values(["code", "date"]).reset_index(drop=True)
    exp = cn_update._ensure_columns(exp).sort_values(["code", "date"]).reset_index(drop=True)
    assert list(got.columns) == list(exp.columns)
    assert len(got) == len(exp), f"行数 {len(got)} != {len(exp)}"
    assert list(got["date"]) == list(exp["date"])
    assert list(got["code"].astype(str)) == list(exp["code"].astype(str))
    for col in exp.columns:
        if col in ("date", "code"):
            continue
        a, b = got[col], exp[col]
        if col in ("src", "industry") or str(exp[col].dtype) == "string":
            assert list(a.astype("string").fillna("<NA>")) == list(b.astype("string").fillna("<NA>")), col
        elif str(exp[col].dtype) == "boolean" or col in (
                "limit_up", "limit_down", "limit_up_oneword", "limit_down_oneword",
                "no_limit_inferred", "is_st", "is_suspended"):
            assert list(a.astype("boolean")) == list(b.astype("boolean")), (
                f"{col}: {(a.astype('boolean') != b.astype('boolean')).sum()} 处不同")
        else:
            aa = pd.to_numeric(a, errors="coerce").to_numpy(float)
            bb = pd.to_numeric(b, errors="coerce").to_numpy(float)
            both_nan = np.isnan(aa) & np.isnan(bb)
            ok = both_nan | np.isclose(aa, bb, rtol=rtol, atol=atol, equal_nan=True)
            assert ok.all(), (
                f"列 {col} 不一致:\n"
                + pd.DataFrame({"date": got["date"], "got": aa, "exp": bb}).loc[~ok].head(10).to_string()
            )


def _fetch_from_full_cache(code: str, start, end):
    """增量钩子：从全量 fqt0/sina 缓存读（与 load_code 同源），不联网。"""
    j = json.loads((http.raw_dir("cn", "kline", "fqt0") / f"{code}.json").read_text())
    df = cn.parse_kline(j)
    df = df[df["date"] >= pd.Timestamp(start)]
    if end is not None:
        df = df[df["date"] <= pd.Timestamp(end)]
    return df.reset_index(drop=True)


def _factors_from_cache(code: str) -> pd.DataFrame:
    return cn.parse_sina_hfq((http.raw_dir("cn", "kline", "sina_hfq") / f"{code}.js").read_text())


def _setup_real_build(tmp_path, monkeypatch, code: str, dates, factors, *,
                      list_date=T("1999-11-10"), name="浦发",
                      total_shares=2.0e10, industry_name="银行",
                      close0=10.0, start_build="2005-01-01"):
    """写真实缓存 + pit，monkeypatch 联网，跑 cn.build_cn，返回全量 prices。"""
    monkeypatch.setenv("FACTORLAB_DATA", str(tmp_path))
    http._DEFAULT.pop("cn", None)
    raw, _ = _bars(dates, close0=close0)
    # 用传入的 factors（可含除权）
    F = np.asarray(factors, dtype=float)
    assert len(F) == len(dates)
    _write_tencent_fqt0(code, raw)
    _write_sina_hfq(code, dates, F)
    sec = _securities({"code": code, "name": name, "list_date": list_date,
                       "delist_date": pd.NaT, "status": "listed"})
    _patch_master_no_network(monkeypatch, sec, {code})
    _write_pit_tables(code, total_shares=total_shares, industry_name=industry_name)
    http.raw_dir("cn").joinpath("selected_codes.json").write_text(json.dumps([code]))
    # 冻结 fin_pit
    fin = store.market_dir("cn") / "fin_pit.parquet"
    fin.write_bytes(b"FIN_PIT_REAL_BUILD_FROZEN")
    cn.build_cn(start=start_build, codes=[code])
    full = store.read_prices("cn", raw=True)
    assert not full.empty and set(full["code"].astype(str)) == {code}
    return full, fin, raw, F


def test_incremental_matches_real_build_cn(tmp_path, monkeypatch):
    """合成原始数据写入真实缓存路径，经 cn.build_cn（真实 load_code + add_pit_columns）对照增量。"""
    code = "600000"
    dates = _dates(40, start="2024-01-02")
    # 历史段除权一次（不在截断区）
    F = np.where(np.arange(len(dates)) >= 20, 1.65, 1.5)
    full, fin, raw, F = _setup_real_build(tmp_path, monkeypatch, code, dates, F)
    fin_sha = hashlib.sha256(fin.read_bytes()).hexdigest()
    cut = 5
    stored = full.sort_values("date").iloc[:-cut].copy()
    cn_update.atomic_write_prices("cn", stored)

    rep = cn_update.update_cn(
        codes=[code], progress=False,
        fetch_bars=lambda c, s, e: _fetch_from_full_cache(c, s, e),
        fetch_factors=lambda c: _factors_from_cache(c),
        # pit=None → 走 _load_pit_helpers（读刚写入的 pit 表；szse/status 已 patch）
    )
    assert rep["codes_skipped"] == []
    assert rep["added_rows"] == cut
    assert hashlib.sha256(fin.read_bytes()).hexdigest() == fin_sha
    got = store.read_prices("cn", raw=True)
    _assert_prices_equal(got, full)


def test_incremental_matches_real_build_exdiv_in_new_and_month_end(tmp_path, monkeypatch):
    """除权日落在新增区间 + 新增区间跨月末；仍与真实 build_cn 逐列一致。"""
    code = "600000"
    dates = _dates(30, start="2024-01-15")
    jan_idx = [i for i, d in enumerate(dates) if d.month == 1]
    feb_idx = [i for i, d in enumerate(dates) if d.month == 2]
    assert jan_idx and feb_idx
    # 新增区从 1 月倒数第 3 个交易日起 → 含 1 月末 + 2 月
    first_new = jan_idx[-3]
    cut = len(dates) - first_new
    assert dates[first_new].month == 1 and dates[-1].month == 2
    # 除权日：新增区第 3 个交易日（仍在 1 月或刚入 2 月）
    ex_i = first_new + 2
    assert first_new <= ex_i < len(dates)
    F = np.where(np.arange(len(dates)) >= ex_i, 1.21, 1.0)
    full, fin, raw, F = _setup_real_build(
        tmp_path, monkeypatch, code, dates, F, close0=12.0, total_shares=3.0e10)
    full_s = full.sort_values("date").reset_index(drop=True)
    ex_date = pd.Timestamp(dates[ex_i])
    assert full_s.loc[full_s["date"] == ex_date, "adj_factor"].iloc[0] == pytest.approx(1.21)
    assert full_s.loc[full_s["date"] < ex_date, "adj_factor"].iloc[-1] == pytest.approx(1.0)

    stored = full_s.iloc[:-cut].copy()
    assert stored["date"].max() < ex_date
    assert stored["date"].max().month == 1
    assert full_s["date"].max().month == 2
    new_months = set(full_s.iloc[-cut:]["date"].dt.month)
    assert new_months >= {1, 2}

    cn_update.atomic_write_prices("cn", stored)
    fin_sha = hashlib.sha256(fin.read_bytes()).hexdigest()
    rep = cn_update.update_cn(
        codes=[code], progress=False,
        fetch_bars=lambda c, s, e: _fetch_from_full_cache(c, s, e),
        fetch_factors=lambda c: _factors_from_cache(c),
    )
    assert rep["codes_skipped"] == []
    assert rep["added_rows"] == cut
    assert hashlib.sha256(fin.read_bytes()).hexdigest() == fin_sha
    got = store.read_prices("cn", raw=True)
    _assert_prices_equal(got, full)
    g = got.sort_values("date")
    assert (g["date"] == ex_date).any()
    assert g.loc[g["date"] == ex_date, "adj_factor"].iloc[0] == pytest.approx(1.21)
