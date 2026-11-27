"""港股点时（PIT）财报：利润表 / 资产负债表 / 现金流关键科目，带公告日、公告日修复规则与币种。

命令行：
    uv run python -m factorlab.sources.hk_fin fetch --codes 00700,00005,01299   # 试下载（指定代码）
    uv run python -m factorlab.sources.hk_fin fetch                  # 全量（断点续传）
    uv run python -m factorlab.sources.hk_fin build                  # 写 {root}/hk/fin_pit.parquet
    uv run python -m factorlab.sources.hk_fin audit                  # 覆盖率、公告日质量、币种、与 A 股 H 股对照（JSON）

数据源：巨潮资讯数据中心 webapi.cninfo.com.cn（请求头 Accept-EncKey，算法同 cn_pit）。没有请求东方财富。
- hk/p_hk4039  港股证券信息表：不带代码一次返回全部（含终止上市、上市日、退市日），用来列举退市代码、识别代码重用。
- hk/p_hk4024  综合损益表（非银行）    hk/p_hk4023  资产负债表（非银行）    hk/p_hk4025  重要指标表（非银行）
- hk/p_hk4021  综合损益表（银行）      hk/p_hk4020  资产负债表（银行）
- hk/p_hk4019  现金流量表（通用，含银行、保险）
- en/p_ENHK7515 / 7514  保险公司利润表 / 资产负债表（英文接口；中文非银行表对保险公司全是空值）。
  必须带 sdate / edate（报告期区间，跨度 ≤ 5 年），按 4 年窗口分段请求。只对「非银行利润表 2008 年以后的记录
  多数收入与归母净利润都为空、银行表无记录」的代码请求（保险公司在中文表里只有 2006 年以前有数）。
- hk/p_hk4008  港股业绩公布预告（董事会会议通知：F002D = 业绩公布日，F001D = 通知日；2010-12 起）。
- 多代码批量：scode=a,b,c（逗号分隔）一次返回这些代码的全部历史；默认每批 30 只。返回后按代码拆开，
  每个（表，代码）存一个文件 {root}/hk/raw/fin/cninfo/{table}/{code}.json（records 原样保留），已存在就跳过（续传）。

点时口径：
1. 巨潮港股每个（代码，报告期）只有一条记录，没有原值 / 重述之分（is_restated 恒为 False；数值看起来是该期首次披露值，
   例如腾讯 2022 年报归母净利润 1,882.43 亿元是 IFRS 17 重述前的原值，但无法逐条证明）。
2. 公告日：同一（代码，报告期末，期初）在各张表里的 DECLAREDATE 取晚于期末的最早一个（同一份业绩公告）。
   然后按 announce_rule 修复（详见 repair_dates 与 DATA-CN-HK.md 第十三节）：
   - declared：DECLAREDATE 不晚于法定截止日 → 直接用；
   - 晚于截止日的 DECLAREDATE 分两种：报告期在 2007 年以前，或该日期是「批量录入日」（2010-10 至 2012-12 之间、
     同一天有 ≥ BATCH_MIN_CODES 个代码的逾期记录，且本条逾期 > 180 天）→ 视为占位：有 p_hk4008 业绩公布日（且早于占位日）就用它（hk4008），否则用法定截止日
     （statutory_deadline）；其余逾期日期视为真实延期，照用（declared_late，偏保守）；
   - DECLAREDATE 缺失或不晚于期末 → p_hk4008 或法定截止日。
   法定截止日（主板《上市规则》13.49，取较晚的口径）：年度业绩 = 财年结束后 3 个月（2010-12-31 以前结束的财年为 4 个月）；
   中期业绩 = 期末后 2 个月（2010-06-30 以前为 3 个月）；季度（主板自愿，GEM 45 天）= 期末后 2 个月；都取月末。
3. 生效日 avail_date = announce_date 之后第一个交易日（港股业绩多在收盘后公布；交易日取自 hk prices）。
4. 币种：currency = 报告币种（HKD / CNY / USD / ...，原样，不折算）；fx_hkd = 巨潮给的「1 单位报告币种 = ? 港币」
   （抽查接近期末汇率）。数值单位是报告币种的元。跨公司比较要么用同币种的比率（如 净利润 / 权益），要么先折算。
5. 期间：利润表、现金流是本财年初至期末累计（中报 6 个月、年报 12 个月、季报 3 / 9 个月），period_start = STARTDATE，
   period_months 给出月数。财年结束月份不统一（3 / 6 / 12 月都有）；改财年时同一期末可能有两条不同期间的记录
   （按 period_start 区分，都保留）。
6. 代码重用：巨潮按代码返回现持有人的数据。p_hk4039 里同一代码有多条（旧公司退市、新公司上市）时，只保留报告期末
   不早于现持有人上市日前 PRE_LISTING_YEARS 年的行（招股书业绩记录期）；退市且未被重用的代码，只保留退市日以前的报告期。
7. 读取：load_fin_pit() 默认截掉 avail_date ≥ 锁箱起点的行（与 store.read_prices 一致），raw=True 才给全部。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from .. import store
from . import cn_pit, http
from .cn_fin import next_trading_day

MARKET = "hk"
FIN_SUBDIR = "fin"
CNINFO_ROOT = "https://webapi.cninfo.com.cn/api/"
TABLES = {
    "income": "hk/p_hk4024", "balance": "hk/p_hk4023", "indicator": "hk/p_hk4025", "cashflow": "hk/p_hk4019",
    "bank_income": "hk/p_hk4021", "bank_balance": "hk/p_hk4020",
    "ins_income": "en/p_ENHK7515", "ins_balance": "en/p_ENHK7514",
    "results_dates": "hk/p_hk4008",
}
SOURCE_TABLE = {**TABLES, "derived": "derived"}
MAIN_TABLES = ("income", "balance", "indicator", "cashflow", "bank_income", "bank_balance", "results_dates")
INS_TABLES = ("ins_income", "ins_balance")
SECURITIES_API = "hk/p_hk4039"
# 窗口跨度：服务器按天数检查「不超过 5 年」，含两个闰日的 5 年（如 2016–2020）会被拒，所以用 4 年窗口
INS_WINDOWS = [(f"{y}0101", f"{y + 3}1231") for y in range(2001, 2029, 4)]
BATCH = 30
SPLIT_AT = 5000          # 单批返回 ≥ 此条数时怀疑被截断：拆半重下
SOURCE = ("cninfo webapi 港股 (p_hk4024/4023/4025/4019 非银行, p_hk4021/4020 银行, en/p_ENHK7515/7514 保险, "
          "p_hk4008 业绩公布日, p_hk4039 证券信息)")

# ---- 字段映射（按腾讯、汇丰、平安、友邦 2023 年报的实测数值对齐，见 DATA-CN-HK.md 第十三节） ----
FIELDS = {
    "income": {"F005N": "revenue", "F006N": "operating_profit", "F009N": "total_profit",
               "F012N": "net_income_parent", "F025N": "eps_basic", "F022N": "shares_outstanding"},
    "indicator": {"F017N": "revenue", "F024N": "net_income", "F026N": "net_income_parent", "F071N": "gross_profit",
                  "F007N": "total_assets", "F014N": "total_equity_parent", "F069N": "total_equity", "F030N": "cfo"},
    "balance": {"F012N": "total_assets", "F020N": "total_equity_parent"},   # F018N 股本、F019N 储备、F020N = 二者之和
    "cashflow": {"F034N": "cfo"},
    "bank_income": {"F013N": "revenue", "F007N": "net_interest_income", "F017N": "operating_profit",
                    "F020N": "total_profit", "F022N": "net_income", "F033N": "net_income_parent",
                    "F034N": "eps_basic", "F031N": "shares_outstanding"},
    "bank_balance": {"F024N": "total_assets", "F035N": "total_liabilities", "F042N": "total_equity_parent",
                     "F044N": "total_equity"},
    "ins_income": {"F012N": "revenue", "F023N": "total_profit", "F025N": "net_income", "F026N": "net_income_parent",
                   "F033N": "eps_basic", "F054N": "shares_outstanding"},
    "ins_balance": {"F023N": "total_assets", "F034N": "total_liabilities", "F043N": "total_equity_parent",
                    "F047N": "total_equity"},
}
TEMPLATE = {"income": "general", "balance": "general", "indicator": "general", "cashflow": "any",
            "bank_income": "bank", "bank_balance": "bank", "ins_income": "insurance", "ins_balance": "insurance"}
# 同一（代码，期末，期初，科目）多张表都有时的优先级（小者优先）：三大表优先，指标表补缺
TABLE_PRIORITY = {"income": 0, "balance": 0, "cashflow": 0, "bank_income": 0, "bank_balance": 0,
                  "ins_income": 0, "ins_balance": 0, "indicator": 1}
STOCK_ITEMS = {"total_assets", "total_liabilities", "total_equity", "total_equity_parent", "shares_outstanding"}
ITEMS = ["revenue", "cost_of_revenue", "gross_profit", "operating_profit", "total_profit", "net_income",
         "net_income_parent", "net_interest_income", "eps_basic", "cfo", "total_assets", "total_liabilities",
         "total_equity", "total_equity_parent", "shares_outstanding"]
REPORT_TYPES = {"年报": "annual", "半年报": "interim", "第一季报告": "q1", "第三季报告": "q3",
                "Annual Report": "annual", "Interim Report": "interim", "Q1 Report": "q1", "Q3 Report": "q3"}
EXPECTED_MONTHS = {"annual": 12, "interim": 6, "q1": 3, "q3": 9}
CURRENCY_ALIASES = {"RMB": "CNY"}

# 公告日修复
PLACEHOLDER_BEFORE = pd.Timestamp("2007-01-01")   # 报告期末早于此：DECLAREDATE 一律视为录入日占位
BATCH_MIN_CODES = 5                               # 同一 DECLAREDATE 有 ≥ 5 个代码的逾期记录 → 批量录入日
# 批量录入只认 2010-10 至 2012-12（巨潮港股库集中建库期；全量里中位逾期约 5 年的大批次全在这段）。之后的同日聚集
# 是真实的（截止日次日 40 多家，或疫情延期），或是「取自下一年报告对比数」（逾期约 362 天，数值可能已重述）→ 照用。
BATCH_WINDOW = (pd.Timestamp("2010-10-01"), pd.Timestamp("2012-12-31"))
PLACEHOLDER_MIN_LATE = pd.Timedelta(days=180)     # 批量录入日上的记录还须逾期 > 180 天才当占位（排除恰好同日的真实延期）
PRE_LISTING_YEARS = 4                             # 代码重用时保留现持有人上市前 4 年内的报告期（招股书记录期）

FIN_COLUMNS = ["code", "report_period", "period_start", "item", "value", "announce_date", "avail_date",
               "announce_rule", "period_deadline", "is_restated", "value_basis", "version", "source",
               "source_table", "source_report", "doc_type",
               # 港股专有
               "currency", "fx_hkd", "report_type", "period_months", "template", "audited", "date_quality",
               "declare_date_raw", "hk4008_date", "code_reused"]


# ================================================================ 下载
def cache_rel(table: str, code: str) -> str:
    return f"{FIN_SUBDIR}/cninfo/{table}/{code}.json"


def _headers() -> dict:
    return {"Accept-EncKey": cn_pit.cninfo_key(), "Origin": "https://webapi.cninfo.com.cn",
            "Referer": "https://webapi.cninfo.com.cn/", "X-Requested-With": "XMLHttpRequest"}


def cninfo_request(api: str, params: dict) -> dict:
    """一次巨潮请求（限速、重试由 http.Client 负责）；resultcode != 200 抛 HttpError。"""
    body = http.client(MARKET).fetch(CNINFO_ROOT + api, params, headers=_headers())
    j = http.parse_json(body)
    if j.get("resultcode") != 200:
        raise http.HttpError(f"巨潮 {api} {str(params)[:80]}: {j.get('resultcode')} {j.get('resultmsg')}")
    return j


def securities_list(refresh: bool = False) -> pd.DataFrame:
    """p_hk4039 全部港股证券（含终止上市）：code, name, full_name, org_id, list_date, delist_date, status, board。"""
    p = http.raw_dir(MARKET) / f"{FIN_SUBDIR}/cninfo/securities/p_hk4039_all.json"
    if p.exists() and not refresh:
        j = http.parse_json(p.read_bytes())
    else:
        j = cninfo_request(SECURITIES_API, {})
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(j, ensure_ascii=False), encoding="utf-8")
    return parse_securities(j)


def parse_securities(payload: dict) -> pd.DataFrame:
    cols = ["code", "name", "full_name", "org_id", "list_date", "delist_date", "status", "board"]
    recs = payload.get("records") or []
    if not recs:
        return pd.DataFrame(columns=cols)
    d = pd.DataFrame(recs)
    out = pd.DataFrame({
        "code": d["SECCODE"].astype(str).str.zfill(5), "name": d.get("SECNAME"), "full_name": d.get("F007V"),
        "org_id": d.get("F006V"), "list_date": pd.to_datetime(d.get("F004D"), errors="coerce"),
        "delist_date": pd.to_datetime(d.get("F005D"), errors="coerce"),
        "status": np.where(d.get("F008V") == "013002", "delisted", "listed"),
        "board": np.where(d.get("F002V") == "012007", "GEM", "主板")})
    return out.sort_values(["code", "list_date"]).reset_index(drop=True)


def hashed(codes) -> str:
    return hashlib.sha1(",".join(codes).encode()).hexdigest()[:12]


def _write_code_files(table: str, codes: list[str], records: list[dict], meta: dict) -> None:
    by = {c: [] for c in codes}
    for r in records:
        c = str(r.get("SECCODE", "")).zfill(5)
        if c in by:
            by[c].append(r)
    for c, rs in by.items():
        p = http.raw_dir(MARKET) / cache_rel(table, c)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".json.tmp")
        tmp.write_text(json.dumps({"resultcode": 200, "records": rs, **meta}, ensure_ascii=False), encoding="utf-8")
        tmp.replace(p)


def fetch_batch(table: str, codes: list[str]) -> list[dict]:
    """一批代码、一张表的全部记录（保险表按 5 年窗口拼接）。条数可疑（≥ SPLIT_AT）时拆半重下。"""
    api = TABLES[table]
    windows = INS_WINDOWS if table in INS_TABLES else [None]
    recs: list[dict] = []
    for w in windows:
        params = {"scode": ",".join(codes)}
        if w is not None:
            params.update({"sdate": w[0], "edate": w[1]})
        j = cninfo_request(api, params)
        rs = j.get("records") or []
        total = j.get("total")
        if (len(rs) >= SPLIT_AT or (isinstance(total, int) and total > len(rs))) and len(codes) > 1:
            h = len(codes) // 2
            return fetch_batch(table, codes[:h]) + fetch_batch(table, codes[h:])
        recs.extend(rs)
    return recs


def _cached(table: str) -> set[str]:
    return {p.stem for p in http.raw_dir(MARKET, FIN_SUBDIR, "cninfo", table).glob("*.json")}


BACKOFF_403 = (60, 180, 600)
MAX_CONSEC_FAIL = 6


def _sleep(seconds: float) -> None:
    import time

    time.sleep(seconds)


def fetch(codes: list[str], tables=MAIN_TABLES, refresh: bool = False, batch: int = BATCH,
          backoff=BACKOFF_403, max_consec_fail: int = MAX_CONSEC_FAIL) -> dict:
    """按表、按批下载；每批写成逐代码文件。已有文件的代码跳过（refresh=True 全部重下）。"""
    out = {"codes": len(codes), "requests_batches": 0, "failed": [], "records": {}, "forbidden_waits": 0,
           "stopped_early": False}
    t0 = datetime.now()
    consec = 0
    for table in tables:
        have = set() if refresh else _cached(table)
        todo = [c for c in codes if c not in have]
        batches = [todo[i:i + batch] for i in range(0, len(todo), batch)]
        print(f"[hk_fin] {table}: {len(todo)} 只待下，{len(batches)} 批", file=sys.stderr, flush=True)
        for bi, b in enumerate(batches, 1):
            for attempt in range(len(backoff) + 1):
                try:
                    recs = fetch_batch(table, b)
                    _write_code_files(table, b, recs, {"api": TABLES[table], "batch": hashed(b),
                                                       "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")})
                    out["records"][table] = out["records"].get(table, 0) + len(recs)
                    out["requests_batches"] += 1
                    consec = 0
                    break
                except http.HttpError as e:
                    if "HTTP 403" in str(e) and attempt < len(backoff):
                        out["forbidden_waits"] += 1
                        print(f"[hk_fin] {table} 批 {bi} 403，等待 {backoff[attempt]} 秒", file=sys.stderr, flush=True)
                        _sleep(backoff[attempt])
                        continue
                    out["failed"].append((table, b[0], b[-1]))
                    consec += 1
                    print(f"[hk_fin] {table} 批 {bi} 失败：{e}", file=sys.stderr, flush=True)
                    break
            if consec >= max_consec_fail:
                out["stopped_early"] = True
                print(f"[hk_fin] 连续 {consec} 批失败，停止；稍后重跑续传", file=sys.stderr, flush=True)
                out["seconds"] = round((datetime.now() - t0).total_seconds(), 1)
                return out
            if bi % 10 == 0 or bi == len(batches):
                el = (datetime.now() - t0).total_seconds()
                print(f"[hk_fin] {table} {bi}/{len(batches)} {el:.0f}s http={http.stats()}", file=sys.stderr, flush=True)
    out["seconds"] = round((datetime.now() - t0).total_seconds(), 1)
    return out


def insurance_candidates(codes=None, since: str = "2008-01-01", min_null_share: float = 0.5) -> list[str]:
    """非银行利润表 since 以后的记录里，营业额与归母净利润都为空的占比 ≥ min_null_share，且银行利润表无记录的代码
    （保险公司：中文非银行表只有 2006 年以前有数）。多请求几只非保险公司无妨（英文保险表对它们返回空）。"""
    out = []
    bank = _cached("bank_income")
    for c in sorted(_cached("income") if codes is None else codes):
        p = http.raw_dir(MARKET) / cache_rel("income", c)
        if not p.exists():
            continue
        recs = [r for r in http.parse_json(p.read_bytes()).get("records") or [] if str(r.get("ENDDATE")) >= since]
        if not recs:
            continue
        null = sum(r.get("F005N") is None and r.get("F012N") is None for r in recs) / len(recs)
        if null < min_null_share:
            continue
        if c in bank:
            bp = http.raw_dir(MARKET) / cache_rel("bank_income", c)
            if http.parse_json(bp.read_bytes()).get("records"):
                continue
        out.append(c)
    return out


# ================================================================ 解析
def _num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s, errors="coerce").astype(float)


def _months(start: pd.Series, end: pd.Series) -> pd.Series:
    days = (end - start).dt.days + 1
    return (days / 30.4375).round().astype("Int64")


def parse_table(payload: dict, table: str, code: str | None = None) -> pd.DataFrame:
    """一张表（一个代码或多个代码）→ 长表：code, report_period, period_start, item, value, declare_date, currency,
    fx_hkd, report_type, audited, table。"""
    cols = ["code", "report_period", "period_start", "item", "value", "declare_date", "currency", "fx_hkd",
            "report_type", "audited", "table"]
    recs = payload.get("records") or []
    fields = FIELDS[table]
    if not recs:
        return pd.DataFrame(columns=cols)
    d = pd.DataFrame(recs)
    if table in INS_TABLES:
        cur = d.get("CURRENCY")
        if cur is None:
            cur = pd.Series(None, index=d.index, dtype=object)
        d["_cur"] = cur
        d["_fx"] = d.get("F001N")
        d["_type"] = d.get("REPORTTYPE")
        d["_aud"] = None
    else:
        d["_cur"] = d.get("F002V")
        d["_fx"] = d.get("F004N")
        d["_type"] = d["F001V"] if "F001V" in d else d.get("F001v")
        aud_col = {"income": "F036V", "balance": "F023V", "indicator": "F078V", "cashflow": "F037V",
                   "bank_income": "F042V", "bank_balance": "F047V"}.get(table)
        d["_aud"] = d.get(aud_col) if aud_col else None
    for c in ("SECCODE", "ENDDATE", "STARTDATE", "DECLAREDATE"):
        if c not in d:
            d[c] = None
    if code is not None:
        d["SECCODE"] = d["SECCODE"].fillna(code)
    d["code"] = d["SECCODE"].astype(str).str.zfill(5)
    d["report_period"] = pd.to_datetime(d["ENDDATE"], errors="coerce")
    d["period_start"] = pd.to_datetime(d["STARTDATE"], errors="coerce")
    d["declare_date"] = pd.to_datetime(d["DECLAREDATE"], errors="coerce")
    d["currency"] = d["_cur"].astype("string").str.strip().replace(CURRENCY_ALIASES)
    d["fx_hkd"] = _num(d["_fx"]) if d["_fx"] is not None else np.nan
    d["report_type"] = d["_type"].map(REPORT_TYPES)
    aud = d["_aud"].astype("string") if d["_aud"] is not None else pd.Series(pd.NA, index=d.index, dtype="string")
    d["audited"] = aud.map({"2": True, "1": False})
    present = [f for f in fields if f in d.columns]
    for f in present:
        d[f] = _num(d[f])
    long = d.melt(id_vars=["code", "report_period", "period_start", "declare_date", "currency", "fx_hkd",
                           "report_type", "audited"], value_vars=present, var_name="field", value_name="value")
    long["item"] = long["field"].map(fields)
    long = long.dropna(subset=["value", "report_period"])
    # 股数 ≤ 0 是占位
    long = long[~((long["item"] == "shares_outstanding") & (long["value"] <= 0))]
    long["table"] = table
    return long[cols].reset_index(drop=True)


_MONTHS_RE = re.compile(r"(\d+)\s*Months?\s*Ended\s*(\d{1,2})/(\d{1,2})/(\d{2,4})", re.I)


def parse_results_dates(payload: dict, code: str | None = None) -> pd.DataFrame:
    """p_hk4008 → code, report_period, months, results_date, notice_date, kind。"""
    cols = ["code", "report_period", "months", "results_date", "notice_date", "kind"]
    recs = payload.get("records") or []
    rows = []
    for r in recs:
        m = _MONTHS_RE.search(str(r.get("F006V") or ""))
        if not m:
            continue
        months, dd, mm, yy = int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4))
        yy = yy + 2000 if yy < 100 and yy < 70 else (yy + 1900 if yy < 100 else yy)
        try:
            pe = pd.Timestamp(yy, mm, dd)
        except ValueError:
            continue
        rows.append((str(r.get("SECCODE") or code).zfill(5), pe, months, r.get("F002D"), r.get("F001D"),
                     r.get("F004V")))
    d = pd.DataFrame(rows, columns=cols)
    if d.empty:
        return d
    d["results_date"] = pd.to_datetime(d["results_date"], errors="coerce")
    d["notice_date"] = pd.to_datetime(d["notice_date"], errors="coerce")
    return d.dropna(subset=["results_date"]).reset_index(drop=True)


# ================================================================ 点时组装
def statutory_deadline(report_period: pd.Series, report_type: pd.Series) -> pd.Series:
    """法定（较晚口径）业绩公布截止日，取月末：年度 3 个月（2010-12-31 以前结束的财年 4 个月）；
    中期 2 个月（2010-06-30 以前 3 个月）；季度 2 个月。report_type 缺失按期间长度推断不了时按年度处理。"""
    rp = pd.to_datetime(report_period)
    rt = report_type.fillna("annual")
    months = np.select([rt == "annual", rt == "interim"],
                       [np.where(rp < pd.Timestamp("2010-12-31"), 4, 3), np.where(rp < pd.Timestamp("2010-06-30"), 3, 2)],
                       default=2)
    out = [pd.Timestamp(p) + pd.offsets.MonthEnd(int(m)) if pd.notna(p) else pd.NaT for p, m in zip(rp, months)]
    # 期末不是月末（少数公司财年在月中结束）：MonthEnd(n) 会多算不足一个月，可以接受（更保守）
    return pd.Series(pd.to_datetime(out), index=report_period.index)


def batch_dates(periods: pd.DataFrame, min_codes: int = BATCH_MIN_CODES) -> set:
    """批量录入日：BATCH_WINDOW 内、同一 DECLAREDATE 上有 ≥ min_codes 个代码的逾期（晚于截止日）记录。
    periods 每行 = 一个（代码，期末，期初），列 declare_date、deadline。"""
    late = periods[(periods["declare_date"] > periods["deadline"])
                   & periods["declare_date"].between(*BATCH_WINDOW)]
    n = late.groupby("declare_date")["code"].nunique()
    return set(n[n >= min_codes].index)


def repair_dates(periods: pd.DataFrame, hk4008: pd.DataFrame, batch: set | None = None) -> pd.DataFrame:
    """每个（代码，期末，期初）一行 → 加 announce_date / announce_rule / date_quality / hk4008_date。

    periods 列：code, report_period, period_start, report_type, declare_date（各表最早的有效 DECLAREDATE）。
    规则：
    - declare_date 晚于期末且不晚于截止日 → declared（date_quality = 'declared'）
    - declare_date 晚于截止日：
        * 占位（期末早于 2007 年，或 declare_date 是 2010-10 至 2012-12 的批量录入日且逾期 > 180 天）→ p_hk4008 业绩公布日（晚于期末、不晚于
          declare_date）有则 hk4008（'repaired_hk4008'），否则法定截止日 statutory_deadline（'repaired_deadline'）；
        * 否则视为真实延期 → declared_late（'declared_late'，照用）
    - declare_date 缺失或不晚于期末 → hk4008 / statutory_deadline（'missing_*'）
    p_hk4008 同一（代码，期末）有多条（改期）时取最晚的业绩公布日；期间月数对得上的优先。"""
    d = periods.copy()
    d["deadline"] = statutory_deadline(d["report_period"], d["report_type"])
    if batch is None:
        batch = batch_dates(d)
    h = pd.Series(pd.NaT, index=d.index, dtype="datetime64[ns]")
    if hk4008 is not None and len(hk4008):
        x = hk4008[hk4008["results_date"] > hk4008["report_period"]]
        latest = x.groupby(["code", "report_period"])["results_date"].max()
        k = pd.MultiIndex.from_frame(d[["code", "report_period"]])
        h = pd.Series(latest.reindex(k).to_numpy(), index=d.index).astype("datetime64[ns]")
    d["hk4008_date"] = h
    decl = d["declare_date"]
    valid = decl.notna() & (decl > d["report_period"])
    ontime = valid & (decl <= d["deadline"])
    late = valid & ~ontime
    placeholder = late & ((d["report_period"] < PLACEHOLDER_BEFORE)
                          | (decl.isin(batch) & (decl - d["deadline"] > PLACEHOLDER_MIN_LATE)))
    h_ok = h.notna() & (h > d["report_period"])
    h_use_ph = placeholder & h_ok & (h <= decl)
    missing = ~valid
    h_use_ms = missing & h_ok
    ann = pd.Series(pd.NaT, index=d.index, dtype="datetime64[ns]")
    rule = np.full(len(d), "", dtype=object)
    qual = np.full(len(d), "", dtype=object)

    def put(mask: pd.Series, values: pd.Series, r: str, q: str) -> None:
        m = mask.fillna(False).to_numpy(dtype=bool)
        ann.iloc[m] = pd.to_datetime(values).to_numpy()[m]
        rule[m] = r
        qual[m] = q

    put(ontime, decl, "declared", "declared")
    put(late & ~placeholder, decl, "declared_late", "declared_late")
    put(h_use_ph, h, "hk4008", "repaired_hk4008")
    put(placeholder & ~h_use_ph, d["deadline"], "statutory_deadline", "repaired_deadline")
    put(h_use_ms, h, "hk4008", "missing_hk4008")
    put(missing & ~h_use_ms, d["deadline"], "statutory_deadline", "missing_deadline")
    d["announce_date"] = ann
    d["announce_rule"] = rule
    d["date_quality"] = qual
    return d


def entity_filter(raw: pd.DataFrame, sec: pd.DataFrame | None) -> pd.DataFrame:
    """代码重用 / 退市的行过滤（见文件头第 6 条），加 code_reused 列。"""
    d = raw.copy()
    d["code_reused"] = False
    if sec is None or sec.empty or d.empty:
        return d
    s = sec.sort_values(["code", "list_date"])
    n = s.groupby("code").size()
    last = s.groupby("code").tail(1).set_index("code")
    reused = set(n[n > 1].index)
    d["code_reused"] = d["code"].isin(reused)
    lo = d["code"].map(last["list_date"]) - pd.DateOffset(years=PRE_LISTING_YEARS)
    lo = lo.where(d["code_reused"])
    st = d["code"].map(last["status"])
    hi = d["code"].map(last["delist_date"]).where(st == "delisted")
    keep = ~(lo.notna() & (d["report_period"] < lo)) & ~(hi.notna() & (d["report_period"] > hi))
    return d[keep.fillna(True)]


def assemble(raw: pd.DataFrame, hk4008: pd.DataFrame, trading_days: pd.DatetimeIndex,
             sec: pd.DataFrame | None = None, batch: set | None = None) -> pd.DataFrame:
    """各表长表（parse_table 的拼接）→ 点时长表。batch 给定时用它作批量录入日集合（全量构建时先全局统计）。"""
    if raw.empty:
        return pd.DataFrame(columns=FIN_COLUMNS)
    d = entity_filter(raw, sec)
    if d.empty:
        return pd.DataFrame(columns=FIN_COLUMNS)
    pk = ["code", "report_period", "period_start"]
    d["period_start"] = d["period_start"].fillna(d["report_period"])     # 极少数缺期初：用期末占位，使分组可用
    # 每个（代码，期末，期初）：各表 DECLAREDATE 取晚于期末的最早一个；报告类型 / 币种 / 汇率取主表优先
    dd = d.assign(_dv=d["declare_date"].where(d["declare_date"] > d["report_period"]))
    per = dd.groupby(pk, dropna=False).agg(declare_date=("_dv", "min"), declare_any=("declare_date", "min"),
                                           report_type=("report_type", "first")).reset_index()
    per["declare_date"] = per["declare_date"].fillna(per["declare_any"])
    per = per.drop(columns=["declare_any"])
    per = repair_dates(per, hk4008, batch)
    d["_prio"] = d["table"].map(TABLE_PRIORITY).fillna(9)
    d = d.sort_values(pk + ["item", "_prio"], kind="stable").drop_duplicates(pk + ["item"], keep="first")
    # 同一期初 / 期末 / 科目的重复记录处理完后，补派生科目
    d = add_derived(d)
    d = d.merge(per[pk + ["announce_date", "announce_rule", "date_quality", "deadline", "hk4008_date", "declare_date"]]
                .rename(columns={"declare_date": "declare_date_raw", "deadline": "period_deadline"}),
                on=pk, how="left")
    d["period_months"] = _months(d["period_start"], d["report_period"])
    rt = d["report_type"]
    # 同一期末的重复记录（期初录错）：数值相同、只是期初不同 → 期初 / 月数取与报告类型相符的一条，
    # 公告日取这组里最早的一个（同样的数值最早在那天就公开了）
    d["_score"] = (d["period_months"].astype(float) - rt.map(EXPECTED_MONTHS).astype(float)).abs().fillna(99)
    grp = ["code", "report_period", "item", "value"]
    ann_cols = ["announce_date", "announce_rule", "date_quality", "period_deadline", "hk4008_date", "declare_date_raw"]
    first_ann = d.sort_values("announce_date", kind="stable").drop_duplicates(grp)[grp + ann_cols]
    d = d.sort_values(grp + ["_score", "announce_date"], kind="stable").drop_duplicates(grp, keep="first")
    d = d.drop(columns=ann_cols).merge(first_ann, on=grp, how="left")
    # 上市前的报告期（招股书）：DECLAREDATE 在上市日前后（−120 / +30 天），按招股书日期生效，单独标注
    d["doc_type"] = "periodic"
    if sec is not None and len(sec):
        ld = pd.to_datetime(d["code"].map(sec.sort_values("list_date").groupby("code")["list_date"].last()))
        pre = (d["date_quality"] == "declared_late") & (d["report_period"] < ld) \
            & (d["announce_date"] >= ld - pd.Timedelta(days=120)) & (d["announce_date"] <= ld + pd.Timedelta(days=30))
        d.loc[pre.fillna(False), "date_quality"] = "declared_prospectus"
        d.loc[pre.fillna(False), "doc_type"] = "prospectus"
    d.loc[d["item"].isin(STOCK_ITEMS), "period_start"] = pd.NaT
    d.loc[d["item"].isin(STOCK_ITEMS), "period_months"] = pd.NA
    d["template"] = d["table"].map(TEMPLATE)
    tmpl = d[d["template"] != "any"].groupby("code")["template"].agg(lambda s: s.value_counts().index[0])
    d.loc[d["template"] == "any", "template"] = d.loc[d["template"] == "any", "code"].map(tmpl).fillna("general")
    d["avail_date"] = next_trading_day(d["announce_date"], trading_days)
    d["is_restated"] = False
    d["value_basis"] = "as_reported"
    d["source"] = "cninfo_hk"
    d["source_table"] = d["table"].map(SOURCE_TABLE)
    d["source_report"] = d["report_period"]
    d = d.sort_values(["code", "report_period", "item", "avail_date"], kind="stable")
    d["version"] = d.groupby(["code", "report_period", "period_start", "item"], dropna=False).cumcount() + 1
    out = d.reindex(columns=FIN_COLUMNS)
    for c in ("report_period", "period_start", "announce_date", "avail_date", "period_deadline", "source_report",
              "declare_date_raw", "hk4008_date"):
        out[c] = pd.to_datetime(out[c]).astype("datetime64[ns]")
    for c in ("code", "item", "announce_rule", "value_basis", "source", "source_table", "doc_type", "currency",
              "report_type", "template", "date_quality"):
        out[c] = out[c].astype("string[pyarrow]")
    out["is_restated"] = out["is_restated"].astype(bool)
    out["code_reused"] = out["code_reused"].astype(bool)
    out["audited"] = out["audited"].astype("boolean")
    out["value"] = out["value"].astype(float)
    out["fx_hkd"] = out["fx_hkd"].astype(float)
    out["period_months"] = out["period_months"].astype("Int64")
    out["version"] = out["version"].astype("int64")
    return out.sort_values(["code", "item", "report_period", "avail_date"]).reset_index(drop=True)


def add_derived(d: pd.DataFrame) -> pd.DataFrame:
    """派生（同一（代码，期末，期初）、同一记录组）：
    cost_of_revenue = revenue − gross_profit（非银行；两者都有时）；
    total_liabilities = total_assets − total_equity（没有直接给出时）。"""
    key = ["code", "report_period", "period_start"]
    keep = ["currency", "fx_hkd", "report_type", "audited", "declare_date", "code_reused"]
    piv = d.pivot_table(index=key, columns="item", values="value", aggfunc="first")
    meta = d.sort_values("_prio", kind="stable").drop_duplicates(key)[key + keep].set_index(key)
    add = []
    if {"revenue", "gross_profit"} <= set(piv.columns):
        v = (piv["revenue"] - piv["gross_profit"]).dropna()
        add.append(v.rename("cost_of_revenue"))
    if {"total_assets", "total_equity"} <= set(piv.columns):
        v = (piv["total_assets"] - piv["total_equity"])
        if "total_liabilities" in piv.columns:
            v = v[piv["total_liabilities"].isna()]
        add.append(v.dropna().rename("total_liabilities"))
    if not add:
        return d
    parts = []
    for s in add:
        if s.empty:
            continue
        x = s.reset_index().rename(columns={s.name: "value"})
        x["item"] = s.name
        x["table"] = "derived"
        x["_prio"] = 5
        parts.append(x.join(meta, on=key))
    if not parts:
        return d
    return pd.concat([d] + parts, ignore_index=True)


TEMPLATE["derived"] = "any"


# ================================================================ 构建 / 读取
def fin_path(market: str = MARKET):
    return store.market_dir(market) / "fin_pit.parquet"


def meta_path(market: str = MARKET):
    return store.market_dir(market) / "fin_pit.meta.json"


def load_raw(codes=None, tables=None) -> tuple[pd.DataFrame, pd.DataFrame]:
    """缓存 → (各表长表, p_hk4008 业绩公布日)。"""
    frames = []
    for t in tables or [t for t in TABLES if t != "results_dates"]:
        for c in (sorted(_cached(t)) if codes is None else codes):
            p = http.raw_dir(MARKET) / cache_rel(t, c)
            if p.exists():
                f = parse_table(http.parse_json(p.read_bytes()), t, c)
                if len(f):
                    frames.append(f)
    raw = pd.concat(frames, ignore_index=True) if frames else parse_table({}, "income")
    hf = []
    for c in (sorted(_cached("results_dates")) if codes is None else codes):
        p = http.raw_dir(MARKET) / cache_rel("results_dates", c)
        if p.exists():
            f = parse_results_dates(http.parse_json(p.read_bytes()), c)
            if len(f):
                hf.append(f)
    h = pd.concat(hf, ignore_index=True) if hf else parse_results_dates({})
    return raw, h


def trading_days(market: str = MARKET) -> pd.DatetimeIndex:
    try:
        px = store.read_prices(market, [], raw=True)
        return pd.DatetimeIndex(px["date"].unique()).sort_values()
    except FileNotFoundError:
        return pd.DatetimeIndex([])


def build(market: str = MARKET) -> dict:
    raw, h = load_raw()
    try:
        sec = securities_list()
    except (http.HttpError, FileNotFoundError):
        sec = None
    days = trading_days(market)
    # 批量录入日按全市场统计（逐期一行）
    per = raw.assign(_dv=raw["declare_date"].where(raw["declare_date"] > raw["report_period"]))
    per = per.groupby(["code", "report_period", "period_start"], dropna=False).agg(
        declare_date=("_dv", "min"), report_type=("report_type", "first")).reset_index()
    per["deadline"] = statutory_deadline(per["report_period"], per["report_type"])
    batch = batch_dates(per)
    fin = assemble(raw, h, days, sec, batch)
    p = fin_path(market)
    fin.to_parquet(p, index=False)
    rep = {"rows": int(len(fin)), "codes": int(fin["code"].nunique()) if len(fin) else 0,
           "items": fin["item"].value_counts().to_dict() if len(fin) else {},
           "templates": fin.drop_duplicates("code")["template"].value_counts().to_dict() if len(fin) else {},
           "currencies": fin.drop_duplicates(["code", "report_period"])["currency"].value_counts().to_dict() if len(fin) else {},
           "batch_dates": len(batch),
           "report_period_range": [str(fin["report_period"].min().date()), str(fin["report_period"].max().date())] if len(fin) else None}
    meta = {"source": SOURCE, "built_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "sha256": store._sha256(p), **rep,
            "batch_dates_list": sorted(str(x.date()) for x in batch),
            "notes": "点时规则见 factorlab/sources/hk_fin.py 文件头与 docs/research/factorlab/DATA-CN-HK.md 第十三节。"}
    meta_path(market).write_text(json.dumps(meta, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")
    return rep


def load_fin_pit(market: str = MARKET, items: list[str] | None = None, *, raw: bool = False) -> pd.DataFrame:
    """读港股点时财报长表。默认（raw=False）截掉 avail_date ≥ 锁箱起点的行（与 store.read_prices 一致）。"""
    df = pd.read_parquet(fin_path(market))
    if items is not None:
        df = df[df["item"].isin(items)]
    if not raw:
        cut = store.lockbox_start(market)
        if cut is not None:
            df = df[df["avail_date"] < cut]
    return df.reset_index(drop=True)


def asof(fin: pd.DataFrame, date, item: str | None = None) -> pd.DataFrame:
    """截至 date（含）已生效的最新记录：每个 (code, report_period, period_start, item) 一行。"""
    d = fin[fin["avail_date"] <= pd.Timestamp(date)]
    if item is not None:
        d = d[d["item"] == item]
    return d.sort_values("avail_date").groupby(["code", "report_period", "period_start", "item"], sort=False,
                                               dropna=False).tail(1).reset_index(drop=True)


# ================================================================ 审计
SPOT = {  # 公开年报数值（单位：报告币种百万），用来核对字段映射；来源与不确定性见 DATA-CN-HK.md 第十三节
    ("00700", "2023-12-31"): {"currency": "CNY", "revenue": 609015, "net_income_parent": 115216, "total_assets": 1577246,
                              "total_equity_parent": 808591, "cfo": 221962, "gross_profit": 293109},
    ("00005", "2023-12-31"): {"currency": "USD", "revenue": 66058, "net_income": 24559, "total_assets": 3038677,
                              "total_equity_parent": 185329},
    ("02318", "2023-12-31"): {"currency": "CNY", "net_income_parent": 85665, "total_assets": 11583417,
                              "total_equity_parent": 899011},
}
# A+H 对照（同一公司 H 股代码 → A 股代码）：港股归母净利润、总资产应与 A 股 cn_fin 一致（会计准则已趋同，个别有差异）
AH_PAIRS = {"02318": "601318", "03968": "600036", "01398": "601398", "00939": "601939", "03988": "601988",
            "00857": "601857", "00386": "600028", "01088": "601088", "02628": "601628", "00998": "601998",
            "01288": "601288", "03328": "601328", "02601": "601601", "00914": "600585", "02333": "601633",
            "00168": "600600", "01211": "002594", "02238": "601238", "06030": "600030", "00753": "601111"}


def periods(fin: pd.DataFrame) -> pd.DataFrame:
    """每个（代码，期末，期初）一行（只看流量科目行；时点科目没有期初）。"""
    return fin[fin["period_start"].notna()].drop_duplicates(["code", "report_period", "period_start"])


def coverage_by_year(fin: pd.DataFrame, years=range(2003, 2027)) -> dict:
    """按财年（年报期末所在年）统计：有年报归母净利润的公司数；其中日期质量分布。"""
    a = fin[(fin["item"] == "net_income_parent") & (fin["report_type"] == "annual")]
    out = {}
    for y in years:
        g = a[a["report_period"].dt.year == y]
        out[y] = {"companies": int(g["code"].nunique()),
                  "date_quality": g.drop_duplicates(["code", "report_period"])["date_quality"].value_counts().to_dict()}
    return out


def interim_coverage(fin: pd.DataFrame, years=range(2003, 2027)) -> dict:
    a = fin[fin["item"] == "net_income_parent"]
    out = {}
    for y in years:
        g = a[a["report_period"].dt.year == y]
        out[y] = periods(g)["report_type"].value_counts().to_dict()
    return out


def date_quality_by_year(fin: pd.DataFrame) -> dict:
    p = periods(fin)
    out = {}
    for y, g in p.groupby(p["report_period"].dt.year):
        vc = g["date_quality"].value_counts(normalize=True).round(4).to_dict()
        out[int(y)] = {"n": int(len(g)), **vc}
    return out


def hk4008_agreement(fin: pd.DataFrame) -> dict:
    """公告日（declared）与 p_hk4008 业绩公布日的差（天）：同一天的占比。"""
    p = periods(fin)
    p = p[(p["date_quality"] == "declared") & p["hk4008_date"].notna()]
    if p.empty:
        return {}
    diff = (p["announce_date"] - p["hk4008_date"]).dt.days
    return {"n": int(len(p)), "same_day": round(float((diff == 0).mean()), 4),
            "within_3d": round(float((diff.abs() <= 3).mean()), 4),
            "declared_later": round(float((diff > 0).mean()), 4), "declared_earlier": round(float((diff < 0).mean()), 4),
            "diff_quantiles": {str(q): float(diff.quantile(q)) for q in (0.01, 0.05, 0.5, 0.95, 0.99)}}


def lag_stats(fin: pd.DataFrame) -> dict:
    p = periods(fin)
    p = p[p["report_period"] >= "2011-01-01"]
    p = p.assign(lag=(p["announce_date"] - p["report_period"]).dt.days)
    out = {}
    for k, g in p.groupby("report_type"):
        out[k] = {"n": int(len(g)), "p50": float(g["lag"].median()), "p95": float(g["lag"].quantile(0.95)),
                  "late_share": round(float((g["announce_date"] > g["period_deadline"]).mean()), 4)}
    return out


def spot_check(fin: pd.DataFrame, spot=SPOT) -> dict:
    out = {}
    for (code, pe), exp in spot.items():
        g = fin[(fin["code"] == code) & (fin["report_period"] == pd.Timestamp(pe))]
        res = {"currency": g["currency"].dropna().unique().tolist(),
               "announce_date": str(g["announce_date"].min().date()) if len(g) else None,
               "date_quality": g["date_quality"].dropna().unique().tolist()}
        for it, v in exp.items():
            if it == "currency":
                continue
            x = g.loc[g["item"] == it, "value"]
            got = float(x.iloc[0]) / 1e6 if len(x) else None
            res[it] = {"expected_m": v, "got_m": got, "rel_err": None if got is None else round(got / v - 1, 6)}
        out[f"{code}@{pe}"] = res
    return out


def ah_crosscheck(fin: pd.DataFrame, pairs=AH_PAIRS, items=("net_income_parent", "total_assets", "total_equity_parent"),
                  since: int = 2010) -> dict:
    """H 股（hk_fin）对照 A 股（cn_fin，原值）年报 / 中报：相对误差 < 1% 的占比；公告日差。"""
    try:
        cn = pd.read_parquet(store.root() / "cn" / "fin_pit.parquet",
                             filters=[("code", "in", list(pairs.values())), ("item", "in", list(items))])
    except FileNotFoundError:
        return {"note": "没有 A 股 fin_pit"}
    cn = cn[~cn["is_restated"] & (cn["report_period"].dt.year >= since)]
    cn = cn.sort_values("avail_date").groupby(["code", "report_period", "item"]).head(1)
    out = {"by_item": {}, "pairs": {}}
    allj = []
    for h, a in pairs.items():
        hk = fin[(fin["code"] == h) & fin["item"].isin(items) & (fin["report_period"].dt.year >= since)
                 & fin["report_type"].isin(["annual", "interim"])]
        if hk.empty:
            out["pairs"][h] = "no hk rows"
            continue
        j = hk.merge(cn[cn["code"] == a][["report_period", "item", "value", "announce_date"]],
                     on=["report_period", "item"], suffixes=("_hk", "_cn"))
        j = j[j["value_cn"].abs() > 0]
        j["rel"] = (j["value_hk"] / j["value_cn"] - 1).abs()
        j["dd"] = (j["announce_date_hk"] - j["announce_date_cn"]).dt.days
        j["pair"] = h
        allj.append(j)
        out["pairs"][h] = {"n": int(len(j)), "within_1pct": round(float((j["rel"] < 0.01).mean()), 3) if len(j) else None,
                           "currency": hk["currency"].dropna().unique().tolist()}
    if allj:
        j = pd.concat(allj)
        for it, g in j.groupby("item"):
            out["by_item"][it] = {"n": int(len(g)), "within_0.1pct": round(float((g["rel"] < 0.001).mean()), 4),
                                  "within_1pct": round(float((g["rel"] < 0.01).mean()), 4)}
        jj = j.drop_duplicates(["pair", "report_period"])
        jj = jj[jj["date_quality"] == "declared"]
        out["announce_date_hk_minus_cn_days"] = {"n": int(len(jj)), "same_day": round(float((jj["dd"] == 0).mean()), 4),
                                                 "hk_one_day_earlier": round(float((jj["dd"] == -1).mean()), 4),
                                                 "abs_le_1": round(float((jj["dd"].abs() <= 1).mean()), 4)}
    return out


def consistency(raw: pd.DataFrame) -> dict:
    """同一科目在多张表里的值是否一致（三大表 vs 指标表）。"""
    out = {}
    main = {"revenue": "income", "net_income_parent": "income", "total_assets": "balance",
            "total_equity_parent": "balance", "cfo": "cashflow"}
    for it, other in main.items():
        x = raw[(raw["item"] == it) & raw["table"].isin([other, "indicator"])]
        w = x.pivot_table(index=["code", "report_period", "period_start"], columns="table", values="value", aggfunc="first")
        if "indicator" not in w or other not in w:
            continue
        ww = w[["indicator", other]].dropna()
        ww = ww[ww[other].abs() > 0]
        rel = (ww["indicator"] / ww[other] - 1).abs()
        out[f"{it}:{other}_vs_indicator"] = {"n": int(len(ww)), "within_0.1pct": round(float((rel < 1e-3).mean()), 4)}
    return out


def audit(market: str = MARKET) -> dict:
    fin = load_fin_pit(market, raw=True)
    out: dict = {"rows": int(len(fin)), "codes": int(fin["code"].nunique())}
    try:
        sec = securities_list()
        last = sec.groupby("code").tail(1).set_index("code")
        st = pd.Series(sorted(fin["code"].unique())).map(last["status"]).fillna("unknown")
        out["codes_by_current_status"] = st.value_counts().to_dict()
        out["securities_p_hk4039"] = {"entries": int(len(sec)), "codes": int(sec["code"].nunique()),
                                      "delisted_entries": int((sec["status"] == "delisted").sum()),
                                      "reused_codes": int((sec.groupby("code").size() > 1).sum())}
        px_codes = set(store.read_securities(MARKET)["code"].astype(str))
        out["price_universe_codes_with_fin"] = {"price_codes": len(px_codes),
                                                "with_fin": len(px_codes & set(fin["code"]))}
    except Exception as e:  # noqa: BLE001  审计尽力而为
        out["securities_error"] = repr(e)
    out["cached_files"] = {t: len(_cached(t)) for t in TABLES}
    out["nonempty_files"] = {}
    for t in TABLES:
        n = 0
        for c in _cached(t):
            p = http.raw_dir(MARKET) / cache_rel(t, c)
            if (http.parse_json(p.read_bytes()).get("records") or []):
                n += 1
        out["nonempty_files"][t] = n
    out["templates"] = fin.drop_duplicates("code")["template"].value_counts().to_dict()
    out["items"] = fin.groupby("item").agg(rows=("code", "size"), codes=("code", "nunique")).to_dict("index")
    out["currency_by_period"] = fin.drop_duplicates(["code", "report_period"])["currency"].value_counts().to_dict()
    cc = fin.drop_duplicates(["code", "report_period"]).groupby("code")["currency"].nunique()
    out["codes_with_currency_change"] = int((cc > 1).sum())
    out["coverage_fy"] = coverage_by_year(fin)
    out["report_types_by_year"] = interim_coverage(fin)
    out["date_quality_by_year"] = date_quality_by_year(fin)
    out["date_quality_total"] = periods(fin)["date_quality"].value_counts().to_dict()
    out["hk4008_agreement"] = hk4008_agreement(fin)
    out["lag_2011+"] = lag_stats(fin)
    out["spot_check"] = spot_check(fin)
    out["ah_crosscheck"] = ah_crosscheck(fin)
    raw, _ = load_raw()
    out["table_consistency"] = consistency(raw)
    out["lockbox_visible_rows"] = int(len(load_fin_pit(market)))
    return out


# ================================================================ 命令行
def target_codes() -> list[str]:
    """港股价格面板的全部代码 ∪ p_hk4039 的全部代码（含终止上市），按代码排序。"""
    codes = set(store.read_securities(MARKET)["code"].astype(str).str.zfill(5))
    try:
        codes |= set(securities_list()["code"])
    except http.HttpError as e:
        print(f"[hk_fin] p_hk4039 失败（只用价格面板代码）：{e}", file=sys.stderr)
    return sorted(codes)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="factorlab.sources.hk_fin")
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--codes", default=None, help="逗号分隔代码")
    f.add_argument("--tables", default=",".join(MAIN_TABLES))
    f.add_argument("--no-insurance", action="store_true", help="不下保险公司英文表")
    f.add_argument("--batch", type=int, default=BATCH)
    f.add_argument("--rps", type=float, default=1.0, help="限速（次/秒），默认 1")
    f.add_argument("--refresh", action="store_true")
    sub.add_parser("build")
    sub.add_parser("audit")
    a = ap.parse_args(argv)
    if a.cmd == "fetch":
        http.set_rate(a.rps)
        codes = [c.strip().zfill(5) for c in a.codes.split(",")] if a.codes else target_codes()
        tables = [t.strip() for t in a.tables.split(",") if t.strip()]
        res = fetch(codes, tables, refresh=a.refresh, batch=a.batch)
        if not a.no_insurance and not res["stopped_early"]:
            ins = insurance_candidates(codes)
            print(f"[hk_fin] 保险候选 {len(ins)} 只：{ins[:40]}", file=sys.stderr, flush=True)
            res["insurance"] = fetch(ins, INS_TABLES, refresh=a.refresh, batch=a.batch)
            res["insurance_codes"] = ins
        res["http"] = http.stats()
        print(json.dumps(res, ensure_ascii=False, default=str))
    elif a.cmd == "build":
        print(json.dumps(build(), ensure_ascii=False, indent=2, default=str))
    elif a.cmd == "audit":
        print(json.dumps(audit(), ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
