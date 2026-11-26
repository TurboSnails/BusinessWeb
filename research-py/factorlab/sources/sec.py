"""SEC EDGAR 财报适配器（点时 point-in-time；主键 = CIK）。

数据源（都需要带联系方式的 User-Agent，SEC 的公平访问规则要求）：
- https://www.sec.gov/files/company_tickers.json            当前 ticker → CIK 映射
- https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json   某公司全部 XBRL 事实
- https://data.sec.gov/submissions/CIK##########.json        申报列表（含 acceptanceDateTime，可选）

User-Agent 只从环境变量 SEC_USER_AGENT 或本机私有文件 research-py/.secrets/sec_user_agent（不进 git，由用户自己写入）读取；未设置时本模块的每个联网函数都抛 SecUserAgentMissing，
命令行打印设置方法。代码里不写任何个人姓名或邮箱。

点时规则（docs/research/factorlab/DESIGN.md 第三节）：
1. 只用 companyfacts 每条事实自带的 filed（申报日）/ accn（申报编号）判断「何时可知」；不用 fy / fp
   （它们描述的是**申报文件**的财年 / 季度，同一期间的数值会出现在之后多份文件的对比栏里）。
2. 期间按 start / end 对齐（时点科目只有 end）。
3. 同一期间在之后的文件里重复出现、数值不变 → 只保留最早那条；数值变了（重述、10-K/A、10-Q/A）
   → 另记一条「之后才知道的新值」，从不覆盖历史（vintage 表）。
4. 生效日：申报在收盘（美东 16:00）后受理 → 下一交易日生效；没有受理时间时保守地用 filed + 1 个交易日
   （本模块用工作日近似交易日，节假日顺延由引擎按交易日历处理）。
5. 10-Q 的现金流（以及部分利润表）科目是年初至今累计（YTD）→ 差分成单季：Q2 = H1 − Q1，Q3 = 9M − H1，
   Q4 = 年度 − 9M。差分值的生效日 = 所用各分量里最晚的生效日；任一分量后来被重述，差分值也另记新版本。

命令行：
    export SEC_USER_AGENT="组织名 联系邮箱"      # 必须自己设置
    uv run python -m factorlab.sources.sec tickers
    uv run python -m factorlab.sources.sec facts --cik 320193 [--concepts NetIncomeLoss,Assets]
"""

from __future__ import annotations

import argparse
import gzip
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from .. import store

MARKET = "us_sec"
ENV_UA = "SEC_USER_AGENT"
TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json"
SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik:010d}.json"
NY = ZoneInfo("America/New_York")

# (taxonomy, concept)；收入有多个互相替代的科目，不合并，各自保留
DEFAULT_CONCEPTS: list[tuple[str, str]] = [
    ("us-gaap", "NetIncomeLoss"),
    ("us-gaap", "StockholdersEquity"),
    ("us-gaap", "Assets"),
    ("us-gaap", "Liabilities"),
    ("us-gaap", "Revenues"),
    ("us-gaap", "RevenueFromContractWithCustomerExcludingAssessedTax"),
    ("us-gaap", "SalesRevenueNet"),
    ("us-gaap", "OperatingIncomeLoss"),
    ("us-gaap", "GrossProfit"),
    ("us-gaap", "NetCashProvidedByUsedInOperatingActivities"),
    ("us-gaap", "PaymentsToAcquirePropertyPlantAndEquipment"),
    ("us-gaap", "CommonStockSharesOutstanding"),
    ("dei", "EntityCommonStockSharesOutstanding"),
]

USAGE = (f"未设置环境变量 {ENV_UA}。SEC 要求请求头带可联系的 User-Agent，请自行设置，例如：\n"
         f'    export {ENV_UA}="YourOrganization your-contact@example.com"\n'
         "（本项目不会在代码或请求里写入任何个人信息；值只从环境变量读取。）")


class SecUserAgentMissing(RuntimeError):
    pass


# 本机私有文件（.gitignore 已排除 .secrets/）：环境变量未设置时从这里读，内容只有一行 User-Agent，由用户自己写入
UA_FILE = Path(__file__).resolve().parents[2] / ".secrets" / "sec_user_agent"


def user_agent() -> str:
    ua = os.environ.get(ENV_UA, "").strip()
    if not ua and UA_FILE.exists():
        ua = UA_FILE.read_text(encoding="utf-8").strip()
    if not ua:
        raise SecUserAgentMissing(USAGE)
    return ua


def _http():
    from .us import _Http
    # SEC 公平访问上限 10 次/秒；这里留余量用 ~6 次/秒
    return _Http(min_interval=0.16, headers={"User-Agent": user_agent(), "Accept-Encoding": "gzip, deflate"})


def raw_dir(*parts: str) -> Path:
    d = store.market_dir(MARKET) / "raw" / Path(*parts) if parts else store.market_dir(MARKET) / "raw"
    d.mkdir(parents=True, exist_ok=True)
    return d


# ----------------------------------------------------------------------------------------------
# 下载（全部需要 SEC_USER_AGENT）
# ----------------------------------------------------------------------------------------------
def fetch_company_tickers(refresh: bool = False) -> pd.DataFrame:
    """当前 ticker → CIK 映射。注意：ticker 会被重复使用（退市公司的代码可能分给新公司），
    只能把它当成「下载当日」的映射；历史上的 ticker 归属必须以 CIK 为准。"""
    user_agent()
    p = raw_dir() / "company_tickers.json"
    if refresh or not p.exists():
        p.write_bytes(_http().get(TICKERS_URL))
    return parse_company_tickers(json.loads(p.read_text()), as_of=datetime.fromtimestamp(
        p.stat().st_mtime, timezone.utc).date().isoformat())


def parse_company_tickers(data: dict, as_of: str | None = None) -> pd.DataFrame:
    rows = [(int(v["cik_str"]), str(v["ticker"]).upper(), v.get("title", "")) for v in data.values()]
    df = pd.DataFrame(rows, columns=["cik", "ticker", "title"])
    df["mapping_as_of"] = as_of
    return df


def fetch_companyfacts(cik: int, refresh: bool = False) -> dict:
    user_agent()
    p = raw_dir("companyfacts") / f"CIK{int(cik):010d}.json.gz"
    if refresh or not p.exists():
        p.write_bytes(gzip.compress(_http().get(FACTS_URL.format(cik=int(cik)))))
    return json.loads(gzip.decompress(p.read_bytes()))


def fetch_acceptance_times(cik: int, refresh: bool = False) -> dict[str, str]:
    """accn → acceptanceDateTime（ISO，UTC），来自 submissions API 的 recent 段（最近约 1000 份申报）。"""
    user_agent()
    p = raw_dir("submissions") / f"CIK{int(cik):010d}.json.gz"
    if refresh or not p.exists():
        p.write_bytes(gzip.compress(_http().get(SUBMISSIONS_URL.format(cik=int(cik)))))
    return parse_acceptance_times(json.loads(gzip.decompress(p.read_bytes())))


def parse_acceptance_times(sub: dict) -> dict[str, str]:
    rec = (sub.get("filings") or {}).get("recent") or {}
    return dict(zip(rec.get("accessionNumber", []), rec.get("acceptanceDateTime", [])))


# ----------------------------------------------------------------------------------------------
# 点时提取（离线，纯函数）
# ----------------------------------------------------------------------------------------------
def effective_date(filed: pd.Series, accn: pd.Series | None = None,
                   acceptance: dict[str, str] | None = None) -> pd.Series:
    """生效日：有受理时间时，美东 16:00 前受理 → 当日收盘后可用、记为当日；16:00 及以后 → 下一工作日。
    没有受理时间 → filed + 1 个工作日（保守）。返回的日期表示「从这一天收盘起可用于计算信号」。"""
    filed = pd.to_datetime(filed)
    eff = filed + pd.offsets.BDay(1)
    if acceptance and accn is not None:
        for i, a in zip(filed.index, accn):
            t = acceptance.get(a)
            if not t:
                continue
            ts = pd.Timestamp(t)
            ts = ts.tz_localize("UTC") if ts.tzinfo is None else ts
            local = ts.tz_convert(NY)
            day = pd.Timestamp(local.date())
            eff.loc[i] = day if local.hour < 16 else day + pd.offsets.BDay(1)
    return eff


def extract_facts(facts: dict, concepts: list[tuple[str, str]] | None = None,
                  acceptance: dict[str, str] | None = None) -> pd.DataFrame:
    """companyfacts JSON → 全部原始观测（一行 = 一份申报里的一个数值），带 effective_date。

    列：cik, taxonomy, concept, unit, start, end, period_days, val, accn, form, fy, fp, frame, filed,
        is_amendment, effective_date
    """
    concepts = concepts or DEFAULT_CONCEPTS
    cik = int(facts.get("cik", 0))
    rows = []
    for tax, con in concepts:
        node = (facts.get("facts") or {}).get(tax, {}).get(con)
        if not node:
            continue
        for unit, obs in (node.get("units") or {}).items():
            for o in obs:
                rows.append((cik, tax, con, unit, o.get("start"), o.get("end"), o.get("val"), o.get("accn"),
                             o.get("form"), o.get("fy"), o.get("fp"), o.get("frame"), o.get("filed")))
    cols = ["cik", "taxonomy", "concept", "unit", "start", "end", "val", "accn", "form", "fy", "fp", "frame",
            "filed"]
    df = pd.DataFrame(rows, columns=cols)
    for c in ("start", "end", "filed"):
        df[c] = pd.to_datetime(df[c])
    df["val"] = pd.to_numeric(df["val"], errors="coerce")
    df["period_days"] = (df["end"] - df["start"]).dt.days + 1
    df["is_amendment"] = df["form"].fillna("").str.endswith("/A")
    df["effective_date"] = effective_date(df["filed"], df["accn"], acceptance) if len(df) else df["filed"]
    return df.sort_values(["concept", "unit", "end", "start", "filed", "accn"], na_position="first"
                          ).reset_index(drop=True)


def vintages(obs: pd.DataFrame) -> pd.DataFrame:
    """原始观测 → vintage 表：每个 (concept, unit, start, end) 期间按生效日排序，只保留首次出现和数值变化的行。
    同一天生效的多条（如同日 10-K 与对比栏）取 accn 最大的那条作为当日的值。"""
    if obs.empty:
        return obs.assign(version=pd.Series(dtype="int64"))
    key = ["concept", "unit", "start", "end"]
    o = obs.sort_values(key + ["effective_date", "accn"], na_position="first")
    o = o.groupby(key + ["effective_date"], dropna=False, sort=False).tail(1)
    prev = o.groupby(key, dropna=False, sort=False)["val"].shift(1)
    new_period = o.groupby(key, dropna=False, sort=False).cumcount() == 0
    keep = new_period | (o["val"] != prev)
    v = o[keep].copy()
    v["version"] = v.groupby(key, dropna=False, sort=False).cumcount() + 1
    return v.reset_index(drop=True)


def asof(vint: pd.DataFrame, date) -> pd.DataFrame:
    """截至 date（含）已生效的最新值：每个期间一行。"""
    d = pd.Timestamp(date)
    v = vint[vint["effective_date"] <= d]
    key = ["concept", "unit", "start", "end"]
    return v.sort_values("effective_date").groupby(key, dropna=False, sort=False).tail(1).reset_index(drop=True)


def _classify_len(days: float) -> str:
    if pd.isna(days):
        return "instant"
    if 80 <= days <= 100:
        return "Q"
    if 170 <= days <= 195:
        return "H"
    if 260 <= days <= 285:
        return "9M"
    if 350 <= days <= 380:
        return "FY"
    return "other"


def _quarters_from_snapshot(snap: pd.DataFrame) -> dict[pd.Timestamp, tuple[float, pd.Timestamp, str, pd.Timestamp]]:
    """一个科目、一个时点的快照 → {季末: (单季值, 季初, 方法, 所用分量的最晚生效日)}。直接的 3 个月值优先。"""
    out: dict = {}
    s = snap.copy()
    s["len"] = s["period_days"].map(_classify_len)
    for r in s[s["len"] == "Q"].itertuples():
        out[r.end] = (float(r.val), r.start, "direct", r.effective_date)
    # 同一起点（财年初）的累计值：Q1(=YTD3M) / H / 9M / FY
    for start, g in s[s["len"].isin(["Q", "H", "9M", "FY"])].groupby("start"):
        g = g.sort_values("end")
        ytd = {r.len: r for r in g.itertuples()}
        for cur, prv, how in (("H", "Q", "ytd_diff"), ("9M", "H", "ytd_diff"), ("FY", "9M", "fy_minus_9m")):
            if cur in ytd and prv in ytd:
                a, b = ytd[cur], ytd[prv]
                if a.end in out and out[a.end][2] == "direct":
                    continue
                gap = (a.end - b.end).days
                if not 80 <= gap <= 100:
                    continue
                out[a.end] = (float(a.val) - float(b.val), pd.Timestamp(b.end) + pd.offsets.Day(1), how,
                              max(a.effective_date, b.effective_date))
    return out


def quarterize(vint: pd.DataFrame, concept: str, unit: str | None = None) -> pd.DataFrame:
    """把流量科目（利润表、现金流量表）还原成点时的单季序列。

    在该科目每一个「新知识」时点 t（vintage 表里的每个不同生效日）用截至 t 的快照重算各季度；
    某季度的值第一次出现或与上次不同就记一行，生效日 = t（≥ 所用分量的生效日）。
    列：concept, unit, q_start, q_end, val, method(direct/ytd_diff/fy_minus_9m), effective_date, version
    """
    v = vint[(vint["concept"] == concept) & vint["start"].notna()]
    if unit is not None:
        v = v[v["unit"] == unit]
    cols = ["concept", "unit", "q_start", "q_end", "val", "method", "effective_date", "version"]
    if v.empty:
        return pd.DataFrame(columns=cols)
    unit = unit or v["unit"].mode().iloc[0]
    v = v[v["unit"] == unit]
    last: dict = {}
    rows = []
    for t in sorted(v["effective_date"].unique()):
        snap = asof(v, t)
        for q_end, (val, q_start, how, _eff) in sorted(_quarters_from_snapshot(snap).items()):
            prev = last.get(q_end)
            if prev is None or not np.isclose(prev, val, rtol=0, atol=1e-6):
                last[q_end] = val
                rows.append((concept, unit, q_start, q_end, val, how, pd.Timestamp(t)))
    df = pd.DataFrame(rows, columns=cols[:-1])
    df["version"] = df.groupby("q_end").cumcount() + 1
    return df.sort_values(["q_end", "version"]).reset_index(drop=True)


def latest_known(vint: pd.DataFrame, date, concept: str, period: str | None = None) -> pd.Series | None:
    """截至 date 已知的、期末最晚的一个值（period 取 'FY' / 'Q' / 'instant' 等过滤期间长度）。"""
    a = asof(vint[vint["concept"] == concept], date)
    if period:
        a = a[a["period_days"].map(_classify_len) == period]
    if a.empty:
        return None
    return a.sort_values(["end", "effective_date"]).iloc[-1]


def build_pit(cik: int, concepts: list[tuple[str, str]] | None = None, use_acceptance: bool = True) -> Path:
    """下载（需 SEC_USER_AGENT）→ vintage 表写到 {root}/us_sec/pit/CIK##########.parquet。"""
    facts = fetch_companyfacts(cik)
    acc = fetch_acceptance_times(cik) if use_acceptance else None
    v = vintages(extract_facts(facts, concepts, acc))
    d = store.market_dir(MARKET) / "pit"
    d.mkdir(parents=True, exist_ok=True)
    p = d / f"CIK{int(cik):010d}.parquet"
    v.to_parquet(p, index=False)
    return p


# ----------------------------------------------------------------------------------------------
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m factorlab.sources.sec", description="SEC EDGAR 点时财报")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("tickers", help="下载 ticker → CIK 映射")
    f = sub.add_parser("facts", help="下载某公司 companyfacts 并生成点时 vintage 表")
    f.add_argument("--cik", type=int, required=True)
    f.add_argument("--concepts", default=None, help="逗号分隔，可写 taxonomy:concept，默认 us-gaap")
    a = ap.parse_args(argv)
    try:
        user_agent()
    except SecUserAgentMissing as e:
        print(str(e), file=sys.stderr)
        return 2
    if a.cmd == "tickers":
        df = fetch_company_tickers(refresh=True)
        print(f"{len(df)} 条 ticker → CIK 映射（当前快照；ticker 会被重复使用，历史以 CIK 为准）")
    elif a.cmd == "facts":
        concepts = None
        if a.concepts:
            concepts = [tuple(c.split(":", 1)) if ":" in c else ("us-gaap", c) for c in a.concepts.split(",")]
        p = build_pit(a.cik, concepts)
        v = pd.read_parquet(p)
        print(f"写入 {p}：{len(v)} 行；科目 {v['concept'].nunique()}；"
              f"申报日 {v['filed'].min().date()} → {v['filed'].max().date()}；修订版本行 {int((v['version'] > 1).sum())}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
