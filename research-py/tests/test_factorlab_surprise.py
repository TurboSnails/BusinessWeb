"""盈余惊喜（R5：fundamentals_cn.surprise_fields / fundamentals_us.firm_surprise + factors/surprise）：
单季还原（含第四季 = 年报 − 三季报累计）与手算一致、σ 的最少样本与 σ = 0、200 天陈旧、公告日当天不可用次日起可用、
扰动未来数据 / 截到当日重算无前视、可见上界截断、经数据层读取。全部合成数据，不读仓库数据。"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from factorlab import factors as _factors  # noqa: F401  注册内置因子
from factorlab import fundamentals_cn as fc
from factorlab import fundamentals_us as fu
from factorlab import registry, store
from factorlab.sources import sec

CODE = "600001"
QS = pd.period_range("2017Q1", "2021Q4", freq="Q")
RNG = np.random.default_rng(5)
XS = dict(zip(QS, np.round(100 + np.cumsum(RNG.normal(5, 20, len(QS))), 2)))     # 单季归母净利润（真值）
REV = {p: v * 10 + 7 * i for i, (p, v) in enumerate(XS.items())}                 # 单季营业收入（真值）


def _qend(p: pd.Period) -> pd.Timestamp:
    return p.end_time.normalize()


def _avail(p: pd.Period) -> pd.Timestamp:
    return _qend(p) + pd.Timedelta(100 if p.quarter == 4 else 25, unit="D")


def _cn_rows(single=XS, item="net_income_parent", avail=_avail, drop=()):
    """单季真值 → 年初累计长表（fin_pit 同格式）。"""
    rows, cum = [], 0.0
    for p, v in single.items():
        cum = v if p.quarter == 1 else cum + v
        if p in drop:
            continue
        rows.append({"code": CODE, "report_period": _qend(p), "item": item, "value": float(cum),
                     "avail_date": pd.Timestamp(avail(p))})
    return rows


def _fin(*row_lists) -> pd.DataFrame:
    return pd.DataFrame([r for rl in row_lists for r in rl])


def _hand_sue(single: dict, q: pd.Period, n=8, min_n=4) -> float:
    d = []
    for j in range(n):
        a, b = single.get(q - j), single.get(q - j - 4)
        if a is not None and b is not None:
            d.append(a - b)
    if len(d) < min_n or (q not in single) or (q - 4 not in single):
        return np.nan
    return (single[q] - single[q - 4]) / np.std(d, ddof=1)


def _cn(fin, dates, end_ex=None, hidden=None):
    return fc.surprise_fields(fc.guard_fin(fin, end_ex, hidden), pd.DatetimeIndex(dates), [CODE])


def _cv(res, k, d):
    return res[k].loc[pd.Timestamp(d), CODE]


# ------------------------------------------------------------------ A 股：数值
def test_cn_single_quarter_reconstruction_and_sue_match_hand_calc():
    fin = _fin(_cn_rows(), _cn_rows(REV, "revenue"))
    dates = pd.date_range("2018-01-31", "2022-03-31", freq="BME")
    r = _cn(fin, dates)
    n_checked = 0
    for d in dates:
        vis = [p for p in QS if _avail(p) <= d]
        if not vis:
            continue
        q = max(vis)
        exp = _hand_sue(XS, q) if (d - _qend(q)).days <= 200 else np.nan
        got = _cv(r, "fin_ni_sue", d)
        if np.isnan(exp):
            assert np.isnan(got), d
        else:
            assert got == pytest.approx(exp, rel=1e-9), d
            assert _cv(r, "fin_rev_sur", d) == pytest.approx(_hand_sue(REV, q), rel=1e-9), d
            n_checked += 1
    assert n_checked > 20


def test_cn_q4_is_annual_minus_9m_by_hand():
    # 只给 4 年，单季 2018–2021：Q1..Q4 = 10/20/30/40 + 年份差；手算 2021 年报季（第四季）
    single = {}
    for y, add in zip(range(2018, 2022), (0, 5, 12, 30)):
        for k, base in zip(range(1, 5), (10, 20, 30, 40)):
            single[pd.Period(f"{y}Q{k}", "Q")] = base + add + (k == 4) * (y - 2018) * 3
    fin = _fin(_cn_rows(single))
    d = pd.Timestamp("2022-04-29")                                     # 2021 年报 2022-04-10 生效，一季报未出
    r = _cn(fin, [d])
    # 2021：累计 9M = 42+52+62 = 156，年报 = 156 + (40+30+9) = 235 → 第四季 = 235 − 156 = 79；2020 第四季 = 40+12+6 = 58
    fy21 = sum(single[pd.Period(f"2021Q{k}", "Q")] for k in range(1, 5))
    m9_21 = sum(single[pd.Period(f"2021Q{k}", "Q")] for k in range(1, 4))
    assert fy21 - m9_21 == 79 and single[pd.Period("2020Q4", "Q")] == 58
    diffs = [79 - 58]                                                  # j = 0：2021Q4 − 2020Q4
    for p in [pd.Period("2021Q3", "Q"), pd.Period("2021Q2", "Q"), pd.Period("2021Q1", "Q"),
              pd.Period("2020Q4", "Q"), pd.Period("2020Q3", "Q"), pd.Period("2020Q2", "Q"),
              pd.Period("2020Q1", "Q")]:
        diffs.append(single[p] - single[p - 4])
    assert _cv(r, "fin_ni_sue", d) == pytest.approx(21 / np.std(diffs, ddof=1))


def test_cn_restated_prior_year_used_only_after_its_avail_date():
    rows = _cn_rows()
    # 2020Q1 累计值在 2021 一季报（2021-04-25 生效）里被重述
    p = pd.Period("2020Q1", "Q")
    rows.append({"code": CODE, "report_period": _qend(p), "item": "net_income_parent", "value": XS[p] - 50,
                 "avail_date": pd.Timestamp("2021-04-25")})
    r = _cn(_fin(rows), ["2021-04-23", "2021-04-30"])
    alt = dict(XS)
    alt[p] = XS[p] - 50
    alt[pd.Period("2020Q2", "Q")] = XS[pd.Period("2020Q2", "Q")] + 50          # 半年累计不变 → 第二季多 50
    assert _cv(r, "fin_ni_sue", "2021-04-23") == pytest.approx(_hand_sue(XS, pd.Period("2020Q4", "Q")))
    assert _cv(r, "fin_ni_sue", "2021-04-30") == pytest.approx(_hand_sue(alt, pd.Period("2021Q1", "Q")))


# ------------------------------------------------------------------ A 股：样本、σ、陈旧、可用日
def test_cn_sigma_min_sample_rule():
    # 只保留 2019Q1 起的季度：q = 2020Q4 时同比差只有 2020Q1–Q4 四个；去掉 2020Q1 的累计后只剩 3 个（Q1、Q2 单季都没了）
    keep = {p: v for p, v in XS.items() if p >= pd.Period("2019Q1", "Q")}
    d = pd.Timestamp("2021-04-15")                                    # 2020 年报 2021-04-10 生效
    r4 = _cn(_fin(_cn_rows(keep)), [d])
    assert _cv(r4, "fin_ni_sue", d) == pytest.approx(_hand_sue(keep, pd.Period("2020Q4", "Q")))
    r3 = _cn(_fin(_cn_rows(keep, drop=(pd.Period("2020Q1", "Q"),))), [d])
    assert np.isnan(_cv(r3, "fin_ni_sue", d))


def test_cn_sigma_zero_is_nan():
    single = {p: 100.0 + 10 * (p.year - 2017) for p in QS}           # 每个同比差都 = 10
    r = _cn(_fin(_cn_rows(single)), ["2021-08-31"])
    assert np.isnan(_cv(r, "fin_ni_sue", "2021-08-31"))
    single[pd.Period("2021Q2", "Q")] += 1                              # 打破后有值
    r = _cn(_fin(_cn_rows(single)), ["2021-08-31"])
    assert np.isfinite(_cv(r, "fin_ni_sue", "2021-08-31"))


def test_cn_staleness_200_days():
    fin = _fin(_cn_rows())
    # 2021 年报 2022-04-10 生效（期末 2021-12-31）；之后没有新财报：+200 天 = 2022-07-19
    r = _cn(fin, ["2022-07-19", "2022-07-20"])
    assert np.isfinite(_cv(r, "fin_ni_sue", "2022-07-19"))
    assert np.isnan(_cv(r, "fin_ni_sue", "2022-07-20"))
    # 2021 三季报（期末 9-30）之后年报迟迟不出：4 月末（期末 + 211 天）为空
    late = _fin(_cn_rows(avail=lambda p: _avail(p) if p != pd.Period("2021Q4", "Q") else pd.Timestamp("2022-05-05")))
    r = _cn(late, ["2022-04-18", "2022-04-29"])
    assert np.isfinite(_cv(r, "fin_ni_sue", "2022-04-18")) and np.isnan(_cv(r, "fin_ni_sue", "2022-04-29"))


def test_cn_announcement_day_not_usable_next_day_usable():
    """avail_date = 公告日后第一个交易日：公告当天（avail 前一天）看不到，avail 当天起看得到。"""
    ann = pd.Timestamp("2021-04-27")                                   # 2021 一季报公告日（周二）
    avail = ann + pd.offsets.BDay(1)
    rows = _cn_rows(avail=lambda p: avail if p == pd.Period("2021Q1", "Q") else _avail(p))
    r = _cn(_fin(rows), [ann, avail])
    assert _cv(r, "fin_ni_sue", ann) == pytest.approx(_hand_sue(XS, pd.Period("2020Q4", "Q")))
    assert _cv(r, "fin_ni_sue", avail) == pytest.approx(_hand_sue(XS, pd.Period("2021Q1", "Q")))


# ------------------------------------------------------------------ A 股：无前视与护栏
def test_cn_perturbing_future_data_does_not_change_past_values():
    dates = pd.date_range("2018-01-31", "2022-06-30", freq="BME")
    base = _cn(_fin(_cn_rows(), _cn_rows(REV, "revenue")), dates)
    d = pd.Timestamp("2021-05-31")
    fut = {p: (v * 3 + 999 if _avail(p) > d else v) for p, v in XS.items()}
    later = _cn_rows(fut) + [
        {"code": CODE, "report_period": _qend(pd.Period("2020Q4", "Q")), "item": "net_income_parent",
         "value": -1e6, "avail_date": pd.Timestamp("2021-06-15")},                 # d 之后才生效的重述
    ]
    alt = _cn(_fin(later, _cn_rows(REV, "revenue")), dates)
    for k in fc.SURPRISE_FIELDS:
        pd.testing.assert_frame_equal(base[k].loc[:d], alt[k].loc[:d], obj=k)
    assert not np.isclose(_cv(base, "fin_ni_sue", "2021-06-30"), _cv(alt, "fin_ni_sue", "2021-06-30"))


def test_cn_truncate_to_each_date_gives_same_values():
    fin = _fin(_cn_rows(), _cn_rows(REV, "revenue"))
    dates = pd.date_range("2019-06-28", "2022-03-31", freq="BME")
    full = _cn(fin, dates)
    for d in dates[::5]:
        cut = _cn(fin[fin["avail_date"] <= d], [d])
        for k in fc.SURPRISE_FIELDS:
            a, b = full[k].loc[d, CODE], cut[k].loc[d, CODE]
            assert (np.isnan(a) and np.isnan(b)) or a == pytest.approx(b, rel=1e-12), (k, d)


def test_cn_guard_end_ex_and_hidden():
    fin = _fin(_cn_rows())
    dates = pd.date_range("2019-01-31", "2022-06-30", freq="BME")
    end_ex = pd.Timestamp("2021-06-01")
    full, cut = _cn(fin, dates), _cn(fin, dates, end_ex=end_ex)
    pd.testing.assert_frame_equal(full["fin_ni_sue"].loc[:"2021-05-31"], cut["fin_ni_sue"].loc[:"2021-05-31"])
    # 可见上界之后没有新知识：2021 半年报不进来，q 停在 2021Q1（陈旧后为空）
    assert _cv(cut, "fin_ni_sue", "2021-08-31") == pytest.approx(_hand_sue(XS, pd.Period("2021Q1", "Q")))
    assert np.isnan(_cv(cut, "fin_ni_sue", "2021-10-29"))
    # 被删区间里生效的 2020 年报（4/10）、2021 一季报（4/25）看不到：4 月末 q 停在 2020Q3（211 天，陈旧为空）
    hid = _cn(fin, dates, hidden=(pd.Timestamp("2021-04-01"), pd.Timestamp("2021-05-01")))
    assert _cv(hid, "fin_ni_sue", "2021-03-31") == _cv(full, "fin_ni_sue", "2021-03-31")
    assert np.isnan(_cv(hid, "fin_ni_sue", "2021-04-30")) and np.isfinite(_cv(full, "fin_ni_sue", "2021-04-30"))


def test_cn_registered_factors_pass_engine_lookahead_check():
    days = pd.bdate_range("2018-01-01", "2022-06-30")
    close = pd.DataFrame(10.0, index=days, columns=[CODE])
    dates = fc.month_rows(days)
    f = fc.surprise_fields(_fin(_cn_rows(), _cn_rows(REV, "revenue")), dates, [CODE])
    panel = {"close_adj": close, "close": close, **f}
    for name in ("cn_sue", "cn_sur"):
        spec = registry.get(name)
        assert spec.markets == ("cn",) and spec.direction == 1
        assert registry.check_no_lookahead(spec, panel, dates[12:], n_check=8), name
        assert spec(panel, dates).notna().sum().sum() > 10


def test_load_market_cn_surprise_within_lockbox_and_core_fields_unchanged(tmp_path, monkeypatch):
    from factorlab.data import load_market
    from factorlab.guard import Lockbox, split_codes

    monkeypatch.setenv("FACTORLAB_DATA", str(tmp_path / "data"))
    days = pd.bdate_range("2019-01-02", "2024-03-29")
    codes = [f"{600100 + i:06d}" for i in range(12)]
    px = [pd.DataFrame({"date": days, "code": c, "open": 10.0, "high": 10.0, "low": 10.0, "close": 10.0,
                        "close_adj": 10.0, "volume": 1e4, "amount": 1e5, "mcap_total": 1e9}) for c in codes]
    store.write_prices("cn", pd.concat(px, ignore_index=True))
    store.write_securities("cn", pd.DataFrame({"code": codes, "name": codes, "market": "cn", "exchange": "SSE",
                                               "status": "listed", "currency": "CNY", "source": "t"}))
    qs = pd.period_range("2019Q1", "2023Q4", freq="Q")
    rows = []
    for i, c in enumerate(codes):
        single = {p: 100.0 + 3 * k + (k % 3) * (i + 1) + (5e9 if p == pd.Period("2023Q3", "Q") else 0)
                  for k, p in enumerate(qs)}
        cum = 0.0
        for p, v in single.items():
            cum = v if p.quarter == 1 else cum + v
            av = pd.Timestamp("2023-11-01") if p == pd.Period("2023Q3", "Q") else _avail(p)   # 锁箱起点当天生效
            rows.append({"code": c, "report_period": _qend(p), "item": "net_income_parent", "value": cum,
                         "avail_date": av})
            rows.append({"code": c, "report_period": _qend(p), "item": "total_equity_parent", "value": 100.0 + i,
                         "avail_date": av})
    pd.DataFrame(rows).to_parquet(store.market_dir("cn") / "fin_pit.parquet", index=False)
    (store.market_dir("cn") / "fin_pit.meta.json").write_text(json.dumps({"sha256": "test"}))

    md = load_market("cn", ["close_adj", "close", "fin_be", "fin_ni_sue"], mode="explore")
    lb = Lockbox().visible_end("cn", "explore")
    sue = md.panel["fin_ni_sue"]
    assert sue.index.max() < lb and set(sue.columns) == set(split_codes(codes, "explore"))
    assert np.isfinite(sue.loc["2023-09-29"]).all()
    assert np.nanmax(np.abs(sue.to_numpy())) < 100                    # 锁箱起点生效的 5e9 没有泄露
    md0 = load_market("cn", ["close_adj", "close", "fin_be"], mode="explore")
    pd.testing.assert_frame_equal(md0.panel["fin_be"], md.panel["fin_be"])
    assert md0.snapshot == md.snapshot                                # 盈余惊喜不改数据快照哈希


# ------------------------------------------------------------------ 美股
CIK = 777
UQS = pd.period_range("2015Q1", "2021Q4", freq="Q")
URNG = np.random.default_rng(11)
UNI = dict(zip(UQS, np.round(50 + np.cumsum(URNG.normal(1, 8, len(UQS))), 3)))


def _filed(p: pd.Period) -> pd.Timestamp:
    return _qend(p) + pd.Timedelta(70 if p.quarter == 4 else 40, unit="D")


def _us_rows(single=UNI, concept="NetIncomeLoss", direct_q=True, filed=_filed, skip=()):
    """10-Q：3 个月直接值（direct_q）或年初累计；10-K：年度值（第四季没有直接值）。"""
    out, cum = [], 0.0
    for p, v in single.items():
        y = p.year
        cum = v if p.quarter == 1 else cum + v
        if p in skip:
            continue
        f = filed(p)
        if p.quarter == 4:
            out.append((concept, "USD", f"{y}-01-01", f"{y}-12-31", cum, f, "10-K"))
        else:
            if direct_q or p.quarter == 1:
                out.append((concept, "USD", p.start_time.strftime("%Y-%m-%d"), _qend(p).strftime("%Y-%m-%d"), v, f))
            if not direct_q or p.quarter > 1:
                out.append((concept, "USD", f"{y}-01-01", _qend(p).strftime("%Y-%m-%d"), cum, f))
    return out


def _obs(rows, cik=CIK) -> pd.DataFrame:
    out = []
    for r in rows:
        con, unit, start, end, val, filed = r[:6]
        form = r[6] if len(r) > 6 else "10-Q"
        out.append({"cik": cik, "taxonomy": "us-gaap", "concept": con, "unit": unit,
                    "start": pd.Timestamp(start) if start else pd.NaT, "end": pd.Timestamp(end), "val": float(val),
                    "accn": f"{cik}-{pd.Timestamp(filed).date()}-{con[:6]}", "form": form, "fy": None, "fp": None,
                    "frame": None, "filed": pd.Timestamp(filed)})
    df = pd.DataFrame(out)
    df["period_days"] = (df["end"] - df["start"]).dt.days + 1
    df["is_amendment"] = df["form"].str.endswith("/A")
    df["effective_date"] = sec.effective_date(df["filed"])
    return df


def _vint(rows, cik=CIK):
    return sec.vintages(_obs(rows, cik))


def _ust(ev, t) -> pd.Series:
    return ev[ev["t"] <= pd.Timestamp(t)].iloc[-1]


def _eff(p) -> pd.Timestamp:
    return _filed(p) + pd.offsets.BDay(1)


def test_us_quarters_match_sec_quarterize():
    for direct in (True, False):
        v = _vint(_us_rows(direct_q=direct))
        c = fu._con(v, "NetIncomeLoss", "USD")
        q = sec.quarterize(v, "NetIncomeLoss", "USD")
        for t in np.unique(c.eff)[::3]:
            mine = fu.quarters_at(c, c.snapshot(t))
            ref = q[q["effective_date"] <= pd.Timestamp(int(t), unit="D")].groupby("q_end").tail(1)
            ref = {int((e - pd.Timestamp("1970-01-01")).days): val for e, val in zip(ref["q_end"], ref["val"])}
            assert mine.keys() == ref.keys()
            for k in mine:
                assert mine[k] == pytest.approx(ref[k], abs=1e-6)
        # 第四季 = 年度 − 9M，与真值一致
        last = fu.quarters_at(c, c.snapshot(int(c.eff.max())))
        for p in UQS:
            e = int((_qend(p) - pd.Timestamp("1970-01-01")).days)
            assert last[e] == pytest.approx(UNI[p], abs=1e-6), (direct, p)


def test_us_sue_matches_hand_calc_and_effective_date():
    for direct in (True, False):
        ev = fu.firm_surprise(_vint(_us_rows(direct_q=direct)))
        n = 0
        for p in UQS[8:]:
            e = _eff(p)
            r = _ust(ev, e)                                             # 生效日当天起可用
            assert r["ni_q_end"] == _qend(p)
            assert r["ni_sue"] == pytest.approx(_hand_sue(UNI, p), rel=1e-9), (direct, p)
            r0 = _ust(ev, e - pd.Timedelta(1, unit="D"))                      # 生效前一天：还是上一季
            assert r0["ni_q_end"] == _qend(p - 1)
            n += 1
        assert n == len(UQS) - 8


def test_us_min_sample_sigma_zero_and_revenue_fallback_order():
    # 只有 2019 起的数据：q = 2020Q3 时同比差 2020Q1–Q3 三个 → 空；2020Q4 四个 → 有值
    keep = {p: v for p, v in UNI.items() if p >= pd.Period("2019Q1", "Q")}
    ev = fu.firm_surprise(_vint(_us_rows(keep)))
    assert np.isnan(_ust(ev, _eff(pd.Period("2020Q3", "Q")))["ni_sue"])
    assert _ust(ev, _eff(pd.Period("2020Q4", "Q")))["ni_sue"] == pytest.approx(
        _hand_sue(keep, pd.Period("2020Q4", "Q")))
    flat = {p: 10.0 + 4 * (p.year - 2015) for p in UQS}                  # 同比差全 = 4 → σ = 0
    ev0 = fu.firm_surprise(_vint(_us_rows(flat)))
    assert ev0["ni_sue"].isna().all()
    # 收入：2018 年起改报 RevenueFromContract…（ASC 606），之前是 SalesRevenueNet；Revenues 只在 2020Q2 有一个
    # 不同的数，逐季优先用 Revenues
    rev = {p: v * 7 + 3 for p, v in UNI.items()}
    old = {p: v for p, v in rev.items() if p.year < 2018}
    new = {p: v for p, v in rev.items() if p.year >= 2018}
    rows = (_us_rows(old, "SalesRevenueNet") + _us_rows(new, "RevenueFromContractWithCustomerExcludingAssessedTax")
            + [("Revenues", "USD", "2020-04-01", "2020-06-30", rev[pd.Period("2020Q2", "Q")] + 100,
                _filed(pd.Period("2020Q2", "Q")))])
    evr = fu.firm_surprise(_vint(rows))
    q = pd.Period("2020Q4", "Q")
    mix = dict(rev)
    mix[pd.Period("2020Q2", "Q")] += 100
    assert _ust(evr, _eff(q))["rev_sur"] == pytest.approx(_hand_sue(mix, q), rel=1e-9)
    assert _ust(evr, _eff(pd.Period("2019Q3", "Q")))["rev_sur"] == pytest.approx(
        _hand_sue(rev, pd.Period("2019Q3", "Q")), rel=1e-9)               # 跨科目衔接的同比差
    assert evr["ni_sue"].isna().all()


def test_us_52_53_week_quarter_ends_bucket_consistently():
    # 财年末在 9 月最后一个周六附近（期末日在 9-24 至 10-01 间漂移）
    assert len({fu._qbucket(int((pd.Timestamp(d) - pd.Timestamp("1970-01-01")).days))
                for d in ("2019-09-28", "2020-09-26", "2021-10-02", "2018-09-29")}) == 4
    b = [fu._qbucket(int((pd.Timestamp(d) - pd.Timestamp("1970-01-01")).days))
         for d in ("2020-09-26", "2020-12-26", "2021-03-27", "2021-06-26", "2021-10-02")]
    assert np.diff(b).tolist() == [1, 1, 1, 1]


def _us_panel(rows, days, end_ex=None):
    sev = fu.guard_surprise(fu.firm_surprise(_vint(rows)), end_ex, None)
    close = pd.DataFrame(10.0, index=days, columns=["XYZ"])
    return fu.surprise_panel(sev, fu.FIELDS_SURPRISE, close, pd.Series({"XYZ": CIK})), close


def test_us_staleness_200_days_and_no_lookahead():
    days = pd.bdate_range("2017-01-02", "2022-12-30")
    rows = _us_rows() + _us_rows({p: v * 5 for p, v in UNI.items()}, "Revenues")
    f, close = _us_panel(rows, days)
    s = f["fund_ni_sue"]["XYZ"]
    # 最后一季 2021Q4（期末 2021-12-31）：+200 天 = 2022-07-19 → 6 月末有值、7 月末为空
    assert np.isfinite(s.loc["2022-06-30"]) and np.isnan(s.loc["2022-07-29"])
    assert s.loc["2021-05-31"] == pytest.approx(_hand_sue(UNI, pd.Period("2021Q1", "Q")))
    assert np.isfinite(f["fund_rev_sur"]["XYZ"].loc["2021-05-31"])
    # 扰动未来：d 之后才生效的申报（新季度、重述）不改变 d 及以前的值
    d = pd.Timestamp("2020-06-30")
    fut = {p: (v * 4 - 77 if _eff(p) > d else v) for p, v in UNI.items()}
    later = _us_rows(fut) + _us_rows({p: v * 5 for p, v in UNI.items()}, "Revenues") + [
        ("NetIncomeLoss", "USD", "2019-01-01", "2019-12-31", -9e9, "2020-07-15", "10-K/A")]
    g, _ = _us_panel(later, days)
    for k in fu.FIELDS_SURPRISE:
        pd.testing.assert_frame_equal(f[k].loc[:d], g[k].loc[:d], obj=k)
    assert not np.isclose(f["fund_ni_sue"].loc["2020-08-31", "XYZ"], g["fund_ni_sue"].loc["2020-08-31", "XYZ"])
    # 截断：可见上界之后没有新知识
    end_ex = pd.Timestamp("2021-06-01")
    h, _ = _us_panel(rows, days, end_ex=end_ex)
    for k in fu.FIELDS_SURPRISE:
        pd.testing.assert_frame_equal(f[k].loc[:"2021-05-31"], h[k].loc[:"2021-05-31"], obj=k)
    assert h["fund_ni_sue"].loc["2021-08-31", "XYZ"] == pytest.approx(_hand_sue(UNI, pd.Period("2021Q1", "Q")))
    # 引擎的「截到当日重算」核对
    panel = {"close_adj": close, "close": close, **f}
    mdates = fu.month_rows(days)[24:]
    for name in ("us_sue", "us_sur"):
        spec = registry.get(name)
        assert spec.markets == ("us",) and spec.direction == 1
        assert registry.check_no_lookahead(spec, panel, mdates, n_check=8), name


def test_load_market_us_surprise_within_lockbox(tmp_path, monkeypatch):
    from factorlab.data import load_market
    from factorlab.guard import Lockbox, split_codes

    monkeypatch.setenv("FACTORLAB_DATA", str(tmp_path / "data"))
    days = pd.bdate_range("2019-01-01", "2024-03-29")
    codes = [f"C{i:02d}" for i in range(12)]
    px = [pd.DataFrame({"date": days, "code": c, "open": 10.0, "high": 10.0, "low": 10.0, "close": 10.0,
                        "close_adj": 10.0, "volume": 1e4, "amount": 1e5}) for c in codes]
    store.write_prices("us", pd.concat(px, ignore_index=True))
    store.write_securities("us", pd.DataFrame({"code": codes, "name": codes, "market": "us", "exchange": "NYSE",
                                               "status": "listed", "currency": "USD", "source": "t"}))
    (store.market_dir("us_sec") / "raw").mkdir(parents=True, exist_ok=True)
    tick = {str(i): {"cik_str": 1000 + i, "ticker": c, "title": c} for i, c in enumerate(codes)}
    (store.market_dir("us_sec") / "raw" / "company_tickers.json").write_text(json.dumps(tick))
    qs = pd.period_range("2019Q1", "2023Q4", freq="Q")
    evs, sevs = [], []
    for i, c in enumerate(codes):
        single = {p: 100.0 + 3 * k + (k % 3) * (i + 1) + (9e9 if p == pd.Period("2023Q3", "Q") else 0)
                  for k, p in enumerate(qs)}
        filed = (lambda p: pd.Timestamp("2023-10-31") if p == pd.Period("2023Q3", "Q") else _filed(p))
        rows = _us_rows(single, filed=filed) + [
            ("StockholdersEquity", "USD", None, "2022-12-31", 100 + i, "2023-02-15", "10-K"),
            ("EntityCommonStockSharesOutstanding", "shares", None, "2023-01-31", 1e6, "2023-02-15", "10-K")]
        v = _vint(rows, 1000 + i)
        evs.append(fu.firm_events(v))
        sevs.append(fu.firm_surprise(v))
    pd.concat(evs).to_parquet(fu.derived_dir() / "events.parquet", index=False)
    (fu.derived_dir() / "MANIFEST.json").write_text(json.dumps({"version": "t", "sha256": {}}))
    pd.concat(sevs).to_parquet(fu.derived_dir() / "surprise.parquet", index=False)

    md = load_market("us", ["close_adj", "close", "fund_be", "fund_ni_sue"], mode="explore")
    lb = Lockbox().visible_end("us", "explore")
    s = md.panel["fund_ni_sue"]
    assert s.index.max() < lb and set(s.columns) == set(split_codes(codes, "explore"))
    assert np.isfinite(s.loc["2023-09-29"]).all()
    assert np.nanmax(np.abs(s.to_numpy())) < 100                       # 10-31 申报、11-01 生效的 9e9 没有泄露
    md0 = load_market("us", ["close_adj", "close", "fund_be"], mode="explore")
    pd.testing.assert_frame_equal(md0.panel["fund_be"], md.panel["fund_be"])
    assert md0.snapshot == md.snapshot
