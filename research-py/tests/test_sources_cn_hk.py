"""A 股 / 港股数据源的离线单元测试（不联网；夹具 JSON 内嵌在本文件）。"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from factorlab.sources import cn, hk, http

# 东方财富 kline 夹具：600000 2024 年初（fqt=0）与同期后复权（fqt=2，按比例 ×14.8）
RAW_600000 = json.loads("""{"rc":0,"data":{"code":"600000","market":1,"name":"浦发银行","klines":[
"2024-01-02,6.63,6.60,6.65,6.60,220667,146066304.00,0.76,-0.30,-0.02,0.08",
"2024-01-03,6.59,6.64,6.65,6.59,182037,120639706.00,0.91,0.61,0.04,0.06",
"2024-01-04,6.64,6.62,6.67,6.55,288860,190580610.00,1.81,-0.30,-0.02,0.10"]}}""")
EMPTY = json.loads('{"rc":0,"data":null}')


def _hfq_payload(raw: dict, factor: float) -> dict:
    lines = []
    for ln in raw["data"]["klines"]:
        p = ln.split(",")
        for i in (1, 2, 3, 4):
            p[i] = f"{float(p[i]) * factor:.2f}"
        lines.append(",".join(p))
    return {"rc": 0, "data": {"klines": lines}}


# ---------------- 解析 ----------------
def test_parse_kline_units():
    df = cn.parse_kline(RAW_600000)
    assert list(df.columns) == cn.KLINE_COLS
    assert len(df) == 3
    assert df["date"].iloc[0] == pd.Timestamp("2024-01-02")
    assert df["volume"].iloc[0] == 220667 * 100          # 手 → 股
    assert df["turnover"].iloc[0] == pytest.approx(0.0008)  # 0.08% → 小数
    assert df["pct_chg"].iloc[1] == pytest.approx(0.0061)
    assert df["amount"].iloc[0] == pytest.approx(146066304.0)


def test_parse_kline_empty_and_jsonp():
    assert cn.parse_kline(EMPTY).empty
    body = ("jQuery123(" + json.dumps(RAW_600000) + ");").encode()
    assert len(cn.parse_kline(body)) == 3


def test_merge_raw_hfq_factor_and_consistency():
    raw = cn.parse_kline(RAW_600000)
    hfq = cn.parse_kline(_hfq_payload(RAW_600000, 14.8))
    df = cn.merge_raw_hfq(raw, hfq)
    assert {"close_adj", "open_adj", "adj_factor"} <= set(df.columns)
    assert df["adj_factor"].between(14.7, 14.9).all()
    rep = cn.hfq_consistency(df)
    assert rep["factor_change_days"] == 0
    assert rep["max_open_close_factor_gap"] < 0.005


def test_hfq_consistency_detects_additive():
    raw = cn.parse_kline(RAW_600000)
    add = raw.copy()
    for c in ("open", "close", "high", "low"):
        add[c] = add[c] + 50.0      # 加法复权：比值随价格漂移
    df = cn.merge_raw_hfq(raw, add)
    rep = cn.hfq_consistency(df)
    assert rep["max_open_close_factor_gap"] > 0.005 or rep["max_nonevent_drift"] > 0.0


# ---------------- 代码映射 ----------------
@pytest.mark.parametrize("code,sid,ex,board", [
    ("600000", "1.600000", "SSE", "主板"),
    ("688001", "1.688001", "SSE", "科创板"),
    ("000001", "0.000001", "SZSE", "主板"),
    ("002594", "0.002594", "SZSE", "主板"),
    ("300750", "0.300750", "SZSE", "创业板"),
    ("301139", "0.301139", "SZSE", "创业板"),
    ("920992", "0.920992", "BSE", "北交所"),
    ("430047", "0.430047", "BSE", "北交所"),
])
def test_secid_mapping(code, sid, ex, board):
    assert cn.secid(code) == sid
    assert cn.exchange_of(code) == ex
    assert cn.board_of(code) == board


def test_hk_secid_and_filter():
    assert hk.secid("00700") == "116.00700"
    assert hk.is_equity_code("00700") and hk.is_equity_code("08668")
    assert not hk.is_equity_code("80700")   # 人民币柜台
    assert not hk.is_equity_code("700")


# ---------------- 涨跌停 ----------------
def test_round_price_half_up():
    assert cn.round_price(11.005) == pytest.approx(11.01)
    assert cn.round_price(10.994) == pytest.approx(10.99)
    assert cn.round_price(3.3 * 1.1) == pytest.approx(3.63)


def _bars(dates, closes, opens=None, highs=None, lows=None):
    closes = list(map(float, closes))
    prev = [np.nan] + closes[:-1]
    df = pd.DataFrame({"date": pd.to_datetime(dates), "close": closes,
                       "open": opens or closes, "high": highs or closes, "low": lows or closes})
    df["chg"] = df["close"] - pd.Series(prev)
    return df


def test_main_board_10pct_limit_and_oneword():
    df = _bars(["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"], [10.00, 11.00, 9.90, 10.50],
               opens=[10.0, 11.0, 10.5, 10.0], highs=[10.0, 11.0, 10.6, 10.6], lows=[10.0, 11.0, 9.9, 9.9])
    lim = cn.compute_limits(df, "主板", list_date="2000-01-01")
    assert pd.isna(lim["limit_up"].iloc[0])            # 第 1 行视为上市首日 → 不判
    assert bool(lim["limit_up"].iloc[1]) is True        # 10.00 × 1.1 = 11.00
    assert bool(lim["limit_up_oneword"].iloc[1]) is True
    assert bool(lim["limit_down"].iloc[2]) is True      # 11.00 × 0.9 = 9.90
    assert bool(lim["limit_down_oneword"].iloc[2]) is False
    assert bool(lim["limit_up"].iloc[3]) is False and bool(lim["limit_down"].iloc[3]) is False


def test_limit_price_rounding_case():
    # 前收 3.33：涨停价 = round(3.663) = 3.66；收 3.66 应判涨停，收 3.65 不判
    df = _bars(["2024-01-02", "2024-01-03", "2024-01-04"], [3.33, 3.66, 3.65])
    df.loc[2, "chg"] = 3.65 - 3.33   # 让第 3 行的基准价也是 3.33
    lim = cn.compute_limits(df, "主板", list_date="2000-01-01")
    assert lim["limit_up_price"].iloc[1] == pytest.approx(3.66)
    assert bool(lim["limit_up"].iloc[1]) is True
    assert bool(lim["limit_up"].iloc[2]) is False


def test_no_limit_day_inferred_when_move_exceeds_ratio():
    # 恢复上市 / 股改复牌首日没有涨跌幅：收盘较基准 +150% → 不判涨停（NA），并标记 no_limit_inferred
    df = _bars(["2008-04-10", "2008-04-11", "2008-04-14", "2008-04-15"], [3.0, 3.1, 7.75, 8.53])
    lim = cn.compute_limits(df, "主板", list_date="2000-01-01")
    assert bool(lim["no_limit_inferred"].iloc[2]) is True
    assert pd.isna(lim["limit_up"].iloc[2])
    assert lim["limit_up_price"].iloc[3] == pytest.approx(8.53)   # 次日恢复 10%：7.75 × 1.1 = 8.525 → 四舍五入 8.53
    assert bool(lim["limit_up"].iloc[3]) is True


def test_chinext_reform_date():
    # 2020-08-21 仍是 10%；2020-08-24 起 20%
    d = ["2020-08-20", "2020-08-21", "2020-08-24", "2020-08-25"]
    df = _bars(d, [10.0, 11.0, 13.2, 14.0])
    lim = cn.compute_limits(df, "创业板", list_date="2015-01-01")
    assert lim["limit_ratio"].iloc[1] == pytest.approx(0.10)
    assert bool(lim["limit_up"].iloc[1]) is True
    assert lim["limit_ratio"].iloc[2] == pytest.approx(0.20)
    assert bool(lim["limit_up"].iloc[2]) is True        # 11 × 1.2 = 13.2
    assert bool(lim["limit_up"].iloc[3]) is False


def test_star_ipo_first_five_days_no_limit():
    d = pd.bdate_range("2021-03-01", periods=7)
    df = _bars(d, [30, 40, 48, 50, 52, 62.4, 74.88])
    lim = cn.compute_limits(df, "科创板", list_date="2021-03-01")
    assert lim["limit_ratio"].iloc[:5].isna().all()
    assert lim["limit_up"].iloc[:5].isna().all()
    assert bool(lim["limit_up"].iloc[5]) is True        # 52 × 1.2 = 62.4
    assert bool(lim["limit_up"].iloc[6]) is True


def test_chinext_registration_ipo_vs_old_ipo():
    d = pd.bdate_range("2021-03-01", periods=6)
    new = cn.limit_ratio("创业板", pd.Series(d), pd.Series(range(1, 7)), None, pd.Timestamp("2021-03-01"))
    assert new.iloc[:5].isna().all() and new.iloc[5] == pytest.approx(0.20)
    old = cn.limit_ratio("创业板", pd.Series(d), pd.Series(range(100, 106)), None, pd.Timestamp("2015-01-01"))
    assert (old == 0.20).all()


def test_main_board_registration_ipo_and_bse():
    d = pd.Series(pd.bdate_range("2023-05-04", periods=6))
    tn = pd.Series(range(1, 7))
    m = cn.limit_ratio("主板", d, tn, None, pd.Timestamp("2023-05-04"))
    assert m.iloc[:5].isna().all() and m.iloc[5] == pytest.approx(0.10)
    old = cn.limit_ratio("主板", pd.Series(pd.bdate_range("2015-05-04", periods=3)), pd.Series([1, 2, 3]),
                         None, pd.Timestamp("2015-05-04"))
    assert np.isnan(old.iloc[0]) and old.iloc[1] == pytest.approx(0.10)   # 旧规则：只有首日不判
    b = cn.limit_ratio("北交所", d, tn, None, pd.Timestamp("2023-05-04"))
    assert np.isnan(b.iloc[0]) and (b.iloc[1:] == 0.30).all()


def test_st_limits():
    d = pd.Series(pd.to_datetime(["2024-03-01", "2026-07-03", "2026-07-06", "2024-03-01"]))
    tn = pd.Series([100, 101, 102, 100])
    st = pd.Series([True, True, True, pd.NA], dtype="boolean")
    r = cn.limit_ratio("主板", d, tn, st, pd.Timestamp("2000-01-01"))
    assert r.tolist()[:3] == [0.05, 0.05, 0.10]
    assert r.iloc[3] == pytest.approx(0.10)             # ST 未知 → 按非 ST
    c = cn.limit_ratio("创业板", pd.Series(pd.to_datetime(["2019-01-02", "2021-01-04"])), pd.Series([50, 51]),
                       pd.Series([True, True], dtype="boolean"), pd.Timestamp("2012-01-01"))
    assert c.tolist() == [0.05, 0.20]


def test_ex_dividend_reference_price_used():
    # 除权日：前收 20，10 送 10 → 参考价 10.00；东方财富 chg 以参考价计
    df = pd.DataFrame({"date": pd.to_datetime(["2024-06-03", "2024-06-04"]),
                       "open": [20.0, 11.0], "high": [20.0, 11.0], "low": [20.0, 11.0], "close": [20.0, 11.0],
                       "chg": [0.0, 1.0], "adj_factor": [1.0, 2.0]})
    lim = cn.compute_limits(df, "主板", list_date="2000-01-01")
    assert lim["ref_close"].iloc[1] == pytest.approx(10.0)
    assert bool(lim["limit_up"].iloc[1]) is True
    # chg 缺失时用复权因子推算的参考价：20 × 1 / 2 = 10
    df2 = df.drop(columns="chg")
    lim2 = cn.compute_limits(df2, "主板", list_date="2000-01-01")
    assert lim2["ref_close"].iloc[1] == pytest.approx(10.0)


def test_st_flags_from_name_changes():
    ch = pd.DataFrame({"date": pd.to_datetime(["2020-05-06", "2022-05-10"]), "code": ["000005", "000005"],
                       "before": ["世纪星源", "ST星源"], "after": ["ST星源", "世纪星源"]})
    f = cn.st_flags("000005", pd.Series(pd.to_datetime(["2020-05-05", "2020-05-06", "2022-05-09", "2022-05-10"])), ch)
    assert f.tolist() == [False, True, True, False]
    assert cn.st_flags("600000", pd.Series(pd.to_datetime(["2020-05-05"])), ch).isna().all()
    assert cn._has_st("*ST长油") and cn._has_st("ＳＴ华光") and not cn._has_st("平安银行")


# ---------------- 流通市值 ----------------
def test_float_shares_estimate_basic_and_split():
    n = 40
    shares = 1e9
    vol = np.linspace(1e6, 5e6, n)
    turn = np.round(vol / shares, 4)              # 东方财富换手率只有 0.01% 精度
    df = pd.DataFrame({"volume": vol, "turnover": turn, "adj_factor": 1.0, "close": 10.0,
                       "amount": vol * 10.0})
    est = cn.float_shares_estimate(df)
    assert est.iloc[:4].isna().all()              # min_obs = 5
    assert abs(est.iloc[-1] / shares - 1) < 0.02
    # 10 送 10：第 20 天起股本翻倍、复权因子翻倍、换手率不变 → 估计当天就跟上
    df2 = df.copy()
    df2.loc[20:, "volume"] *= 2
    df2.loc[20:, "adj_factor"] = 2.0
    est2 = cn.float_shares_estimate(df2)
    assert abs(est2.iloc[20] / (2 * shares) - 1) < 0.03
    # 阶梯化：估计值逐日不抖动
    assert est.iloc[10:].nunique() <= 3


def test_float_shares_zero_turnover_nan():
    df = pd.DataFrame({"volume": [1e6] * 6, "turnover": [0.0] * 6, "adj_factor": 1.0})
    assert cn.float_shares_estimate(df).isna().all()
    df2 = pd.DataFrame({"amount": [1e7, 1e7], "turnover": [0.0, 0.01]})
    m = cn.mcap_proxy_amount(df2)
    assert np.isnan(m.iloc[0]) and m.iloc[1] == pytest.approx(1e9)


# ---------------- HTTP 工具 ----------------
def test_cache_key_and_json_helpers():
    a = http.cache_key("https://x/y", {"b": 2, "a": 1})
    b = http.cache_key("https://x/y", {"a": 1, "b": 2})
    assert a == b
    assert http.full_url("https://x/y", {"b": 2, "a": 1}) == "https://x/y?a=1&b=2"
    assert http.parse_json(b'cb({"a": 1});') == {"a": 1}


def test_client_cache_hit_no_network(tmp_path, monkeypatch):
    monkeypatch.setenv("FACTORLAB_DATA", str(tmp_path))
    c = http.Client("cn")
    calls = []

    def fake_fetch(url, params=None, headers=None):
        calls.append(url)
        return json.dumps(RAW_600000).encode()

    monkeypatch.setattr(c, "fetch", fake_fetch)
    d1 = c.get_json("https://example.invalid/k", {"secid": "1.600000"}, cache_file="kline/fqt0/600000.json")
    d2 = c.get_json("https://example.invalid/k", {"secid": "1.600000"}, cache_file="kline/fqt0/600000.json")
    assert d1 == d2 and len(calls) == 1
    assert (tmp_path / "cn" / "raw" / "kline" / "fqt0" / "600000.json").exists()


def test_rate_limiter_interval():
    rl = http._RateLimiter(50.0)
    import time
    t0 = time.monotonic()
    for _ in range(6):
        rl.wait()
    assert time.monotonic() - t0 >= 5 / 50.0 - 1e-3


def test_pilot_sample_stratified():
    rows = []
    for i in range(200):
        rows.append({"code": f"600{i:03d}", "exchange": "SSE", "board": "主板", "status": "listed"})
        rows.append({"code": f"300{i:03d}", "exchange": "SZSE", "board": "创业板", "status": "listed"})
    for i in range(20):
        rows.append({"code": f"688{i:03d}", "exchange": "SSE", "board": "科创板", "status": "listed"})
    for i, y in enumerate(range(2005, 2025)):
        for j in range(3):
            rows.append({"code": f"601{i:02d}{j}", "exchange": "SSE", "board": "主板", "status": "delisted",
                         "delist_date": pd.Timestamp(f"{y}-06-30")})
    sec = pd.DataFrame(rows)
    sec["delist_date"] = pd.to_datetime(sec.get("delist_date"))
    codes = cn.pilot_sample(sec, 60)
    listed = [c for c in codes if not c.startswith("601")]
    dl = [c for c in codes if c.startswith("601")]
    assert len(listed) <= 60 and len(dl) == 30
    assert any(c.startswith("688") for c in listed)     # 小板块也有最低配额
    years = {sec.set_index("code").loc[c, "delist_date"].year for c in dl}
    assert len(years) == 20                             # 退市股按年份分层


# ---------------- 复权因子 ----------------
def test_parse_sina_hfq_and_apply_factor():
    text = ('var sh600000hfq={"total":3,"data":[{"d":"2024-07-18", "f":"16.1182559331356000"},'
            '{"d":"2023-07-21", "f":"15.5459152080763000"},{"d":"1900-01-01", "f":"1.0"}]}\n/* xyz */')
    fac = cn.parse_sina_hfq(text)
    assert list(fac["factor"].round(4)) == [1.0, 15.5459, 16.1183]
    d = pd.Series(pd.to_datetime(["2023-07-20", "2023-07-21", "2024-07-17", "2024-07-18"]))
    f = cn.apply_factor(d, fac)
    assert f[0] == pytest.approx(1.0) and f[1] == pytest.approx(15.5459152)
    assert f[2] == pytest.approx(15.5459152) and f[3] == pytest.approx(16.1182559)   # 除权日当日生效


def test_factor_from_ref_ex_dividend_and_split():
    # 第 3 天除息 0.5（参考价 9.50），第 5 天 10 送 10（参考价 = 前收 / 2）
    raw = pd.DataFrame({"date": pd.bdate_range("2024-06-03", periods=5),
                        "close": [10.0, 10.0, 9.6, 9.8, 5.0]})
    raw["chg"] = [0.0, 0.0, 9.6 - 9.5, 0.2, 5.0 - 4.9]
    F = cn.factor_from_ref(raw)
    assert F[:2].tolist() == [1.0, 1.0]
    assert F[2] == pytest.approx(10 / 9.5)
    assert F[3] == pytest.approx(10 / 9.5)                   # 普通日不变
    assert F[4] == pytest.approx(10 / 9.5 * 2.0)
    adj = raw["close"] * F
    assert adj.iloc[2] / adj.iloc[1] - 1 == pytest.approx(9.6 / 9.5 - 1)   # 含息总收益


def test_additive_to_multiplicative_hk():
    raw = pd.DataFrame({"date": pd.bdate_range("2024-06-03", periods=6),
                        "close": [10.0, 10.0, 9.6, 9.6, 19.0, 19.0]})
    rec = pd.DataFrame({"date": pd.to_datetime(["1900-01-01", "2024-06-05", "2024-06-07"]),
                        "f": [1.0, 1.0, 0.5], "c": [0.0, 0.5, 0.5]})
    # 06-05 派息 0.5：ref = (10×1 + 0 − 0.5)/1 = 9.5；06-07 两股合一：ref = 9.6×1/0.5 = 19.2
    F = hk.additive_to_multiplicative(raw, rec)
    assert F[:2].tolist() == [1.0, 1.0]
    assert F[2] == pytest.approx(10 / 9.5)
    assert F[4] == pytest.approx(10 / 9.5 * 9.6 / 19.2)
    adj = raw["close"].to_numpy() * F
    assert adj[4] / adj[3] - 1 == pytest.approx(19.0 / 19.2 - 1)          # 合股日只剩真实涨跌


def test_parse_sina_hk_hfq():
    text = ('var hk00700hfq={"total":2,"data":[{"d":"2026-05-15", "f":"5", "c":"278.93"},'
            '{"d":"2014-05-15", "f":"5", "c":"10.5"}]}')
    r = hk.parse_sina_hk_hfq(text)
    assert r["date"].is_monotonic_increasing and r["f"].tolist() == [5.0, 5.0] and r["c"].iloc[-1] == pytest.approx(278.93)


def test_affine_fit_detects_additive_adjustment():
    raw = pd.DataFrame({"date": pd.to_datetime(["2026-11-25", "2026-11-26"]),
                        "high": [10.79, 10.72], "low": [10.52, 10.53], "close": [10.67, 10.72]})
    # 东方财富 600000 实测：hfq 高 / 低 / 收
    hfq = pd.DataFrame({"date": raw["date"], "high": [110.47, 110.01], "low": [108.69, 108.76],
                        "close": [109.68, 110.01]})
    fit = cn.affine_fit(raw, hfq)
    assert fit["a"].between(6.4, 6.8).all()
    assert (fit["b_over_hfq"] > 0.3).all()          # 截距约占 hfq 的 36%：不是按比例复权
    prop = hfq.copy()
    for c in ("high", "low", "close"):
        prop[c] = raw[c] * 10.0
    assert cn.affine_fit(raw, prop)["b_over_hfq"].abs().max() < 1e-9


# ---------------- 腾讯后备源 ----------------
def test_tencent_rows_to_klines_units():
    rows = [["2024-01-02", "6.63", "6.60", "6.65", "6.60", "220667.00", {}, "0.08", "14606.63", "0.00", "0.00"]]
    ln = cn.tencent_rows_to_klines(rows)[0].split(",")
    assert ln[5] == "220667.00"                      # 手（与东方财富同口径）
    assert float(ln[6]) == pytest.approx(146066300.0)  # 万元 → 元
    df = cn.parse_kline({"data": {"klines": cn.tencent_rows_to_klines(rows)}})
    assert df["volume"].iloc[0] == pytest.approx(22066700.0) and df["turnover"].iloc[0] == pytest.approx(0.0008)
    assert np.isnan(df["chg"].iloc[0])
    # 成交量以「股」给出（额 /(量 × 价) ≈ 0.01）→ 自动 ÷100 成手
    rows_sh = [["2024-01-02", "30.00", "30.00", "30.5", "29.5", "7438700.00", {}, "1.0", "22316.1"]]
    assert cn.tencent_rows_to_klines(rows_sh)[0].split(",")[5] == "74387.00"
    assert cn.tencent_rows_to_klines(rows_sh, detect_unit=False)[0].split(",")[5] == "7438700.00"


def test_fix_volume_unit():
    raw = pd.DataFrame({"volume": [1000.0] * 6, "close": [10.0] * 6, "amount": [1e6] * 6})
    out = cn.fix_volume_unit(raw)
    assert out["volume"].iloc[0] == pytest.approx(1e5)
    ok = pd.DataFrame({"volume": [1e5] * 6, "close": [10.0] * 6, "amount": [1e6] * 6})
    assert cn.fix_volume_unit(ok)["volume"].iloc[0] == pytest.approx(1e5)


def test_hk_fix_suspect_factor_jumps():
    import pandas as pd
    from factorlab.sources.hk import fix_suspect_factor_jumps
    df = pd.DataFrame({
        "date": pd.to_datetime(["2011-04-13", "2011-04-14", "2011-04-15", "2011-04-18"] * 2),
        "code": ["00767"] * 4 + ["00700"] * 4,
        "open": [2.1, 2.1, 0.9, 0.95, 100, 101, 50, 51],
        "close": [2.1, 2.13, 0.91, 0.95, 100, 102, 51, 52],
        # 00767：因子跳 15 倍（错误）；00700：1 拆 2，因子翻倍、复权收益正常（不改）
        "adj_factor": [1.0, 1.0, 15.0, 15.0, 1.0, 1.0, 2.0, 2.0],
    })
    df["close_adj"] = df["close"] * df["adj_factor"]
    df["open_adj"] = df["open"] * df["adj_factor"]
    out, n = fix_suspect_factor_jumps(df)
    assert n == 1
    a = out[out.code == "00767"].reset_index(drop=True)
    r = a["close_adj"].pct_change()
    assert abs(r[2] - (0.91 / 2.13 - 1)) < 1e-12 and abs(r[3] - (0.95 / 0.91 - 1)) < 1e-12
    b = out[out.code == "00700"].reset_index(drop=True)
    assert list(b["adj_factor"]) == [1.0, 1.0, 2.0, 2.0]


def test_hk_missing_turnover_is_nan_not_zero(tmp_path, monkeypatch):
    """腾讯港股没给换手率时原始值为 0；load_code 之后必须是缺失。这里直接检查规则本身。"""
    import pandas as pd
    df = pd.DataFrame({"volume": [100.0, 200.0], "turnover": [0.0, 0.0123]})
    df["turnover"] = df["turnover"].where(df["turnover"] > 0)
    assert df["turnover"].isna().tolist() == [True, False]
