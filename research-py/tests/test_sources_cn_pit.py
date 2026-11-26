"""A 股点时补充数据（cn_pit）的离线单元测试：夹具按巨潮 webapi 实际返回的字段结构内嵌在本文件，不联网。"""

from __future__ import annotations

import json

import numpy as np
import pandas as pd
import pytest

from factorlab.sources import cn, cn_pit, http

T = pd.Timestamp

# 巨潮 p_stock2117（上市状态变动）节选：600766 园城黄金（实测记录）+ 合成的北交所新旧代码 + 恢复上市组合事件
STATUS = {"resultcode": 200, "records": [
    {"SECCODE": "600766", "ORGNAME": "烟台华联", "F006V": "新股上市", "F004V": None, "DECLAREDATE": "1996-10-28", "VARYDATE": "1996-10-28"},
    {"SECCODE": "600766", "ORGNAME": "烟台华联", "F006V": "戴帽", "F004V": "两年亏损", "DECLAREDATE": "2003-04-28", "VARYDATE": "2003-04-29"},
    {"SECCODE": "600766", "ORGNAME": "烟台华联", "F006V": "披*", "F004V": None, "DECLAREDATE": "2006-02-28", "VARYDATE": "2006-03-01"},
    {"SECCODE": "600766", "ORGNAME": "烟台华联", "F006V": "摘*摘帽", "F004V": None, "DECLAREDATE": "2007-03-29", "VARYDATE": "2007-03-30"},
    {"SECCODE": "600766", "ORGNAME": "烟台园城", "F006V": "戴帽披*", "F004V": None, "DECLAREDATE": "2021-04-23", "VARYDATE": "2021-04-26"},
    {"SECCODE": "600766", "ORGNAME": "烟台园城", "F006V": "摘*", "F004V": None, "DECLAREDATE": "2022-09-14", "VARYDATE": "2022-09-15"},
    {"SECCODE": "600766", "ORGNAME": "烟台园城", "F006V": "退市整理", "F004V": None, "DECLAREDATE": "2024-05-29", "VARYDATE": "2024-06-05"},
    {"SECCODE": "600766", "ORGNAME": "烟台园城", "F006V": "终止上市", "F004V": None, "DECLAREDATE": "2024-06-25", "VARYDATE": "2024-06-26"},
    {"SECCODE": "600001", "ORGNAME": "某钢铁", "F006V": "戴帽披*", "F004V": None, "DECLAREDATE": "2010-04-01", "VARYDATE": "2010-04-02"},
    {"SECCODE": "600001", "ORGNAME": "某钢铁", "F006V": "暂停上市", "F004V": None, "DECLAREDATE": "2011-05-01", "VARYDATE": "2011-05-03"},
    {"SECCODE": "600001", "ORGNAME": "某钢铁", "F006V": "恢复上市,摘*", "F004V": None, "DECLAREDATE": "2012-06-01", "VARYDATE": "2012-06-04"},
    {"SECCODE": "830001", "ORGNAME": "北交甲股份有限公司", "F006V": "新股上市", "F004V": None, "DECLAREDATE": "2021-11-15", "VARYDATE": "2021-11-15"},
    {"SECCODE": "830001", "ORGNAME": "北交甲股份有限公司", "F006V": "戴帽", "F004V": None, "DECLAREDATE": "2024-04-29", "VARYDATE": "2024-04-30"},
    {"SECCODE": "920001", "ORGNAME": "北交甲股份有限公司", "F006V": "摘帽", "F004V": None, "DECLAREDATE": "2025-05-06", "VARYDATE": "2025-05-07"},
    {"SECCODE": "600000", "ORGNAME": "浦发银行", "F006V": "新股上市", "F004V": None, "DECLAREDATE": "1999-11-10", "VARYDATE": "1999-11-10"},
]}

# 巨潮 p_stock2110（行业归属变动）节选：600000 实测记录 + 一条合成的申万 2021 回填记录
INDUSTRY = {"resultcode": 200, "records": [
    {"SECCODE": "600000", "F001V": "008018", "F002V": "申银万国行业分类标准(旧)", "VARYDATE": "1999-11-10", "F003V": "S440101",
     "F004V": "金融服务", "F005V": "银行", "F006V": "银行", "F007V": "银行", "F008C": "0"},
    {"SECCODE": "600000", "F001V": "008018", "F002V": "申银万国行业分类标准(旧)", "VARYDATE": "2008-06-02", "F003V": "S480101",
     "F004V": "银行", "F005V": "银行", "F006V": "银行", "F007V": "银行", "F008C": "1"},
    {"SECCODE": "600000", "F001V": "008003", "F002V": "申银万国行业分类标准", "VARYDATE": "2021-07-30", "F003V": "S480301",
     "F004V": "银行", "F005V": "股份制银行Ⅱ", "F006V": "股份制银行Ⅲ", "F007V": "股份制银行Ⅲ", "F008C": "1"},
    {"SECCODE": "600000", "F001V": "008021", "F002V": "证监会行业分类标准（2012）", "VARYDATE": "1999-11-10", "F003V": "J66",
     "F004V": "金融业", "F005V": None, "F006V": "货币金融服务", "F007V": None, "F008C": "1"},
]}
INDUSTRY_BACKFILL = {"resultcode": 200, "records": [
    {"SECCODE": "920000", "F001V": "008003", "F002V": "申银万国行业分类标准", "VARYDATE": "2020-12-23", "F003V": "S280203",
     "F004V": "汽车", "F005V": "汽车零部件", "F006V": "底盘与发动机系统", "F007V": "底盘与发动机系统", "F008C": "1"},
]}

# 巨潮 p_stock2215（公司股本变动）节选，单位万股：送转（公告早于变动）、增发（公告晚于变动）、晚到的旧定期报告快照
SHARES = {"resultcode": 200, "records": [
    {"SECCODE": "600999", "DECLAREDATE": None, "VARYDATE": "2019-12-31", "F002V": "定期报告", "F003N": 10000.0, "F021N": 8000.0, "F022N": 8000.0, "F023N": None, "F024N": None},
    {"SECCODE": "600999", "DECLAREDATE": "2020-05-20", "VARYDATE": "2020-06-01", "F002V": "送股,转增", "F003N": 15000.0, "F021N": 12000.0, "F022N": 12000.0, "F023N": None, "F024N": None},
    {"SECCODE": "600999", "DECLAREDATE": "2020-07-10", "VARYDATE": "2020-07-06", "F002V": "增发新股上市", "F003N": 16000.0, "F021N": 12000.0, "F022N": 12000.0, "F023N": None, "F024N": None},
    {"SECCODE": "600999", "DECLAREDATE": "2020-08-25", "VARYDATE": "2020-06-30", "F002V": "定期报告", "F003N": 15000.0, "F021N": 12000.0, "F022N": 12000.0, "F023N": None, "F024N": None},
]}


# ---------------- ST ----------------
def test_st_intervals_state_machine():
    ev = cn_pit.parse_status_changes(STATUS)
    iv = cn_pit.st_intervals(ev)
    a = iv[iv["code"] == "600766"].reset_index(drop=True)
    assert list(a["flag"]) == ["ST", "*ST", "*ST", "ST", "delisting"]
    assert a.loc[0, "start_date"] == T("2003-04-29") and a.loc[0, "end_date"] == T("2006-02-28")
    assert a.loc[1, "end_date"] == T("2007-03-29")          # 摘*摘帽 当日起恢复正常
    assert a.loc[4, "start_date"] == T("2024-06-05") and a.loc[4, "end_date"] == T("2024-06-25")
    # 暂停上市不改状态；「恢复上市,摘*」= *ST → ST
    b = iv[iv["code"] == "600001"].reset_index(drop=True)
    assert list(b["flag"]) == ["*ST", "ST"]
    assert b.loc[0, "end_date"] == T("2012-06-03") and pd.isna(b.loc[1, "end_date"])
    assert "600000" not in set(iv["code"])


def test_bse_code_map_by_org():
    ev = cn_pit.parse_status_changes(STATUS)
    m = cn_pit.bse_code_map(ev)
    assert m == {"830001": "920001"}
    iv = cn_pit.st_intervals(ev, m)
    c = iv[iv["code"] == "920001"]
    assert len(c) == 1 and c["flag"].iloc[0] == "ST"
    assert c["start_date"].iloc[0] == T("2024-04-30") and c["end_date"].iloc[0] == T("2025-05-06")


def test_st_flags_pit_lookup_and_coverage():
    ev = cn_pit.parse_status_changes(STATUS)
    iv = cn_pit.st_intervals(ev, cn_pit.bse_code_map(ev))
    q = pd.DataFrame({"code": ["600766", "600766", "600766", "600766", "600000", "601111", "920001"],
                      "date": [T("2003-04-28"), T("2003-04-29"), T("2006-06-01"), T("2024-06-10"),
                               T("2020-01-02"), T("2020-01-02"), T("2024-12-31")]}, index=[10, 11, 12, 13, 14, 15, 16])
    covered = {"600766", "600000", "920001"}
    s = cn_pit.st_flags_pit(q, iv, covered)
    assert list(s.index) == list(q.index)
    assert s.tolist()[:5] == [False, True, True, False, False]   # 退市整理期不算 ST（主板 10%）
    assert pd.isna(s.loc[15])                                     # 不在巨潮状态表 → 未知
    assert bool(s.loc[16]) is True


# ---------------- 行业 ----------------
def test_industry_intervals_and_backfill():
    raw = pd.concat([cn_pit.parse_industry(INDUSTRY), cn_pit.parse_industry(INDUSTRY_BACKFILL)], ignore_index=True)
    iv = cn_pit.industry_intervals(raw)
    sw_old = iv[(iv["code"] == "600000") & (iv["system"] == "sw_old")].reset_index(drop=True)
    assert sw_old.loc[0, "end_date"] == T("2008-06-01") and pd.isna(sw_old.loc[1, "end_date"])
    assert sw_old.loc[1, "level1_code"] == "S48" and sw_old.loc[1, "level1_name"] == "银行"
    csrc = iv[(iv["code"] == "600000") & (iv["system"] == "csrc2012")].iloc[0]
    assert csrc["backfilled"] and csrc["avail_date"] == T("2012-10-26") and csrc["level1_code"] == "J"
    bf = iv[iv["code"] == "920000"].iloc[0]
    assert bf["backfilled"] and bf["avail_date"] == cn_pit.SW2021_START


def test_sw_level1_lookup_switches_on_2021_07_30():
    raw = pd.concat([cn_pit.parse_industry(INDUSTRY), cn_pit.parse_industry(INDUSTRY_BACKFILL)], ignore_index=True)
    iv = cn_pit.industry_intervals(raw)
    q = pd.DataFrame({"code": ["600000"] * 4 + ["920000"] * 2,
                      "date": [T("2005-01-04"), T("2010-01-04"), T("2021-07-29"), T("2021-07-30"),
                               T("2021-01-04"), T("2022-01-04")]})
    s = cn_pit.sw_level1_lookup(q, iv)
    assert s.tolist()[:4] == ["金融服务", "银行", "银行", "银行"]
    assert pd.isna(s.iloc[4])           # 申万 2021 回填记录在标准发布前不用
    assert s.iloc[5] == "汽车"


# ---------------- 总股本 ----------------
def test_statutory_deadline():
    assert cn_pit.statutory_deadline(T("2019-12-31")) == T("2020-04-30")
    assert cn_pit.statutory_deadline(T("2020-03-31")) == T("2020-04-30")
    assert cn_pit.statutory_deadline(T("2020-06-30")) == T("2020-08-31")
    assert cn_pit.statutory_deadline(T("2020-09-30")) == T("2020-10-31")


def test_shares_availability_and_steps():
    d = cn_pit.shares_availability(cn_pit.parse_shares(SHARES))
    assert d["total_shares"].iloc[0] == 1e8                               # 万股 → 股
    assert d["avail_date"].tolist() == [T("2020-05-01"), T("2020-06-01"), T("2020-07-10"), T("2020-08-25")]
    assert d["avail_rule"].tolist() == ["statutory_deadline", "declare", "declare", "declare"]
    st = cn_pit.shares_steps(d)
    # 08-25 才可得的 06-30 定期报告快照（变动日早于 07-06 增发）不覆盖增发后的 1.6 亿股
    assert st["date"].tolist() == [T("2020-05-01"), T("2020-06-01"), T("2020-07-10")]
    assert st["total_shares"].tolist() == [1e8, 1.5e8, 1.6e8]
    q = pd.DataFrame({"code": "600999", "date": [T("2020-04-30"), T("2020-06-01"), T("2020-07-09"), T("2020-09-01")]})
    v = cn_pit.shares_asof(q, st.assign(code="600999"))
    assert np.isnan(v.iloc[0]) and v.iloc[1:].tolist() == [1.5e8, 1.5e8, 1.6e8]


# ---------------- 增补 prices ----------------
def _px_sh_st():
    """合成沪市主板股 600766：2021-04 的 4 天，第 3 天收盘 = 前收 × 1.05（*ST 时应判涨停）。"""
    dates = pd.to_datetime(["2021-04-22", "2021-04-23", "2021-04-26", "2021-04-27"])
    close = np.array([10.00, 10.10, 10.61, 10.40])
    df = pd.DataFrame({"date": dates, "code": "600766", "open": close, "high": close, "low": close, "close": close,
                       "adj_factor": 1.0})
    df["ref_close"] = df["close"].shift()
    lim = cn.compute_limits(df.assign(chg=df["close"] - df["ref_close"]), "主板", T("1996-10-28"), None, 1000)
    for c in cn_pit.LIMIT_COLS:
        df[c] = lim[c]
    df["is_st"] = pd.array([pd.NA] * 4, dtype="boolean")
    return df


def test_augment_prices_sets_st_limits_and_mcap_total():
    px = _px_sh_st()
    assert not bool(px.loc[2, "limit_up"])          # 原口径（10%）不判涨停
    ev = cn_pit.parse_status_changes(STATUS)
    iv = cn_pit.st_intervals(ev)
    shares = cn_pit.shares_availability(cn_pit.parse_shares({"records": [
        {"SECCODE": "600766", "DECLAREDATE": "2021-04-20", "VARYDATE": "2021-04-20", "F002V": "股份回购", "F003N": 31000.0}]}))
    sec = pd.DataFrame({"code": ["600766"], "list_date": [T("1996-10-28")]})
    out, rep = cn_pit.augment_prices(px, sec, iv, {"600766"}, shares, None)
    assert out["is_st"].tolist() == [False, False, True, True]
    assert bool(out.loc[2, "limit_up"]) and out.loc[2, "limit_ratio"] == pytest.approx(0.05)
    assert not bool(out.loc[3, "limit_down"])
    assert out.loc[0, "limit_ratio"] == pytest.approx(0.10)       # is_st 未变的行原样保留
    assert rep["st_rows_changed"] == 2
    assert out["mcap_total"].tolist() == pytest.approx(list(3.1e8 * out["close"]))


# ---------------- 请求与缓存 ----------------
def test_cninfo_get_caches_and_skips_key_on_hit(tmp_path, monkeypatch):
    monkeypatch.setenv("FACTORLAB_DATA", str(tmp_path))
    c = http.Client("cn")
    monkeypatch.setitem(http._DEFAULT, "cn", c)
    keys, calls = [], []
    monkeypatch.setattr(cn_pit, "cninfo_key", lambda: keys.append(1) or "k")

    def fake_fetch(url, params=None, headers=None):
        calls.append((url, params, headers.get("Accept-EncKey")))
        return json.dumps(INDUSTRY).encode()

    monkeypatch.setattr(c, "fetch", fake_fetch)
    j1 = cn_pit.cninfo_get("industry", "600000")
    j2 = cn_pit.cninfo_get("industry", "600000")
    assert j1 == j2 and len(calls) == 1 and len(keys) == 1
    assert calls[0][0].endswith("/p_stock2110") and calls[0][1] == {"scode": "600000"} and calls[0][2] == "k"
    assert (tmp_path / "cn" / "raw" / "pit" / "industry" / "600000.json").exists()


def test_cninfo_get_rejects_error_payload(tmp_path, monkeypatch):
    monkeypatch.setenv("FACTORLAB_DATA", str(tmp_path))
    c = http.Client("cn")
    monkeypatch.setitem(http._DEFAULT, "cn", c)
    monkeypatch.setattr(cn_pit, "cninfo_key", lambda: "k")
    monkeypatch.setattr(c, "fetch", lambda *a, **k: b'{"resultmsg":"RequestCheckFilter","resultcode":402}')
    with pytest.raises(http.HttpError):
        cn_pit.cninfo_get("shares", "600000")
    assert not (tmp_path / "cn" / "raw" / "pit" / "shares" / "600000.json").exists()
