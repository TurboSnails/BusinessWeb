"""A 股点时基本面（fundamentals_cn + factors/fundamental_cn）：TTM 与单季同比数值、无前视（晚生效的财报与重述
只在生效后起作用）、负权益、金融业毛利、陈旧度、市值后备、可见上界截断、经数据层读取。全部合成数据，不读仓库数据。"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from factorlab import fundamentals_cn as fc
from factorlab import factors as _factors  # noqa: F401  注册内置因子
from factorlab import registry, store

CODE = "600001"


def _fin(rows, code=CODE) -> pd.DataFrame:
    """rows: (report_period, item, value, avail_date) → fin_pit 同格式（只含用到的列）。"""
    return pd.DataFrame([{"code": code, "report_period": pd.Timestamp(r), "item": i, "value": float(v),
                          "avail_date": pd.Timestamp(a)} for r, i, v, a in rows])


# 年初累计：2020 单季 100/110/120/130（年报 460），2021 单季 120/130
NI = [("2020-03-31", 100, "2020-04-28"), ("2020-06-30", 210, "2020-08-25"), ("2020-09-30", 330, "2020-10-28"),
      ("2020-12-31", 460, "2021-04-20"), ("2021-03-31", 120, "2021-04-27"), ("2021-06-30", 250, "2021-08-24")]


def _base_rows():
    rows = []
    for rp, v, a in NI:
        rows += [(rp, "net_income_parent", v, a), (rp, "net_income_parent_deducted", v * 0.9, a),
                 (rp, "revenue", v * 10, a), (rp, "cfo", v * 2, a), (rp, "gross_profit", v * 3, a)]
    eq = {"2020-03-31": 1000, "2020-06-30": 1050, "2020-09-30": 1100, "2020-12-31": 1150, "2021-03-31": 1200,
          "2021-06-30": 1300}
    ta = {k: v * 4 for k, v in eq.items()}
    av = {rp: a for rp, _, a in NI}
    for rp in eq:
        rows += [(rp, "total_equity_parent", eq[rp], av[rp]), (rp, "total_assets", ta[rp], av[rp]),
                 (rp, "share_capital", 100, av[rp])]
    return rows


DATES = pd.DatetimeIndex(pd.date_range("2020-01-31", "2022-12-31", freq="BME"))


def _core(rows, dates=DATES, end_ex=None, hidden=None):
    return fc.core_fields(fc.guard_fin(_fin(rows), end_ex, hidden), dates, [CODE])


def _v(core, k, d):
    return core[k].loc[pd.Timestamp(d), CODE]


# ------------------------------------------------------------------ 数值
def test_ttm_formula_and_annual():
    c = _core(_base_rows())
    assert np.isnan(_v(c, "ni_ttm", "2020-07-31"))                       # 只有 2020 年 Q1/H1、没有上年 → 无年报可退
    assert _v(c, "ni_ttm", "2021-04-30") == pytest.approx(480)          # 4/27 生效的一季报：120 + 460 − 100
    assert _v(c, "ni_ttm", "2021-08-31") == pytest.approx(250 + 460 - 210)
    assert _v(c, "cfo_ttm", "2021-08-31") == pytest.approx(2 * 500)
    assert _v(c, "rev_ttm", "2021-08-31") == pytest.approx(10 * 500)
    # 年报当月：4/20 公告年报、4/27 一季报 → 4 月末用一季报；看 4/21–4/26 之间的日子
    c2 = _core(_base_rows(), dates=pd.DatetimeIndex(["2021-04-23"]))
    assert _v(c2, "ni_ttm", "2021-04-23") == pytest.approx(460)


def test_roe_accruals_asset_growth_gpa_growth():
    c = _core(_base_rows())
    d = "2021-08-31"                                                     # 最新期 2021-06-30
    assert _v(c, "roe", d) == pytest.approx(500 / ((1300 + 1050) / 2))
    assert _v(c, "accruals", d) == pytest.approx((500 - 1000) / ((1300 * 4 + 1050 * 4) / 2))
    assert _v(c, "asset_growth", d) == pytest.approx(1300 / 1050 - 1)
    assert _v(c, "gpa", d) == pytest.approx(1500 / (1300 * 4))
    # 单季扣非：2021Q2 = (250 − 120)·0.9，2020Q2 = (210 − 100)·0.9
    assert _v(c, "nided_yoy", d) == pytest.approx((130 - 110) / 110)
    # 一季度：单季 = 累计
    assert _v(c, "nided_yoy", "2021-05-31") == pytest.approx((120 - 100) / 100)
    assert _v(c, "be", d) == 1300


def test_negative_growth_denominator_uses_abs():
    rows = _base_rows() + [("2019-06-30", "net_income_parent_deducted", -50, "2019-08-20"),
                           ("2019-03-31", "net_income_parent_deducted", -10, "2019-04-20")]
    rows = [r for r in rows if not (r[1] == "net_income_parent_deducted" and r[0] == "2020-06-30")]
    rows.append(("2020-06-30", "net_income_parent_deducted", 30, "2020-08-25"))
    c = _core(rows)
    # 2020-08-31：本季 30 − 90 = −60；上年同季 −50 − (−10) = −40 → (−60 + 40) / 40
    assert _v(c, "nided_yoy", "2020-08-31") == pytest.approx((-60 - (-40)) / 40)


# ------------------------------------------------------------------ 无前视 / 重述
def test_later_filings_and_restatements_do_not_change_past_values():
    base = _core(_base_rows())
    d = pd.Timestamp("2021-08-31")
    later = _base_rows() + [
        ("2020-12-31", "net_income_parent", 999, "2021-09-15"),          # 2020 年报的重述，9/15 才生效
        ("2021-06-30", "total_equity_parent", 5000, "2021-09-01"),       # 晚于 d 生效的版本
        ("2021-09-30", "net_income_parent", 400, "2021-10-28"),
    ]
    alt = _core(later)
    for k in fc._CORE:
        pd.testing.assert_frame_equal(base[k].loc[:d], alt[k].loc[:d], obj=k)
    # 之后确实用上了新版本：9 月末 TTM = 250 + 999 − 210，BE = 5000
    assert _v(alt, "ni_ttm", "2021-09-30") == pytest.approx(250 + 999 - 210)
    assert _v(alt, "be", "2021-09-30") == 5000
    assert _v(base, "be", "2021-09-30") == 1300


def test_restated_version_only_after_its_avail_date():
    rows = _base_rows() + [("2020-03-31", "net_income_parent", 80, "2021-04-27")]   # 一年后随一季报重述
    c = _core(rows)
    # 2021-04-27 起，2020Q1 已是重述值 80：TTM = 120 + 460 − 80
    assert _v(c, "ni_ttm", "2021-04-30") == pytest.approx(500)
    c2 = _core(rows, dates=pd.DatetimeIndex(["2021-04-26"]))
    assert _v(c2, "ni_ttm", "2021-04-26") == pytest.approx(460)       # 重述前：年报值


def test_registered_factors_pass_engine_lookahead_check():
    days = pd.bdate_range("2020-01-01", "2022-06-30")
    close = pd.DataFrame(10.0, index=days, columns=[CODE])
    dates = fc.month_rows(days)
    core = fc.core_fields(_fin(_base_rows()), dates, [CODE])
    f = fc.compute_fields(core, fc.PROVIDES, close, close, None, None)
    panel = {"close_adj": close, "close": close, **f}
    names = [n for n, s in registry.FACTORS.items()
             if s.markets == ("cn",) and s.func.__module__.endswith(".fundamental_cn")]   # R2 的 10 个（R3 组合另测）
    assert len(names) == 10
    for name in names:
        assert registry.check_no_lookahead(registry.get(name), panel, dates[6:], n_check=6), name


# ------------------------------------------------------------------ 负权益、金融业、陈旧度
def test_negative_equity_gives_nan_bp_and_roe():
    rows = [r for r in _base_rows() if not (r[1] == "total_equity_parent" and r[0] == "2021-06-30")]
    rows.append(("2021-06-30", "total_equity_parent", -20, "2021-08-24"))
    days = pd.bdate_range("2020-01-01", "2021-12-31")
    close = pd.DataFrame(10.0, index=days, columns=[CODE])
    dates = fc.month_rows(days)
    f = fc.compute_fields(fc.core_fields(_fin(rows), dates, [CODE]), fc.PROVIDES, close, close, None, None)
    panel = {"close_adj": close, **f}
    bp = registry.get("cn_bp")(panel, dates)[CODE]
    roe = registry.get("cn_roe_ttm")(panel, dates)[CODE]
    assert np.isnan(bp.loc["2021-08-31"]) and np.isnan(roe.loc["2021-08-31"])
    assert bp.loc["2021-07-30"] == pytest.approx(1200 / (100 * 10))
    assert roe.loc["2021-07-30"] == pytest.approx(480 / ((1200 + 1000) / 2))


def test_financial_industry_gpa_nan():
    days = pd.bdate_range("2020-01-01", "2021-12-31")
    codes = [CODE, "601999"]
    close = pd.DataFrame(10.0, index=days, columns=codes)
    fin = pd.concat([_fin(_base_rows()), _fin(_base_rows(), code="601999")])
    dates = fc.month_rows(days)
    ind = pd.DataFrame({CODE: "食品饮料", "601999": "非银金融"}, index=days)
    ind.loc[:"2021-06-30", "601999"] = "金融服务"                     # 旧版申万也算金融业
    f = fc.compute_fields(fc.core_fields(fin, dates, codes), fc.PROVIDES, close, close, None, ind)
    g = registry.get("cn_gpa_ttm")({"fin_gpa": f["fin_gpa"]}, dates)
    assert g.loc["2021-08-31", CODE] == pytest.approx(1500 / 5200)
    assert g["601999"].isna().all()


def test_staleness_limit_15_months():
    c = _core(_base_rows())
    # 最新 BE 期末 2021-06-30：+456 天 = 2022-09-29；9/30 起陈旧
    d_ok = pd.DatetimeIndex(["2022-09-29", "2022-09-30"])
    c2 = _core(_base_rows(), dates=d_ok)
    assert _v(c2, "be", "2022-09-29") == 1300 and np.isnan(_v(c2, "be", "2022-09-30"))
    assert np.isnan(_v(c, "ni_ttm", "2022-10-31")) and np.isnan(_v(c, "nided_yoy", "2022-10-31"))
    assert np.isfinite(_v(c, "ni_ttm", "2022-08-31"))


# ------------------------------------------------------------------ 市值
def test_mcap_total_first_then_share_capital_fallback():
    days = pd.bdate_range("2020-01-01", "2021-12-31")
    codes = [CODE, "000002"]
    close = pd.DataFrame(10.0, index=days, columns=codes)
    adj = close.copy()
    close.loc["2021-07-15":, "000002"] = 5.0                           # 10 转 10：不复权价减半，复权价不变
    fin = pd.concat([_fin(_base_rows()), _fin(_base_rows(), code="000002")])
    dates = fc.month_rows(days)
    core = fc.core_fields(fin, dates, codes)
    mt = pd.DataFrame(np.nan, index=days, columns=codes)
    mt[CODE] = 12345.0
    m = fc.compute_fields(core, ["fin_mcap"], close, adj, mt, None)["fin_mcap"]
    assert (m[CODE].dropna() == 12345.0).all()
    # 000002 没有 mcap_total：实收资本 100（期末 2021-03-31，4/27 生效）× 收盘 × 复权因子比
    assert m.loc["2021-05-31", "000002"] == pytest.approx(100 * 10)
    assert m.loc["2021-07-30", "000002"] == pytest.approx(100 * 5 * 2)  # 送转后股本折算为 200
    assert m.loc["2021-08-31", "000002"] == pytest.approx(100 * 5 * 2)  # 2021-06-30 期末的实收资本仍是 100（送转在期后）


# ------------------------------------------------------------------ 护栏
def test_guard_fin_respects_visible_end_and_hidden():
    end_ex = pd.Timestamp("2021-06-01")
    full = _core(_base_rows())
    cut = _core(_base_rows(), end_ex=end_ex)
    for k in fc._CORE:
        pd.testing.assert_frame_equal(full[k].loc[:"2021-05-31"], cut[k].loc[:"2021-05-31"], obj=k)
    assert _v(cut, "ni_ttm", "2021-09-30") == pytest.approx(480)        # 8/24 的半年报不可见
    assert _v(full, "ni_ttm", "2021-09-30") == pytest.approx(500)
    g = fc.guard_fin(_fin(_base_rows()), None, (pd.Timestamp("2021-04-01"), pd.Timestamp("2021-05-01")))
    assert not g["avail_date"].between("2021-04-01", "2021-04-30").any()


def test_load_market_cn_provides_fundamentals_within_lockbox(tmp_path, monkeypatch):
    from factorlab.data import load_market
    from factorlab.guard import Lockbox, split_codes

    monkeypatch.setenv("FACTORLAB_DATA", str(tmp_path / "data"))
    days = pd.bdate_range("2022-01-03", "2024-03-29")
    codes = [f"{600100 + i:06d}" for i in range(12)]
    px = []
    for c in codes:
        px.append(pd.DataFrame({"date": days, "code": c, "open": 10.0, "high": 10.0, "low": 10.0, "close": 10.0,
                                "close_adj": 10.0, "volume": 1e4, "amount": 1e5, "mcap_total": 1e9}))
    store.write_prices("cn", pd.concat(px, ignore_index=True))
    store.write_securities("cn", pd.DataFrame({"code": codes, "name": codes, "market": "cn", "exchange": "SSE",
                                               "status": "listed", "currency": "CNY", "source": "t"}))
    rows = []
    for i, c in enumerate(codes):
        rows.append(_fin([("2022-12-31", "total_equity_parent", 100 + i, "2023-04-20"),
                          ("2023-09-30", "total_equity_parent", 500 + i, "2023-11-01"),   # 锁箱起点当天生效
                          ("2023-12-31", "total_equity_parent", 9e9, "2024-03-20")], code=c))
    pd.concat(rows).to_parquet(store.market_dir("cn") / "fin_pit.parquet", index=False)
    (store.market_dir("cn") / "fin_pit.meta.json").write_text(json.dumps({"sha256": "test"}))
    assert fc.available()

    md = load_market("cn", ["close_adj", "close", "mcap_float", "fin_be", "fin_mcap"], mode="explore")
    lb_start = Lockbox().visible_end("cn", "explore")
    assert md.visible_end == lb_start
    be = md.panel["fin_be"]
    assert be.index.max() < lb_start and md.panel["close_adj"].index.max() < lb_start
    assert set(be.columns) == set(split_codes(codes, "explore"))
    assert (be.loc["2023-10-31"].dropna() < 200).all()
    assert np.nanmax(be.to_numpy()) < 1e6                               # 锁箱里的 9e9 没有泄露
    assert (md.panel["fin_mcap"].loc["2023-06-30"] == 1e9).all()
    assert "+" in md.snapshot and "mcap_total" not in md.panel           # 辅助字段用完即删
