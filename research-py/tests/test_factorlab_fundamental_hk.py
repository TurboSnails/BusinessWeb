"""港股基本面（R7：fundamentals_hk + factors/fundamental_hk）：TTM 与半年单期还原与手算一致（含 3 月财年）、
半年 SUE、公告日当天不可用、扰动未来数据 / 截到当日重算无前视、隐含股本与拆合股调整（构造 1 拆 2、合股、分红不调）、
货币折算与换币种置空、银行 / 保险毛利为空、300 天陈旧、可见上界 / 锁箱截断、经数据层读取。全部合成数据。"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from factorlab import factors as _factors  # noqa: F401  注册内置因子
from factorlab import fundamentals_hk as fh
from factorlab import registry, store

YEARS = range(2012, 2023)
RNG = np.random.default_rng(7)
# 单半年归母净利润真值：(财年, 1 = 上半年 / 2 = 下半年)
HALF = {(y, h): float(np.round(100 + 4 * i + RNG.normal(0, 15), 2))
        for i, (y, h) in enumerate((y, h) for y in YEARS for h in (1, 2))}
SHARES = 2e8


def _fy_end(y: int, fy_month: int) -> pd.Timestamp:
    return pd.Timestamp(year=y, month=fy_month, day=1) + pd.offsets.MonthEnd(0)


def _avail_default(end: pd.Timestamp, rt: str) -> pd.Timestamp:
    return end + pd.Timedelta(days=80 if rt == "annual" else 55)


def _rows(code="00001", half=HALF, fy_month=12, currency="HKD", fx=1.0, template="general", avail=None,
          shares=SHARES, ccy_of=None, skip=(), quality="declared", extra_items=True):
    """单半年真值 → 年报 / 中报长表（hk_fin 同格式）。fy_month：财年结束月份；财年 y 的年报期末 = y 年 fy_month 月末。"""
    avail = avail or _avail_default
    rows = []
    for y in sorted({k[0] for k in half}):
        a_end = _fy_end(y, fy_month)
        i_end = a_end - pd.offsets.MonthEnd(6)
        start = (a_end - pd.offsets.MonthEnd(12)) + pd.Timedelta(days=1)
        for rt, end, pm, cum in (("interim", i_end, 6, half[(y, 1)]),
                                 ("annual", a_end, 12, half[(y, 1)] + half[(y, 2)])):
            if (y, rt) in skip:
                continue
            av = pd.Timestamp(avail(end, rt))
            ccy = ccy_of(end) if ccy_of else currency
            base = {"code": code, "report_period": end, "report_type": rt, "avail_date": av, "currency": ccy,
                    "fx_hkd": fx, "template": template, "date_quality": quality(end) if callable(quality) else quality}
            k = (end.year - 2012) * 2 + (rt == "annual")
            items = {"net_income_parent": (cum, pm, start), "eps_basic": (cum / shares, pm, start)}
            if extra_items:
                items.update({"gross_profit": (3 * cum, pm, start),
                              "total_assets": (5000.0 + 50 * k, None, None),
                              "total_equity_parent": (2000.0 + 20 * k, None, None)})
            for it, (v, m, s) in items.items():
                rows.append({**base, "item": it, "value": float(v), "period_months": m, "period_start": s})
    return rows


def _fin(*row_lists) -> pd.DataFrame:
    df = pd.DataFrame([r for rl in row_lists for r in rl])
    df["period_months"] = df["period_months"].astype("Int64")
    return df


def _core(fin, dates, codes=("00001",), end_ex=None, hidden=None):
    return fh.core_fields(fh.guard_fin(fin, end_ex, hidden), pd.DatetimeIndex(pd.to_datetime(list(dates))),
                          list(codes))


def _v(res, k, d, code="00001"):
    return res[k].loc[pd.Timestamp(d), code]


def _hand_sue(half, y, h, n=6, min_n=4):
    """(y, h) 为最新半年；同比差 X_{h−j} − X_{h−j−2}，j = 0…n−1。"""
    seq = [(yy, hh) for yy in YEARS for hh in (1, 2)]
    i = seq.index((y, h))
    d = []
    for j in range(n):
        if i - j - 2 >= 0:
            d.append(half[seq[i - j]] - half[seq[i - j - 2]])
    if len(d) < min_n:
        return np.nan
    return (half[seq[i]] - half[seq[i - 2]]) / np.std(d, ddof=1)


# ------------------------------------------------------------------ TTM、半年还原、SUE
@pytest.mark.parametrize("fy_month", [12, 3])
def test_ttm_and_half_year_sue_match_hand_calc(fy_month):
    fin = _fin(_rows(fy_month=fy_month))
    dates = pd.date_range("2014-01-31", "2023-03-31", freq="BME")
    r = _core(fin, dates)
    seen = 0
    for d in dates:
        # 手算：d 时已公告的最新报告
        known = []
        for (y, h) in HALF:
            a_end = _fy_end(y, fy_month)
            end = a_end if h == 2 else a_end - pd.offsets.MonthEnd(6)
            rt = "annual" if h == 2 else "interim"
            if _avail_default(end, rt) <= d:
                known.append((end, y, h))
        end, y, h = max(known)
        if (d - end).days > fh.STALE_DAYS:
            assert np.isnan(_v(r, "ni_ttm", d))
            continue
        # 年报 → 年报值（= 两个半年和）；中报 → 中报 + 上年年报 − 上年中报 = 本上半年 + 上年下半年
        ttm = HALF[(y, 1)] + HALF[(y, 2)] if h == 2 else HALF[(y, 1)] + HALF.get((y - 1, 2), np.nan)
        got = _v(r, "ni_ttm", d)
        if np.isnan(ttm):
            assert np.isnan(got)
        else:
            assert got == pytest.approx(ttm, rel=1e-12), d
            seen += 1
        assert _v(r, "sue", d) == pytest.approx(_hand_sue(HALF, y, h), rel=1e-10, nan_ok=True), d
    assert seen > 80


def test_second_half_is_annual_minus_interim_by_hand():
    half = {(2018, 1): 10.0, (2018, 2): 30.0, (2019, 1): 12.0, (2019, 2): 31.0, (2020, 1): 15.0, (2020, 2): 36.0,
            (2021, 1): 13.0, (2021, 2): 50.0}
    fin = _fin(_rows(half=half))
    d = pd.Timestamp("2022-04-29")       # 2021 年报（3/21 生效）
    r = _core(fin, [d])
    # 单半年：10 30 12 31 15 36 13 50；同比差（h = 2021H2 起往前）：50−36, 13−15, 36−31, 15−12, 31−30, 12−10
    diffs = [14.0, -2.0, 5.0, 3.0, 1.0, 2.0]
    assert _v(r, "sue", d) == pytest.approx(14.0 / np.std(diffs, ddof=1))
    assert _v(r, "ni_ttm", d) == pytest.approx(63.0)
    # 只剩 3 个同比差时为空（最少 4 个）：去掉 2018 年、2019 年报 → 同比差只有 14、−2、3
    r3 = _core(_fin(_rows(half={k: v for k, v in half.items() if k[0] >= 2019}, skip={(2019, "annual")})), [d])
    assert np.isnan(_v(r3, "sue", d))


def test_interim_ttm_missing_component_is_nan_no_fallback():
    fin = _fin(_rows(skip={(2019, "interim")}))
    r = _core(fin, ["2020-09-30", "2021-04-30"])
    assert np.isnan(_v(r, "ni_ttm", "2020-09-30"))        # 上年同期中报缺失 → 空，不退回 2019 年报
    assert np.isfinite(_v(r, "ni_ttm", "2021-04-30"))


def test_roe_gpa_asset_growth_by_hand():
    fin = _fin(_rows())
    d = pd.Timestamp("2020-09-30")                        # 最新 = 2020 中报（k = 16），12 个月前 = 2019 中报（k = 14）
    r = _core(fin, [d])
    ttm = HALF[(2020, 1)] + HALF[(2019, 2)]
    e0, e1 = 2000 + 20 * 16, 2000 + 20 * 14
    assert _v(r, "roe", d) == pytest.approx(ttm / ((e0 + e1) / 2))
    assert _v(r, "gpa", d) == pytest.approx(3 * ttm / (5000 + 50 * 16))
    assert _v(r, "asset_growth", d) == pytest.approx((5000 + 50 * 16) / (5000 + 50 * 14) - 1)
    assert _v(r, "be", d) == pytest.approx(e0)


def test_negative_equity_gives_nan_bp_and_roe():
    rows = _rows()
    for x in rows:
        if x["item"] == "total_equity_parent" and x["report_period"] == pd.Timestamp("2019-06-30"):
            x["value"] = -5.0
    r = _core(_fin(rows), ["2019-09-30", "2020-09-30", "2021-04-30"])
    assert np.isnan(_v(r, "be", "2019-09-30"))
    assert np.isnan(_v(r, "roe", "2020-09-30"))           # 12 个月前权益 ≤ 0
    assert np.isfinite(_v(r, "roe", "2021-04-30"))


# ------------------------------------------------------------------ 公告日、无前视
def test_announcement_day_not_usable_next_day_usable():
    ann = pd.Timestamp("2021-08-24")                      # 2021 中报公告日（周二，收盘后）
    avail = ann + pd.offsets.BDay(1)
    fin = _fin(_rows(avail=lambda e, rt: avail if e == pd.Timestamp("2021-06-30") else _avail_default(e, rt)))
    r = _core(fin, [ann, avail])
    assert _v(r, "ni_ttm", ann) == pytest.approx(HALF[(2020, 1)] + HALF[(2020, 2)])
    assert _v(r, "ni_ttm", avail) == pytest.approx(HALF[(2021, 1)] + HALF[(2020, 2)])
    assert _v(r, "sue", ann) == pytest.approx(_hand_sue(HALF, 2020, 2))
    assert _v(r, "sue", avail) == pytest.approx(_hand_sue(HALF, 2021, 1))


def test_perturbing_future_data_does_not_change_past_values():
    fin = _fin(_rows(), _rows(code="00002", fy_month=3))
    dates = pd.date_range("2015-01-30", "2022-12-30", freq="BME")
    codes = ("00001", "00002")
    base = _core(fin, dates, codes)
    d = pd.Timestamp("2019-05-31")
    alt = fin.copy()
    fut = alt["avail_date"] > d
    alt.loc[fut, "value"] = alt.loc[fut, "value"] * -7 + 1234
    late = alt.iloc[:1].copy()                            # d 之后才生效的「重述」：2018 年报改值
    late["report_period"], late["report_type"], late["period_months"] = pd.Timestamp("2018-12-31"), "annual", 12
    late["avail_date"], late["value"] = pd.Timestamp("2019-07-02"), -9e9
    alt = pd.concat([alt, late], ignore_index=True)
    pert = _core(alt, dates, codes)
    for k in fh._CORE + ("shares_end",):
        pd.testing.assert_frame_equal(base[k].loc[:d], pert[k].loc[:d], obj=k)
    assert not np.isclose(_v(base, "ni_ttm", "2019-09-30"), _v(pert, "ni_ttm", "2019-09-30"))


def test_truncate_to_each_date_gives_same_values():
    fin = _fin(_rows(), _rows(code="00002", fy_month=3, currency="CNY", fx=1.12))
    dates = pd.date_range("2015-06-30", "2022-12-30", freq="BME")
    codes = ("00001", "00002")
    full = _core(fin, dates, codes)
    for d in dates[::3]:
        cut = _core(fin[fin["avail_date"] <= d], [d], codes)
        for k in fh._CORE:
            for c in codes:
                a, b = full[k].loc[d, c], cut[k].loc[d, c]
                assert (np.isnan(a) and np.isnan(b)) or a == pytest.approx(b, rel=1e-12), (k, d, c)


def test_guard_end_ex_and_hidden():
    fin = _fin(_rows())
    dates = pd.date_range("2018-01-31", "2022-06-30", freq="BME")
    end_ex = pd.Timestamp("2020-06-01")
    full, cut = _core(fin, dates), _core(fin, dates, end_ex=end_ex)
    pd.testing.assert_frame_equal(full["ni_ttm"].loc[:"2020-05-29"], cut["ni_ttm"].loc[:"2020-05-29"])
    # 可见上界之后没有新财报：2020 中报不进来，停在 2019 年报，2019-12-31 + 300 天之后为空
    assert _v(cut, "ni_ttm", "2020-09-30") == pytest.approx(HALF[(2019, 1)] + HALF[(2019, 2)])
    assert np.isnan(_v(cut, "ni_ttm", "2020-10-30"))
    hid = _core(fin, dates, hidden=(pd.Timestamp("2020-03-01"), pd.Timestamp("2020-04-01")))
    # 2019 年报（2020-03-20 生效）落在被删区间 → 3 月末还是 2019 中报的 TTM
    assert _v(hid, "ni_ttm", "2020-03-31") == pytest.approx(HALF[(2019, 1)] + HALF[(2018, 2)])


def test_registered_factors_pass_engine_lookahead_check():
    codes = ["00001", "00002", "00003"]
    fin = _fin(_rows(), _rows(code="00002", fy_month=3), _rows(code="00003", currency="USD", fx=7.8))
    days = pd.bdate_range("2014-01-01", "2022-12-30")
    close = pd.DataFrame(10.0, index=days, columns=codes)
    dates = fh.month_rows(days)
    core = fh.core_fields(fin, dates, codes)
    f = fh.compute_fields(core, fh.FIELDS, close, close * 1.5)
    panel = {"close_adj": close * 1.5, "close": close, **f}
    for name, direction in (("hk_ep_ttm", 1), ("hk_bp", 1), ("hk_roe_ttm", 1), ("hk_gpa_ttm", 1),
                            ("hk_asset_growth", -1), ("hk_sue_h", 1)):
        spec = registry.get(name)
        assert spec.markets == ("hk",) and spec.direction == direction
        assert registry.check_no_lookahead(spec, panel, dates[24:], n_check=8), name
        assert spec(panel, dates).notna().sum().sum() > 30, name


# ------------------------------------------------------------------ 隐含股本、拆合股、货币
def _px(days, events):
    """events：{日期: (不复权价乘数, 复权因子乘数)}，从该日起生效。"""
    close = pd.Series(10.0, index=days)
    adj = pd.Series(1.0, index=days)
    for d, (pm, am) in events.items():
        close[days >= d] *= pm
        adj[days >= d] *= am
    return close.to_frame("00001"), (close * adj).to_frame("00001")


def test_implied_shares_and_split_adjustment():
    fin = _fin(_rows(shares=SHARES))
    days = pd.bdate_range("2019-01-01", "2021-12-31")
    split, div = pd.Timestamp("2020-11-16"), pd.Timestamp("2020-09-15")
    # 2020-09-15 派息（价格 −4%，复权因子 +4.2%，不调）；2020-11-16 一拆二（价格减半，复权因子 ×2）
    close, cadj = _px(days, {div: (0.96, 1 / 0.96), split: (0.5, 2.0)})
    dates = fh.month_rows(days)
    core = fh.core_fields(fin, dates, ["00001"])
    assert core["shares"].loc["2020-10-30", "00001"] == pytest.approx(SHARES)
    assert core["shares_end"].loc["2020-10-30", "00001"] == pd.Timestamp("2020-06-30")
    m = fh.compute_fields(core, ["hkf_mcap"], close, cadj)["hkf_mcap"]["00001"]
    assert m["2020-08-31"] == pytest.approx(SHARES * 10)
    assert m["2020-10-30"] == pytest.approx(SHARES * 9.6)        # 分红：股本不调
    assert m["2020-12-31"] == pytest.approx(SHARES * 2 * 4.8)    # 拆股后：股本 ×2，价格 4.8
    # 2020 年报（期末 12-31 在拆股之后）的每股收益按拆后股本给出：用新报告期时不再调整
    rows = _rows(shares=SHARES)
    for x in rows:
        if x["item"] == "eps_basic" and x["report_period"] >= pd.Timestamp("2020-12-31"):
            x["value"] = x["value"] / 2
    core2 = fh.core_fields(_fin(rows), dates, ["00001"])
    m2 = fh.compute_fields(core2, ["hkf_mcap"], close, cadj)["hkf_mcap"]["00001"]
    assert core2["shares"].loc["2021-04-30", "00001"] == pytest.approx(2 * SHARES)
    assert m2["2021-04-30"] == pytest.approx(2 * SHARES * 4.8)
    assert m2["2020-12-31"] == pytest.approx(SHARES * 2 * 4.8)   # 年报生效前仍用中报股本 × 拆股比例
    # 合股（10 合 1）：股本 ×0.1
    close3, cadj3 = _px(days, {split: (10.0, 0.1)})
    m3 = fh.compute_fields(core, ["hkf_mcap"], close3, cadj3)["hkf_mcap"]["00001"]
    assert m3["2020-12-31"] == pytest.approx(SHARES * 0.1 * 100)
    # 拆合股比例只用 d 及以前的价格：截到 d 重算一致
    for d in ("2020-10-30", "2020-12-31"):
        cut = fh.compute_fields(core.copy(), ["hkf_mcap"], close.loc[:d], cadj.loc[:d])["hkf_mcap"]["00001"]
        assert cut[d] == pytest.approx(m[d])


def test_implied_shares_requires_positive_ratio_and_same_currency():
    rows = _rows()
    for x in rows:
        if x["report_period"] == pd.Timestamp("2020-06-30") and x["item"] == "eps_basic":
            x["value"] = -x["value"]                      # 商为负 → 这一期不算，退回上一期（2019 年报）
    core = _core(_fin(rows), ["2020-09-30"])
    assert _v(core, "shares", "2020-09-30") == pytest.approx(SHARES)
    assert _v(core, "shares_end", "2020-09-30") == pd.Timestamp("2019-12-31")


def test_fx_conversion_and_ratios_unconverted():
    hkd = _fin(_rows(code="00001"))
    cny = _fin(_rows(code="00002", currency="CNY", fx=1.1))
    dates = pd.date_range("2016-01-29", "2022-06-30", freq="BME")
    r = _core(pd.concat([hkd, cny], ignore_index=True), dates, ("00001", "00002"))
    a, b = r["ni_ttm"]["00001"], r["ni_ttm"]["00002"]
    np.testing.assert_allclose(b.to_numpy(), 1.1 * a.to_numpy(), rtol=1e-12)
    np.testing.assert_allclose(r["be"]["00002"].to_numpy(), 1.1 * r["be"]["00001"].to_numpy(), rtol=1e-12)
    for k in ("roe", "gpa", "asset_growth", "sue", "shares"):
        np.testing.assert_allclose(r[k]["00002"].to_numpy(), r[k]["00001"].to_numpy(), rtol=1e-12)
    # E/P：港元利润 / 港元市值
    days = pd.bdate_range("2016-01-01", "2022-06-30")
    close = pd.DataFrame(10.0, index=days, columns=["00001", "00002"])
    f = fh.compute_fields(r, fh.FIELDS, close, close)
    ep = registry.get("hk_ep_ttm")({**f, "close": close, "close_adj": close}, fh.month_rows(days))
    d = pd.Timestamp("2020-09-30")
    assert ep.loc[d, "00002"] == pytest.approx(1.1 * (HALF[(2020, 1)] + HALF[(2019, 2)]) / (SHARES * 10))


def test_currency_switch_nans_cross_period_items():
    switch = pd.Timestamp("2020-06-30")                   # 2020 中报起改为人民币报告
    fin = _fin(_rows(ccy_of=lambda e: "CNY" if e >= switch else "HKD"))
    r = _core(fin, ["2020-09-30", "2021-04-30", "2021-09-30"])
    for k in ("ni_ttm", "roe", "asset_growth", "sue"):
        assert np.isnan(_v(r, k, "2020-09-30")), k          # 中报 CNY + 上年年报 / 中报 HKD
    assert np.isfinite(_v(r, "ni_ttm", "2021-04-30"))      # 2020 年报自身是 CNY：TTM = 年报
    assert np.isnan(_v(r, "sue", "2021-04-30"))           # 下半年 = 年报 CNY − 中报 CNY 可算，但同比差跨币种
    assert np.isnan(_v(r, "gpa", "2020-09-30"))            # 毛利 TTM 跨币种同样为空
    assert np.isfinite(_v(r, "be", "2020-09-30"))          # 单期时点科目不受影响


# ------------------------------------------------------------------ 模板、陈旧
def test_bank_and_insurance_gpa_nan():
    fin = _fin(_rows(code="00001"), _rows(code="00002", template="bank"), _rows(code="00003", template="insurance"))
    r = _core(fin, ["2020-09-30"], ("00001", "00002", "00003"))
    assert np.isfinite(_v(r, "gpa", "2020-09-30", "00001"))
    assert np.isnan(_v(r, "gpa", "2020-09-30", "00002")) and np.isnan(_v(r, "gpa", "2020-09-30", "00003"))
    for c in ("00002", "00003"):                           # 其余因子不区分模板
        assert np.isfinite(_v(r, "roe", "2020-09-30", c)) and np.isfinite(_v(r, "ni_ttm", "2020-09-30", c))


def test_staleness_300_days():
    half = {k: v for k, v in HALF.items() if k[0] <= 2020}
    fin = _fin(_rows(half=half))                          # 最后一期 = 2020 年报（期末 2020-12-31）
    ok, stale = pd.Timestamp("2020-12-31") + pd.Timedelta(days=300), pd.Timestamp("2020-12-31") + pd.Timedelta(days=301)
    r = _core(fin, [ok, stale])
    for k in ("ni_ttm", "be", "roe", "gpa", "asset_growth", "sue", "shares"):
        assert np.isfinite(_v(r, k, ok)), k
        assert np.isnan(_v(r, k, stale)), k


def test_quarterly_and_odd_period_rows_ignored():
    rows = _rows()
    extra = [{**rows[0], "report_period": pd.Timestamp("2020-09-30"), "report_type": "q3", "period_months": 9,
              "item": "net_income_parent", "value": 1e9, "avail_date": pd.Timestamp("2020-11-10")},
             {**rows[0], "report_period": pd.Timestamp("2020-12-31"), "report_type": "annual", "period_months": 6,
              "item": "net_income_parent", "value": 1e9, "avail_date": pd.Timestamp("2020-11-11")}]
    base = _core(_fin(rows), ["2020-11-30"])
    alt = _core(_fin(rows, extra), ["2020-11-30"])
    for k in fh._CORE:
        a, b = _v(base, k, "2020-11-30"), _v(alt, k, "2020-11-30")
        assert (np.isnan(a) and np.isnan(b)) or a == b, k


# ------------------------------------------------------------------ 数据层
def test_load_market_hk_within_lockbox_and_price_fields_unchanged(tmp_path, monkeypatch):
    from factorlab.data import has_field, load_market
    from factorlab.guard import Lockbox, split_codes

    monkeypatch.setenv("FACTORLAB_DATA", str(tmp_path / "data"))
    days = pd.bdate_range("2019-01-02", "2024-03-29")
    codes = [f"{i:05d}" for i in range(1, 13)]
    px = [pd.DataFrame({"date": days, "code": c, "open": 10.0, "high": 10.0, "low": 10.0, "close": 10.0,
                        "close_adj": 10.0, "volume": 1e4, "amount": 1e5, "mcap_float": np.nan}) for c in codes]
    store.write_prices("hk", pd.concat(px, ignore_index=True))
    store.write_securities("hk", pd.DataFrame({"code": codes, "name": codes, "market": "hk", "exchange": "HKEX",
                                               "status": "listed", "currency": "HKD", "source": "t"}))
    md0 = load_market("hk", ["close_adj", "close"], mode="explore")
    half = {(y, h): 100.0 + 3 * y + 7 * h for y in range(2015, 2024) for h in (1, 2)}
    rows = []
    for i, c in enumerate(codes):
        hv = dict(half)
        hv[(2023, 1)] = 5e9                               # 2023 中报：锁箱起点当天才生效
        q = (lambda e: "repaired_deadline" if e < pd.Timestamp("2019-01-01") else "declared")
        rows += _rows(code=c, half={k: v + i for k, v in hv.items()},
                      avail=lambda e, rt: (pd.Timestamp("2023-11-01") if e == pd.Timestamp("2023-06-30")
                                           else _avail_default(e, rt)), quality=q)
    _fin(rows).to_parquet(store.market_dir("hk") / "fin_pit.parquet", index=False)
    (store.market_dir("hk") / "fin_pit.meta.json").write_text(json.dumps({"sha256": "test"}))
    assert has_field("hk", "hkf_sue") and has_field("hk", "hkf_mcap")

    md = load_market("hk", ["close_adj", "close", "hkf_ni_ttm", "hkf_mcap", "hkf_sue"], mode="explore")
    lb = Lockbox().visible_end("hk", "explore")
    ni = md.panel["hkf_ni_ttm"]
    assert ni.index.max() < lb and set(ni.columns) == set(split_codes(codes, "explore"))
    assert np.isfinite(ni.loc["2023-09-29"]).all()
    assert np.nanmax(np.abs(ni.to_numpy())) < 1e6                     # 锁箱起点生效的 5e9 没有泄露
    assert np.isfinite(md.panel["hkf_mcap"].loc["2023-09-29"]).all()
    # 价格字段与快照哈希不受影响（不请求 hkf_* 时不调用提供方）
    md1 = load_market("hk", ["close_adj", "close"], mode="explore")
    pd.testing.assert_frame_equal(md0.panel["close"], md1.panel["close"])
    assert md0.snapshot == md1.snapshot and md.snapshot != md1.snapshot
    # 稳健性选项：剔除修复公告日的行（2019 年前的报告期）后，2019 中报的 TTM（要用 2018 年报、2018 中报）变为空；
    # 2020 中报起只用 2019 年以后的报告期，与不剔除时相同
    from factorlab.data import window
    end_ex, hidden = window("hk", "explore")
    pnl = {k: md.panel[k] for k in ("close", "close_adj")}
    ex = fh.panel_fields(["hkf_ni_ttm"], pnl, end_ex, hidden, exclude_quality=fh.REPAIRED)["hkf_ni_ttm"]
    al = fh.panel_fields(["hkf_ni_ttm"], pnl, end_ex, hidden)["hkf_ni_ttm"]
    assert np.isfinite(al.loc["2019-09-30"]).all() and np.isnan(ex.loc["2019-09-30"]).all()
    pd.testing.assert_frame_equal(al.loc["2020-09-30":], ex.loc["2020-09-30":])
