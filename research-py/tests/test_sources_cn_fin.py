"""A 股点时财报（cn_fin）的离线单元测试：夹具按巨潮 webapi / 新浪实际返回的字段结构内嵌在本文件，不联网。"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from factorlab.sources import cn_fin, cn_pit, http

T = pd.Timestamp


def _inc(src, end, start, decl, typ, rev, cost, nip, doc="033003", code="600519"):
    ni = nip
    return {"SECCODE": code, "F001D": src, "ENDDATE": end, "STARTDATE": start, "DECLAREDATE": decl, "F002V": typ,
            "F003V": {"071001": "合并本期", "071002": "合并上期", "071003": "母公司本期"}[typ], "F004V": doc,
            "F005V": "定期报告", "F006N": rev, "F035N": rev, "F007N": cost, "F018N": ni * 1.3, "F024N": ni * 1.3,
            "F027N": ni * 1.05, "F028N": ni, "F031N": 1.0}


# 巨潮 p_stock2301 节选（结构同实测；数值为 600519 2023 年报 / 2024 年报对比栏，单位元）
INCOME = {"resultcode": 200, "records": [
    _inc("2023-12-31", "2023-12-31", "2023-01-01", "2024-04-03", "071001", 147693604994.14, 11867273851.78, 74734071550.75),
    _inc("2023-12-31", "2023-12-31", "2023-01-01", "2024-04-03", "071003", 1.0, 1.0, 1.0),          # 母公司：不用
    _inc("2024-12-31", "2023-12-31", "2023-01-01", "2025-04-03", "071002", 147693604994.14, 11867273851.78, 74734071550.75),  # 对比数未变
    _inc("2024-03-31", "2024-03-31", "2024-01-01", "2024-04-27", "071001", 46485000000.0, 3700000000.0, 24065000000.0),
    _inc("2025-03-31", "2024-03-31", "2024-01-01", "2025-04-30", "071002", 46485000000.0, 3700000000.0, 24070000000.0),  # 重述
    # 早年占位公告日（等于报告期末）→ 法定截止日
    _inc("2001-12-31", "2001-12-31", "2001-01-01", "2001-12-31", "071001", 1618046660.31, 200000000.0, 328290723.14),
]}

# 巨潮 p_stock2303 节选：年报本期有资产负债表；非年报「上期」行资产负债表科目为空 / 0（占位）
INDICATOR = {"resultcode": 200, "records": [
    {"SECCODE": "600519", "F069D": "2023-12-31", "ENDDATE": "2023-12-31", "STARTDATE": "2023-01-01", "F070V": "071001",
     "F071V": "合并本期", "F001V": "033003", "F002V": "定期报告", "F089N": 147693604994.14, "F102N": 74734071550.75,
     "F103N": 74752564425.52, "F105N": 66593247721.09, "F118N": 272699660092.25, "F121N": 49043190797.43,
     "F122N": 1256197800.0, "F128N": 223656469294.82, "F129N": 215668571607.43},
    {"SECCODE": "600519", "F069D": "2025-03-31", "ENDDATE": "2024-03-31", "STARTDATE": "2024-01-01", "F070V": "071002",
     "F071V": "合并上期", "F001V": "033003", "F002V": "定期报告", "F102N": 24070000000.0, "F105N": 9187422000.0,
     "F118N": None, "F121N": None, "F122N": None, "F128N": None, "F129N": 0.0},
    {"SECCODE": "600519", "F069D": "2001-06-30", "ENDDATE": "2001-06-30", "STARTDATE": "2001-01-01", "F070V": "071001",
     "F071V": "合并本期", "F001V": "033001", "F002V": "招募说明书", "F102N": 223407900.0, "F118N": 1214455000.0},
]}

# 新浪 getFinanceReport2022 节选（退市股 000418）：2019Q1 为本期报告；2017 年报的 publish_date 是 2018 年报的公告日
SINA_LRB = {"result": {"status": {"code": 0}, "data": {"report_count": "2", "report_list": {
    "20190331": {"rType": "合并期末", "data_source": "定期报告", "publish_date": "20190427", "data": [
        {"item_field": "BIZINCO", "item_value": "7359616847.470000"},
        {"item_field": "BIZCOST", "item_value": "5228073476.410000"},
        {"item_field": "PARENETP", "item_value": "603252543.540000"},
        {"item_field": "INTEINCO", "item_value": None}]},
    "20171231": {"rType": "合并期末", "data_source": "定期报告", "publish_date": "20190330", "data": [
        {"item_field": "BIZINCO", "item_value": "21385000000.00"},
        {"item_field": "PARENETP", "item_value": "1492000000.00"}]},
}}}}
SINA_FZB = {"result": {"status": {"code": 0}, "data": {"report_list": {
    "20181231": {"rType": "合并期末", "data_source": "定期报告", "publish_date": "20190427", "data": [
        {"item_field": "TOTASSET", "item_value": "23561899125.85"},
        {"item_field": "PARESHARRIGH", "item_value": "8312062507.53"}]},
}}}}

DAYS = pd.bdate_range("2001-01-01", "2026-11-26")


def _cn_raw():
    return pd.concat([cn_fin.parse_cninfo(INCOME, "income"), cn_fin.parse_cninfo(INDICATOR, "indicator")],
                     ignore_index=True)


# ---------------- 解析 ----------------
def test_parse_cninfo_income_keeps_consolidated_only():
    d = cn_fin.parse_cninfo(INCOME, "income")
    assert set(d["type_code"]) == {"071001", "071002"}
    assert set(d["item"]) == set(cn_fin.INCOME_FIELDS.values())
    r = d[(d["item"] == "net_income_parent") & (d["report_period"] == T("2023-12-31")) & (d["type_code"] == "071001")]
    assert len(r) == 1 and r["value"].iloc[0] == pytest.approx(74734071550.75)
    assert r["declare_date"].iloc[0] == T("2024-04-03") and r["period_start"].iloc[0] == T("2023-01-01")


def test_parse_cninfo_indicator_drops_placeholder_balance_items():
    d = cn_fin.parse_cninfo(INDICATOR, "indicator")
    up = d[d["source_report"] == T("2025-03-31")]
    assert set(up["item"]) == {"net_income_parent", "cfo"}          # 上期行的 0 / 空资产负债表科目全部丢弃
    fy = d[(d["source_report"] == T("2023-12-31"))].set_index("item")["value"]
    assert fy["total_equity_parent"] == pytest.approx(215668571607.43) and fy["share_capital"] == 1256197800.0
    assert d.loc[d["item"] == "total_assets", "period_start"].isna().all()


def test_parse_cninfo_empty_payload():
    assert cn_fin.parse_cninfo({"records": []}, "income").empty
    assert cn_fin.parse_cninfo({"records": [{"SECCODE": "600000", "F002V": "071003"}]}, "income").empty


def test_parse_sina_and_paper_code():
    d = cn_fin.parse_sina(SINA_LRB, "lrb", "000418")
    assert set(d["item"]) == {"revenue", "cost_of_revenue", "net_income_parent"}
    assert d["publish_date"].min() == T("2019-03-30")
    assert cn_fin.sina_paper_code("600519") == "sh600519"
    assert cn_fin.sina_paper_code("000418") == "sz000418"
    assert cn_fin.sina_paper_code("920002") == "bj920002"
    assert cn_fin.sina_paper_code("832317") == "bj832317"


# ---------------- 公告日与生效日 ----------------
def test_announce_dates_indicator_borrows_declare_and_placeholder_falls_back():
    d = cn_fin.announce_dates(_cn_raw())
    cfo = d[(d["item"] == "cfo") & (d["source_report"] == T("2023-12-31"))]
    assert cfo["announce_date"].iloc[0] == T("2024-04-03") and cfo["announce_rule"].iloc[0] == "declared_same_report"
    old = d[(d["source_report"] == T("2001-12-31")) & (d["item"] == "revenue")]
    assert old["announce_date"].iloc[0] == T("2002-04-30") and old["announce_rule"].iloc[0] == "statutory_deadline"
    pros = d[(d["source_report"] == T("2001-06-30"))]
    assert (pros["announce_date"] == T("2001-08-31")).all() and (pros["announce_rule"] == "statutory_deadline").all()


def test_next_trading_day_strictly_after_and_beyond_calendar():
    days = pd.DatetimeIndex(["2024-04-01", "2024-04-02", "2024-04-08"])
    s = pd.Series([T("2024-04-01"), T("2024-04-03"), T("2024-04-08"), pd.NaT])
    out = cn_fin.next_trading_day(s, days)
    assert out.iloc[0] == T("2024-04-02") and out.iloc[1] == T("2024-04-08")
    assert out.iloc[2] == T("2024-04-09")          # 日历外 → 下一个工作日
    assert pd.isna(out.iloc[3])
    early = cn_fin.next_trading_day(pd.Series([T("1997-04-30")]), days)
    assert early.iloc[0] == T("1997-05-01")        # 早于日历起点也按工作日，不挤到日历第一天


# ---------------- 组装 ----------------
def test_assemble_versions_restated_and_dedup():
    fin = cn_fin.assemble(_cn_raw(), pd.DataFrame(), DAYS)
    nip = fin[(fin["item"] == "net_income_parent") & (fin["report_period"] == T("2024-03-31"))]
    assert nip["version"].tolist() == [1, 2] and nip["is_restated"].tolist() == [False, True]
    assert nip["avail_date"].tolist() == [T("2024-04-29"), T("2025-05-01")]
    assert nip["value_basis"].tolist() == ["as_reported", "restated"]
    # 2023 年报的对比数与原值相同 → 不另记版本
    fy = fin[(fin["item"] == "net_income_parent") & (fin["report_period"] == T("2023-12-31"))]
    assert len(fy) == 1 and not fy["is_restated"].iloc[0]
    assert fy["avail_date"].iloc[0] == T("2024-04-04") and fy["period_deadline"].iloc[0] == T("2024-04-30")
    # 利润表与指标表重合的科目只保留一条（利润表优先）
    rev = fin[(fin["item"] == "revenue") & (fin["report_period"] == T("2023-12-31"))]
    assert len(rev) == 1 and rev["source_table"].iloc[0] == "p_stock2301"
    assert list(fin.columns) == cn_fin.FIN_COLUMNS


def test_gross_profit_derived_only_with_cost():
    fin = cn_fin.assemble(_cn_raw(), pd.DataFrame(), DAYS)
    gp = fin[(fin["item"] == "gross_profit") & (fin["report_period"] == T("2023-12-31"))]
    assert gp["value"].iloc[0] == pytest.approx(147693604994.14 - 11867273851.78)
    raw = _cn_raw()
    raw = raw[raw["item"] != "cost_of_revenue"]
    assert not (cn_fin.assemble(raw, pd.DataFrame(), DAYS)["item"] == "gross_profit").any()


def test_sina_rows_as_published_vs_later_version():
    s = pd.concat([cn_fin.parse_sina(SINA_LRB, "lrb", "000418"), cn_fin.parse_sina(SINA_FZB, "fzb", "000418")])
    fin = cn_fin.assemble(pd.DataFrame(), s, DAYS)
    q1 = fin[(fin["report_period"] == T("2019-03-31")) & (fin["item"] == "net_income_parent")].iloc[0]
    assert q1["value_basis"] == "as_published" and not q1["is_restated"] and q1["announce_date"] == T("2019-04-27")
    assert q1["period_start"] == T("2019-01-01")
    fy17 = fin[(fin["report_period"] == T("2017-12-31")) & (fin["item"] == "revenue")].iloc[0]
    assert fy17["value_basis"] == "later_version" and fy17["is_restated"]
    assert fy17["announce_date"] == T("2019-03-30")              # 不往前挪到 2018-04-30
    assert fy17["period_deadline"] == T("2018-04-30")
    ta = fin[fin["item"] == "total_assets"].iloc[0]
    assert pd.isna(ta["period_start"]) and ta["value_basis"] == "as_published"
    assert (fin.loc[fin["item"] == "gross_profit", "report_period"] == T("2019-03-31")).all()


def test_assemble_prefers_cninfo_and_filters_sina_codes():
    s = cn_fin.parse_sina(SINA_LRB, "lrb", "000418")
    s2 = s.assign(code="600519")
    fin = cn_fin.assemble(_cn_raw(), pd.concat([s, s2]), DAYS, sina_only_codes={"000418"})
    assert set(fin.loc[fin["source"] == "sina", "code"]) == {"000418"}
    assert set(fin.loc[fin["code"] == "600519", "source"]) == {"cninfo"}
    fin2 = cn_fin.assemble(_cn_raw(), s, DAYS, sina_only_codes=set())
    assert (fin2["source"] == "cninfo").all()


def test_asof_picks_latest_known_version():
    fin = cn_fin.assemble(_cn_raw(), pd.DataFrame(), DAYS)
    a = cn_fin.asof(fin, "2024-12-31", "net_income_parent")
    assert a.loc[a["report_period"] == T("2024-03-31"), "value"].iloc[0] == pytest.approx(24065000000.0)
    b = cn_fin.asof(fin, "2025-05-01", "net_income_parent")
    assert b.loc[b["report_period"] == T("2024-03-31"), "value"].iloc[0] == pytest.approx(24070000000.0)
    assert cn_fin.asof(fin, "2024-04-03", "net_income_parent")["report_period"].max() == T("2001-12-31")


def test_vintages_same_day_prefers_original():
    base = dict(code="1", report_period=T("2020-12-31"), item="x", announce_date=T("2021-04-01"))
    d = pd.DataFrame([{**base, "value": 2.0, "is_restated": True, "avail_date": T("2021-04-02")},
                      {**base, "value": 1.0, "is_restated": False, "avail_date": T("2021-04-02")}])
    v = cn_fin.vintages(d)
    assert len(v) == 1 and v["value"].iloc[0] == 1.0 and v["version"].iloc[0] == 1


# ---------------- 读取与锁箱 ----------------
def test_load_fin_pit_truncates_lockbox(tmp_path, monkeypatch):
    monkeypatch.setenv("FACTORLAB_DATA", str(tmp_path))
    fin = cn_fin.assemble(_cn_raw(), pd.DataFrame(), DAYS)
    fin.to_parquet(cn_fin.fin_path(), index=False)
    cut = T(json.loads(cn_fin.store.LOCKBOX_FILE.read_text())["markets"]["cn"]["start"])
    vis = cn_fin.load_fin_pit()
    assert (vis["avail_date"] < cut).all() and len(vis) < len(fin)
    assert len(cn_fin.load_fin_pit(raw=True)) == len(fin)
    assert set(cn_fin.load_fin_pit(items=["cfo"], raw=True)["item"]) == {"cfo"}


# ---------------- 请求与缓存 ----------------
def test_cninfo_fetch_caches_and_rejects_errors(tmp_path, monkeypatch):
    monkeypatch.setenv("FACTORLAB_DATA", str(tmp_path))
    c = http.Client("cn")
    monkeypatch.setitem(http._DEFAULT, "cn", c)
    monkeypatch.setattr(cn_pit, "cninfo_key", lambda: "k")
    calls = []

    def fake_fetch(url, params=None, headers=None):
        calls.append((url, params))
        if params["scode"] == "000001":
            return b'{"resultmsg":"RequestCheckFilter","resultcode":402}'
        return json.dumps(INCOME).encode()

    monkeypatch.setattr(c, "fetch", fake_fetch)
    j1 = cn_fin.cninfo_fetch("income", "600519")
    j2 = cn_fin.cninfo_fetch("income", "600519")
    assert j1 == j2 and len(calls) == 1 and calls[0][0].endswith("/p_stock2301")
    assert (tmp_path / "cn" / "raw" / "fin" / "cninfo" / "income" / "600519.json").exists()
    with pytest.raises(http.HttpError):
        cn_fin.cninfo_fetch("income", "000001")
    assert not (tmp_path / "cn" / "raw" / "fin" / "cninfo" / "income" / "000001.json").exists()


def test_sina_fetch_params_and_cache(tmp_path, monkeypatch):
    monkeypatch.setenv("FACTORLAB_DATA", str(tmp_path))
    c = http.Client("cn")
    monkeypatch.setitem(http._DEFAULT, "cn", c)
    calls = []
    monkeypatch.setattr(c, "fetch", lambda url, params=None, headers=None: calls.append(params) or json.dumps(SINA_LRB).encode())
    cn_fin.sina_fetch("lrb", "000418")
    cn_fin.sina_fetch("lrb", "000418")
    assert len(calls) == 1 and calls[0]["paperCode"] == "sz000418" and calls[0]["source"] == "lrb"
    monkeypatch.setattr(c, "fetch", lambda *a, **k: b'{"result":{"status":{"code":1}}}')
    with pytest.raises(http.HttpError):
        cn_fin.sina_fetch("fzb", "000418")


def test_build_from_cache(tmp_path, monkeypatch):
    monkeypatch.setenv("FACTORLAB_DATA", str(tmp_path))
    sec = pd.DataFrame({"code": ["600519", "000418"], "name": ["a", "b"], "market": "cn", "exchange": ["SSE", "SZSE"],
                        "board": "主板", "list_date": [T("2001-08-27"), T("1997-03-28")],
                        "delist_date": [pd.NaT, T("2019-06-21")], "status": ["listed", "delisted"],
                        "currency": "CNY", "source": "t"})
    cn_fin.store.write_securities("cn", sec)
    for rel, payload in [(cn_fin.cache_rel("cninfo", "income", "600519"), INCOME),
                         (cn_fin.cache_rel("cninfo", "indicator", "600519"), INDICATOR),
                         (cn_fin.cache_rel("sina", "lrb", "000418"), SINA_LRB)]:
        p = http.raw_dir("cn") / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(payload))
    rep = cn_fin.build()
    assert rep["codes"] == 2 and rep["codes_by_source"] == {"cninfo": 1, "sina": 1}
    fin = cn_fin.load_fin_pit(raw=True)
    assert fin["avail_date"].notna().all() and (fin["avail_date"] > fin["announce_date"]).all()
    cov = cn_fin.coverage_by_year(fin, sec, years=[2018, 2023])
    assert cov[2018]["delisted"]["expected"] == 1 and cov[2018]["delisted"]["have"] == 0
    assert cov[2023]["listed"] == {"expected": 1, "have": 1, "share": 1.0}
    assert cn_fin.meta_path().exists()


def test_hashed_order_is_stable_permutation():
    codes = [f"{i:06d}" for i in range(50)]
    o = cn_fin.hashed_order(codes)
    assert sorted(o) == codes and o != codes and o == cn_fin.hashed_order(list(reversed(codes)))


def test_fetch_backs_off_on_403_then_stops(monkeypatch):
    calls, sleeps = [], []
    monkeypatch.setattr(cn_fin, "_sleep", lambda s: sleeps.append(s))

    def fake(table, code, refresh=False, market="cn"):
        calls.append((table, code))
        if code == "000001" and len([c for c in calls if c[1] == "000001"]) == 1:
            raise http.HttpStatusError("HTTP 403: x")          # 第一次 403，等待后重试成功
        if code.startswith("9"):
            raise http.HttpStatusError("HTTP 403: x")          # 一直 403
        return {"records": [{"x": 1}]}

    monkeypatch.setattr(cn_fin, "cninfo_fetch", fake)
    out = cn_fin.fetch(["000001", "000002"], [], tables=("income",), backoff=(1,))
    assert out["failed"] == [] and out["forbidden_waits"] == 1 and sleeps == [1] and len(calls) == 3
    out = cn_fin.fetch(["900001", "900002", "900003", "000002"], [], tables=("income",), backoff=(1,), max_consec_fail=2)
    assert out["stopped_early"] and len(out["failed"]) == 2 and ("income", "000002") not in calls[-1:]
