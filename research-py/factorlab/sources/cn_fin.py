"""A 股点时（PIT）财报：利润表 / 资产负债表 / 现金流关键科目，带公告日与原始 / 重述版本。

命令行：
    uv run python -m factorlab.sources.cn_fin fetch --limit 100      # 试下载（分层抽样，含约 10% 退市股）
    uv run python -m factorlab.sources.cn_fin fetch                  # 全量（断点续传；顺序按 sha256(代码) 打散）
    uv run python -m factorlab.sources.cn_fin fetch --sina-codes 600519,601318,600036   # 第二来源（核对用）
    uv run python -m factorlab.sources.cn_fin build                  # 写 {root}/cn/fin_pit.parquet
    uv run python -m factorlab.sources.cn_fin audit                  # 覆盖率、公告日质量、与新浪核对（JSON）

数据源：
- 当前上市股：巨潮资讯数据中心 webapi.cninfo.com.cn（深交所旗下；请求头 Accept-EncKey 的算法同 cn_pit）。
  每只 2 次请求（默认表）：
    stock/p_stock2301?scode=  个股报告期利润表（含公告日 DECLAREDATE、本期 / 上期）
    stock/p_stock2303?scode=  个股报告期指标表（含资产负债表合计项、经营现金流；无公告日，按来源报告并入利润表的公告日）
  可选：p_stock2300 资产负债表、p_stock2302 现金流量表（--tables 指定；字段与指标表重合，只作核对）。
  巨潮对退市股返回空（逐只与全表增量接口都已核实），所以退市股走新浪。
- 退市股（以及 --sina-codes 指定的核对样本）：新浪财经
    quotes.sina.cn/cn/api/openapi.php/CompanyFinanceService.getFinanceReport2022?paperCode=&source=lrb|fzb|llb
  每只 3 次请求。新浪每个报告期只给一个值，publish_date 是「最近一份含该期数据的报告」的公告日
  （例如 2023 年报数据的 publish_date 常是 2024 年报的公告日），数值也是那份报告里的（可能已重述）。

点时口径（PIT）：
1. 巨潮的每条记录 = 某份报告（F001D / F069D = 来源报告期）里披露的某期数据（ENDDATE）。
   类型 071001「合并本期」= 该期首次披露的原值；071002「合并上期」= 下一年同期报告里的对比数（重述值，
   is_restated=True）。两者都保留，按各自来源报告的公告日生效，从不覆盖历史。母公司报表（071003/4）不用。
2. 公告日 announce_date = 来源报告的 DECLAREDATE；缺失或不晚于来源报告期末（早年记录有这种占位日期）时，
   改用法定披露截止日（一季报 4/30、半年报 8/31、三季报 10/31、年报次年 4/30），announce_rule 记录用了哪种。
3. 生效日 avail_date = announce_date 之后第一个交易日（公告时间不详，盘中 / 盘后都按次日；交易日取自 prices）。
   引擎在调仓日 t 只能用 avail_date ≤ t 的行。
4. 新浪：publish_date ≤ 本期法定截止日 + 120 天 → 视为本期报告的原值（value_basis='as_published'），
   否则是之后报告里的版本（value_basis='later_version'，is_restated=True），一律按 publish_date 生效，不往前挪。
   period_deadline 列给出本期法定截止日，需要「按截止日回填后来版本」的研究可以显式改用（有重述前视，自行承担）。
5. 同一 (code, report_period, item) 的后来版本若数值与此前最新值相同，丢弃（与 sec.vintages 同口径）。
6. 利润表、现金流科目是年初至今累计（一季报 3 个月、半年报 6 个月、三季报 9 个月、年报 12 个月），
   period_start 给出起点；单季 / TTM 由因子自行差分。
7. 读取：load_fin_pit() 默认截掉 avail_date ≥ 锁箱起点的行（与 store.read_prices 一致），raw=True 才给全部。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from .. import store
from . import cn, cn_pit, http

MARKET = "cn"
FIN_SUBDIR = "fin"
CNINFO_API = cn_pit.CNINFO_API
CNINFO_TABLES = {"income": "p_stock2301", "indicator": "p_stock2303", "balance": "p_stock2300", "cashflow": "p_stock2302"}
DEFAULT_TABLES = ("income", "indicator")
SINA_URL = "https://quotes.sina.cn/cn/api/openapi.php/CompanyFinanceService.getFinanceReport2022"
SINA_SOURCES = ("lrb", "fzb", "llb")
SOURCE = ("cninfo webapi (p_stock2301 利润表 + p_stock2303 指标表；当前上市股) | "
          "sina getFinanceReport2022 (lrb/fzb/llb；退市股)")

# 巨潮记录类型：本期（原值）/ 上期（下一年报告里的对比数）
TYPE_ORIGINAL, TYPE_RESTATED = "071001", "071002"
# 来源文件类型（F004V / F001V）：定期报告以外多是上市前文件（招股、预披露、上市公告书、北交所转让说明书），
# 只影响上市前的报告期；「更正或补充」作为之后的新版本保留
DOC_TYPES = {"033001": "prospectus", "033002": "listing_notice", "033003": "periodic", "033005": "interim_notice",
             "033006": "transfer_prospectus", "033008": "ipo_predisclosure", "033013": "other",
             "033016": "correction", "033020": "audit_report"}

# ---- 字段映射（按贵州茅台 2023 年报、平安银行 2023 年报实测数值对齐，见 DATA-CN-HK.md 第十一节） ----
INCOME_FIELDS = {          # p_stock2301
    "F006N": "revenue",                 # 营业收入
    "F035N": "revenue_total",           # 营业总收入（含利息、手续费等，金融类公司与营业收入不同）
    "F007N": "cost_of_revenue",         # 营业成本
    "F018N": "operating_profit",        # 营业利润
    "F024N": "total_profit",            # 利润总额
    "F027N": "net_income",              # 净利润（含少数股东损益）
    "F028N": "net_income_parent",       # 归属于母公司所有者的净利润
    "F031N": "eps_basic",               # 基本每股收益（元）
}
INDICATOR_FIELDS = {       # p_stock2303（与利润表重合的科目只在利润表缺行时补用）
    "F089N": "revenue", "F090N": "cost_of_revenue", "F097N": "operating_profit", "F100N": "total_profit",
    "F101N": "net_income", "F102N": "net_income_parent",
    "F103N": "net_income_parent_deducted",   # 扣除非经常性损益后的归母净利润
    "F105N": "cfo",                          # 经营活动产生的现金流量净额
    "F118N": "total_assets", "F121N": "total_liabilities",
    "F122N": "share_capital",                # 实收资本（股本），元；面值 1 元时 ≈ 总股本（股）
    "F128N": "total_equity", "F129N": "total_equity_parent",
}
BALANCE_FIELDS = {"F038N": "total_assets", "F061N": "total_liabilities", "F062N": "share_capital",
                  "F070N": "total_equity", "F073N": "total_equity_parent"}   # p_stock2300
CASHFLOW_FIELDS = {"F015N": "cfo"}                                          # p_stock2302
SINA_FIELDS = {
    "lrb": {"BIZINCO": "revenue", "BIZTOTINCO": "revenue_total", "BIZCOST": "cost_of_revenue",
            "PERPROFIT": "operating_profit", "TOTPROFIT": "total_profit", "NETPROFIT": "net_income",
            "PARENETP": "net_income_parent", "BASICEPS": "eps_basic"},
    "fzb": {"TOTASSET": "total_assets", "TOTLIAB": "total_liabilities", "PAIDINCAPI": "share_capital",
            "RIGHAGGR": "total_equity", "PARESHARRIGH": "total_equity_parent"},
    "llb": {"MANANETR": "cfo"},
}
SINA_DOC_TYPES = {"定期报告": "periodic", "招股说明书/意向书": "prospectus", "招股说明书(申报稿)": "ipo_predisclosure",
                  "更正或补充": "correction", "其他": "other"}
STOCK_ITEMS = {"total_assets", "total_liabilities", "share_capital", "total_equity", "total_equity_parent"}
ITEMS = ["revenue", "revenue_total", "cost_of_revenue", "gross_profit", "operating_profit", "total_profit",
         "net_income", "net_income_parent", "net_income_parent_deducted", "eps_basic", "cfo",
         "total_assets", "total_liabilities", "total_equity", "total_equity_parent", "share_capital"]
# 同一 (code, 报告期, 科目, 来源报告, 版本) 多表都有时的优先级（小者优先）
TABLE_PRIORITY = {"income": 0, "balance": 1, "cashflow": 2, "indicator": 3, "lrb": 0, "fzb": 0, "llb": 0}
SINA_ASPUBLISHED_GRACE = pd.Timedelta("120D")

FIN_COLUMNS = ["code", "report_period", "period_start", "item", "value", "announce_date", "avail_date",
               "announce_rule", "period_deadline", "is_restated", "value_basis", "version", "source",
               "source_table", "source_report", "doc_type"]


# ---------------- 下载 ----------------
def cache_rel(source: str, table: str, code: str) -> str:
    """缓存文件相对 {root}/cn/raw/ 的路径。"""
    return f"{FIN_SUBDIR}/{source}/{table}/{code}.json"


def cninfo_fetch(table: str, code: str, refresh: bool = False, market: str = MARKET) -> dict:
    """巨潮一张表、一只股票的全部历史（带磁盘缓存；只缓存 resultcode == 200 的响应）。"""
    rel = cache_rel("cninfo", table, code)
    p = http.raw_dir(market) / rel
    if p.exists() and p.stat().st_size > 0 and not refresh:
        return http.parse_json(p.read_bytes())
    headers = {"Accept-EncKey": cn_pit.cninfo_key(), "Origin": "https://webapi.cninfo.com.cn",
               "Referer": "https://webapi.cninfo.com.cn/", "X-Requested-With": "XMLHttpRequest"}
    body = http.client(market).get(CNINFO_API + CNINFO_TABLES[table], {"scode": code}, headers=headers,
                                   cache_file=rel, max_age=0 if refresh else None, validate=cn_pit._cninfo_ok)
    j = http.parse_json(body)
    if j.get("resultcode") != 200:
        raise http.HttpError(f"巨潮 {CNINFO_TABLES[table]} {code}: {j.get('resultmsg')}")
    return j


def sina_paper_code(code: str) -> str:
    code = str(code)
    if code.startswith(("6", "9")) and not code.startswith("920"):
        return "sh" + code
    if code.startswith(("4", "8", "920")):
        return "bj" + code
    return "sz" + code


def _sina_ok(body: bytes) -> bool:
    try:
        j = http.parse_json(body)
        return (j.get("result") or {}).get("status", {}).get("code") == 0
    except (ValueError, AttributeError):
        return False


def sina_fetch(source: str, code: str, refresh: bool = False, market: str = MARKET) -> dict:
    """新浪一张报表（lrb 利润表 / fzb 资产负债表 / llb 现金流量表）的全部报告期。"""
    rel = cache_rel("sina", source, code)
    params = {"paperCode": sina_paper_code(code), "source": source, "type": 0, "page": 1, "num": 300}
    body = http.client(market).get(SINA_URL, params, cache_file=rel, max_age=0 if refresh else None, validate=_sina_ok)
    if not _sina_ok(body):
        raise http.HttpError(f"新浪 {source} {code}: 返回异常")
    return http.parse_json(body)


def hashed_order(codes) -> list[str]:
    """按 sha256(代码) 排序：全量下载中途停下时，已下部分是随机样本而不是按代码顺序的一段。"""
    return sorted(codes, key=lambda c: hashlib.sha256(str(c).encode()).hexdigest())


# 巨潮在连续请求约 4,000 次后会间歇返回 HTTP 403（几分钟后自行恢复，实测见 DATA-CN-HK.md 第十一节）：
# 遇到 403 先等待再重试同一项；连续失败越多等得越久，连续 MAX_CONSEC_FAIL 项失败就停下（缓存已落盘，重跑续传）
BACKOFF_403 = (60, 180, 600)
MAX_CONSEC_FAIL = 8


def _sleep(seconds: float) -> None:
    import time

    time.sleep(seconds)


def fetch(cninfo_codes: list[str], sina_codes: list[str], tables=DEFAULT_TABLES, refresh: bool = False,
          progress_every: int = 50, market: str = MARKET, backoff=BACKOFF_403, max_consec_fail: int = MAX_CONSEC_FAIL) -> dict:
    """下载（失败的跳过，重跑同一命令即可续传）。"""
    out = {"failed": [], "empty": {}, "cninfo_codes": len(cninfo_codes), "sina_codes": len(sina_codes),
           "forbidden_waits": 0, "stopped_early": False}
    jobs = [("cninfo", t, c) for c in cninfo_codes for t in tables] + [("sina", s, c) for c in sina_codes for s in SINA_SOURCES]
    t0 = datetime.now()
    consec = 0
    for i, (src, t, code) in enumerate(jobs, 1):
        for attempt in range(len(backoff) + 1):
            try:
                j = cninfo_fetch(t, code, refresh, market) if src == "cninfo" else sina_fetch(t, code, refresh, market)
                n = len(j.get("records") or []) if src == "cninfo" else len(((j.get("result") or {}).get("data") or {}).get("report_list") or {})
                if not n:
                    out["empty"][f"{src}:{t}"] = out["empty"].get(f"{src}:{t}", 0) + 1
                consec = 0
                break
            except http.HttpError as e:
                forbidden = "HTTP 403" in str(e)
                if forbidden and attempt < len(backoff):
                    out["forbidden_waits"] += 1
                    print(f"[cn_fin] {src} {t} {code} 403，等待 {backoff[attempt]} 秒后重试", file=sys.stderr, flush=True)
                    _sleep(backoff[attempt])
                    continue
                out["failed"].append((src, t, code))
                consec += 1
                print(f"[cn_fin] {src} {t} {code} 失败：{e}", file=sys.stderr, flush=True)
                break
        if consec >= max_consec_fail:
            out["stopped_early"] = True
            print(f"[cn_fin] 连续 {consec} 项失败，停止；稍后重跑同一命令续传", file=sys.stderr, flush=True)
            break
        if i % progress_every == 0 or i == len(jobs):
            el = (datetime.now() - t0).total_seconds()
            print(f"[cn_fin] {i}/{len(jobs)} {el:.0f}s http={http.stats()}", file=sys.stderr, flush=True)
    out["seconds"] = round((datetime.now() - t0).total_seconds(), 1)
    return out


# ---------------- 解析 ----------------
def statutory_deadline(period_end) -> pd.Timestamp:
    return cn_pit.statutory_deadline(pd.Timestamp(period_end))


def _num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").astype(float)


def parse_cninfo(payload: dict, table: str, code: str | None = None) -> pd.DataFrame:
    """巨潮一张表 → 长表（一行 = 一条记录的一个科目）。只取合并报表的本期 / 上期。

    列：code, report_period, period_start, item, value, source_report, type_code, doc_code, declare_date, table
    """
    cols = ["code", "report_period", "period_start", "item", "value", "source_report", "type_code", "doc_code",
            "declare_date", "table"]
    recs = payload.get("records") or []
    if not recs:
        return pd.DataFrame(columns=cols)
    d = pd.DataFrame(recs)
    if table == "indicator":
        d = d.rename(columns={"F069D": "source_report", "F070V": "type_code", "F001V": "doc_code"})
        d["declare_date"] = None
        fields = INDICATOR_FIELDS
    else:
        d = d.rename(columns={"F001D": "source_report", "F002V": "type_code", "F004V": "doc_code",
                              "DECLAREDATE": "declare_date"})
        fields = {"income": INCOME_FIELDS, "balance": BALANCE_FIELDS, "cashflow": CASHFLOW_FIELDS}[table]
    for c in ("SECCODE", "ENDDATE", "STARTDATE", "source_report", "type_code", "doc_code", "declare_date"):
        if c not in d:
            d[c] = None
    if code is not None:
        d["SECCODE"] = d["SECCODE"].fillna(code)
    d = d[d["type_code"].isin([TYPE_ORIGINAL, TYPE_RESTATED])].copy()
    if d.empty:
        return pd.DataFrame(columns=cols)
    d["code"] = d["SECCODE"].astype(str).str.zfill(6)
    d["report_period"] = pd.to_datetime(d["ENDDATE"], errors="coerce")
    d["period_start"] = pd.to_datetime(d["STARTDATE"], errors="coerce")
    d["source_report"] = pd.to_datetime(d["source_report"], errors="coerce")
    d["declare_date"] = pd.to_datetime(d["declare_date"], errors="coerce")
    present = [f for f in fields if f in d.columns]
    for f in present:
        d[f] = _num(d[f])
    # 指标表的「上期」行在非年报里资产负债表科目是空值或 0（占位）：资产总计缺失 / ≤ 0 的行丢弃全部时点科目
    if table in ("indicator", "balance"):
        ta = "F118N" if table == "indicator" else "F038N"
        bad = ~(d.get(ta, pd.Series(np.nan, index=d.index)) > 0)
        for f, item in fields.items():
            if item in STOCK_ITEMS and f in d:
                d.loc[bad, f] = np.nan
        if "F122N" in d:
            d.loc[d["F122N"] <= 0, "F122N"] = np.nan
    long = d.melt(id_vars=["code", "report_period", "period_start", "source_report", "type_code", "doc_code",
                           "declare_date"], value_vars=present, var_name="field", value_name="value")
    long["item"] = long["field"].map(fields)
    long = long.dropna(subset=["value", "report_period", "source_report"])
    long.loc[long["item"].isin(STOCK_ITEMS), "period_start"] = pd.NaT
    long["table"] = table
    return long[cols].reset_index(drop=True)


def parse_sina(payload: dict, source: str, code: str) -> pd.DataFrame:
    """新浪一张报表 → 长表。列：code, report_period, item, value, publish_date, table, data_source"""
    cols = ["code", "report_period", "item", "value", "publish_date", "table", "data_source"]
    rl = (((payload.get("result") or {}).get("data") or {}).get("report_list")) or {}
    fields = SINA_FIELDS[source]
    rows = []
    for k, rep in rl.items():
        if rep.get("rType") not in (None, "合并期末"):
            continue
        pub = rep.get("publish_date")
        for it in rep.get("data") or []:
            item = fields.get(it.get("item_field"))
            if item is None or it.get("item_value") in (None, ""):
                continue
            rows.append((str(code).zfill(6), k, item, it["item_value"], pub, source, rep.get("data_source")))
    d = pd.DataFrame(rows, columns=cols)
    if d.empty:
        return d
    d["report_period"] = pd.to_datetime(d["report_period"], format="%Y%m%d", errors="coerce")
    d["publish_date"] = pd.to_datetime(d["publish_date"], format="%Y%m%d", errors="coerce")
    d["value"] = _num(d["value"])
    return d.dropna(subset=["report_period", "value"]).reset_index(drop=True)


def period_start_of(report_period: pd.Series) -> pd.Series:
    """累计期间起点：报告期所在年的 1 月 1 日（A 股定期报告的利润表 / 现金流都是年初至今累计）。"""
    return pd.to_datetime(report_period.dt.year.astype(str) + "-01-01")


# ---------------- 点时组装 ----------------
def next_trading_day(dates: pd.Series, days: pd.DatetimeIndex) -> pd.Series:
    """每个日期之后（严格晚于）的第一个交易日；早于或晚于交易日历覆盖范围的部分用下一个工作日。"""
    days = pd.DatetimeIndex(days).sort_values().unique()
    d = pd.to_datetime(dates)
    out = pd.Series(pd.NaT, index=d.index, dtype="datetime64[ns]")
    ok = d.notna()
    if len(days):
        ok = ok & (d >= days[0])
        pos = days.searchsorted(d[ok].to_numpy(), side="right")
        inside = pos < len(days)
        vals = np.full(len(pos), np.datetime64("NaT"), dtype="datetime64[ns]")
        vals[inside] = days[pos[inside]].to_numpy()
        out.loc[ok] = vals
    rest = d.notna() & out.isna()
    if rest.any():
        out.loc[rest] = (d[rest] + pd.offsets.BDay(1)).to_numpy()
    return out


def announce_dates(raw: pd.DataFrame) -> pd.DataFrame:
    """巨潮长表加 announce_date / announce_rule：
    指标表没有公告日 → 用同一 (code, 来源报告期, 文件类型) 在利润表 / 资产负债表 / 现金流表里的 DECLAREDATE
    （取最早的一个），再退一步只按 (code, 来源报告期)；仍没有、或不晚于来源报告期末 → 法定截止日。"""
    d = raw.copy()
    known = d.dropna(subset=["declare_date"])
    known = known[known["declare_date"] > known["source_report"]]
    m1 = known.groupby(["code", "source_report", "doc_code"], dropna=False)["declare_date"].min()
    m2 = known.groupby(["code", "source_report"])["declare_date"].min()
    own = d["declare_date"].where(d["declare_date"] > d["source_report"])
    k1 = pd.MultiIndex.from_frame(d[["code", "source_report", "doc_code"]])
    k2 = pd.MultiIndex.from_frame(d[["code", "source_report"]])
    via1 = pd.Series(m1.reindex(k1).to_numpy(), index=d.index)
    via2 = pd.Series(m2.reindex(k2).to_numpy(), index=d.index)
    ann = own.fillna(via1).fillna(via2)
    rule = np.where(own.notna(), "declared", np.where(ann.notna(), "declared_same_report", "statutory_deadline"))
    deadline = d["source_report"].map(statutory_deadline)
    d["announce_date"] = pd.to_datetime(ann.fillna(deadline))
    d["announce_rule"] = rule
    return d


def cninfo_pit_rows(raw: pd.DataFrame) -> pd.DataFrame:
    """巨潮长表（多张表拼接） → 点时行（未去重版本）。"""
    if raw.empty:
        return pd.DataFrame(columns=FIN_COLUMNS)
    d = announce_dates(raw)
    d["is_restated"] = d["type_code"] == TYPE_RESTATED
    d["value_basis"] = np.where(d["is_restated"], "restated", "as_reported")
    d["source"] = "cninfo"
    d["source_table"] = d["table"].map(CNINFO_TABLES)
    d["doc_type"] = d["doc_code"].map(DOC_TYPES).fillna(d["doc_code"].astype("string"))
    d["_prio"] = d["table"].map(TABLE_PRIORITY)
    d = d.sort_values("_prio", kind="stable").drop_duplicates(
        ["code", "report_period", "item", "source_report", "type_code", "doc_code"], keep="first")
    return d.drop(columns=["_prio"])


def sina_pit_rows(raw: pd.DataFrame) -> pd.DataFrame:
    if raw.empty:
        return pd.DataFrame(columns=FIN_COLUMNS)
    d = raw.copy()
    deadline = d["report_period"].map(statutory_deadline)
    pub = d["publish_date"]
    as_pub = pub.notna() & (pub > d["report_period"]) & (pub <= deadline + SINA_ASPUBLISHED_GRACE)
    d["announce_date"] = pub.where(pub.notna() & (pub > d["report_period"]), deadline)
    d["announce_rule"] = np.where(pub.notna() & (pub > d["report_period"]), "sina_publish_date", "statutory_deadline")
    d["is_restated"] = ~as_pub
    d["value_basis"] = np.where(as_pub, "as_published", "later_version")
    d["period_start"] = period_start_of(d["report_period"]).where(~d["item"].isin(STOCK_ITEMS))
    d["source"] = "sina"
    d["source_table"] = d["table"]
    d["source_report"] = pd.NaT
    d["doc_type"] = d["data_source"].map(SINA_DOC_TYPES).fillna("sina:" + d["data_source"].fillna("").astype(str))
    return d


def add_gross_profit(d: pd.DataFrame) -> pd.DataFrame:
    """派生 gross_profit = revenue − cost_of_revenue（同一来源行、同一版本；没有营业成本的金融类公司不派生）。"""
    key = ["code", "report_period", "source", "source_report", "announce_date", "is_restated", "doc_type"]
    rev = d[d["item"] == "revenue"]
    cost = d[d["item"] == "cost_of_revenue"][key + ["value"]].rename(columns={"value": "_cost"})
    m = rev.merge(cost, on=key, how="inner")
    m = m[m["_cost"].notna() & (m["_cost"] != 0)]
    m["value"] = m["value"] - m["_cost"]
    m["item"] = "gross_profit"
    return pd.concat([d, m.drop(columns=["_cost"])], ignore_index=True)


def vintages(d: pd.DataFrame) -> pd.DataFrame:
    """每个 (code, report_period, item) 按 avail_date 排序：同一天生效的取「原值优先、表优先级」的一条；
    之后的版本只在数值变化时保留（相对差 < 1e-9 视为相同）。加 version（从 1 起）。"""
    if d.empty:
        return d.assign(version=pd.Series(dtype="int64"))
    key = ["code", "report_period", "item"]
    o = d.sort_values(key + ["avail_date", "is_restated", "announce_date"], kind="stable")
    o = o.drop_duplicates(key + ["avail_date"], keep="first")
    prev = o.groupby(key, sort=False)["value"].shift(1)
    first = o.groupby(key, sort=False).cumcount() == 0
    same = (o["value"] - prev).abs() <= 1e-9 * np.maximum(o["value"].abs(), prev.abs()).fillna(0) + 1e-6
    v = o[first | ~same.fillna(False)].copy()
    v["version"] = v.groupby(key, sort=False).cumcount() + 1
    return v.reset_index(drop=True)


def assemble(cninfo_raw: pd.DataFrame, sina_raw: pd.DataFrame, trading_days: pd.DatetimeIndex,
             sina_only_codes: set[str] | None = None) -> pd.DataFrame:
    """两路来源 → 点时长表。巨潮有数据的代码不再用新浪（新浪只补巨潮没有的代码，如退市股）。"""
    a = cninfo_pit_rows(cninfo_raw)
    b = sina_pit_rows(sina_raw)
    if len(b) and len(a):
        b = b[~b["code"].isin(set(a["code"]))]
    if sina_only_codes is not None and len(b):
        b = b[b["code"].isin(sina_only_codes)]
    parts = [x for x in (a, b) if len(x)]
    if not parts:
        return pd.DataFrame(columns=FIN_COLUMNS)
    d = pd.concat(parts, ignore_index=True)
    d = add_gross_profit(d)
    d["avail_date"] = next_trading_day(d["announce_date"], trading_days)
    d["period_deadline"] = d["report_period"].map(statutory_deadline)
    d = vintages(d)
    out = d.reindex(columns=FIN_COLUMNS)
    for c in ("report_period", "period_start", "announce_date", "avail_date", "period_deadline", "source_report"):
        out[c] = pd.to_datetime(out[c]).astype("datetime64[ns]")
    for c in ("code", "item", "announce_rule", "value_basis", "source", "source_table", "doc_type"):
        out[c] = out[c].astype("string[pyarrow]")
    out["is_restated"] = out["is_restated"].astype(bool)
    out["value"] = out["value"].astype(float)
    out["version"] = out["version"].astype("int64")
    return out.sort_values(["code", "item", "report_period", "avail_date"]).reset_index(drop=True)


# ---------------- 构建 / 读取 ----------------
def fin_path(market: str = MARKET):
    return store.market_dir(market) / "fin_pit.parquet"


def meta_path(market: str = MARKET):
    return store.market_dir(market) / "fin_pit.meta.json"


def _cached(source: str, table: str, market: str = MARKET) -> list[str]:
    return sorted(p.stem for p in http.raw_dir(market, FIN_SUBDIR, source, table).glob("*.json"))


def load_cninfo_raw(tables=None, market: str = MARKET, codes=None) -> pd.DataFrame:
    frames = []
    for t in tables or CNINFO_TABLES:
        for code in (_cached("cninfo", t, market) if codes is None else codes):
            p = http.raw_dir(market) / cache_rel("cninfo", t, code)
            if p.exists():
                frames.append(parse_cninfo(http.parse_json(p.read_bytes()), t, code))
    frames = [f for f in frames if len(f)]
    return pd.concat(frames, ignore_index=True) if frames else parse_cninfo({}, "income")


def load_sina_raw(market: str = MARKET, codes=None) -> pd.DataFrame:
    frames = []
    for s in SINA_SOURCES:
        for code in (_cached("sina", s, market) if codes is None else codes):
            p = http.raw_dir(market) / cache_rel("sina", s, code)
            if p.exists():
                frames.append(parse_sina(http.parse_json(p.read_bytes()), s, code))
    frames = [f for f in frames if len(f)]
    return pd.concat(frames, ignore_index=True) if frames else parse_sina({}, "lrb", "000000")


def trading_days(market: str = MARKET) -> pd.DatetimeIndex:
    try:
        px = store.read_prices(market, [], raw=True)
        return pd.DatetimeIndex(px["date"].unique()).sort_values()
    except FileNotFoundError:
        return pd.DatetimeIndex([])


def build(market: str = MARKET) -> dict:
    sec = store.read_securities(market)
    delisted = set(sec.loc[sec["status"] == "delisted", "code"].astype(str))
    days = trading_days(market)
    cn_codes = sorted(set().union(*[_cached("cninfo", t, market) for t in CNINFO_TABLES]))
    sina_codes = sorted(set().union(*[_cached("sina", s, market) for s in SINA_SOURCES]) & delisted - set(cn_codes))
    # 逐只组装（公告日、去重、版本都只在单只股票内部计算），避免几千万行原始记录同时驻留内存
    parts = []
    for code in cn_codes:
        part = assemble(load_cninfo_raw(market=market, codes=[code]), pd.DataFrame(), days)
        if len(part):
            parts.append(part)
    for code in sina_codes:
        part = assemble(pd.DataFrame(), load_sina_raw(market=market, codes=[code]), days)
        if len(part):
            parts.append(part)
    fin = pd.concat(parts, ignore_index=True) if parts else assemble(pd.DataFrame(), pd.DataFrame(), days)
    p = fin_path(market)
    fin.to_parquet(p, index=False)
    rep = {"rows": int(len(fin)), "codes": int(fin["code"].nunique()) if len(fin) else 0,
           "codes_by_source": fin.groupby("source")["code"].nunique().to_dict() if len(fin) else {},
           "items": fin["item"].value_counts().to_dict() if len(fin) else {},
           "report_period_range": [str(fin["report_period"].min().date()), str(fin["report_period"].max().date())] if len(fin) else None}
    meta = {"source": SOURCE, "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "sha256": store._sha256(p), **rep,
            "notes": "点时规则见 factorlab/sources/cn_fin.py 文件头与 docs/research/factorlab/DATA-CN-HK.md 第十一节。"}
    meta_path(market).write_text(json.dumps(meta, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")
    return rep


def load_fin_pit(market: str = MARKET, items: list[str] | None = None, *, raw: bool = False) -> pd.DataFrame:
    """读点时财报长表。默认（raw=False）截掉 avail_date ≥ 锁箱起点的行（与 store.read_prices 一致）。"""
    df = pd.read_parquet(fin_path(market))
    if items is not None:
        df = df[df["item"].isin(items)]
    if not raw:
        cut = store.lockbox_start(market)
        if cut is not None:
            df = df[df["avail_date"] < cut]
    return df.reset_index(drop=True)


def asof(fin: pd.DataFrame, date, item: str | None = None) -> pd.DataFrame:
    """截至 date（含）已生效的最新版本：每个 (code, report_period, item) 一行。"""
    d = fin[fin["avail_date"] <= pd.Timestamp(date)]
    if item is not None:
        d = d[d["item"] == item]
    return d.sort_values("avail_date").groupby(["code", "report_period", "item"], sort=False).tail(1).reset_index(drop=True)


# ---------------- 审计 ----------------
def expected_codes(sec: pd.DataFrame, period_end: pd.Timestamp) -> pd.DataFrame:
    """某报告期「应当有财报」的证券：期末前上市、且在该期法定截止日之后才退市。"""
    dl = statutory_deadline(period_end)
    s = sec[(sec["list_date"] <= period_end) & (sec["delist_date"].isna() | (sec["delist_date"] > dl))]
    return s[["code", "status"]]


def coverage_by_year(fin: pd.DataFrame, sec: pd.DataFrame, item: str = "net_income_parent",
                     years=range(2004, 2026), universe: set[str] | None = None) -> dict:
    """年报（12-31）覆盖率：有该科目的证券 / 应有证券，按当前状态（listed / delisted）分开。
    universe 给定时只在这些代码里算（例如「已下载的代码」，用来评估来源本身的完整度）。"""
    have = fin[(fin["item"] == item)]
    out = {}
    for y in years:
        pe = pd.Timestamp(y, 12, 31)
        exp = expected_codes(sec, pe)
        if universe is not None:
            exp = exp[exp["code"].isin(universe)]
        got = set(have.loc[have["report_period"] == pe, "code"])
        row = {}
        for st in ("listed", "delisted"):
            e = set(exp.loc[exp["status"] == st, "code"])
            row[st] = {"expected": len(e), "have": len(e & got), "share": round(len(e & got) / len(e), 3) if e else None}
        out[y] = row
    return out


def announce_quality(fin: pd.DataFrame) -> dict:
    """公告日质量：按来源报告年份统计法定截止日回退占比、披露滞后分位数、晚于截止日占比。"""
    d = fin[(fin["source"] == "cninfo") & (fin["item"] == "net_income_parent") & ~fin["is_restated"]
            & (fin["doc_type"] == "periodic")].copy()
    if d.empty:
        return {}
    d["lag"] = (d["announce_date"] - d["report_period"]).dt.days
    d["late"] = d["announce_date"] > d["period_deadline"]
    d["kind"] = d["report_period"].dt.month.map({3: "Q1", 6: "H1", 9: "Q3", 12: "FY"})
    by_year = {}
    for y, g in d.groupby(d["report_period"].dt.year):
        by_year[int(y)] = {"n": int(len(g)), "statutory_fallback": round(float((g["announce_rule"] == "statutory_deadline").mean()), 4),
                           "late_after_deadline": round(float(g["late"].mean()), 4),
                           "lag_median_days": float(g["lag"].median())}
    by_kind = {k: {"lag_p05": float(g["lag"].quantile(0.05)), "lag_p50": float(g["lag"].median()),
                   "lag_p95": float(g["lag"].quantile(0.95)), "late_share": round(float(g["late"].mean()), 4)}
               for k, g in d[d["report_period"].dt.year >= 2005].groupby("kind")}
    return {"by_year": by_year, "by_kind_2005+": by_kind,
            "rule_counts": fin["announce_rule"].value_counts().to_dict(),
            "value_basis_counts": fin["value_basis"].value_counts().to_dict()}


def identity_check(fin: pd.DataFrame) -> dict:
    """资产 = 负债 + 所有者权益（同一版本）误差 < 1% 的占比；归母权益 ≤ 所有者权益的占比。"""
    d = fin[fin["item"].isin(["total_assets", "total_liabilities", "total_equity", "total_equity_parent"]) & ~fin["is_restated"]]
    w = d.pivot_table(index=["code", "report_period", "announce_date"], columns="item", values="value", aggfunc="last")
    w = w.dropna(subset=["total_assets", "total_liabilities", "total_equity"])
    if w.empty:
        return {}
    err = (w["total_liabilities"] + w["total_equity"] - w["total_assets"]).abs() / w["total_assets"].abs()
    par = w.dropna(subset=["total_equity_parent"])
    return {"n": int(len(w)), "a_eq_l_plus_e_within_1pct": round(float((err < 0.01).mean()), 4),
            "parent_le_total_equity": round(float((par["total_equity_parent"] <= par["total_equity"] + 1).mean()), 4)}


def sina_crosscheck(fin: pd.DataFrame, codes: list[str], market: str = MARKET,
                    items=("revenue", "net_income_parent", "operating_profit", "total_assets",
                           "total_equity_parent", "cfo"), since: int = 2010) -> dict:
    """巨潮（每期最新版本）对照新浪（每期一个值，最近报告版本）：相对误差；公告日对照（新浪 as_published 的期）。"""
    out = {}
    sraw = []
    for s in SINA_SOURCES:
        for c in codes:
            p = http.raw_dir(market) / cache_rel("sina", s, c)
            if p.exists():
                sraw.append(parse_sina(http.parse_json(p.read_bytes()), s, c))
    if not sraw:
        return {"note": "没有新浪核对缓存（先跑 fetch --sina-codes）"}
    sr = sina_pit_rows(pd.concat(sraw, ignore_index=True))
    sr = sr[sr["report_period"].dt.year >= since]
    cf = fin[(fin["source"] == "cninfo") & fin["code"].isin(codes) & (fin["report_period"].dt.year >= since)]
    latest = cf.sort_values("avail_date").groupby(["code", "report_period", "item"]).tail(1)
    orig = cf[~cf["is_restated"]].sort_values("avail_date").groupby(["code", "report_period", "item"]).head(1)
    for code in codes:
        res = {}
        for it in items:
            a = latest[(latest["code"] == code) & (latest["item"] == it)].set_index("report_period")["value"]
            b = sr[(sr["code"] == code) & (sr["item"] == it)].set_index("report_period")["value"]
            j = pd.concat([a.rename("cninfo"), b.rename("sina")], axis=1, join="inner").dropna()
            if j.empty:
                continue
            rel = (j["cninfo"] / j["sina"] - 1).abs()
            worst = rel.idxmax()
            res[it] = {"n": int(len(j)), "share_within_0.1pct": round(float((rel < 1e-3).mean()), 4),
                       "max_rel_err": round(float(rel.max()), 6), "worst_period": str(worst.date()),
                       "worst": [float(j.loc[worst, "cninfo"]), float(j.loc[worst, "sina"])]}
        # 公告日：新浪 as_published 的期，对照巨潮原值公告日
        sa = sr[(sr["code"] == code) & (sr["value_basis"] == "as_published") & (sr["item"] == "net_income_parent")]
        oa = orig[(orig["code"] == code) & (orig["item"] == "net_income_parent")].set_index("report_period")["announce_date"]
        jj = sa.set_index("report_period")["announce_date"].rename("sina").to_frame().join(oa.rename("cninfo"), how="inner")
        if len(jj):
            diff = (jj["cninfo"] - jj["sina"]).dt.days
            res["announce_date"] = {"n": int(len(jj)), "same_day": round(float((diff == 0).mean()), 4),
                                    "mismatch": {str(k.date()): int(v) for k, v in diff[diff != 0].items()}}
        out[code] = res
    return out


def audit(market: str = MARKET, validation_codes=("600519", "601318", "600036")) -> dict:
    fin = load_fin_pit(market, raw=True)
    sec = store.read_securities(market)
    sec["code"] = sec["code"].astype(str)
    out: dict = {"rows": int(len(fin)), "codes": int(fin["code"].nunique())}
    st = sec.set_index("code")["status"]
    fc = pd.Series(sorted(fin["code"].unique()))
    out["codes_by_status"] = fc.map(st).fillna("unknown").value_counts().to_dict()
    out["codes_by_source"] = fin.groupby("source")["code"].nunique().to_dict()
    out["listed_universe"] = int((sec["status"] == "listed").sum())
    out["delisted_universe"] = int((sec["status"] == "delisted").sum())
    out["delisted_since_2005"] = int(((sec["status"] == "delisted") & (sec["delist_date"] >= "2005-01-01")).sum())
    cached = {t: len(_cached("cninfo", t, market)) for t in CNINFO_TABLES}
    cached.update({f"sina_{s}": len(_cached("sina", s, market)) for s in SINA_SOURCES})
    out["cached_files"] = cached
    out["items"] = fin.groupby("item").agg(rows=("code", "size"), codes=("code", "nunique"),
                                           restated_rows=("is_restated", "sum")).to_dict("index")
    fetched = set(_cached("cninfo", "income", market)) | set(_cached("sina", "lrb", market))
    out["coverage_fy_net_income_parent"] = coverage_by_year(fin, sec)
    out["coverage_fy_net_income_parent_of_fetched"] = coverage_by_year(fin, sec, universe=fetched)
    out["doc_type_rows"] = fin["doc_type"].value_counts().to_dict()
    out["coverage_fy_total_assets"] = {y: v for y, v in coverage_by_year(fin, sec, "total_assets").items() if y % 5 == 0 or y >= 2023}
    out["announce_quality"] = announce_quality(fin)
    out["identity"] = identity_check(fin)
    out["sina_crosscheck"] = sina_crosscheck(fin, list(validation_codes), market)
    return out


# ---------------- 命令行 ----------------
def target_codes(sec: pd.DataFrame) -> tuple[list[str], list[str]]:
    """(巨潮代码 = 当前上市, 新浪代码 = 2005 年及以后退市)。"""
    listed = sec.loc[sec["status"] == "listed", "code"].astype(str)
    dl = sec.loc[(sec["status"] == "delisted") & (sec["delist_date"] >= pd.Timestamp("2005-01-01")), "code"].astype(str)
    return hashed_order(listed), hashed_order(dl)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="factorlab.sources.cn_fin")
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--limit", type=int, default=None, help="试下载：分层抽样只数（含约 10%% 退市股）")
    f.add_argument("--codes", default=None, help="逗号分隔代码（上市股走巨潮、退市股走新浪）")
    f.add_argument("--sina-codes", default=None, help="逗号分隔代码，强制走新浪（核对用）")
    f.add_argument("--tables", default=",".join(DEFAULT_TABLES), help="巨潮表：income,indicator[,balance,cashflow]")
    f.add_argument("--no-sina", action="store_true", help="不下退市股（新浪）")
    f.add_argument("--no-cninfo", action="store_true", help="只下新浪部分")
    f.add_argument("--rps", type=float, default=1.0, help="限速（次/秒），默认 1")
    f.add_argument("--refresh", action="store_true")
    sub.add_parser("build")
    au = sub.add_parser("audit")
    au.add_argument("--validation-codes", default="600519,601318,600036")
    a = ap.parse_args(argv)
    if a.cmd == "fetch":
        http.set_rate(a.rps)
        sec = store.read_securities(MARKET)
        sec["code"] = sec["code"].astype(str)
        status = sec.set_index("code")["status"]
        if a.sina_codes:
            cn_codes, sina_codes = [], a.sina_codes.split(",")
        elif a.codes:
            codes = a.codes.split(",")
            cn_codes = [c for c in codes if status.get(c) != "delisted"]
            sina_codes = [c for c in codes if status.get(c) == "delisted"]
        elif a.limit:
            n_dl = max(1, a.limit // 10)
            codes = cn.pilot_sample(sec, a.limit - n_dl, n_delisted=n_dl)
            cn_codes = [c for c in codes if status.get(c) != "delisted"]
            sina_codes = [c for c in codes if status.get(c) == "delisted"]
        else:
            cn_codes, sina_codes = target_codes(sec)
        if a.no_sina:
            sina_codes = []
        if a.no_cninfo:
            cn_codes = []
        tables = [t.strip() for t in a.tables.split(",") if t.strip()]
        res = fetch(cn_codes, sina_codes, tables, refresh=a.refresh)
        res["http"] = http.stats()
        print(json.dumps(res, ensure_ascii=False, default=str))
    elif a.cmd == "build":
        print(json.dumps(build(), ensure_ascii=False, indent=2, default=str))
    elif a.cmd == "audit":
        print(json.dumps(audit(validation_codes=a.validation_codes.split(",")), ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
