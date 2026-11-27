"""港股点时财报（hk_fin）的离线单元测试：夹具按巨潮 webapi 港股接口实际返回的字段结构内嵌在本文件，不联网。"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from factorlab import fundamentals_cn
from factorlab.sources import cn_pit, hk_fin, http

T = pd.Timestamp
# 港股交易日（工作日，去掉 2024-05-15 佛诞、2024-03-29 / 04-01 复活节）
DAYS = pd.bdate_range("2003-01-01", "2026-12-31").difference(pd.DatetimeIndex(["2024-05-15", "2024-03-29", "2024-04-01"]))


def _inc(code, end, start, decl, typ, rev, nip, cur="CNY", fx=1.1022, aud="2", shares=None, **extra):
    r = {"SECCODE": code, "SECNAME": "x", "ENDDATE": end, "STARTDATE": start, "DECLAREDATE": decl, "F001V": typ,
         "F002V": cur, "F003V": "人民币", "F004N": fx, "F005N": rev, "F006N": rev * 0.25, "F009N": nip * 1.4,
         "F012N": nip, "F024N": nip, "F025N": 12.1857, "F022N": shares, "F036V": aud, "CNY": 1.0, "USD": None}
    r.update(extra)
    return r


# 巨潮 hk/p_hk4024 节选（结构同实测；00700 2023 年报 / 2024 中报数值，单位元）
INCOME = {"resultcode": 200, "records": [
    _inc("00700", "2023-12-31", "2023-01-01", "2024-03-20", "年报", 609015e6, 115216e6, shares=9482992820.0),
    _inc("00700", "2024-06-30", "2024-01-01", "2024-08-14", "半年报", 320618e6, 89519e6, aud="1"),
    # 早年：录入日占位（2012-01-04）
    _inc("00700", "2004-12-31", "2004-01-01", "2012-01-04", "年报", 1143533e3, 441119e3, fx=0.9434, shares=0.0),
]}
INDICATOR = {"resultcode": 200, "records": [
    {"SECCODE": "00700", "ENDDATE": "2023-12-31", "STARTDATE": "2023-01-01", "DECLAREDATE": "2024-03-20",
     "F001V": "年报", "F002V": "CNY", "F004N": 1.1022, "F078V": "2", "F017N": 609015e6, "F024N": 118048e6,
     "F026N": 115216e6, "F071N": 293109e6, "F007N": 1577246e6, "F014N": 808591e6, "F069N": 873681e6,
     "F030N": 221962e6},
]}
BALANCE = {"resultcode": 200, "records": [
    {"SECCODE": "00700", "ENDDATE": "2023-12-31", "STARTDATE": "2023-01-01", "DECLAREDATE": "2024-03-20",
     "F001V": "年报", "F002V": "CNY", "F004N": 1.1022, "F023V": "2", "F012N": 1577246e6, "F018N": 0.0,
     "F019N": 808591e6, "F020N": 808591e6},
    # 资产负债表的 DECLAREDATE 与利润表不同（另一个录入日）：同一期取晚于期末的最早一个
    {"SECCODE": "00700", "ENDDATE": "2004-12-31", "STARTDATE": "2004-01-01", "DECLAREDATE": "2011-02-20",
     "F001V": "年报", "F002V": "CNY", "F004N": 0.9434, "F023V": "2", "F012N": 4e9, "F020N": 3e9},
]}
CASHFLOW = {"resultcode": 200, "records": [
    {"SECCODE": "00700", "ENDDATE": "2023-12-31", "STARTDATE": "2023-01-01", "DECLAREDATE": "2024-03-20",
     "F001v": "年报", "F002V": "CNY", "F004N": 1.1022, "F037V": "2", "F034N": 221962e6},
]}
# 汇丰（银行表，美元）
BANK_INCOME = {"resultcode": 200, "records": [
    {"SECCODE": "00005", "ENDDATE": "2023-12-31", "STARTDATE": "2023-01-01", "DECLAREDATE": "2024-02-21",
     "F001V": "年报", "F002V": "USD", "F004N": 7.8131, "F042V": "2", "F013N": 66058e6, "F007N": 35796e6,
     "F017N": 27541e6, "F020N": 30348e6, "F022N": 24559e6, "F033N": 23533e6, "F034N": 1.1517, "F031N": 19262728193.0},
]}
BANK_BALANCE = {"resultcode": 200, "records": [
    {"SECCODE": "00005", "ENDDATE": "2023-12-31", "STARTDATE": "2023-01-01", "DECLAREDATE": "2024-02-21",
     "F001V": "年报", "F002V": "USD", "F004N": 7.8131, "F047V": "", "F024N": 3038677e6, "F035N": 2846067e6,
     "F042N": 185329e6, "F044N": 192610e6},
]}
# 平安（英文保险表，币种写作 RMB）
INS_INCOME = {"resultcode": 200, "records": [
    {"SECCODE": "02318", "ENDDATE": "2023-12-31", "STARTDATE": "2023-01-01", "DECLAREDATE": "2024-03-21",
     "REPORTTYPE": "Annual Report", "CURRENCY": "RMB", "F001N": 1.1022, "F012N": 903401e6, "F023N": 120117e6,
     "F025N": 109274e6, "F026N": 85665e6, "F033N": 4.8352, "F054N": 18210234607.0},
]}
RESULTS_DATES = {"resultcode": 200, "records": [
    {"SECCODE": "00700", "F002D": "2011-03-16", "F001D": "2010-12-16", "F004V": "Final Results / Dividend",
     "F006V": "12 Months Ended 31/12/10"},
    {"SECCODE": "00700", "F002D": "2026-11-18", "F001D": "2026-09-24", "F004V": "3rd Quarter Results / Dividend",
     "F006V": "9 Months Ended 30/09/26                 "},
    {"SECCODE": "00700", "F002D": None, "F006V": "6 Months Ended 30/06/26"},
    {"SECCODE": "00700", "F002D": "2026-01-01", "F006V": "garbage"},
]}


def _raw(*pairs):
    return pd.concat([hk_fin.parse_table(p, t) for t, p in pairs], ignore_index=True)


# ---------------- 解析 ----------------
def test_parse_income_items_currency_type_audited():
    d = hk_fin.parse_table(INCOME, "income")
    a = d[(d["report_period"] == T("2023-12-31"))].set_index("item")
    assert a.loc["revenue", "value"] == 609015e6 and a.loc["net_income_parent", "value"] == 115216e6
    assert a.loc["shares_outstanding", "value"] == 9482992820.0
    assert set(a["currency"]) == {"CNY"} and a["fx_hkd"].iloc[0] == pytest.approx(1.1022)
    assert set(a["report_type"]) == {"annual"} and a["audited"].all()
    h = d[d["report_period"] == T("2024-06-30")]
    assert set(h["report_type"]) == {"interim"} and not h["audited"].any()
    # 股数 0 是占位，丢弃；空值不出行
    old = d[d["report_period"] == T("2004-12-31")]
    assert "shares_outstanding" not in set(old["item"])


def test_parse_bank_and_insurance_tables():
    b = hk_fin.parse_table(BANK_INCOME, "bank_income").set_index("item")
    assert b.loc["revenue", "value"] == 66058e6 and b.loc["net_income_parent", "value"] == 23533e6
    assert b.loc["net_interest_income", "value"] == 35796e6 and b["currency"].iloc[0] == "USD"
    i = hk_fin.parse_table(INS_INCOME, "ins_income").set_index("item")
    assert i.loc["net_income_parent", "value"] == 85665e6
    assert i["currency"].iloc[0] == "CNY" and i["report_type"].iloc[0] == "annual"   # RMB → CNY
    bal = hk_fin.parse_table(BALANCE, "balance")
    tep = bal[(bal["item"] == "total_equity_parent") & (bal["report_period"] == T("2023-12-31"))]["value"]
    assert tep.iloc[0] == 808591e6                    # F020N（股本 + 储备），不是 F019N（储备）
    assert hk_fin.parse_table({"records": []}, "income").empty


def test_parse_results_dates():
    h = hk_fin.parse_results_dates(RESULTS_DATES)
    assert len(h) == 2
    assert h.iloc[0]["report_period"] == T("2010-12-31") and h.iloc[0]["months"] == 12
    assert h.iloc[0]["results_date"] == T("2011-03-16")
    assert h.iloc[1]["report_period"] == T("2026-09-30") and h.iloc[1]["months"] == 9


def test_parse_securities_status_and_board():
    s = hk_fin.parse_securities({"records": [
        {"SECCODE": "00494", "SECNAME": "利丰", "F004D": "1992-07-01", "F005D": "2020-05-28", "F008V": "013002",
         "F002V": "012006", "F006V": "o1", "F007V": "利丰有限公司"},
        {"SECCODE": "08177", "SECNAME": "x", "F004D": "2002-07-29", "F005D": None, "F008V": "013001", "F002V": "012007"},
    ]})
    assert list(s["status"]) == ["delisted", "listed"] and list(s["board"]) == ["主板", "GEM"]
    assert s.iloc[0]["delist_date"] == T("2020-05-28")


# ---------------- 公告日规则 ----------------
def test_statutory_deadline_rules():
    rp = pd.Series([T("2009-12-31"), T("2010-12-31"), T("2009-06-30"), T("2010-06-30"), T("2021-03-31"),
                    T("2023-03-31"), T("2022-09-30")])
    rt = pd.Series(["annual", "annual", "interim", "interim", "q1", "annual", "interim"])
    got = list(hk_fin.statutory_deadline(rp, rt))
    assert got == [T("2010-04-30"), T("2011-03-31"), T("2009-09-30"), T("2010-08-31"), T("2021-05-31"),
                   T("2023-06-30"), T("2022-11-30")]


def _periods(rows):
    return pd.DataFrame(rows, columns=["code", "report_period", "period_start", "report_type", "declare_date"])


def test_batch_dates_need_many_codes():
    rows = [(f"{i:05d}", T("2008-12-31"), T("2008-01-01"), "annual", T("2012-08-16")) for i in range(5)]
    rows += [("00099", T("2015-12-31"), T("2015-01-01"), "annual", T("2016-09-01"))]        # 单只延期
    rows += [(f"{i:05d}", T("2015-12-31"), T("2015-01-01"), "annual", T("2016-03-20")) for i in range(5)]  # 按时
    p = _periods(rows)
    p["deadline"] = hk_fin.statutory_deadline(p["report_period"], p["report_type"])
    assert hk_fin.batch_dates(p) == {T("2012-08-16")}


def test_repair_dates_all_rules():
    p = _periods([
        ("00001", T("2015-12-31"), T("2015-01-01"), "annual", T("2016-03-17")),   # 按时
        ("00002", T("2004-12-31"), T("2004-01-01"), "annual", T("2012-01-04")),   # 2007 年前占位，无 4008 → 截止日
        ("00003", T("2010-12-31"), T("2010-01-01"), "annual", T("2012-08-16")),   # 批量录入日 + 4008 → 4008
        ("00004", T("2015-12-31"), T("2015-01-01"), "annual", T("2016-09-01")),   # 真实延期 → 照用
        ("00005", T("2015-06-30"), T("2015-01-01"), "interim", T("2015-06-30")),  # 不晚于期末 → 截止日
        ("00006", T("2015-06-30"), T("2015-01-01"), "interim", pd.NaT),          # 缺失 + 4008
        ("00007", T("2011-06-30"), T("2011-01-01"), "interim", T("2012-08-16")),  # 批量日，但 4008 晚于占位日 → 截止日
    ])
    h = pd.DataFrame({"code": ["00003", "00003", "00006", "00007"],
                      "report_period": [T("2010-12-31"), T("2010-12-31"), T("2015-06-30"), T("2011-06-30")],
                      "months": [12, 12, 6, 6],
                      "results_date": [T("2011-03-10"), T("2011-03-24"), T("2015-08-20"), T("2013-01-01")]})
    r = hk_fin.repair_dates(p, h, batch={T("2012-08-16")}).set_index("code")
    assert r.loc["00001", ["announce_date", "announce_rule", "date_quality"]].tolist() == [T("2016-03-17"), "declared", "declared"]
    assert r.loc["00002", ["announce_date", "date_quality"]].tolist() == [T("2005-04-30"), "repaired_deadline"]
    # 4008 同一期多条（改期）：取最晚的
    assert r.loc["00003", ["announce_date", "announce_rule", "date_quality"]].tolist() == [T("2011-03-24"), "hk4008", "repaired_hk4008"]
    assert r.loc["00004", ["announce_date", "date_quality"]].tolist() == [T("2016-09-01"), "declared_late"]
    assert r.loc["00005", ["announce_date", "date_quality"]].tolist() == [T("2015-08-31"), "missing_deadline"]
    assert r.loc["00006", ["announce_date", "date_quality"]].tolist() == [T("2015-08-20"), "missing_hk4008"]
    assert r.loc["00007", ["announce_date", "date_quality"]].tolist() == [T("2011-08-31"), "repaired_deadline"]
    # 修复后的公告日从不晚于原始占位日（只往前修到「当时最晚可能的日子」，不会更晚）
    ph = r[r["date_quality"].str.startswith("repaired")]
    assert (ph["announce_date"] <= ph["declare_date"]).all()


# ---------------- 组装 ----------------
def test_assemble_avail_date_strictly_after_and_holidays():
    raw = _raw(("income", INCOME), ("indicator", INDICATOR), ("balance", BALANCE), ("cashflow", CASHFLOW))
    fin = hk_fin.assemble(raw, hk_fin.parse_results_dates(RESULTS_DATES), DAYS)
    assert fin["avail_date"].notna().all() and (fin["avail_date"] > fin["announce_date"]).all()
    a = fin[(fin["report_period"] == T("2023-12-31"))]
    assert set(a["announce_date"]) == {T("2024-03-20")} and set(a["avail_date"]) == {T("2024-03-21")}
    h = fin[(fin["report_period"] == T("2024-06-30"))]
    assert set(h["avail_date"]) == {T("2024-08-15")}
    # 2004 年报：利润表 2012-01-04、资产负债表 2011-02-20 都是占位 → 法定截止日 2005-04-30（周六）→ 下一交易日 5-02
    o = fin[fin["report_period"] == T("2004-12-31")]
    assert set(o["announce_date"]) == {T("2005-04-30")} and set(o["avail_date"]) == {T("2005-05-02")}
    assert set(o["date_quality"]) == {"repaired_deadline"} and set(o["declare_date_raw"]) == {T("2011-02-20")}
    assert set(fin.columns) == set(hk_fin.FIN_COLUMNS)


def test_assemble_items_priority_and_derived():
    raw = _raw(("income", INCOME), ("indicator", INDICATOR), ("balance", BALANCE), ("cashflow", CASHFLOW))
    fin = hk_fin.assemble(raw, pd.DataFrame(), DAYS)
    a = fin[fin["report_period"] == T("2023-12-31")].set_index("item")
    assert a.loc["revenue", "source_table"] == "hk/p_hk4024"            # 三大表优先于指标表
    assert a.loc["gross_profit", "source_table"] == "hk/p_hk4025"
    assert a.loc["cost_of_revenue", "value"] == pytest.approx(609015e6 - 293109e6)
    assert a.loc["total_liabilities", "value"] == pytest.approx(1577246e6 - 873681e6)
    assert a.loc["net_income", "value"] == 118048e6 and a.loc["cfo", "value"] == 221962e6
    assert pd.isna(a.loc["total_assets", "period_start"]) and a.loc["revenue", "period_months"] == 12
    assert not fin["is_restated"].any() and (fin["version"] == 1).all()
    assert set(a["template"]) == {"general"}


def test_assemble_keeps_currency_per_row_and_templates():
    raw = _raw(("income", INCOME), ("bank_income", BANK_INCOME), ("bank_balance", BANK_BALANCE),
               ("ins_income", INS_INCOME))
    fin = hk_fin.assemble(raw, pd.DataFrame(), DAYS)
    cur = fin.groupby("code")["currency"].unique().map(list).to_dict()
    assert cur == {"00005": ["USD"], "00700": ["CNY"], "02318": ["CNY"]}
    tm = fin.groupby("code")["template"].first().to_dict()
    assert tm == {"00005": "bank", "00700": "general", "02318": "insurance"}
    # 币种不同的公司不做任何折算：数值是报告币种原值
    assert fin[(fin["code"] == "00005") & (fin["item"] == "total_assets")]["value"].iloc[0] == 3038677e6
    assert fin[fin["code"] == "00005"]["fx_hkd"].iloc[0] == pytest.approx(7.8131)


def test_assemble_currency_switch_stays_per_period():
    recs = [_inc("01111", "2019-12-31", "2019-01-01", "2020-03-20", "年报", 100.0, 10.0, cur="HKD", fx=1.0),
            _inc("01111", "2020-12-31", "2020-01-01", "2021-03-20", "年报", 90.0, 9.0, cur="CNY", fx=1.18)]
    fin = hk_fin.assemble(hk_fin.parse_table({"records": recs}, "income"), pd.DataFrame(), DAYS)
    by = fin.drop_duplicates("report_period").set_index("report_period")["currency"].to_dict()
    assert by == {T("2019-12-31"): "HKD", T("2020-12-31"): "CNY"}


def test_assemble_duplicate_period_start_takes_matching_months_and_earliest_date():
    # 同一期末、同样数值，期初录错（12 个月 vs 6 个月的半年报）：留 6 个月那条，公告日取两条里最早的
    recs = [_inc("00097", "2009-06-30", "2008-07-01", "2009-08-28", "半年报", 143e6, 41e6, cur="HKD", fx=1.0, aud="1"),
            _inc("00097", "2009-06-30", "2009-01-01", "2014-04-08", "半年报", 143e6, 41e6, cur="HKD", fx=1.0, aud="1")]
    fin = hk_fin.assemble(hk_fin.parse_table({"records": recs}, "income"), pd.DataFrame(), DAYS)
    r = fin[fin["item"] == "revenue"]
    assert len(r) == 1 and r["period_start"].iloc[0] == T("2009-01-01") and r["period_months"].iloc[0] == 6
    assert r["announce_date"].iloc[0] == T("2009-08-28") and r["date_quality"].iloc[0] == "declared"
    # 改财年：同一期末、数值不同 → 两条都保留，靠期初区分
    recs = [_inc("00101", "2011-12-31", "2011-01-01", "2012-01-19", "年报", 5712e6, 4890e6, cur="HKD", fx=1.0),
            _inc("00101", "2011-12-31", "2011-07-01", "2012-01-19", "年报", 3069e6, 2516e6, cur="HKD", fx=1.0)]
    fin = hk_fin.assemble(hk_fin.parse_table({"records": recs}, "income"), pd.DataFrame(), DAYS)
    r = fin[fin["item"] == "revenue"].sort_values("period_start")
    assert list(r["period_months"]) == [12, 6] and list(r["version"]) == [1, 1]


def test_entity_filter_reused_and_delisted_codes_and_prospectus():
    sec = pd.DataFrame({"code": ["01880", "01880", "00494", "00013"],
                        "list_date": [T("2007-05-23"), T("2022-08-25"), T("1992-07-01"), T("2006-05-19")],
                        "delist_date": [T("2017-07-27"), pd.NaT, T("2020-05-28"), pd.NaT],
                        "status": ["delisted", "listed", "delisted", "listed"]})
    recs = [_inc("01880", "2010-12-31", "2010-01-01", "2011-03-20", "年报", 1.0, 1.0),     # 旧公司年代 → 丢
            _inc("01880", "2021-12-31", "2021-01-01", "2022-08-15", "年报", 2.0, 2.0),     # 招股书 → 留，标注
            _inc("01880", "2023-12-31", "2023-01-01", "2024-03-27", "年报", 3.0, 3.0),
            _inc("00494", "2019-12-31", "2019-01-01", "2020-03-19", "年报", 4.0, 4.0),
            _inc("00494", "2020-12-31", "2020-01-01", "2021-03-19", "年报", 5.0, 5.0)]    # 退市后 → 丢
    fin = hk_fin.assemble(hk_fin.parse_table({"records": recs}, "income"), pd.DataFrame(), DAYS, sec=sec)
    got = fin[fin["item"] == "revenue"].set_index(["code", "report_period"])
    assert sorted(got.index.tolist()) == [("00494", T("2019-12-31")), ("01880", T("2021-12-31")), ("01880", T("2023-12-31"))]
    assert got.loc[("01880", T("2021-12-31")), "date_quality"] == "declared_prospectus"
    assert got.loc[("01880", T("2021-12-31")), "doc_type"] == "prospectus"
    assert got.loc[("01880", T("2023-12-31")), "code_reused"] and not got.loc[("00494", T("2019-12-31")), "code_reused"]


def test_asof_latest_known():
    raw = _raw(("income", INCOME))
    fin = hk_fin.assemble(raw, pd.DataFrame(), DAYS)
    a = hk_fin.asof(fin, "2024-03-20", "revenue")
    assert set(a["report_period"]) == {T("2004-12-31")}                  # 当天公布的还不可用
    a = hk_fin.asof(fin, "2024-03-21", "revenue")
    assert set(a["report_period"]) == {T("2004-12-31"), T("2023-12-31")}


# ---------------- 读取与护栏 ----------------
def test_load_fin_pit_truncates_lockbox_and_guard_fin(tmp_path, monkeypatch):
    monkeypatch.setenv("FACTORLAB_DATA", str(tmp_path))
    raw = _raw(("income", INCOME), ("indicator", INDICATOR), ("balance", BALANCE), ("cashflow", CASHFLOW))
    fin = hk_fin.assemble(raw, pd.DataFrame(), DAYS)
    fin.to_parquet(hk_fin.fin_path(), index=False)
    cut = T(json.loads(hk_fin.store.LOCKBOX_FILE.read_text())["markets"]["hk"]["start"])
    vis = hk_fin.load_fin_pit()
    assert (vis["avail_date"] < cut).all() and len(vis) < len(fin)
    assert len(hk_fin.load_fin_pit(raw=True)) == len(fin)
    assert set(hk_fin.load_fin_pit(items=["cfo"], raw=True)["item"]) == {"cfo"}
    # 与 A 股相同的护栏函数可以直接作用在港股长表上（列名一致）
    g = fundamentals_cn.guard_fin(fin, T("2024-01-01"), (T("2005-01-01"), T("2006-01-01")))
    assert (g["avail_date"] < T("2024-01-01")).all()
    assert not ((g["avail_date"] >= T("2005-01-01")) & (g["avail_date"] < T("2006-01-01"))).any()


# ---------------- 下载（假客户端） ----------------
def _fake_request(store_calls, payloads):
    def fake(api, params):
        store_calls.append((api, dict(params)))
        codes = params["scode"].split(",")
        recs = [r for r in payloads.get(api, []) if r["SECCODE"] in codes]
        return {"resultcode": 200, "records": recs, "total": len(recs)}
    return fake


def test_fetch_batches_writes_per_code_files_and_resumes(tmp_path, monkeypatch):
    monkeypatch.setenv("FACTORLAB_DATA", str(tmp_path))
    calls = []
    monkeypatch.setattr(hk_fin, "cninfo_request", _fake_request(calls, {"hk/p_hk4024": INCOME["records"]}))
    res = hk_fin.fetch(["00700", "00005", "00941"], tables=("income",), batch=2)
    assert res["requests_batches"] == 2 and len(calls) == 2 and calls[0][1]["scode"] == "00700,00005"
    d = tmp_path / "hk" / "raw" / "fin" / "cninfo" / "income"
    assert len(json.loads((d / "00700.json").read_text())["records"]) == 3
    assert json.loads((d / "00005.json").read_text())["records"] == []        # 空结果也落盘（续传时跳过）
    hk_fin.fetch(["00700", "00005", "00941", "00388"], tables=("income",), batch=2)
    assert len(calls) == 3 and calls[-1][1]["scode"] == "00388"


def test_fetch_insurance_windows_and_split_on_suspected_truncation(tmp_path, monkeypatch):
    monkeypatch.setenv("FACTORLAB_DATA", str(tmp_path))
    calls = []
    monkeypatch.setattr(hk_fin, "cninfo_request", _fake_request(calls, {"en/p_ENHK7515": INS_INCOME["records"]}))
    hk_fin.fetch(["02318"], tables=("ins_income",))
    assert len(calls) == len(hk_fin.INS_WINDOWS)
    assert all("sdate" in p and "edate" in p for _, p in calls)
    for s, e in hk_fin.INS_WINDOWS:                        # 每段不超过 4 年（含两个闰日的 5 年会被服务器拒）
        assert (T(e) - T(s)).days < 4 * 366
    # 单批返回条数 ≥ SPLIT_AT → 拆半重下
    calls.clear()
    monkeypatch.setattr(hk_fin, "SPLIT_AT", 2)
    recs = [_inc(c, "2023-12-31", "2023-01-01", "2024-03-20", "年报", 1.0, 1.0) for c in ("00001", "00002")]
    monkeypatch.setattr(hk_fin, "cninfo_request", _fake_request(calls, {"hk/p_hk4024": recs}))
    out = hk_fin.fetch_batch("income", ["00001", "00002"])
    assert len(out) == 2 and [p["scode"] for _, p in calls] == ["00001,00002", "00001", "00002"]


def test_fetch_backs_off_on_403_then_stops(tmp_path, monkeypatch):
    monkeypatch.setenv("FACTORLAB_DATA", str(tmp_path))
    sleeps = []
    monkeypatch.setattr(hk_fin, "_sleep", lambda s: sleeps.append(s))
    n = {"i": 0}

    def flaky(table, codes):
        n["i"] += 1
        if n["i"] == 1:
            raise http.HttpStatusError("HTTP 403: x")
        if codes[0] >= "00003":
            raise http.HttpError("重试 4 次仍失败")
        return []

    monkeypatch.setattr(hk_fin, "fetch_batch", flaky)
    res = hk_fin.fetch(["00001", "00002", "00003", "00004", "00005"], tables=("income",), batch=1, max_consec_fail=2)
    assert sleeps == [60] and res["forbidden_waits"] == 1 and res["stopped_early"]
    assert [f[1] for f in res["failed"]] == ["00003", "00004"]


def test_cninfo_request_rejects_error_codes(monkeypatch):
    c = http.Client("hk")
    monkeypatch.setitem(http._DEFAULT, "hk", c)
    monkeypatch.setattr(cn_pit, "cninfo_key", lambda: "k")
    seen = []
    monkeypatch.setattr(c, "fetch", lambda url, params=None, headers=None: seen.append((url, headers)) or
                        b'{"resultcode":402,"resultmsg":"RequestCheckFilter"}')
    with pytest.raises(http.HttpError):
        hk_fin.cninfo_request("hk/p_hk4008", {})
    assert seen[0][0].endswith("/api/hk/p_hk4008") and seen[0][1]["Accept-EncKey"] == "k"
    assert "User-Agent" not in seen[0][1]                 # 只用 http 模块的通用 UA


def test_insurance_candidates(tmp_path, monkeypatch):
    monkeypatch.setenv("FACTORLAB_DATA", str(tmp_path))
    null_recs = [{"SECCODE": "01299", "ENDDATE": f"{y}-12-31", "F005N": None, "F012N": None} for y in range(2010, 2024)]
    files = {("income", "01299"): null_recs,
             ("income", "00700"): INCOME["records"],
             ("income", "00005"): [{"SECCODE": "00005", "ENDDATE": "2020-12-31", "F005N": None, "F012N": None}],
             ("bank_income", "00005"): BANK_INCOME["records"]}
    for (t, c), recs in files.items():
        p = http.raw_dir("hk") / hk_fin.cache_rel(t, c)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps({"resultcode": 200, "records": recs}))
    assert hk_fin.insurance_candidates() == ["01299"]


def test_build_from_cache(tmp_path, monkeypatch):
    monkeypatch.setenv("FACTORLAB_DATA", str(tmp_path))
    monkeypatch.setattr(hk_fin, "securities_list", lambda refresh=False: hk_fin.parse_securities({"records": []}))
    for t, code, payload in [("income", "00700", INCOME), ("indicator", "00700", INDICATOR),
                             ("balance", "00700", BALANCE), ("cashflow", "00700", CASHFLOW),
                             ("results_dates", "00700", RESULTS_DATES), ("bank_income", "00005", BANK_INCOME)]:
        p = http.raw_dir("hk") / hk_fin.cache_rel(t, code)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(payload))
    rep = hk_fin.build()
    assert rep["codes"] == 2 and rep["currencies"] == {"CNY": 3, "USD": 1}
    fin = hk_fin.load_fin_pit(raw=True)
    assert (fin["avail_date"] > fin["announce_date"]).all()
    cov = hk_fin.coverage_by_year(fin, years=[2004, 2023])
    assert cov[2023]["companies"] == 2 and cov[2004]["date_quality"] == {"repaired_deadline": 1}
    meta = json.loads(hk_fin.meta_path().read_text())
    assert meta["sha256"] and meta["rows"] == len(fin)
    assert np.isfinite(fin["value"]).all()


def test_batch_dates_only_in_buildout_window_and_small_lag_kept():
    # 2020-04-01：疫情年截止日次日 6 家同日公布（真实）→ 不是批量录入日
    rows = [(f"{i:05d}", T("2019-12-31"), T("2019-01-01"), "annual", T("2020-04-01")) for i in range(6)]
    # 2011-04-08：建库期批量日，但 2010 年报只逾期 8 天 → 真实延期，照用；2006 年以前的照样当占位
    rows += [(f"{i:05d}", T("2008-12-31"), T("2008-01-01"), "annual", T("2011-04-08")) for i in range(10, 16)]
    rows += [("00020", T("2010-12-31"), T("2010-01-01"), "annual", T("2011-04-08"))]
    p = _periods(rows)
    p["deadline"] = hk_fin.statutory_deadline(p["report_period"], p["report_type"])
    b = hk_fin.batch_dates(p)
    assert b == {T("2011-04-08")}
    r = hk_fin.repair_dates(p.drop(columns="deadline"), pd.DataFrame(), b).set_index("code")
    assert r.loc["00000", "date_quality"] == "declared_late"
    assert r.loc["00010", "date_quality"] == "repaired_deadline" and r.loc["00010", "announce_date"] == T("2009-04-30")
    assert r.loc["00020", ["announce_date", "date_quality"]].tolist() == [T("2011-04-08"), "declared_late"]
