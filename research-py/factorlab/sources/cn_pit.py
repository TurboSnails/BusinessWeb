"""A 股点时（PIT）补充数据：沪市 / 北交所 ST 历史、行业归属历史、总股本历史（→ mcap_total）。

命令行：
    uv run python -m factorlab.sources.cn_pit fetch --limit 100     # 试下载（分层抽样，含退市股）
    uv run python -m factorlab.sources.cn_pit fetch                 # 全量（断点续传；默认只下当前上市股，见下）
    uv run python -m factorlab.sources.cn_pit build                 # 写 st_pit / industry_pit / shares_pit，并增补 prices
    uv run python -m factorlab.sources.cn_pit build --no-augment    # 只写三张点时表
    uv run python -m factorlab.sources.cn_pit augment               # 只增补 prices（is_st、涨跌停、mcap_total、industry）
    uv run python -m factorlab.sources.cn_pit audit                 # 覆盖率与验证（JSON）

数据源：巨潮资讯数据中心 webapi.cninfo.com.cn（深交所旗下），请求头需带 Accept-EncKey
（AES-CBC 加密的当前时间戳，算法取自 akshare 自带的 cninfo.js，用 akshare 的依赖 py_mini_racer 计算）。

| 表 | 接口 | 请求数 | 覆盖 |
|---|---|---|---|
| 上市状态变动（戴帽 / 摘帽 / 披* / 摘* / 暂停 / 恢复 / 退市整理 / 终止） | stock/p_stock2117（不带代码 = 全市场一次返回） | 1 | 沪深北全部，含退市股，1990 年起 |
| 行业归属变动（证监会、申万、中证、巨潮等多套标准） | stock/p_stock2110?scode= | 1 / 只 | 只有当前上市股（退市股返回空） |
| 公司股本变动（总股本、流通股、公告日、变动日） | stock/p_stock2215?scode= | 1 / 只 | 只有当前上市股（退市股返回空） |

点时口径：
- ST：状态在变动日（VARYDATE，即交易所实施风险警示 / 撤销的首个交易日）生效；公告日（DECLAREDATE）几乎总在
  变动日之前或同日，所以按变动日生效不会前视。
- 行业：按变动日生效。各分类标准发布前的记录是巨潮回填的（例如申万 2021 版的首条记录日期早于 2021-07-30），
  industry_pit 里标 backfilled，prices.industry 只在标准发布后才用该标准。
- 总股本：可得日 = max(变动日, 公告日)；定期报告快照没有公告日时用法定披露截止日 + 1 天；
  同一天可得的多条取变动日最新的，较晚可得但变动日更早的旧快照不覆盖新状态。
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd

from .. import store
from . import cn, http

MARKET = "cn"
CNINFO_API = "https://webapi.cninfo.com.cn/api/stock/"
API = {"status": "p_stock2117", "industry": "p_stock2110", "shares": "p_stock2215"}
PIT_SUBDIR = "pit"
SOURCE = "cninfo webapi (p_stock2117 上市状态变动, p_stock2110 行业归属变动, p_stock2215 公司股本变动)"

# ---------------- 巨潮请求 ----------------
_KEYGEN = None


def cninfo_key() -> str:
    """巨潮 webapi 的 Accept-EncKey：AES-CBC(key=iv='1234567887654321', 当前 Unix 秒) 的 Base64。"""
    global _KEYGEN
    if _KEYGEN is None:
        import py_mini_racer
        from akshare.datasets import get_ths_js

        ctx = py_mini_racer.MiniRacer()
        with open(get_ths_js("cninfo.js"), encoding="utf-8") as f:
            ctx.eval(f.read())
        _KEYGEN = ctx
    return _KEYGEN.call("getResCode1")


def _cninfo_ok(body: bytes) -> bool:
    try:
        return http.parse_json(body).get("resultcode") == 200
    except (ValueError, AttributeError):
        return False


def cache_rel(kind: str, code: str | None = None) -> str:
    """缓存文件相对 {root}/cn/raw/ 的路径。"""
    if kind == "status":
        return f"{PIT_SUBDIR}/{API['status']}_all.json"
    return f"{PIT_SUBDIR}/{kind}/{code}.json"


def cninfo_get(kind: str, code: str | None = None, refresh: bool = False, market: str = MARKET) -> dict:
    """取一个接口的结果（带磁盘缓存，命中缓存不发请求、也不算密钥）。"""
    c = http.client(market)
    p = http.raw_dir(market) / cache_rel(kind, code)
    if p.exists() and p.stat().st_size > 0 and not refresh:
        return http.parse_json(p.read_bytes())
    headers = {"Accept-EncKey": cninfo_key(), "Origin": "https://webapi.cninfo.com.cn",
               "Referer": "https://webapi.cninfo.com.cn/", "X-Requested-With": "XMLHttpRequest"}
    params = {} if code is None else {"scode": code}
    body = c.get(CNINFO_API + API[kind], params or None, headers=headers, cache_file=cache_rel(kind, code),
                 max_age=0 if refresh else None, validate=_cninfo_ok)
    j = http.parse_json(body)
    if j.get("resultcode") != 200:
        raise http.HttpError(f"巨潮 {API[kind]} {code}: {j.get('resultmsg')}")
    return j


def target_codes(sec: pd.DataFrame, include_delisted: bool = False) -> list[str]:
    """逐只接口要下的代码：默认只取当前上市股（巨潮对退市股返回空，试下载已核实）。"""
    s = sec if include_delisted else sec[sec["status"] == "listed"]
    return sorted(s["code"].astype(str))


def fetch(codes: list[str], kinds=("industry", "shares"), refresh: bool = False, status: bool = True,
          progress_every: int = 100, market: str = MARKET) -> dict:
    """下载：状态变动全表（1 次）+ 每只股票的行业 / 股本（各 1 次）。失败的跳过，重跑即可续传。"""
    out = {"failed": [], "empty": {k: 0 for k in kinds}}
    if status:
        cninfo_get("status", refresh=refresh, market=market)
    for i, code in enumerate(codes, 1):
        for k in kinds:
            try:
                j = cninfo_get(k, code, refresh=refresh, market=market)
                if not j.get("records"):
                    out["empty"][k] += 1
            except http.HttpError as e:
                out["failed"].append((k, code))
                print(f"[cn_pit] {k} {code} 失败：{e}", file=sys.stderr)
        if i % progress_every == 0 or i == len(codes):
            print(f"[cn_pit] {i}/{len(codes)} http={http.stats()}", file=sys.stderr, flush=True)
    return out


# ---------------- ST（上市状态变动） ----------------
# 事件 → 之后的状态（None = 正常）。「恢复上市」「暂停上市」「新股上市」等不改变 ST 状态。
ST_EVENT_STATE: dict[str, str | None] = {
    "戴帽": "ST", "戴帽披*": "*ST", "披*": "*ST", "摘*": "ST",
    "摘*摘帽": None, "摘帽": None, "退市整理": "delisting", "终止上市": None,
}
ST_FLAGS = ("ST", "*ST")


def parse_status_changes(payload: dict) -> pd.DataFrame:
    recs = payload.get("records") or []
    d = pd.DataFrame(recs)
    if d.empty:
        return pd.DataFrame(columns=["code", "org", "event", "reason", "declare_date", "vary_date"])
    d = d.rename(columns={"SECCODE": "code", "ORGNAME": "org", "F006V": "event", "F004V": "reason",
                          "DECLAREDATE": "declare_date", "VARYDATE": "vary_date"})
    d["code"] = d["code"].astype(str).str.zfill(6)
    for c in ("declare_date", "vary_date"):
        d[c] = pd.to_datetime(d[c], errors="coerce")
    d["vary_date"] = d["vary_date"].fillna(d["declare_date"])
    d = d.dropna(subset=["vary_date"])
    d["_ord"] = np.arange(len(d))
    d = d.sort_values(["code", "vary_date", "_ord"]).drop(columns="_ord")
    return d[["code", "org", "event", "reason", "declare_date", "vary_date"]].reset_index(drop=True)


def bse_code_map(events: pd.DataFrame) -> dict[str, str]:
    """北交所旧代码（43/83/87）→ 新代码（920）：按机构全称配对（巨潮两套代码的记录各自独立）。"""
    org = events.dropna(subset=["org"]).groupby("code")["org"].last()
    new = org[org.index.str.startswith("920")]
    old = org[org.index.str.startswith(("43", "83", "87"))]
    by_org = {o: c for c, o in new.items()}
    if len(by_org) != len(new):          # 同名机构多个新代码：不配对
        dup = new[new.duplicated(keep=False)]
        for o in dup.unique():
            by_org.pop(o, None)
    return {c: by_org[o] for c, o in old.items() if o in by_org}


def st_intervals(events: pd.DataFrame, code_map: dict[str, str] | None = None) -> pd.DataFrame:
    """状态变动事件 → 点时区间表：code, start_date, end_date（含当日；NaT = 至今）, flag（ST / *ST / delisting）,
    declare_date, event, reason。只输出非正常状态的区间。"""
    ev = events.copy()
    if code_map:
        ev["code"] = ev["code"].map(lambda c: code_map.get(c, c))
        ev = ev.sort_values(["code", "vary_date"], kind="stable")
    rows = []
    for code, g in ev.groupby("code", sort=True):
        state, start, decl, evt, why = None, None, None, None, None
        for r in g.itertuples(index=False):
            new = state
            for tok in str(r.event).split(","):
                tok = tok.strip()
                if tok in ST_EVENT_STATE:
                    new = ST_EVENT_STATE[tok]
            if new == state:
                continue
            if state is not None:
                rows.append((code, start, pd.Timestamp(r.vary_date) - pd.Timedelta(days=1), state, decl, evt, why))
            state, start, decl, evt, why = new, r.vary_date, r.declare_date, r.event, r.reason
        if state is not None:
            rows.append((code, start, pd.NaT, state, decl, evt, why))
    out = pd.DataFrame(rows, columns=["code", "start_date", "end_date", "flag", "declare_date", "event", "reason"])
    out = out[out["end_date"].isna() | (out["end_date"] >= out["start_date"])]
    for c in ("start_date", "end_date", "declare_date"):
        out[c] = pd.to_datetime(out[c])
    return out.reset_index(drop=True)


def _keys(df: pd.DataFrame, date_col: str) -> pd.DataFrame:
    """merge_asof 前统一键类型（code → object 字符串，日期 → datetime64[ns]），记下原行号并按日期排序。"""
    out = df.copy()
    out["code"] = out["code"].astype(str).astype(object)
    out[date_col] = pd.to_datetime(out[date_col]).astype("datetime64[ns]")
    out["_i"] = np.arange(len(out))
    return out.sort_values(date_col, kind="stable")


def interval_lookup(code_dates: pd.DataFrame, iv: pd.DataFrame, value: str) -> pd.Series:
    """对 (code, date) 行查区间表（区间不重叠）：返回 date 落在 [start_date, end_date] 内的 value，否则 NA。"""
    out = pd.Series(pd.NA, index=code_dates.index, dtype="object")
    if iv.empty or code_dates.empty:
        return out
    left = _keys(code_dates[["code", "date"]], "date")
    right = _keys(iv[["code", "start_date", "end_date", value]], "start_date").drop(columns="_i")
    right["end_date"] = pd.to_datetime(right["end_date"]).astype("datetime64[ns]")
    m = pd.merge_asof(left, right, left_on="date", right_on="start_date", by="code", direction="backward")
    hit = m["start_date"].notna() & (m["end_date"].isna() | (m["date"] <= m["end_date"]))
    vals = m[value].where(hit)
    res = np.empty(len(left), dtype=object)
    res[m["_i"].to_numpy()] = vals.to_numpy()
    out[:] = res
    return out


def st_flags_pit(code_dates: pd.DataFrame, iv: pd.DataFrame, covered: set[str] | None = None) -> pd.Series:
    """(code, date) → 点时 is_st（ST 或 *ST 为 True）；代码不在巨潮状态表里（covered 之外）为 NA。"""
    flag = interval_lookup(code_dates, iv, "flag")
    st = flag.isin(ST_FLAGS).astype("boolean")
    if covered is not None:
        st[~code_dates["code"].isin(covered)] = pd.NA
    return st


# ---------------- 行业 ----------------
# 巨潮分类标准编码 → (简称, 一级代码的前缀长度, 标准发布 / 启用日)
INDUSTRY_SYSTEMS: dict[str, tuple[str, int | None, str | None]] = {
    "008003": ("sw2021", 3, "2021-07-30"),       # 申银万国行业分类标准（2021 版）
    "008018": ("sw_old", 3, None),               # 申银万国行业分类标准（旧）
    "008021": ("csrc2012", 1, "2012-10-26"),     # 证监会行业分类标准（2012）
    "008009": ("csrc2001", 1, "2001-04-04"),     # 证监会行业分类标准（2001）
    "008001": ("capco2023", 1, None),            # 中国上市公司协会上市公司行业分类标准
    "008014": ("csi", 2, None),                  # 中证行业分类标准
    "008019": ("csi_old", 2, None),              # 中证行业分类标准（旧）
    "008002": ("cninfo", 3, None),               # 巨潮行业分类标准
    "008013": ("cninfo_old", 3, None),           # 巨潮行业分类标准（旧）
    "008004": ("xcf", None, None),               # 新财富行业分类标准
}
SW2021_START = pd.Timestamp("2021-07-30")


def parse_industry(payload: dict, code: str | None = None) -> pd.DataFrame:
    cols = ["code", "system_code", "system_name", "vary_date", "industry_code", "level1_name", "level2_name",
            "level3_name", "level4_name", "latest"]
    recs = payload.get("records") or []
    if not recs:
        return pd.DataFrame(columns=cols)
    d = pd.DataFrame(recs).rename(columns={
        "SECCODE": "code", "F001V": "system_code", "F002V": "system_name", "VARYDATE": "vary_date",
        "F003V": "industry_code", "F004V": "level1_name", "F005V": "level2_name", "F006V": "level3_name",
        "F007V": "level4_name", "F008C": "latest"})
    for c in cols:
        if c not in d:
            d[c] = None
    if code is not None:
        d["code"] = d["code"].fillna(code)
    d["code"] = d["code"].astype(str).str.zfill(6)
    d["vary_date"] = pd.to_datetime(d["vary_date"], errors="coerce")
    return d[cols].dropna(subset=["vary_date", "system_code"])


def level1_code(system_code: str, industry_code) -> str | None:
    if not isinstance(industry_code, str) or not industry_code:
        return None
    n = INDUSTRY_SYSTEMS.get(system_code, (None, None, None))[1]
    return industry_code if n is None else industry_code[:n]


def industry_intervals(raw: pd.DataFrame, launch: dict[str, pd.Timestamp] | None = None) -> pd.DataFrame:
    """行业变动记录 → 点时区间表（每个 code × 分类标准各自一条时间线）。

    输出：code, system, system_code, start_date, end_date（含当日；NaT = 至今）, level1_code, level1_name,
    industry_code, level2_name, level3_name, level4_name, avail_date（= max(start_date, 标准启用日)）, backfilled。
    """
    cols = ["code", "system", "system_code", "start_date", "end_date", "avail_date", "backfilled", "level1_code",
            "level1_name", "industry_code", "level2_name", "level3_name", "level4_name"]
    if raw.empty:
        return pd.DataFrame(columns=cols)
    d = raw.copy()
    d["system"] = d["system_code"].map(lambda s: INDUSTRY_SYSTEMS.get(s, (s,))[0])
    d = d.sort_values(["code", "system_code", "vary_date"], kind="stable")
    d = d.drop_duplicates(["code", "system_code", "vary_date"], keep="last")
    d["start_date"] = d["vary_date"]
    nxt = d.groupby(["code", "system_code"])["start_date"].shift(-1)
    d["end_date"] = nxt - pd.Timedelta(days=1)
    launch = dict(launch or {})
    for sc, (_, _, day) in INDUSTRY_SYSTEMS.items():
        if day and sc not in launch:
            launch[sc] = pd.Timestamp(day)
    lt = d["system_code"].map(launch)
    d["avail_date"] = d["start_date"].where(lt.isna() | (d["start_date"] >= lt), lt)
    d["backfilled"] = lt.notna() & (d["start_date"] < lt)
    d["level1_code"] = [level1_code(s, c) for s, c in zip(d["system_code"], d["industry_code"])]
    d = d[d["end_date"].isna() | (d["end_date"] >= d["avail_date"])]
    return d[cols].reset_index(drop=True)


def empirical_launch(iv: pd.DataFrame, min_share: float = 0.2) -> dict[str, str]:
    """每套标准里最常见的「首条记录日期」（占比 ≥ min_share 时视为标准批量启用日），只作报告。"""
    out = {}
    first = iv.groupby(["system_code", "code"])["start_date"].min().reset_index()
    for sc, g in first.groupby("system_code"):
        vc = g["start_date"].value_counts()
        if len(vc) and vc.iloc[0] / len(g) >= min_share:
            out[sc] = str(vc.index[0].date())
    return out


def sw_level1_lookup(code_dates: pd.DataFrame, iv: pd.DataFrame) -> pd.Series:
    """prices.industry：申万一级行业名称，点时。2021-07-30 前用申万旧版，之后用申万 2021 版；
    区间起点按 avail_date（标准启用前的回填记录不用）。"""
    out = pd.Series(pd.NA, index=code_dates.index, dtype="object")
    for sys_code, before in (("008018", True), ("008003", False)):
        sub = iv[iv["system_code"] == sys_code][["code", "avail_date", "end_date", "level1_name"]]
        sub = sub.rename(columns={"avail_date": "start_date"})
        part = code_dates[(code_dates["date"] < SW2021_START) if before else (code_dates["date"] >= SW2021_START)]
        if part.empty or sub.empty:
            continue
        out.loc[part.index] = interval_lookup(part, sub, "level1_name")
    return out.astype("string")


# ---------------- 总股本 ----------------
def parse_shares(payload: dict, code: str | None = None) -> pd.DataFrame:
    cols = ["code", "declare_date", "vary_date", "reason", "total_shares", "float_shares", "float_a_shares",
            "b_shares", "h_shares"]
    recs = payload.get("records") or []
    if not recs:
        return pd.DataFrame(columns=cols)
    d = pd.DataFrame(recs).rename(columns={
        "SECCODE": "code", "DECLAREDATE": "declare_date", "VARYDATE": "vary_date", "F002V": "reason",
        "F003N": "total_shares", "F021N": "float_shares", "F022N": "float_a_shares", "F023N": "b_shares",
        "F024N": "h_shares"})
    for c in cols:
        if c not in d:
            d[c] = None
    if code is not None:
        d["code"] = d["code"].fillna(code)
    d["code"] = d["code"].astype(str).str.zfill(6)
    for c in ("declare_date", "vary_date"):
        d[c] = pd.to_datetime(d[c], errors="coerce")
    for c in ("total_shares", "float_shares", "float_a_shares", "b_shares", "h_shares"):
        d[c] = (pd.to_numeric(d[c], errors="coerce") * 1e4).round()   # 万股（4 位小数）→ 股
    return d[cols].dropna(subset=["vary_date"])


def statutory_deadline(period_end: pd.Timestamp) -> pd.Timestamp:
    """定期报告法定披露截止日：一季报 4/30、半年报 8/31、三季报 10/31、年报次年 4/30。"""
    y, m = period_end.year, period_end.month
    if m <= 3:
        return pd.Timestamp(y, 4, 30)
    if m <= 6:
        return pd.Timestamp(y, 8, 31)
    if m <= 9:
        return pd.Timestamp(y, 10, 31)
    return pd.Timestamp(y + 1, 4, 30)


def shares_availability(d: pd.DataFrame) -> pd.DataFrame:
    """加 avail_date / avail_rule：有公告日 → max(变动日, 公告日)；
    无公告日的定期报告快照 → 法定截止日 + 1 天；其他无公告日记录 → 变动日（标 vary_only）。"""
    d = d.copy()
    periodic = d["reason"].astype("string").str.contains("定期报告", na=False)
    has_decl = d["declare_date"].notna()
    deadline = d["vary_date"].map(lambda t: statutory_deadline(t) + pd.Timedelta(days=1))
    avail = np.where(has_decl, np.maximum(d["vary_date"].to_numpy(), d["declare_date"].fillna(d["vary_date"]).to_numpy()),
                     np.where(periodic, deadline.to_numpy(), d["vary_date"].to_numpy()))
    d["avail_date"] = pd.to_datetime(avail)
    d["avail_rule"] = np.where(has_decl, "declare", np.where(periodic, "statutory_deadline", "vary_only"))
    return d


def shares_steps(d: pd.DataFrame) -> pd.DataFrame:
    """单只股票的股本记录 → 点时阶梯（date, total_shares, vary_date）：
    在每个可得日，取「已可得记录里变动日最新的那条」；变动日更早的旧快照晚到不覆盖新状态。"""
    d = d.dropna(subset=["total_shares"])
    d = d[d["total_shares"] > 0].sort_values(["avail_date", "vary_date"], kind="stable")
    rows, best = [], None
    for r in d.itertuples(index=False):
        if best is None or r.vary_date >= best:
            best = r.vary_date
            rows.append((r.avail_date, r.total_shares, r.vary_date, r.float_a_shares))
    s = pd.DataFrame(rows, columns=["date", "total_shares", "vary_date", "float_a_shares"])
    return s.drop_duplicates("date", keep="last").reset_index(drop=True)


def shares_asof(code_dates: pd.DataFrame, steps: pd.DataFrame) -> pd.Series:
    """(code, date) → 当日可得的总股本（股）。steps 需含 code 列。"""
    out = pd.Series(np.nan, index=code_dates.index)
    if steps.empty or code_dates.empty:
        return out
    left = _keys(code_dates[["code", "date"]], "date")
    right = _keys(steps[["code", "date", "total_shares"]], "date").drop(columns="_i")
    m = pd.merge_asof(left, right, on="date", by="code", direction="backward")
    res = np.full(len(left), np.nan)
    res[m["_i"].to_numpy()] = m["total_shares"].to_numpy(float)
    out[:] = res
    return out


# ---------------- 组装 ----------------
def pit_path(name: str, market: str = MARKET):
    return store.market_dir(market) / f"{name}.parquet"


def _cached_codes(kind: str, market: str = MARKET) -> list[str]:
    d = http.raw_dir(market, PIT_SUBDIR, kind)
    return sorted(p.stem for p in d.glob("*.json"))


def build_st(market: str = MARKET) -> pd.DataFrame:
    ev = parse_status_changes(cninfo_get("status", market=market))
    iv = st_intervals(ev, bse_code_map(ev))
    iv["source"] = "cninfo p_stock2117"
    iv.to_parquet(pit_path("st_pit", market), index=False)
    return iv


def status_covered_codes(market: str = MARKET) -> set[str]:
    ev = parse_status_changes(cninfo_get("status", market=market))
    m = bse_code_map(ev)
    return {m.get(c, c) for c in ev["code"].unique()}


def build_industry(market: str = MARKET) -> pd.DataFrame:
    frames = []
    for code in _cached_codes("industry", market):
        p = http.raw_dir(market) / cache_rel("industry", code)
        frames.append(parse_industry(http.parse_json(p.read_bytes()), code))
    raw = pd.concat(frames, ignore_index=True) if frames else parse_industry({})
    iv = industry_intervals(raw)
    iv.to_parquet(pit_path("industry_pit", market), index=False)
    return iv


def build_shares(market: str = MARKET) -> pd.DataFrame:
    frames = []
    for code in _cached_codes("shares", market):
        p = http.raw_dir(market) / cache_rel("shares", code)
        frames.append(parse_shares(http.parse_json(p.read_bytes()), code))
    d = pd.concat(frames, ignore_index=True) if frames else parse_shares({})
    d = shares_availability(d) if not d.empty else d.assign(avail_date=pd.NaT, avail_rule=None)
    d = d.sort_values(["code", "vary_date", "avail_date"]).reset_index(drop=True)
    d.to_parquet(pit_path("shares_pit", market), index=False)
    return d


def all_steps(shares: pd.DataFrame) -> pd.DataFrame:
    parts = [shares_steps(g).assign(code=c) for c, g in shares.groupby("code")]
    return pd.concat(parts, ignore_index=True) if parts else pd.DataFrame(columns=["code", "date", "total_shares"])


LIMIT_COLS = ["limit_ratio", "limit_up", "limit_down", "limit_up_oneword", "limit_down_oneword", "no_limit_inferred"]


def recompute_limits(g: pd.DataFrame, list_date) -> pd.DataFrame:
    """单只股票（按日期排序）按新的 is_st 重算涨跌停列。基准价沿用 prices.ref_close（传成 chg = close − ref_close）。"""
    code = str(g["code"].iloc[0])
    ld = pd.Timestamp(list_date) if list_date is not None and pd.notna(list_date) else None
    first = g["date"].iloc[0]
    ipo_start = (ld is not None and first <= ld + pd.Timedelta(days=15)) or (ld is None and first > pd.Timestamp("2005-01-31"))
    df = g[["date", "open", "high", "low", "close", "adj_factor"]].reset_index(drop=True).copy()
    df["chg"] = df["close"] - g["ref_close"].to_numpy()
    lim = cn.compute_limits(df, cn.board_of(code), ld, g["is_st"].reset_index(drop=True),
                            trade_offset=0 if ipo_start else 1000)
    lim.index = g.index
    return lim[LIMIT_COLS]


def augment_prices(prices: pd.DataFrame, securities: pd.DataFrame | None, st_iv: pd.DataFrame | None,
                   st_covered: set[str] | None, shares: pd.DataFrame | None, industry: pd.DataFrame | None,
                   exchanges=("SSE", "BSE")) -> tuple[pd.DataFrame, dict]:
    """给 prices 增补：沪市 / 北交所点时 is_st（并对 is_st 改变的行重算涨跌停）、mcap_total、industry。
    深市 is_st 维持交易所简称变更口径不动。不重新下载 K 线。"""
    px = prices.reset_index(drop=True)
    rep: dict = {}
    if st_iv is not None:
        ex = px["code"].map(cn.exchange_of)
        sel = ex.isin(exchanges)
        sub = px.loc[sel, ["code", "date"]]
        new = st_flags_pit(sub, st_iv, st_covered)
        old = px.loc[sel, "is_st"].astype("boolean")
        px["is_st"] = px["is_st"].astype("boolean")
        px.loc[sel, "is_st"] = new.to_numpy()
        changed_rows = (new.fillna(False).astype(bool).to_numpy() != old.fillna(False).astype(bool).to_numpy())
        changed_idx = sub.index[changed_rows]
        rep["st_rows_true"] = int(new.fillna(False).sum())
        rep["st_rows_changed"] = int(len(changed_idx))
        rep["st_codes_changed"] = int(px.loc[changed_idx, "code"].nunique())
        if len(changed_idx):
            ld = {} if securities is None else securities.set_index("code")["list_date"].to_dict()
            codes = px.loc[changed_idx, "code"].unique()
            for c in LIMIT_COLS:
                if c != "limit_ratio":
                    px[c] = px[c].astype("boolean")
            pos = px.groupby("code", sort=False).indices
            for code in codes:
                g = px.iloc[pos[code]].sort_values("date")
                lim = recompute_limits(g, ld.get(code))
                rows = g.index.intersection(changed_idx)
                for c in LIMIT_COLS:
                    px.loc[rows, c] = lim.loc[rows, c].to_numpy()
    if shares is not None and not shares.empty:
        steps = all_steps(shares)
        ts = shares_asof(px[["code", "date"]], steps)
        px["total_shares"] = ts.to_numpy()
        px["mcap_total"] = px["total_shares"] * px["close"]
        rep["mcap_total_nonnull_share"] = round(float(px["mcap_total"].notna().mean()), 4)
    if industry is not None and not industry.empty:
        px["industry"] = sw_level1_lookup(px[["code", "date"]], industry).to_numpy()
        rep["industry_nonnull_share"] = round(float(px["industry"].notna().mean()), 4)
    return px, rep


def load_st_pit(market: str = MARKET) -> dict | None:
    """给 cn.build 用：{'intervals': st_pit 表, 'covered': 巨潮状态表里出现过的代码}；没跑过 cn_pit build 时为 None。"""
    p = pit_path("st_pit", market)
    if not p.exists():
        return None
    return {"intervals": pd.read_parquet(p), "covered": status_covered_codes(market)}


def add_pit_columns(prices: pd.DataFrame, market: str = MARKET) -> tuple[pd.DataFrame, dict]:
    """给 cn.build 用：有 shares_pit / industry_pit 时加 total_shares、mcap_total、industry（is_st 已在 load_code 里算好）。"""
    shares = pd.read_parquet(pit_path("shares_pit", market)) if pit_path("shares_pit", market).exists() else None
    ind = pd.read_parquet(pit_path("industry_pit", market)) if pit_path("industry_pit", market).exists() else None
    return augment_prices(prices, None, None, None, shares, ind)


MANIFEST_NOTE_TAG = "[cn_pit]"


def manifest_note(rep: dict) -> str:
    return (f"{MANIFEST_NOTE_TAG} 点时补充（{SOURCE}）："
            "沪市 / 北交所 is_st 改用巨潮上市状态变动表（戴帽 / 摘帽 / 披* / 摘*，变动日生效），is_st 变化的行重算涨跌停；"
            "深市 is_st 维持深交所简称变更口径。"
            f"mcap_total = 点时总股本（含 B / H 股，可得日 = max(变动日, 公告日)）× A 股不复权收盘，非空 {rep.get('mcap_total_nonnull_share')}；"
            f"industry = 申万一级（2021-07-30 前旧版、之后 2021 版，点时），非空 {rep.get('industry_nonnull_share')}；"
            "巨潮行业 / 股本接口不覆盖退市股，退市股这两列为空（用作股票池筛选会引入幸存者偏差，详见 DATA-CN-HK.md）。")


def augment(market: str = MARKET) -> dict:
    """读已构建的 prices.parquet，增补后写回并更新 MANIFEST（不重下 K 线、不重跑 cn.build）。"""
    prices = store.read_prices(market, raw=True)
    sec = store.read_securities(market)
    st_iv = pd.read_parquet(pit_path("st_pit", market)) if pit_path("st_pit", market).exists() else None
    covered = status_covered_codes(market) if st_iv is not None else None
    shares = pd.read_parquet(pit_path("shares_pit", market)) if pit_path("shares_pit", market).exists() else None
    ind = pd.read_parquet(pit_path("industry_pit", market)) if pit_path("industry_pit", market).exists() else None
    prices, rep = augment_prices(prices, sec, st_iv, covered, shares, ind)
    p1 = store.write_prices(market, prices)
    from ..schema import Manifest

    old = store.read_manifest(market)
    notes = [ln for ln in old.get("notes", "").split("\n") if not ln.startswith(MANIFEST_NOTE_TAG)]
    notes = [ln.replace("沪市 / 北交所 ST 未知（NA）按非 ST 处理 → 沪市 ST 股 5% 涨跌停会漏判。",
                        "沪市 / 北交所 ST 见下方 [cn_pit] 一行。") for ln in notes]
    notes.append(manifest_note(rep))
    m = Manifest(market=market, source=old["source"] + " | " + SOURCE, survivorship=old["survivorship"],
                 downloaded_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                 coverage=tuple(old["coverage"]), rows=int(len(prices)), securities=int(prices["code"].nunique()),
                 sha256={p1.name: "", "securities.parquet": ""}, notes="\n".join(notes))
    store.write_manifest(m)
    return rep


def build(market: str = MARKET, do_augment: bool = True) -> dict:
    out = {}
    st = build_st(market)
    out["st_intervals"] = int(len(st))
    ind = build_industry(market)
    out["industry_intervals"] = int(len(ind))
    out["industry_codes"] = int(ind["code"].nunique()) if len(ind) else 0
    sh = build_shares(market)
    out["shares_records"] = int(len(sh))
    out["shares_codes"] = int(sh["code"].nunique()) if len(sh) else 0
    if do_augment and (store.market_dir(market) / "prices.parquet").exists():
        out["augment"] = augment(market)
    return out


# ---------------- 审计 ----------------
def limit_hit_share(px: pd.DataFrame, ratio: float = 0.05) -> float:
    """收盘恰好落在 ±ratio 价位（四舍五入到分）的行占比（与 cn 审计口径一致）。"""
    ref = px["ref_close"]
    up = cn.round_price(ref * (1 + ratio))
    dn = cn.round_price(ref * (1 - ratio))
    hit = ((px["close"] - up).abs() < 0.005) | ((px["close"] - dn).abs() < 0.005)
    return round(float(hit[ref.notna()].mean()), 4) if ref.notna().any() else float("nan")


SSE_GBJG_URL = "https://query.sse.com.cn/commonQuery.do"


def sse_share_structure(code: str, refresh: bool = False, market: str = MARKET) -> dict:
    """上交所「股本结构」当前值（单位万股；TOTAL_DOMESTIC_VOL = A + B，TRADE_DATE = 数据日）。只作审计参考。"""
    c = http.client(market)
    params = {"sqlId": "COMMON_SSE_CP_GPJCTPZ_GPLB_GPGK_GBJG_C", "COMPANY_CODE": code, "isPagination": "false"}
    body = c.get(SSE_GBJG_URL, params, headers={"Referer": "https://www.sse.com.cn/"},
                 cache_file=f"{PIT_SUBDIR}/sse_gbjg/{code}.json", max_age=0 if refresh else None,
                 validate=_sse_ok)
    return http.parse_json(body)


def _sse_ok(body: bytes) -> bool:
    try:
        return bool(http.parse_json(body).get("result"))
    except (ValueError, AttributeError):
        return False


def sse_reference_sample(sec: pd.DataFrame, n: int = 150, seed: int = 20261127) -> list[str]:
    """审计用的沪市当前上市股随机样本（主板 + 科创板）。"""
    codes = sorted(sec.loc[(sec["status"] == "listed") & (sec["exchange"] == "SSE"), "code"].astype(str))
    rng = np.random.default_rng(seed)
    return sorted(rng.choice(codes, size=min(n, len(codes)), replace=False).tolist())


def sse_share_reference_cached(market: str = MARKET) -> pd.DataFrame:
    rows = []
    for p in sorted(http.raw_dir(market, PIT_SUBDIR, "sse_gbjg").glob("*.json")):
        r = (http.parse_json(p.read_bytes()).get("result") or [{}])[0]
        v = pd.to_numeric(r.get("TOTAL_DOMESTIC_VOL"), errors="coerce")
        if pd.notna(v) and r.get("TRADE_DATE"):
            rows.append((p.stem, float(v) * 1e4, pd.Timestamp(r["TRADE_DATE"])))
    return pd.DataFrame(rows, columns=["code", "ref", "ref_date"])


def shares_record_asof(sh: pd.DataFrame, date) -> pd.DataFrame:
    """每只股票在 date 当日可得的股本记录（可得日 ≤ date 中变动日最新的一条）。"""
    d = sh[(sh["avail_date"] <= pd.Timestamp(date)) & sh["total_shares"].notna()]
    return d.sort_values(["vary_date", "avail_date"]).groupby("code").tail(1)


def shares_reference_check(sh: pd.DataFrame, ref: pd.DataFrame, kind: str = "a") -> dict:
    """点时总股本 vs 交易所参考值。kind='a'：总股本 − B − H（深交所 A股总股本）；'domestic'：总股本 − H（上交所境内总股本）。"""
    parts = []
    for day, g in ref.groupby("ref_date"):
        rec = shares_record_asof(sh[sh["code"].isin(g["code"])], day)
        rec = rec.assign(x=rec["total_shares"] - rec["h_shares"].fillna(0)
                         - (rec["b_shares"].fillna(0) if kind == "a" else 0))
        parts.append(g.merge(rec[["code", "x"]], on="code"))
    mm = pd.concat(parts, ignore_index=True).dropna(subset=["ref", "x"]) if parts else pd.DataFrame()
    if mm.empty:
        return {"n": 0}
    err = (mm["x"] / mm["ref"] - 1).abs()
    worst = mm.assign(err=err).sort_values("err").tail(5)
    return {"n": int(len(mm)), "ref_dates": sorted({str(d.date()) for d in mm["ref_date"]}),
            "median_abs_err": round(float(err.median()), 6), "share_exact_0.01pct": round(float((err < 1e-4).mean()), 4),
            "share_within_1pct": round(float((err < 0.01).mean()), 4), "p95_abs_err": round(float(err.quantile(0.95)), 4),
            "worst": [{"code": r.code, "pit": r.x, "ref": r.ref, "err": round(float(r.err), 4)} for r in worst.itertuples()]}


def _by_year(px: pd.DataFrame, col: str) -> dict:
    return {int(y): round(float(s.notna().mean()), 3) for y, s in px.groupby(px["date"].dt.year)[col]}


def audit(market: str = MARKET) -> dict:
    out: dict = {}
    px = store.read_prices(market, ["close", "ref_close", "is_st", "mcap_total", "mcap_float", "industry",
                                    "total_shares", "float_shares"], raw=True)
    sec = store.read_securities(market)
    px["board"] = px["code"].map(cn.board_of)
    px["ex"] = px["code"].map(cn.exchange_of)
    pre = px[px["date"] < cn.MAIN_ST_10PCT]
    # 1) ST：±5% 命中率（主板，2026-07-06 前）
    st_chk = {}
    for ex in ("SSE", "SZSE"):
        g = pre[(pre["ex"] == ex) & (pre["board"] == "主板")]
        s = g["is_st"].fillna(False).astype(bool)
        st_chk[ex] = {"st_rows": int(s.sum()), "nonst_rows": int((~s).sum()),
                      "st_hit_5pct": limit_hit_share(g[s]), "nonst_hit_5pct": limit_hit_share(g[~s]),
                      "st_row_share": round(float(s.mean()), 4)}
    out["st_limit_check_main_board_pre_2026-07-06"] = st_chk
    out["st_by_exchange_rows"] = {ex: {"true": int(s.fillna(False).sum()), "na": int(s.isna().sum()), "rows": int(len(s))}
                                  for ex, s in px.groupby("ex")["is_st"]}
    # 2) 深市交叉核对：巨潮状态表 vs 深交所简称变更
    st_iv = pd.read_parquet(pit_path("st_pit", market))
    sz = px[px["ex"] == "SZSE"][["code", "date", "is_st"]]
    cninfo_sz = st_flags_pit(sz, st_iv, status_covered_codes(market))
    a = sz["is_st"].fillna(False).astype(bool).to_numpy()
    b = cninfo_sz.fillna(False).astype(bool).to_numpy()
    out["sz_crosscheck"] = {"rows": int(len(sz)), "agree": round(float((a == b).mean()), 5),
                            "name_st_only": int((a & ~b).sum()), "cninfo_st_only": int((~a & b).sum()),
                            "both_st": int((a & b).sum())}
    # 3) 行业覆盖
    ind = pd.read_parquet(pit_path("industry_pit", market))
    out["industry"] = {
        "codes": int(ind["code"].nunique()),
        "stock_day_coverage": round(float(px["industry"].notna().mean()), 4),
        "coverage_listed": round(float(px.loc[px["code"].isin(sec.loc[sec["status"] == "listed", "code"]), "industry"].notna().mean()), 4),
        "coverage_by_year": _by_year(px, "industry"),
        "systems": ind.groupby("system").agg(codes=("code", "nunique"), intervals=("code", "size"),
                                             backfilled=("backfilled", "sum")).to_dict("index"),
        "empirical_launch": empirical_launch(ind),
        "sw_level1_names_latest": int(ind[(ind["system_code"] == "008003")]["level1_name"].nunique()),
    }
    # 当前行业对照：深交所 A 股列表「所属行业」（证监会门类，下载于名单日）vs 点时 csrc 最新一条
    try:
        szl = pd.read_parquet(http.raw_dir(market, "meta") / "szse_a.parquet")
        szl["code"] = szl["A股代码"].astype(str).str.zfill(6)
        szl["ref_l1"] = szl["所属行业"].astype(str).str[:1]
        last = ind[ind["system_code"].isin(["008001", "008021"])].sort_values("start_date").groupby("code").tail(1)
        mm = szl.merge(last[["code", "level1_code"]], on="code")
        out["industry"]["szse_current_csrc_l1_agree"] = {"n": int(len(mm)),
                                                         "agree": round(float((mm["ref_l1"] == mm["level1_code"]).mean()), 4)}
    except FileNotFoundError:
        pass
    # 4) 总股本 / 总市值
    sh = pd.read_parquet(pit_path("shares_pit", market))
    out["shares"] = {"codes": int(sh["code"].nunique()), "records": int(len(sh)),
                     "avail_rule": sh["avail_rule"].value_counts().to_dict(),
                     "declare_after_vary_share": round(float((sh["declare_date"] > sh["vary_date"]).mean()), 4),
                     "median_declare_lag_days_when_after": float((sh["declare_date"] - sh["vary_date"]).dt.days[
                         sh["declare_date"] > sh["vary_date"]].median()),
                     "mcap_total_stock_day_coverage": round(float(px["mcap_total"].notna().mean()), 4),
                     "mcap_total_coverage_listed": round(float(px.loc[px["code"].isin(sec.loc[sec["status"] == "listed", "code"]), "mcap_total"].notna().mean()), 4),
                     "coverage_by_year": _by_year(px, "mcap_total")}
    last = px.sort_values("date").groupby("code").tail(1)
    ratio = (last["mcap_float"] / last["mcap_total"]).replace([np.inf, -np.inf], np.nan)
    out["shares"]["latest_float_over_total"] = {"median": round(float(ratio.median()), 4),
                                                "share_gt_1.02": round(float((ratio > 1.02).mean()), 4)}
    # 对照交易所当前股本（深交所 A 股列表「A股总股本」、上交所股本结构「境内总股本」），按参考日点时取值
    refs = []
    try:
        p = http.raw_dir(market, "meta") / "szse_a.parquet"
        szl = pd.read_parquet(p)
        refs.append(("vs_szse_list_a_total", pd.DataFrame({
            "code": szl["A股代码"].astype(str).str.zfill(6),
            "ref": pd.to_numeric(szl["A股总股本"].astype(str).str.replace(",", ""), errors="coerce"),
            "ref_date": pd.Timestamp(datetime.fromtimestamp(p.stat().st_mtime).date())}), "a"))
    except FileNotFoundError:
        pass
    sse = sse_share_reference_cached(market)
    if not sse.empty:
        refs.append(("vs_sse_share_structure_domestic", sse, "domestic"))
    for name, ref, kind in refs:
        out["shares"][name] = shares_reference_check(sh, ref, kind)
    return out


# ---------------- 命令行 ----------------
def main(argv=None):
    ap = argparse.ArgumentParser(prog="factorlab.sources.cn_pit")
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--limit", type=int, default=None, help="试下载：分层抽样只数（含约 10%% 退市股）")
    f.add_argument("--codes", default=None, help="逗号分隔代码")
    f.add_argument("--what", default="status,industry,shares")
    f.add_argument("--include-delisted", action="store_true", help="逐只接口也请求退市股（巨潮返回空）")
    f.add_argument("--rps", type=float, default=1.0, help="限速（次/秒），默认 1")
    f.add_argument("--refresh", action="store_true")
    b = sub.add_parser("build")
    b.add_argument("--no-augment", action="store_true")
    sub.add_parser("augment")
    sub.add_parser("audit")
    sr = sub.add_parser("sse-ref", help="下载上交所当前股本结构样本（审计参考；每只 1 次请求）")
    sr.add_argument("--n", type=int, default=150)
    sr.add_argument("--rps", type=float, default=1.0)
    a = ap.parse_args(argv)
    if a.cmd == "fetch":
        http.set_rate(a.rps)
        what = [w.strip() for w in a.what.split(",") if w.strip()]
        kinds = [k for k in what if k in ("industry", "shares")]
        sec = store.read_securities(MARKET)
        if a.codes:
            codes = a.codes.split(",")
        elif a.limit:
            n_dl = max(1, a.limit // 10)
            codes = cn.pilot_sample(sec, a.limit - n_dl, n_delisted=n_dl)
        else:
            codes = target_codes(sec, a.include_delisted)
        res = fetch(codes, kinds, refresh=a.refresh, status="status" in what)
        res["codes"] = len(codes)
        res["http"] = http.stats()
        print(json.dumps(res, ensure_ascii=False, default=str))
    elif a.cmd == "build":
        print(json.dumps(build(do_augment=not a.no_augment), ensure_ascii=False, indent=2, default=str))
    elif a.cmd == "augment":
        print(json.dumps(augment(), ensure_ascii=False, indent=2, default=str))
    elif a.cmd == "audit":
        print(json.dumps(audit(), ensure_ascii=False, indent=2, default=str))
    elif a.cmd == "sse-ref":
        http.set_rate(a.rps)
        failed = []
        for code in sse_reference_sample(store.read_securities(MARKET), a.n):
            try:
                sse_share_structure(code)
            except http.HttpError as e:
                failed.append(code)
                print(f"[cn_pit] sse {code} 失败：{e}", file=sys.stderr)
        print(json.dumps({"failed": failed, "http": http.stats()}))


if __name__ == "__main__":
    main()
