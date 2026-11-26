"""美股点时基本面（fundamentals_us + factors/fundamental）：TTM / 单季还原数值、无前视、负账面权益、拆股调整、
股本量纲笔误、可见上界（锁箱）截断。全部合成数据，不联网、不读仓库数据。"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from factorlab import fundamentals_us as fu
from factorlab import registry, store
from factorlab.sources import sec
from factorlab_synth import tmp_ledger  # noqa: F401

CIK = 12345


def _obs(rows, cik=CIK) -> pd.DataFrame:
    """rows: (concept, unit, start, end, val, filed[, form]) → sec.extract_facts 同格式的原始观测。"""
    out = []
    for r in rows:
        con, unit, start, end, val, filed = r[:6]
        form = r[6] if len(r) > 6 else "10-Q"
        out.append({"cik": cik, "taxonomy": "dei" if con.startswith("Entity") else "us-gaap", "concept": con,
                    "unit": unit, "start": pd.Timestamp(start) if start else pd.NaT, "end": pd.Timestamp(end),
                    "val": float(val), "accn": f"{cik}-{filed}-{con[:6]}", "form": form, "fy": None, "fp": None,
                    "frame": None, "filed": pd.Timestamp(filed)})
    df = pd.DataFrame(out)
    df["period_days"] = (df["end"] - df["start"]).dt.days + 1
    df["is_amendment"] = df["form"].str.endswith("/A")
    df["effective_date"] = sec.effective_date(df["filed"])
    return df


CFO = "NetCashProvidedByUsedInOperatingActivities"
# 年初累计（YTD）：2020 单季 100/110/120/130，2021 单季 120/130/140/150
YTD = [("2020-01-01", "2020-03-31", 100, "2020-05-01"), ("2020-01-01", "2020-06-30", 210, "2020-08-03"),
       ("2020-01-01", "2020-09-30", 330, "2020-11-02"), ("2020-01-01", "2020-12-31", 460, "2021-02-22"),
       ("2021-01-01", "2021-03-31", 120, "2021-05-03"), ("2021-01-01", "2021-06-30", 250, "2021-08-02"),
       ("2021-01-01", "2021-09-30", 390, "2021-11-01"), ("2021-01-01", "2021-12-31", 540, "2022-02-22")]


def _base_rows():
    rows = []
    for s, e, v, f in YTD:
        form = "10-K" if e.endswith("12-31") else "10-Q"
        rows.append((CFO, "USD", s, e, v, f, form))
        rows.append(("NetIncomeLoss", "USD", s, e, v / 2, f, form))
    # 毛利只有直接披露的单季（测试「连续 4 季相加」的回退）
    for s, e, v, f in [("2020-04-01", "2020-06-30", 50, "2020-08-03"), ("2020-07-01", "2020-09-30", 60, "2020-11-02"),
                       ("2020-10-01", "2020-12-31", 70, "2021-02-22"), ("2021-01-01", "2021-03-31", 80, "2021-05-03")]:
        rows.append(("GrossProfit", "USD", s, e, v, f))
    rows += [
        ("StockholdersEquity", "USD", None, "2020-12-31", -50, "2021-02-22", "10-K"),     # 负账面权益
        ("StockholdersEquity", "USD", None, "2021-03-31", 200, "2021-05-03"),
        ("Assets", "USD", None, "2020-03-31", 1000, "2020-05-01"),
        ("Assets", "USD", None, "2020-12-31", 1100, "2021-02-22", "10-K"),
        ("Assets", "USD", None, "2021-03-31", 1200, "2021-05-03"),
        ("EntityCommonStockSharesOutstanding", "shares", None, "2020-04-20", 1e6, "2020-05-01"),
        ("EntityCommonStockSharesOutstanding", "shares", None, "2020-07-20", 1e6, "2020-08-03"),
        ("EntityCommonStockSharesOutstanding", "shares", None, "2020-10-20", 1e6, "2020-11-02"),
        ("EntityCommonStockSharesOutstanding", "shares", None, "2021-02-10", 1.0e6, "2021-02-22", "10-K"),
        ("EntityCommonStockSharesOutstanding", "shares", None, "2021-04-20", 1.05e6, "2021-05-03"),
    ]
    return rows


def _vint(rows):
    return sec.vintages(_obs(rows))


def _at(ev: pd.DataFrame, t) -> pd.Series:
    return ev[ev["t"] <= pd.Timestamp(t)].iloc[-1]


# ------------------------------------------------------------------ TTM / 单季还原
def test_ttm_matches_ytd_formula_and_quarterize():
    v = _vint(_base_rows())
    ev = fu.firm_events(v)
    exp = {"2021-02-23": (460, "fy"), "2021-05-04": (480, "ytd"), "2021-08-03": (500, "ytd"),
           "2021-11-02": (520, "ytd"), "2022-02-23": (540, "fy")}
    q = sec.quarterize(v, CFO, "USD")
    for t, (val, how) in exp.items():
        r = _at(ev, t)
        assert r["cfo"] == pytest.approx(val), t
        assert r["ni"] == pytest.approx(val / 2), t
        # 与 sec.quarterize 的单季还原 + 最近 4 季相加一致
        qq = q[q["effective_date"] <= pd.Timestamp(t)].groupby("q_end").tail(1).sort_values("q_end").tail(4)
        assert qq["val"].sum() == pytest.approx(val), t
    assert _at(ev, "2021-05-04")["ni_how"] == "ytd"
    # 毛利只有单季：4 季相加 50+60+70+80
    r = _at(ev, "2021-05-04")
    assert r["gp"] == pytest.approx(260) and r["gp_end"] == pd.Timestamp("2021-03-31")
    # 资产：最新与约一年前（同一快照里）
    assert r["assets"] == 1200 and r["assets_lag"] == 1000


def test_cash_flow_ytd_before_full_year_known_uses_old_fy():
    # 只有 2020 年 9M 与 2019 年报：拿不到「上年同期」时退回最新年报（期末更旧）
    rows = [(CFO, "USD", "2019-01-01", "2019-12-31", 400, "2020-02-21", "10-K"),
            (CFO, "USD", "2020-01-01", "2020-09-30", 330, "2020-11-02")]
    ev = fu.firm_events(_vint(rows))
    r = _at(ev, "2020-11-03")
    assert r["cfo"] == 400 and r["cfo_end"] == pd.Timestamp("2019-12-31")


# ------------------------------------------------------------------ 面板字段
def _market(days, codes=("XYZ",), price=10.0, vol=1e4):
    close = pd.DataFrame(price, index=days, columns=list(codes))
    volume = pd.DataFrame(vol, index=days, columns=list(codes))
    return close, volume


NO_SPLITS = pd.DataFrame(columns=["date", "code", "value"])
CMAP = pd.Series({"XYZ": CIK})


def _fields(rows, close, volume, splits=NO_SPLITS, end_ex=None):
    ev = fu.guard_events(fu.firm_events(_vint(rows)), end_ex, None)
    return fu.compute_fields(ev, fu.PROVIDES, close, volume, splits, CMAP)


def test_no_lookahead_later_filings_do_not_change_past_values():
    days = pd.bdate_range("2020-01-01", "2022-06-30")
    close, volume = _market(days)
    base = _fields(_base_rows(), close, volume)
    d = pd.Timestamp("2021-08-31")
    later = _base_rows() + [
        (CFO, "USD", "2020-01-01", "2020-12-31", 999, "2021-09-15", "10-K/A"),          # 之后的重述
        ("StockholdersEquity", "USD", None, "2021-06-30", 777, "2021-09-01"),            # d 之后才生效（9/2）
        ("EntityCommonStockSharesOutstanding", "shares", None, "2021-08-20", 5e6, "2021-09-03"),
    ]
    alt = _fields(later, close, volume)
    for k in fu.FIELDS_MONTHLY:
        a, b = base[k].loc[:d], alt[k].loc[:d]
        pd.testing.assert_frame_equal(a, b, check_exact=False, rtol=1e-12, obj=k)
    # 之后的月末确实用上了新申报（不是没读进来）
    assert alt["fund_be"].loc["2021-09-30", "XYZ"] == 777
    assert base["fund_be"].loc["2021-09-30", "XYZ"] == 200


def test_registered_factors_pass_engine_lookahead_check():
    days = pd.bdate_range("2020-01-01", "2022-06-30")
    close, volume = _market(days)
    panel = {"close_adj": close, "close": close, "volume": volume, **_fields(_base_rows(), close, volume)}
    dates = fu.month_rows(days)[6:]
    for name in ("bm", "ep_ttm", "cfp_ttm", "roe", "gpa", "asset_growth", "accruals", "net_issuance"):
        spec = registry.get(name)
        assert spec.markets == ("us",)
        assert registry.check_no_lookahead(spec, panel, dates, n_check=6), name


def test_negative_book_equity_gives_nan_bm_and_roe():
    days = pd.bdate_range("2020-01-01", "2021-12-31")
    close, volume = _market(days)
    f = _fields(_base_rows(), close, volume)
    panel = {"close_adj": close, **f}
    dates = fu.month_rows(days)
    bm = registry.get("bm")(panel, dates)["XYZ"]
    roe = registry.get("roe")(panel, dates)["XYZ"]
    # 2021-02-23 起已知 BE = −50（2020 年报），到 2021-05-04 才知道 BE = 200
    assert f["fund_be"].loc["2021-03-31", "XYZ"] == -50
    assert np.isnan(bm.loc["2021-03-31"]) and np.isnan(roe.loc["2021-03-31"])
    mcap = 1.05e6 * 10.0
    assert bm.loc["2021-05-31"] == pytest.approx(200 / mcap)
    assert roe.loc["2021-05-31"] == pytest.approx(240 / 200)       # NI TTM = 480 / 2
    ep = registry.get("ep_ttm")(panel, dates)["XYZ"]
    assert ep.loc["2021-05-31"] == pytest.approx(240 / mcap)
    ag = registry.get("asset_growth")(panel, dates)["XYZ"]
    assert ag.loc["2021-05-31"] == pytest.approx(1200 / 1000 - 1)
    acc = registry.get("accruals")(panel, dates)["XYZ"]
    assert acc.loc["2021-05-31"] == pytest.approx((240 - 480) / 1100)


def test_staleness_limit_15_months():
    days = pd.bdate_range("2020-01-01", "2022-12-30")
    close, volume = _market(days)
    f = _fields(_base_rows(), close, volume)
    # 最新 BE 期末 2021-03-31：2022-06-30（456 天内）仍可用，2022-07-29 起陈旧
    assert f["fund_be"].loc["2022-06-30", "XYZ"] == 200
    assert np.isnan(f["fund_be"].loc["2022-07-29", "XYZ"])


def test_split_adjusted_mcap_and_net_issuance():
    days = pd.bdate_range("2020-01-01", "2021-12-31")
    close, volume = _market(days)
    # 2021-06-15 一拆二：之后的不复权价减半
    close.loc["2021-06-15":] = 5.0
    splits = pd.DataFrame({"date": [pd.Timestamp("2021-06-15")], "code": ["XYZ"], "value": [2.0]})
    rows = _base_rows() + [("EntityCommonStockSharesOutstanding", "shares", None, "2021-07-20", 2.2e6, "2021-08-02")]
    f = _fields(rows, close, volume, splits)
    m = f["mcap_total"]["XYZ"]
    assert m.loc["2021-05-31"] == pytest.approx(1.05e6 * 10)
    assert m.loc["2021-06-30"] == pytest.approx(1.05e6 * 2 * 5)     # 封面股数在拆股前 → 乘拆股比例
    assert m.loc["2021-08-31"] == pytest.approx(2.2e6 * 5)
    assert f["mcap_float"]["XYZ"].loc["2021-08-31"] == m.loc["2021-08-31"]
    ni = f["fund_net_issuance"]["XYZ"]
    # 2021-08-31：2.2e6 对 12 个月前（2020-08-31 已知 1e6，拆股调整为 2e6）
    assert ni.loc["2021-08-31"] == pytest.approx(np.log(2.2e6 / 2e6))
    assert ni.loc["2021-05-31"] == pytest.approx(np.log(1.05))
    # 日换手 = 成交量 / 当日已知的拆股调整后股本
    assert f["turnover"]["XYZ"].loc["2021-06-30"] == pytest.approx(1e4 / 2.1e6)


def test_share_scale_typo_rejected_and_previous_value_kept():
    days = pd.bdate_range("2020-01-01", "2021-12-31")
    close, volume = _market(days)
    rows = _base_rows() + [("EntityCommonStockSharesOutstanding", "shares", None, "2021-07-20", 1.06e12, "2021-08-02")]
    f = _fields(rows, close, volume)
    assert f["mcap_total"]["XYZ"].loc["2021-08-31"] == pytest.approx(1.05e6 * 10)   # 沿用上一个通过的值
    # 20-F（ADR）不给股本
    rows20 = [r if not r[0].startswith("Entity") else (*r[:6], "20-F") for r in _base_rows()]
    f20 = _fields(rows20, close, volume)
    assert f20["mcap_total"]["XYZ"].isna().all()


def test_guard_events_respects_visible_end():
    days = pd.bdate_range("2020-01-01", "2022-06-30")
    close, volume = _market(days)
    end_ex = pd.Timestamp("2021-07-01")
    ev = fu.firm_events(_vint(_base_rows()))
    g = fu.guard_events(ev, end_ex, None)
    assert (g["t"] < end_ex).all() and (g["known_at"] < end_ex).all() and len(g) < len(ev)
    full = _fields(_base_rows(), close, volume)
    cut = _fields(_base_rows(), close, volume, end_ex=end_ex)
    for k in fu.FIELDS_MONTHLY:
        pd.testing.assert_frame_equal(full[k].loc[:"2021-06-30"], cut[k].loc[:"2021-06-30"], obj=k)
    # 可见上界之后不再有新知识进来：2021-08-02 的申报不会出现
    assert cut["fund_cfo_ttm"].loc["2021-09-30", "XYZ"] == pytest.approx(480)
    assert full["fund_cfo_ttm"].loc["2021-09-30", "XYZ"] == pytest.approx(500)
    hidden = (pd.Timestamp("2021-04-01"), pd.Timestamp("2021-07-01"))
    gh = fu.guard_events(ev, None, hidden)
    assert not ((gh["t"] >= hidden[0]) & (gh["t"] < hidden[1])).any()


# ------------------------------------------------------------------ 经数据层（load_market）
def test_load_market_us_provides_fundamentals_within_lockbox(tmp_path, monkeypatch):
    from factorlab.data import load_market
    from factorlab.guard import Lockbox, split_codes

    monkeypatch.setenv("FACTORLAB_DATA", str(tmp_path / "data"))
    days = pd.bdate_range("2021-01-01", "2024-03-29")
    codes = [f"C{i:02d}" for i in range(12)]
    rows = []
    for c in codes:
        rows.append(pd.DataFrame({"date": days, "code": c, "open": 10.0, "high": 10.0, "low": 10.0, "close": 10.0,
                                  "close_adj": 10.0, "volume": 1e4, "amount": 1e5}))
    store.write_prices("us", pd.concat(rows, ignore_index=True))
    store.write_securities("us", pd.DataFrame({"code": codes, "name": codes, "market": "us", "exchange": "NYSE",
                                               "status": "listed", "currency": "USD", "source": "t"}))
    (store.market_dir("us_sec") / "raw").mkdir(parents=True, exist_ok=True)
    tick = {str(i): {"cik_str": 1000 + i, "ticker": c, "title": c} for i, c in enumerate(codes)}
    (store.market_dir("us_sec") / "raw" / "company_tickers.json").write_text(json.dumps(tick))
    evs = []
    for i, c in enumerate(codes):
        r = [("StockholdersEquity", "USD", None, "2022-12-31", 100 + i, "2023-02-15", "10-K"),
             ("StockholdersEquity", "USD", None, "2023-09-30", 500 + i, "2023-10-31"),        # 锁箱起点前一天申报
             ("StockholdersEquity", "USD", None, "2023-12-31", 9e9, "2024-02-15", "10-K"),     # 锁箱里
             ("EntityCommonStockSharesOutstanding", "shares", None, "2023-01-31", 1e6, "2023-02-15", "10-K")]
        evs.append(fu.firm_events(sec.vintages(_obs(r, cik=1000 + i))))
    pd.concat(evs).to_parquet(fu.derived_dir() / "events.parquet", index=False)
    (fu.derived_dir() / "MANIFEST.json").write_text(json.dumps({"version": "t", "sha256": {}}))
    assert fu.available()

    md = load_market("us", ["close_adj", "close", "mcap_float", "fund_be"], mode="explore")
    lb_start = Lockbox().visible_end("us", "explore")
    assert md.visible_end == lb_start
    be = md.panel["fund_be"]
    assert be.index.max() < lb_start and md.panel["close_adj"].index.max() < lb_start
    assert set(be.columns) == set(split_codes(codes, "explore"))
    assert (be.loc["2023-09-29"].dropna() < 200).all()       # 10-31 申报，11-01 生效：锁箱前看不到
    assert np.isfinite(md.panel["mcap_float"].loc["2023-06-30"]).all()
    assert "+" in md.snapshot                                # 数据快照含基本面事件表
    assert np.nanmax(be.to_numpy()) < 1e6                     # 锁箱里的 9e9 没有泄露
