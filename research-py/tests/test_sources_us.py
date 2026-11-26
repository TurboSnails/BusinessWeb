"""美股数据源离线单元测试：KF 解析、Yahoo chart 解析、Nasdaq 符号目录、SEC 点时提取。不联网。"""

from __future__ import annotations

import io
import zipfile
from datetime import datetime, timezone

import numpy as np
import pandas as pd
import pytest

from factorlab.sources import kf, sec, us

# ------------------------------------------------------------------------------------------------
# Ken French
# ------------------------------------------------------------------------------------------------
KF_FACTORS = (
    "This file was created using the 202609 CRSP database.\r\n"
    "The 1-month TBill rate data until 202405 are from Ibbotson Associates.\r\n"
    "\r\n"
    ",Mkt-RF,SMB,HML,RF\r\n"
    "192607,   2.89,  -2.42,  -2.75,   0.22\r\n"
    "192608,   2.64,  -1.47,   4.07,   0.25\r\n"
    "\r\n"
    " Annual Factors: January-December \r\n"
    ",Mkt-RF,SMB,HML,RF\r\n"
    "1927,  29.44,  -3.05,  -3.36,   3.12\r\n"
    "\r\n"
    "Copyright 2026 Eugene F. Fama and Kenneth R. French\r\n"
)

KF_PORT = """This file was created using the 202609 CRSP database.
Missing data are indicated by -99.99 or -999.


  Average Value Weighted Returns -- Monthly
,<= 0,Lo 30 ,Hi 30
192607,  -99.99,    0.06,    3.43
192608,  -99.99,    1.00,   -2.00,
192609,  -999,      0.50,    0.25

  Average Equal Weighted Returns -- Monthly
,<= 0,Lo 30,Hi 30
192607,  -99.99,   -0.53,    2.63
192608,  -99.99,    1.10,   -1.90
192609,  -99.99,    0.40,    0.20


  Value Weighted Returns -- Annual from January to December
,<= 0,Lo 30,Hi 30

1927,  -99.99,   35.71,   33.08

  Number of Firms in Portfolios
,<= 0,Lo 30,Hi 30
192607,      0,    300,    100
192608,      0,    301,    100
192609,      0,    302,     99

  Average Firm Size
,<= 0,Lo 30,Hi 30
192607,  -99.99,   2.00,  50.00
192608,  -99.99,   2.10,  51.00
192609,  -99.99,   2.20,  52.00

  For portfolios formed in June of year t
  Value-Weighted Average of Past Return Variance
,<= 0,Lo 30,Hi 30
192607,  1.0,  2.0
"""


def test_kf_factor_file_crlf_untitled_section():
    secs = kf.parse_kf_csv(KF_FACTORS)
    assert [s.freq for s in secs] == ["M", "A"]
    m = secs[0]
    assert m.title == "" and m.kind == "ret" and m.weighting == "vw"
    assert m.columns == ["Mkt-RF", "SMB", "HML", "RF"]
    assert secs[1].title == "Annual Factors: January-December"
    df, st = kf.sections_to_long(secs, "F-F_Research_Data_Factors")
    assert len(df) == 8 and set(df["weighting"]) == {"vw"}
    row = df[(df["portfolio"] == "RF") & (df["date"] == "1926-07-31")]
    assert row["ret"].iloc[0] == pytest.approx(0.0022)
    assert (df["date"] == df["date"] + pd.offsets.MonthEnd(0)).all()  # 月末


def test_kf_portfolio_file_sections_missing_and_quirks():
    secs = kf.parse_kf_csv(KF_PORT)
    kinds = [(s.freq, s.kind, s.weighting) for s in secs]
    assert kinds == [("M", "ret", "vw"), ("M", "ret", "ew"), ("A", "ret", "vw"), ("M", "n_firms", ""),
                     ("M", "size", ""), ("M", "other", "")]
    vw = secs[0]
    assert vw.columns == ["<= 0", "Lo 30", "Hi 30"]       # 表头尾随空格被压缩
    assert vw.n_missing == 3                              # -99.99 ×2 与 -999 ×1
    assert np.isnan(vw.values[:, 0]).all()
    assert secs[2].index == ["1927"]                      # 年度段表头与数据之间夹空行
    assert secs[5].warning                                # 特征段列数不符：容忍并记警告
    df, st = kf.sections_to_long(secs, "Portfolios_Formed_on_ME")
    assert st["missing_cells"] == 6
    assert "<= 0" not in set(df["portfolio"])             # 缺失不写行
    assert len(df) == 2 * 2 * 3
    r = df[(df["portfolio"] == "Lo 30") & (df["weighting"] == "vw") & (df["date"] == "1926-08-31")].iloc[0]
    assert r["ret"] == pytest.approx(0.01) and r["n_firms"] == 301 and r["avg_size"] == pytest.approx(2.10)
    e = df[(df["portfolio"] == "Hi 30") & (df["weighting"] == "ew") & (df["date"] == "1926-09-30")].iloc[0]
    assert e["ret"] == pytest.approx(0.002)


def test_kf_column_mismatch_in_return_section_raises():
    bad = KF_PORT.replace("192608,  -99.99,    1.00,   -2.00,", "192608,  -99.99,    1.00")
    with pytest.raises(ValueError):
        kf.sections_to_long(kf.parse_kf_csv(bad), "x")


def test_kf_read_zip_and_catalog():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("Developed_ex_US_MOM_Factor.csv", KF_FACTORS)   # 文件名大小写与 zip 名不同
    assert kf.read_zip_text(buf.getvalue()).startswith("This file")
    for need in ("F-F_Research_Data_5_Factors_2x3", "F-F_Momentum_Factor", "Portfolios_Formed_on_AC",
                 "10_Portfolios_Prior_1_0", "25_Portfolios_ME_Prior_12_2", "49_Industry_Portfolios",
                 "Developed_ex_US_5_Factors", "Developed_ex_US_Mom_Factor"):
        assert need in kf.CATALOG
    assert kf.url_for("F-F_Momentum_Factor").endswith("/ftp/F-F_Momentum_Factor_CSV.zip")


# ------------------------------------------------------------------------------------------------
# Yahoo chart
# ------------------------------------------------------------------------------------------------
def _ts(d: str) -> int:  # 美东 09:30 开盘时刻（EST = UTC-5）
    return int(pd.Timestamp(d + " 14:30", tz="UTC").timestamp())


def _chart():
    days = ["2020-08-26", "2020-08-27", "2020-08-28", "2020-08-31", "2020-09-01", "2020-09-02"]
    return {"chart": {"error": None, "result": [{
        "meta": {"symbol": "XYZ", "exchangeTimezoneName": "America/New_York", "firstTradeDate": _ts("1980-12-12"),
                 "instrumentType": "EQUITY", "currency": "USD"},
        "timestamp": [_ts(d) for d in days],
        "events": {"splits": {str(_ts("2020-08-31")): {"date": _ts("2020-08-31"), "numerator": 4.0,
                                                      "denominator": 1.0, "splitRatio": "4:1"}},
                   "dividends": {str(_ts("2020-08-28")): {"date": _ts("2020-08-28"), "amount": 0.82}}},
        "indicators": {
            # Yahoo 的 quote 已按拆股调整（拆股前 ÷4）
            "quote": [{"open": [125.0, 126.0, 125.5, 127.0, 132.0, None],
                       "high": [126.0, 127.0, 126.0, 130.0, 134.0, None],
                       "low": [124.0, 124.5, 124.0, 126.0, 129.0, None],
                       "close": [125.0, 125.0, 124.0, 129.0, 134.0, None],
                       "volume": [400.0, 800.0, 400.0, 1000.0, 1200.0, None]}],
            "adjclose": [{"adjclose": [121.0, 121.0, 120.8, 125.7, 130.6, None]}]}}]}}


def test_yahoo_chart_unadjusts_splits_and_rebases_adjclose():
    now = datetime(2026, 11, 26, 23, 0, tzinfo=timezone.utc)
    df, info = us.parse_yahoo_chart(_chart(), "XYZ", now=now)
    assert list(df["date"].dt.strftime("%Y-%m-%d")) == ["2020-08-26", "2020-08-27", "2020-08-28",
                                                        "2020-08-31", "2020-09-01"]
    assert info["dropped"]["null_or_nonpositive_close"] == 1
    assert info["splits"] == [(pd.Timestamp("2020-08-31"), 4.0)]
    assert info["dividends"][0][1] == pytest.approx(0.82)
    assert info["first_trade_date"] == pd.Timestamp("1980-12-12")
    # 不复权：拆股日之前 ×4，成交量 ÷4
    assert df["close"].tolist()[:3] == pytest.approx([500.0, 500.0, 496.0])
    assert df["close"].tolist()[3:] == pytest.approx([129.0, 134.0])
    assert df["volume"].iloc[0] == pytest.approx(100.0)
    assert df["high"].iloc[0] == pytest.approx(504.0)
    # 后复权：首日 = 首日不复权收盘；收益比值与 Yahoo adjclose 一致
    assert df["close_adj"].iloc[0] == pytest.approx(500.0)
    r = df["close_adj"].pct_change().dropna().to_numpy()
    exp = pd.Series([121.0, 121.0, 120.8, 125.7, 130.6]).pct_change().dropna().to_numpy()
    assert r == pytest.approx(exp)
    # 拆股日不复权价跳 ≈ 1/4，复权价连续
    raw_jump = df["close"].iloc[3] / df["close"].iloc[2]
    assert raw_jump == pytest.approx(129.0 / 496.0)
    assert df["amount"].iloc[0] == pytest.approx(500.0 * 100.0)


def test_yahoo_drops_partial_today_bar_and_errors():
    p = _chart()
    now = datetime(2020, 9, 1, 17, 0, tzinfo=timezone.utc)   # 美东 13:00，当日未收盘
    df, info = us.parse_yahoo_chart(p, "XYZ", now=now)
    assert df["date"].max() == pd.Timestamp("2020-08-31")
    assert info["dropped"]["partial_today"] == 2
    with pytest.raises(ValueError):
        us.parse_yahoo_chart({"chart": {"error": {"code": "Not Found"}, "result": None}}, "NOPE")


# ------------------------------------------------------------------------------------------------
# Nasdaq Trader 符号目录
# ------------------------------------------------------------------------------------------------
NASDAQ_TXT = (
    "Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares\r\n"
    "AAPL|Apple Inc. - Common Stock|Q|N|N|100|N|N\r\n"
    "QQQ|Invesco QQQ Trust, Series 1|G|N|N|100|Y|N\r\n"
    "ZXZZT|NASDAQ TEST STOCK|G|Y|N|100|N|N\r\n"
    "ABCDW|ABC Acquisition Corp. - Warrant|S|N|N|100|N|N\r\n"
    "ABCD|ABC Acquisition Corp. - Class A Ordinary Shares|S|N|N|100|N|N\r\n"
    "ABCDU|ABC Acquisition Corp. - Units|S|N|N|100|N|N\r\n"
    "ARM|Arm Holdings plc - American Depositary Shares|Q|N|N|40|N|N\r\n"
    "File Creation Time: 1125202621:32|||||||\r\n"
)
OTHER_TXT = (
    "ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol\r\n"
    "BRK.B|Berkshire Hathaway Inc. New Common Stock|N|BRK.B|N|100|N|BRK=B\r\n"
    "UNH|UnitedHealth Group Incorporated Common Stock (DE)|N|UNH|N|40|N|UNH\r\n"
    "ABR$D|Arbor Realty Trust 6.375% Series D Cumulative Redeemable Preferred Stock|N|ABRpD|N|100|N|ABR-D\r\n"
    "SPY|SPDR S&P 500 ETF Trust|P|SPY|Y|100|N|SPY\r\n"
    "XYZA|Xyz Arca Listed Common Stock|P|XYZA|N|100|N|XYZA\r\n"
    "IMO|Imperial Oil Limited Common Stock|A|IMO|N|100|N|IMO\r\n"
    "AAP|Advance Auto Parts Inc.|N|AAP|N|100|N|AAP\r\n"
    "File Creation Time: 1125202621:32||||||\r\n"
)


def test_nasdaq_directory_parsing_and_filters():
    m = us.build_security_master(NASDAQ_TXT, OTHER_TXT)
    assert sorted(m["code"]) == ["AAP", "AAPL", "ABCD", "BRK.B", "IMO", "UNH"]
    row = m.set_index("code")
    assert row.loc["AAPL", "exchange"] == "NASDAQ" and row.loc["AAPL", "board"] == "NASDAQ Global Select"
    assert row.loc["IMO", "exchange"] == "AMEX" and row.loc["UNH", "sec_type"] == "common"
    assert row.loc["AAP", "sec_type"] == "unspecified"
    assert bool(row.loc["ABCD", "is_spac"]) and row.loc["ABCD", "sec_type"] == "ordinary"
    assert row.loc["BRK.B", "yahoo"] == "BRK-B"
    assert (m["status"] == "listed").all() and (m["market"] == "us").all()


def test_classify_security_word_boundaries():
    assert us.classify_security("UnitedHealth Group Incorporated Common Stock") == "common"
    assert us.classify_security("Foo Corp - Units") == "unit"
    assert us.classify_security("Foo Corp - Rights") == "right"
    assert us.classify_security("Foo Ltd - American Depository Shares") == "adr"
    assert us.classify_security("Foo Partners L.P. Common Units") == "common"
    assert us.classify_security("Foo Inc. 7.25% Senior Notes due 2029") == "note"


def test_pilot_sample_deterministic():
    m = pd.DataFrame({"code": ["AAPL", "MSFT", "CRCL"] + [f"S{i:03d}" for i in range(50)]})
    a, b = us.pilot_sample(m, 20), us.pilot_sample(m, 20)
    assert a == b and len(a) == 20 and a[:2] == ["AAPL", "MSFT"] and "CRCL" in a


# ------------------------------------------------------------------------------------------------
# SEC 点时
# ------------------------------------------------------------------------------------------------
def _o(start, end, val, accn, form, fy, fp, filed, frame=None):
    d = {"end": end, "val": val, "accn": accn, "form": form, "fy": fy, "fp": fp, "filed": filed}
    if start:
        d["start"] = start
    if frame:
        d["frame"] = frame
    return d


FACTS = {
    "cik": 1234567, "entityName": "Example Corp",
    "facts": {
        "dei": {"EntityCommonStockSharesOutstanding": {"units": {"shares": [
            _o(None, "2023-04-28", 5_000_000, "A-23-Q1", "10-Q", 2023, "Q1", "2023-05-05")]}}},
        "us-gaap": {
            # 现金流：10-Q 为年初累计
            "NetCashProvidedByUsedInOperatingActivities": {"units": {"USD": [
                _o("2023-01-01", "2023-03-31", 100, "A-23-Q1", "10-Q", 2023, "Q1", "2023-05-05"),
                _o("2023-01-01", "2023-06-30", 250, "A-23-Q2", "10-Q", 2023, "Q2", "2023-08-04"),
                _o("2023-01-01", "2023-09-30", 420, "A-23-Q3", "10-Q", 2023, "Q3", "2023-11-03"),
                _o("2023-01-01", "2023-12-31", 600, "A-23-K", "10-K", 2023, "FY", "2024-02-20"),
                # 下一年 10-Q 的对比栏：同一期间、同一数值，fy/fp 描述的是新文件 → 不应产生新版本
                _o("2023-01-01", "2023-03-31", 100, "A-24-Q1", "10-Q", 2024, "Q1", "2024-05-03"),
                # 10-K/A 重述年度值 → 另记新版本
                _o("2023-01-01", "2023-12-31", 610, "A-23-KA", "10-K/A", 2023, "FY", "2024-04-10"),
                # 下一年 10-K 再次列示（与重述后一致）→ 无新版本
                _o("2023-01-01", "2023-12-31", 610, "A-24-K", "10-K", 2024, "FY", "2025-02-21"),
            ]}},
            # 利润：10-Q 同时报单季（3 个月）与累计
            "NetIncomeLoss": {"units": {"USD": [
                _o("2023-01-01", "2023-03-31", 50, "A-23-Q1", "10-Q", 2023, "Q1", "2023-05-05"),
                _o("2023-04-01", "2023-06-30", 60, "A-23-Q2", "10-Q", 2023, "Q2", "2023-08-04"),
                _o("2023-01-01", "2023-06-30", 110, "A-23-Q2", "10-Q", 2023, "Q2", "2023-08-04"),
            ]}},
            "Assets": {"units": {"USD": [
                _o(None, "2023-03-31", 1000, "A-23-Q1", "10-Q", 2023, "Q1", "2023-05-05"),
                _o(None, "2023-03-31", 1000, "A-24-Q1", "10-Q", 2024, "Q1", "2024-05-03"),
                _o(None, "2023-12-31", 1200, "A-23-K", "10-K", 2023, "FY", "2024-02-20"),
            ]}},
        },
    },
}


def test_sec_extract_effective_date_next_business_day():
    obs = sec.extract_facts(FACTS)
    assert set(obs["concept"]) == {"EntityCommonStockSharesOutstanding", "NetCashProvidedByUsedInOperatingActivities",
                                   "NetIncomeLoss", "Assets"}
    r = obs[(obs["concept"] == "Assets") & (obs["accn"] == "A-23-Q1")].iloc[0]
    assert r["filed"] == pd.Timestamp("2023-05-05")              # 周五申报
    assert r["effective_date"] == pd.Timestamp("2023-05-08")     # 无受理时间 → 下一工作日（周一）
    assert pd.isna(r["start"]) and r["cik"] == 1234567
    assert obs[obs["form"] == "10-K/A"]["is_amendment"].all()


def test_sec_acceptance_time_before_and_after_close():
    acc = {"A-23-Q1": "2023-05-05T14:30:00.000Z",   # 美东 10:30 → 当日
           "A-23-Q2": "2023-08-04T21:05:00.000Z"}   # 美东 17:05 → 下一工作日（周一 08-07）
    obs = sec.extract_facts(FACTS, acceptance=acc)
    e = obs.groupby("accn")["effective_date"].first()
    assert e["A-23-Q1"] == pd.Timestamp("2023-05-05")
    assert e["A-23-Q2"] == pd.Timestamp("2023-08-07")
    assert e["A-23-K"] == pd.Timestamp("2024-02-21")           # 没有受理时间 → filed + 1


def test_sec_vintages_dedupe_and_keep_amendments():
    v = sec.vintages(sec.extract_facts(FACTS))
    cf = v[v["concept"] == "NetCashProvidedByUsedInOperatingActivities"]
    fy = cf[cf["end"] == pd.Timestamp("2023-12-31")].sort_values("version")
    assert fy["val"].tolist() == [600, 610] and fy["form"].tolist() == ["10-K", "10-K/A"]
    q1 = cf[cf["end"] == pd.Timestamp("2023-03-31")]
    assert len(q1) == 1 and q1["accn"].iloc[0] == "A-23-Q1"     # 对比栏重复不算新知识
    assets = v[(v["concept"] == "Assets") & (v["end"] == pd.Timestamp("2023-03-31"))]
    assert len(assets) == 1
    # asof：重述生效前看到 600，之后看到 610；生效前一天看不到年度值
    a1 = sec.asof(cf, "2024-04-10")
    assert a1[a1["end"] == pd.Timestamp("2023-12-31")]["val"].iloc[0] == 600
    a2 = sec.asof(cf, "2024-04-11")
    assert a2[a2["end"] == pd.Timestamp("2023-12-31")]["val"].iloc[0] == 610
    a0 = sec.asof(cf, "2024-02-20")
    assert (a0["end"] == pd.Timestamp("2023-12-31")).sum() == 0
    lk = sec.latest_known(v, "2023-12-01", "Assets", "instant")
    assert lk["val"] == 1000 and lk["end"] == pd.Timestamp("2023-03-31")


def test_sec_quarterize_ytd_difference_and_q4():
    v = sec.vintages(sec.extract_facts(FACTS))
    q = sec.quarterize(v, "NetCashProvidedByUsedInOperatingActivities")
    got = [(str(r.q_end.date()), r.val, r.method, str(r.effective_date.date()), r.version) for r in q.itertuples()]
    assert got == [
        ("2023-03-31", 100, "direct", "2023-05-08", 1),
        ("2023-06-30", 150, "ytd_diff", "2023-08-07", 1),
        ("2023-09-30", 170, "ytd_diff", "2023-11-06", 1),
        ("2023-12-31", 180, "fy_minus_9m", "2024-02-21", 1),
        ("2023-12-31", 190, "fy_minus_9m", "2024-04-11", 2),     # 10-K/A 重述 → Q4 新版本，旧值保留
    ]
    assert q[q["q_end"] == pd.Timestamp("2023-06-30")]["q_start"].iloc[0] == pd.Timestamp("2023-04-01")


def test_sec_quarterize_prefers_direct_three_month_values():
    v = sec.vintages(sec.extract_facts(FACTS))
    q = sec.quarterize(v, "NetIncomeLoss")
    q2 = q[q["q_end"] == pd.Timestamp("2023-06-30")]
    assert len(q2) == 1 and q2["val"].iloc[0] == 60 and q2["method"].iloc[0] == "direct"


def test_sec_requires_user_agent_env(monkeypatch, capsys, tmp_path):
    monkeypatch.delenv("SEC_USER_AGENT", raising=False)
    monkeypatch.setattr(sec, "UA_FILE", tmp_path / "missing")  # 本机私有文件存在时也要能测到「未设置」
    with pytest.raises(sec.SecUserAgentMissing):
        sec.user_agent()
    with pytest.raises(sec.SecUserAgentMissing):
        sec.fetch_companyfacts(320193)
    with pytest.raises(sec.SecUserAgentMissing):
        sec.fetch_company_tickers()
    assert sec.main(["facts", "--cik", "320193"]) == 2
    assert "SEC_USER_AGENT" in capsys.readouterr().err


def test_sec_company_tickers_parse():
    df = sec.parse_company_tickers({"0": {"cik_str": 320193, "ticker": "aapl", "title": "Apple Inc."}}, "2026-11-26")
    assert df.iloc[0].to_dict() == {"cik": 320193, "ticker": "AAPL", "title": "Apple Inc.",
                                    "mapping_as_of": "2026-11-26"}


def test_sec_extract_facts_tolerates_bad_dates():
    facts = {"cik": 1, "facts": {"us-gaap": {"Assets": {"units": {"USD": [
        {"end": "2020-12-31", "val": 10, "accn": "a1", "form": "10-K", "filed": "2021-02-20"},
        {"end": "0202-02-01", "val": 11, "accn": "a2", "form": "10-K", "filed": "2021-02-20"},
        {"end": "2021-12-31", "val": 12, "accn": "a3", "form": "10-K", "filed": "bad"},
    ]}}}}}
    df = sec.extract_facts(facts, [("us-gaap", "Assets")])
    assert list(df["val"]) == [10]
