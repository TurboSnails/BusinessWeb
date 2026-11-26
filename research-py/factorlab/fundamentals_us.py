"""美股点时基本面面板：SEC companyfacts vintage 表（sources/sec.py）→ 「知识时点」事件表 → 月末 × 代码 的字段。

两步：
1. build()（离线、一次）：逐个 CIK 读 {root}/us_sec/pit/CIK##########.parquet，在该公司每一个「新知识」
   时点 t（任一所需科目的生效日 effective_date）用截至 t 已生效的数值（sec.asof 的同一口径：每个期间取
   生效日 ≤ t 的最新版本）算一行状态，写 {root}/us_sec/derived/events.parquet。每行只用生效日 ≤ t 的数据。
2. panel_fields(fields, panel, end_ex, hidden)（每次评估时，由 data.load_market 调用）：先删掉生效日不早于
   可见上界 end_ex（以及落在被删区间 hidden）的事件——可见上界由 data.window() / guard.Lockbox 按模式给出，
   本模块不写死任何日期；再把事件按 CIK → 代码映射、在面板的每个月末交易日 d 取「t ≤ d 的最新状态」，
   做 15 个月陈旧度检查与拆股调整，得到月末行索引的宽表（行 = 月末交易日，列 = 代码）。

字段（都是月末行；陈旧 = 所用期末日早于 d 超过 STALE_DAYS 天 → 空）：
- mcap_total / mcap_float：股本（dei EntityCommonStockSharesOutstanding，缺失或比 us-gaap 晚一年以上时用
  us-gaap CommonStockSharesOutstanding）× 当日不复权收盘价。股本按拆股调整到 d 的口径：dei 的封面股数是
  期末（封面日）当天的股数，乘以 (封面日, d] 内的拆股比例；us-gaap 的资产负债表股数按 SAB Topic 4C 已反映到
  申报日为止的拆股，乘以 (申报日, d] 内的拆股比例。只有总股本，mcap_float 与 mcap_total 相同（写明）。
  多类股公司（同一 CIK 多个代码）只给 company_tickers.json 里排第一的代码，其余代码为空（不重复计公司）。
- fund_be：StockholdersEquity（最新期末，不含少数股东权益；没有按 Fama–French 加递延税、减优先股）。
- fund_ni_ttm / fund_cfo_ttm / fund_gp_ttm：NetIncomeLoss / NetCashProvidedByUsedInOperatingActivities /
  GrossProfit 的最近 12 个月。口径 = 最新年报 + 本年初至今 − 上年同期（10-Q 的现金流是年初累计，等价于
  sec.quarterize 的单季还原再加总最近 4 季，测试核对）；拿不到时用连续 4 个直接披露的单季相加；再不行用
  最新年报值（期末更旧，陈旧度照查）。
- fund_assets / fund_assets_lag：Assets 最新期末值，与同一快照里期末约早一年（330–400 天）的值。
- fund_accruals：(NI_TTM − CFO_TTM) / 平均总资产；三者期末日相差超过 10 天时为空。
- fund_net_issuance：log(拆股调整后股本_d / 拆股调整后股本_{d−12 月})，两边都按 d 的口径调整、各自不陈旧、
  且 d 时的股本期末晚于 12 个月前的。
- turnover（日度）：成交量 / 当日已知的拆股调整后股本（同上口径），供 turnover_20d 使用。

ticker 会被重复使用：代码 → CIK 用 company_tickers.json 的当前快照，只能保证「现在的代码属于现在这家公司」；
Yahoo 的价格历史跟随当前证券，所以按 CIK 对上的财报与价格属于同一家公司，但若某代码曾属于别的公司、
Yahoo 又把旧历史接在一起，会错配（无法从免费数据核实，写明）。
"""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path

import numpy as np
import pandas as pd

from . import store

BUILD_VERSION = "fund-us-v1"
STALE_DAYS = 456          # 15 个月
SEC_MARKET = "us_sec"
PRICE_MARKET = "us"

FIELDS_MONTHLY = ("mcap_total", "mcap_float", "fund_be", "fund_ni_ttm", "fund_cfo_ttm", "fund_gp_ttm",
                  "fund_assets", "fund_assets_lag", "fund_accruals", "fund_net_issuance")
FIELDS_DAILY = ("turnover",)
PROVIDES = FIELDS_MONTHLY + FIELDS_DAILY
NEEDS = ("close", "volume")   # 计算上述字段要用的日线字段（不复权收盘、成交量）

USD, SHARES = "USD", "shares"
_NAT = np.iinfo(np.int64).min


# ================================================================ 单家公司：快照与 TTM（纯函数）
class _Con:
    """一个科目（单一单位）的 vintage 行，按生效日排序后的数组（日期为自 1970 起的天数）。"""

    __slots__ = ("s", "e", "v", "eff", "filed", "form", "key", "n")

    def __init__(self, df: pd.DataFrame):
        df = df.sort_values(["effective_date", "accn"] if "accn" in df else ["effective_date"], kind="stable")
        self.s = _days(df["start"])
        self.e = _days(df["end"])
        self.v = df["val"].to_numpy(float)
        self.eff = _days(df["effective_date"])
        self.filed = _days(df["filed"]) if "filed" in df else self.eff
        self.form = df["form"].fillna("").astype(str).to_numpy() if "form" in df else np.full(len(df), "")
        self.key = pd.factorize(pd.MultiIndex.from_arrays([self.s, self.e]))[0]
        self.n = len(df)

    def snapshot(self, t: int) -> np.ndarray:
        """截至 t（含）已生效、每个期间 (start, end) 最新版本的行号。"""
        k = int(np.searchsorted(self.eff, t, side="right"))
        if k == 0:
            return np.empty(0, dtype=int)
        keys = self.key[:k][::-1]
        _, first = np.unique(keys, return_index=True)
        return (k - 1 - first)


def _days(s: pd.Series) -> np.ndarray:
    a = pd.to_datetime(s).to_numpy("datetime64[D]")
    out = a.astype(np.int64)
    out[np.isnat(a)] = _NAT
    return out


def _con(vint: pd.DataFrame, concept: str, unit: str) -> _Con | None:
    d = vint[(vint["concept"] == concept) & (vint["unit"] == unit) & vint["val"].notna()]
    return _Con(d) if len(d) else None


def instant_latest(c: _Con | None, idx: np.ndarray) -> tuple[float, int, int, int, str]:
    """时点科目：期末最晚的值 →（值，期末，生效日，申报日，申报表格）。"""
    if c is None or len(idx) == 0:
        return np.nan, _NAT, _NAT, _NAT, ""
    idx = idx[c.s[idx] == _NAT]
    if len(idx) == 0:
        return np.nan, _NAT, _NAT, _NAT, ""
    i = idx[np.argmax(c.e[idx])]
    return c.v[i], c.e[i], c.eff[i], c.filed[i], c.form[i]


def instant_lag(c: _Con | None, idx: np.ndarray, end: int, lo: int = 330, hi: int = 400) -> tuple[float, int, int]:
    """同一快照里期末在 [end − hi, end − lo] 天、最接近 end − 365 的时点值。"""
    if c is None or len(idx) == 0 or end == _NAT:
        return np.nan, _NAT, _NAT
    idx = idx[(c.s[idx] == _NAT) & (c.e[idx] >= end - hi) & (c.e[idx] <= end - lo)]
    if len(idx) == 0:
        return np.nan, _NAT, _NAT
    i = idx[np.argmin(np.abs(c.e[idx] - (end - 365)))]
    return c.v[i], c.e[i], c.eff[i]


def _cls(L: np.ndarray) -> np.ndarray:
    out = np.zeros(len(L), dtype=np.int8)         # 0 = 其他
    out[(L >= 80) & (L <= 100)] = 1               # 单季 / 一季度累计
    out[(L >= 170) & (L <= 195)] = 2              # 半年累计
    out[(L >= 260) & (L <= 285)] = 3              # 9 个月累计
    out[(L >= 350) & (L <= 380)] = 4              # 全年
    return out


def ttm(c: _Con | None, idx: np.ndarray) -> tuple[float, int, int, str]:
    """流量科目最近 12 个月 →（值，期末，所用分量最晚的生效日，方法）。方法：fy | ytd | 4q | fy_old | ''。"""
    none = (np.nan, _NAT, _NAT, "")
    if c is None or len(idx) == 0:
        return none
    idx = idx[c.s[idx] != _NAT]
    if len(idx) == 0:
        return none
    s, e, v, eff = c.s[idx], c.e[idx], c.v[idx], c.eff[idx]
    L = e - s + 1
    k = _cls(L)
    ok = k > 0
    if not ok.any():
        return none
    estar = e[ok].max()
    at = ok & (e == estar)
    fy = k == 4
    if (at & fy).any():
        j = np.flatnonzero(at & fy)
        i = j[np.argmin(np.abs(L[j] - 365))]
        return v[i], estar, eff[i], "fy"
    # 本年初至今：期末 = estar 里最长的那条
    j = np.flatnonzero(at & ~fy)
    i = j[np.argmax(L[j])]
    cls_i, s_i = k[i], s[i]
    prev = np.flatnonzero((k == cls_i) & (e >= estar - 385) & (e <= estar - 345) & (np.abs(s - (s_i - 365)) <= 20))
    fyr = np.flatnonzero(fy & (np.abs(e - (s_i - 1)) <= 10))
    if len(prev) and len(fyr):
        p = prev[np.argmin(np.abs(e[prev] - (estar - 365)))]
        f = fyr[np.argmin(np.abs(L[fyr] - 365))]
        return v[f] + v[i] - v[p], estar, max(eff[i], eff[p], eff[f]), "ytd"
    # 连续 4 个直接披露的单季
    q = np.flatnonzero(k == 1)
    chain, end_, tot, last_eff = 0, estar, 0.0, _NAT
    for _ in range(4):
        cand = q[np.abs(e[q] - end_) <= 3]
        if len(cand) == 0:
            break
        b = cand[np.argmin(np.abs(L[cand] - 91))]
        tot += v[b]
        last_eff = max(last_eff, eff[b])
        end_ = s[b] - 1
        chain += 1
    if chain == 4:
        return tot, estar, last_eff, "4q"
    if fy.any():
        j = np.flatnonzero(fy)
        i = j[np.argmax(e[j])]
        return v[i], e[i], eff[i], "fy_old"
    return none


EVENT_COLS = ["cik", "t", "be", "be_end", "ni", "ni_end", "ni_how", "cfo", "cfo_end", "gp", "gp_end",
              "assets", "assets_end", "assets_lag", "assets_lag_end", "sh", "sh_end", "sh_anchor", "sh_filed",
              "sh_src", "sh_form", "known_at"]


def firm_events(vint: pd.DataFrame) -> pd.DataFrame:
    """一家公司的 vintage 表 → 每个知识时点 t 一行状态（只用生效日 ≤ t 的数据；known_at = 所用分量最晚的生效日）。"""
    cik = int(vint["cik"].iloc[0]) if len(vint) and "cik" in vint else 0
    cons = {
        "be": _con(vint, "StockholdersEquity", USD),
        "ni": _con(vint, "NetIncomeLoss", USD),
        "cfo": _con(vint, "NetCashProvidedByUsedInOperatingActivities", USD),
        "gp": _con(vint, "GrossProfit", USD),
        "assets": _con(vint, "Assets", USD),
        "dei": _con(vint, "EntityCommonStockSharesOutstanding", SHARES),
        "gsh": _con(vint, "CommonStockSharesOutstanding", SHARES),
    }
    times = np.unique(np.concatenate([c.eff for c in cons.values() if c is not None] or [np.empty(0, np.int64)]))
    rows = []
    for t in times:
        snap = {k: (c.snapshot(t) if c is not None else np.empty(0, int)) for k, c in cons.items()}
        be, be_end, be_eff, _, _ = instant_latest(cons["be"], snap["be"])
        ni, ni_end, ni_eff, ni_how = ttm(cons["ni"], snap["ni"])
        cfo, cfo_end, cfo_eff, _ = ttm(cons["cfo"], snap["cfo"])
        gp, gp_end, gp_eff, _ = ttm(cons["gp"], snap["gp"])
        a, a_end, a_eff, _, _ = instant_latest(cons["assets"], snap["assets"])
        al, al_end, al_eff = instant_lag(cons["assets"], snap["assets"], a_end)
        d, d_end, d_eff, d_filed, d_form = instant_latest(cons["dei"], snap["dei"])
        g, g_end, g_eff, g_filed, g_form = instant_latest(cons["gsh"], snap["gsh"])
        if np.isfinite(d) and d > 0 and not (g_end != _NAT and d_end < g_end - 365):
            sh, sh_end, sh_anchor, sh_src, sh_eff, sh_form, sh_filed = d, d_end, d_end, "dei", d_eff, d_form, d_filed
        elif np.isfinite(g) and g > 0:
            sh, sh_end, sh_anchor, sh_src, sh_eff, sh_form, sh_filed = g, g_end, g_filed, "gaap", g_eff, g_form, g_filed
        else:
            sh, sh_end, sh_anchor, sh_src, sh_eff, sh_form, sh_filed = np.nan, _NAT, _NAT, "", _NAT, "", _NAT
        known = max(x for x in (be_eff, ni_eff, cfo_eff, gp_eff, a_eff, al_eff, sh_eff, _NAT + 1))
        rows.append((cik, t, be, be_end, ni, ni_end, ni_how, cfo, cfo_end, gp, gp_end, a, a_end, al, al_end,
                     sh, sh_end, sh_anchor, sh_filed, sh_src, sh_form, known))
    ev = pd.DataFrame(rows, columns=EVENT_COLS)
    for c in ("t", "be_end", "ni_end", "cfo_end", "gp_end", "assets_end", "assets_lag_end", "sh_end", "sh_anchor",
              "sh_filed", "known_at"):
        ev[c] = _to_dt(ev[c].to_numpy(np.int64))
    return ev


def _to_dt(a: np.ndarray) -> pd.Series:
    a = np.asarray(a, dtype=np.int64)
    bad = (a <= _NAT + 1) | (a < -200_000) | (a > 200_000)
    out = np.where(bad, 0, a).astype("datetime64[D]").astype("datetime64[ns]")
    out[bad] = np.datetime64("NaT", "ns")
    return out


# ================================================================ 离线构建
def derived_dir() -> Path:
    d = store.market_dir(SEC_MARKET) / "derived"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _one(path: str) -> pd.DataFrame | None:
    try:
        v = pd.read_parquet(path)
        if v.empty:
            return None
        return firm_events(v)
    except Exception as e:  # 单家公司出错只记录
        return pd.DataFrame({"cik": [int(Path(path).name[3:13])], "error": [f"{type(e).__name__}: {e}"[:200]]})


def build(processes: int = 4) -> dict:
    """全部 pit 文件 → derived/events.parquet + MANIFEST.json。"""
    from multiprocessing import Pool

    pit = store.market_dir(SEC_MARKET) / "pit"
    paths = sorted(str(p) for p in pit.glob("CIK*.parquet"))
    with Pool(processes) as pool:
        parts = pool.map(_one, paths, chunksize=20)
    errs = [p for p in parts if p is not None and "error" in p]
    evs = [p for p in parts if p is not None and "error" not in p and len(p)]
    ev = pd.concat(evs, ignore_index=True)
    out = derived_dir() / "events.parquet"
    ev.to_parquet(out, index=False)
    h = hashlib.sha256()
    for p in paths:
        st = os.stat(p)
        h.update(f"{Path(p).name}:{st.st_size}".encode())
    man = {"version": BUILD_VERSION, "built_from": f"{len(paths)} pit files", "pit_fingerprint": h.hexdigest()[:16],
           "rows": len(ev), "ciks": int(ev["cik"].nunique()), "errors": len(errs),
           "error_examples": [p.iloc[0].to_dict() for p in errs[:5]],
           "sha256": {"events.parquet": store._sha256(out)}}
    (derived_dir() / "MANIFEST.json").write_text(json.dumps(man, ensure_ascii=False, indent=2, default=str) + "\n",
                                                 encoding="utf-8")
    return man


def available() -> bool:
    """事件表与 ticker → CIK 映射都在（store 指向的数据目录下）。"""
    return ((store.root() / SEC_MARKET / "derived" / "events.parquet").exists()
            and (store.root() / SEC_MARKET / "raw" / "company_tickers.json").exists())


def snapshot() -> str | None:
    try:
        m = json.loads((derived_dir() / "MANIFEST.json").read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None
    return hashlib.sha256(json.dumps([m.get("version"), m.get("sha256")], sort_keys=True).encode()).hexdigest()[:16]


# ================================================================ 代码映射与拆股
def code_cik_map() -> pd.Series:
    """美股证券表代码 → CIK（company_tickers.json 当前快照；同一 CIK 多个代码只留排第一的）。"""
    p = store.market_dir(SEC_MARKET) / "raw" / "company_tickers.json"
    from .sources.sec import parse_company_tickers

    m = parse_company_tickers(json.loads(p.read_text()))
    m["code"] = m["ticker"].str.replace("-", ".", regex=False)
    try:
        codes = set(store.read_securities(PRICE_MARKET)["code"].astype(str))
        m = m[m["code"].isin(codes)]
    except FileNotFoundError:
        pass
    m = m.drop_duplicates("code").drop_duplicates("cik")
    return m.set_index("code")["cik"].astype(int)


def read_splits(end_ex: pd.Timestamp | None = None, hidden: tuple | None = None) -> pd.DataFrame:
    p = store.market_dir(PRICE_MARKET) / "actions.parquet"
    if not p.exists():
        return pd.DataFrame(columns=["date", "code", "value"])
    a = pd.read_parquet(p)
    a = a[(a["action"] == "split") & (a["value"] > 0)][["date", "code", "value"]]
    a["date"] = pd.to_datetime(a["date"])
    if end_ex is not None:
        a = a[a["date"] < end_ex]
    if hidden is not None:
        a = a[~((a["date"] >= hidden[0]) & (a["date"] < hidden[1]))]
    return a


def split_factor(splits: pd.DataFrame, codes, anchor: np.ndarray, at: np.ndarray) -> np.ndarray:
    """F = ∏ 拆股比例（anchor < 除权日 ≤ at），逐元素；anchor / at 为 datetime64 数组（行 × 代码），NaT → NaN。"""
    out = np.ones(anchor.shape, dtype=float)
    out[np.isnat(anchor) | np.isnat(at)] = np.nan
    if splits.empty:
        return out
    col = {c: j for j, c in enumerate(codes)}
    for code, g in splits.groupby("code"):
        j = col.get(code)
        if j is None:
            continue
        d = g["date"].to_numpy("datetime64[ns]")
        o = np.argsort(d)
        d, cum = d[o], np.concatenate([[0.0], np.cumsum(np.log(g["value"].to_numpy(float)[o]))])
        a, b = anchor[:, j], at[:, j]
        okm = ~(np.isnat(a) | np.isnat(b))
        ia = np.searchsorted(d, a[okm], side="right")
        ib = np.searchsorted(d, b[okm], side="right")
        f = np.exp(cum[ib] - cum[ia])
        col_j = out[:, j]
        col_j[okm] = col_j[okm] * f
        out[:, j] = col_j
    return out


# ================================================================ 评估时：事件 → 面板字段
def read_events(end_ex: pd.Timestamp | None = None, hidden: tuple | None = None) -> pd.DataFrame:
    """读事件表并按可见范围删掉：t（该行状态的知识时点 = 所用数据最晚的生效日的上界）不早于 end_ex 的、
    落在 hidden 区间的。end_ex / hidden 由调用方从 data.window()（guard.Lockbox）取得。"""
    ev = pd.read_parquet(derived_dir() / "events.parquet")
    return guard_events(ev, end_ex, hidden)


def guard_events(ev: pd.DataFrame, end_ex: pd.Timestamp | None, hidden: tuple | None) -> pd.DataFrame:
    keep = np.ones(len(ev), dtype=bool)
    if end_ex is not None:
        keep &= (ev["t"] < end_ex).to_numpy() & ~(ev["known_at"] >= end_ex).to_numpy()
    if hidden is not None:
        keep &= ~((ev["t"] >= hidden[0]) & (ev["t"] < hidden[1])).to_numpy()
    return ev.loc[keep]


def _state_at(ev: pd.DataFrame, dates: pd.DatetimeIndex, cmap: pd.Series) -> dict[str, pd.DataFrame]:
    """每个 (日期, 代码) 取 t ≤ 日期 的最新事件行 → {列: 日期 × 代码}。"""
    ev = ev[ev["cik"].isin(cmap.values)]
    cik2code = pd.Series(cmap.index, index=cmap.values)
    ev = ev.assign(code=cik2code.reindex(ev["cik"]).to_numpy()).sort_values(["t"])
    grid = pd.DataFrame({"date": np.repeat(dates.values, len(cmap)), "code": np.tile(cmap.index.values, len(dates))})
    grid = grid.sort_values("date")
    m = pd.merge_asof(grid, ev, left_on="date", right_on="t", by="code", direction="backward")
    cols = [c for c in ev.columns if c not in ("cik", "code")]
    return {c: m.pivot(index="date", columns="code", values=c).reindex(index=dates, columns=cmap.index) for c in cols}


def _fresh(val: pd.DataFrame, end: pd.DataFrame, dates: pd.DatetimeIndex) -> pd.DataFrame:
    age = (dates.values[:, None] - end.to_numpy("datetime64[ns]")) / np.timedelta64(1, "D")
    return val.where(age <= STALE_DAYS)


def month_rows(days: pd.DatetimeIndex) -> pd.DatetimeIndex:
    """面板交易日里每个自然月的最后一个交易日（不丢最后一个不完整月：多一行无害）。"""
    days = pd.DatetimeIndex(days).sort_values()
    return pd.DatetimeIndex(pd.Series(days, index=days).groupby(days.to_period("M")).max().values)


TURNOVER_OK = (2e-5, 0.25)   # 股本合理性：t 之前 63 日成交量中位数 / 拆股调整后股本 须落在这个区间（日换手）
SHARES_WINDOW = 63


def clean_shares(ev: pd.DataFrame, volume: pd.DataFrame | None, splits: pd.DataFrame, cmap: pd.Series) -> pd.DataFrame:
    """股本清洗（四条规则，都只用 t 及以前的信息；3、4 见函数内注释）：
    1. 最新股数来自 20-F（外国私人发行人，美国上市的多是 ADR，1 份 ADR ≠ 1 股）→ 空；
    2. XBRL 量纲笔误（实测有 ×1e3、×1e6、×1e9 的单份申报，如 AEP 2010-06、HL 2023-08）：用事件日 t（含）之前
       63 个交易日成交量中位数 ÷ 拆股调整到 t 的股本 得到日换手，不在 TURNOVER_OK 区间（或无法核对）→ 空。
    被剔除的事件沿用上一个通过的股本（其期末日照常参与陈旧度检查）。"""
    ev = ev.copy()
    bad = ev["sh_form"].fillna("").str.startswith("20-F").to_numpy()
    if volume is not None and len(ev):
        cik2code = pd.Series(cmap.index, index=cmap.values)
        code = cik2code.reindex(ev["cik"]).to_numpy()
        medv = volume.rolling(SHARES_WINDOW, min_periods=SHARES_WINDOW // 3).median()
        days = medv.index
        pos = days.searchsorted(ev["t"].to_numpy("datetime64[ns]"), side="right") - 1
        col = pd.Index(medv.columns).get_indexer(code)
        okp = (pos >= 0) & (col >= 0)
        mv = np.full(len(ev), np.nan)
        mv[okp] = medv.to_numpy(float)[pos[okp], col[okp]]
        anchor = ev["sh_anchor"].to_numpy("datetime64[ns]")[:, None]
        at = ev["t"].to_numpy("datetime64[ns]")[:, None]
        f = np.full(len(ev), np.nan)
        for c in np.unique(code[okp]):
            j = np.flatnonzero(code == c)
            f[j] = split_factor(splits, [c], anchor[j], at[j])[:, 0]
        with np.errstate(invalid="ignore", divide="ignore"):
            turn = mv / (ev["sh"].to_numpy(float) * f)
        bad |= ~((turn >= TURNOVER_OK[0]) & (turn <= TURNOVER_OK[1]))
    # 3. 拆股落在「封面 / 期末日」与「申报日」之间时，申报的股数可能已按拆股调整、也可能没有：两种口径里取与
    #    上一个通过值（拆股调整到同一口径）更接近的（没有上一个值时用默认口径：dei 按期末日、us-gaap 按申报日）。
    # 4. 与上一个通过值相差 10^2.5 倍（约 316 倍）以上 → 量纲笔误，空；上一个通过值的期末早于本条 15 个月以上
    #    时不比较（重新起算）。
    if len(ev):
        cik2code = pd.Series(cmap.index, index=cmap.values)
        code = cik2code.reindex(ev["cik"]).to_numpy()
        lsh = np.log(ev["sh"].to_numpy(float))
        end_d = ev["sh_end"].to_numpy("datetime64[ns]")
        filed_d = ev["sh_filed"].to_numpy("datetime64[ns]")
        anchor = ev["sh_anchor"].to_numpy("datetime64[ns]").copy()
        l_end = lsh - _cum_log_splits(splits, code, end_d)
        l_fil = lsh - _cum_log_splits(splits, code, filed_d)
        dflt_end = (ev["sh_src"] == "dei").to_numpy()
        order = np.lexsort((ev["t"].to_numpy("datetime64[ns]"), ev["cik"].to_numpy()))
        cik = ev["cik"].to_numpy()
        last_c, last_v, last_e = None, np.nan, None
        for i in order:
            if cik[i] != last_c:
                last_c, last_v, last_e = cik[i], np.nan, None
            if bad[i] or not np.isfinite(lsh[i]):
                continue
            fresh = np.isfinite(last_v) and (end_d[i] - last_e) <= np.timedelta64(STALE_DAYS, "D")
            use_end = dflt_end[i]
            if fresh and not np.isclose(l_end[i], l_fil[i]):
                use_end = abs(l_end[i] - last_v) <= abs(l_fil[i] - last_v)
            v = l_end[i] if use_end else l_fil[i]
            if fresh and abs(v - last_v) > 2.5 * np.log(10):
                bad[i] = True
                continue
            anchor[i] = end_d[i] if use_end else filed_d[i]
            last_v, last_e = v, end_d[i]
        ev["sh_anchor"] = anchor
    # 被剔除的事件沿用同一公司上一个通过的股本（连同其期末日与调整锚点，陈旧度照查）
    cols = ["sh", "sh_end", "sh_anchor"]
    ev.loc[bad, cols] = np.nan
    ev = ev.sort_values(["cik", "t"], kind="stable")
    ev[cols] = ev.groupby("cik", sort=False)[cols].ffill()
    return ev


def _cum_log_splits(splits: pd.DataFrame, code: np.ndarray, at: np.ndarray) -> np.ndarray:
    """Σ log(拆股比例)（除权日 ≤ at），逐元素；只用于比较两个时点的股本（两者之差只含两点之间的拆股）。"""
    out = np.zeros(len(code), dtype=float)
    if splits.empty:
        return out
    for c, g in splits.groupby("code"):
        j = np.flatnonzero(code == c)
        if len(j) == 0:
            continue
        d = g["date"].to_numpy("datetime64[ns]")
        o = np.argsort(d)
        cum = np.concatenate([[0.0], np.cumsum(np.log(g["value"].to_numpy(float)[o]))])
        a = at[j]
        ok = ~np.isnat(a)
        out[j[ok]] = cum[np.searchsorted(d[o], a[ok], side="right")]
    return out


def compute_fields(ev: pd.DataFrame, fields, close: pd.DataFrame, volume: pd.DataFrame | None,
                   splits: pd.DataFrame, cmap: pd.Series) -> dict[str, pd.DataFrame]:
    """事件表（已按可见范围删过）→ 面板字段。close / volume：日度不复权宽表（行 = 交易日，列 = 代码）。"""
    codes = close.columns
    cmap = cmap[cmap.index.isin(codes)]
    out: dict[str, pd.DataFrame] = {}
    fields = set(fields)
    mdates = month_rows(close.index)
    ev = clean_shares(ev, volume, splits, cmap)
    st = _state_at(ev, mdates, cmap)
    st = {k: v.reindex(columns=codes) for k, v in st.items()}

    def sh_adj(state, dates):
        sh = _fresh(state["sh"].astype(float), state["sh_end"], dates)
        f = split_factor(splits, codes, state["sh_anchor"].to_numpy("datetime64[ns]"),
                         np.repeat(dates.values[:, None], len(codes), 1))
        return sh * f

    if fields & {"mcap_total", "mcap_float", "fund_net_issuance"}:
        sha = sh_adj(st, mdates)
        px = close.reindex(index=mdates, columns=codes)
        mcap = sha * px.where(px > 0)
        out["mcap_total"] = mcap
        out["mcap_float"] = mcap.copy()
        if "fund_net_issuance" in fields:
            # 12 个月前（同一月末序列往前 12 个月）的状态，拆股调整到 d 的口径
            per = mdates.to_period("M")
            pos = pd.Series(np.arange(len(mdates)), index=per).reindex(per - 12).to_numpy(float)
            okp = np.isfinite(pos)
            idx = np.where(okp, pos, 0).astype(int)
            sh12 = _fresh(st["sh"].astype(float).iloc[idx], st["sh_end"].iloc[idx], mdates[idx])
            f12 = split_factor(splits, codes, st["sh_anchor"].iloc[idx].to_numpy("datetime64[ns]"),
                               np.repeat(mdates.values[:, None], len(codes), 1))
            sh12 = pd.DataFrame(sh12.to_numpy(float) * f12, index=mdates, columns=codes)
            newer = st["sh_end"].to_numpy("datetime64[ns]") > st["sh_end"].iloc[idx].to_numpy("datetime64[ns]")
            ratio = sha / sh12
            ni = np.log(ratio.where((ratio > 0) & newer))
            ni.loc[~okp] = np.nan
            out["fund_net_issuance"] = ni
    if "fund_be" in fields:
        out["fund_be"] = _fresh(st["be"].astype(float), st["be_end"], mdates)
    for name, col in (("fund_ni_ttm", "ni"), ("fund_cfo_ttm", "cfo"), ("fund_gp_ttm", "gp")):
        if name in fields:
            out[name] = _fresh(st[col].astype(float), st[f"{col}_end"], mdates)
    if fields & {"fund_assets", "fund_assets_lag", "fund_accruals"}:
        a = _fresh(st["assets"].astype(float), st["assets_end"], mdates)
        al = st["assets_lag"].astype(float).where(a.notna())
        out["fund_assets"], out["fund_assets_lag"] = a, al
        if "fund_accruals" in fields:
            ni = _fresh(st["ni"].astype(float), st["ni_end"], mdates)
            cfo = _fresh(st["cfo"].astype(float), st["cfo_end"], mdates)
            def gap(x, y):
                return np.abs((st[x].to_numpy("datetime64[ns]") - st[y].to_numpy("datetime64[ns]"))
                              / np.timedelta64(1, "D"))
            with np.errstate(invalid="ignore"):
                same = (gap("ni_end", "cfo_end") <= 10) & (gap("ni_end", "assets_end") <= 10)
            avg = (a + al) / 2
            out["fund_accruals"] = ((ni - cfo) / avg.where(avg > 0)).where(same)
    if "turnover" in fields and volume is not None:
        days = close.index
        std = _state_at(ev[["cik", "t", "sh", "sh_end", "sh_anchor"]], days, cmap)
        std = {k: v.reindex(columns=codes) for k, v in std.items()}
        sha_d = sh_adj(std, days)
        vol = volume.reindex(index=days, columns=codes)
        out["turnover"] = vol / sha_d.where(sha_d > 0)
    return {k: v for k, v in out.items() if k in fields}


def panel_fields(fields, panel: dict, end_ex: pd.Timestamp | None, hidden: tuple | None) -> dict[str, pd.DataFrame]:
    """data.load_market 的钩子：panel 至少含不复权 close（turnover 还要 volume），已按可见范围截断。"""
    ev = read_events(end_ex, hidden)
    splits = read_splits(end_ex, hidden)
    return compute_fields(ev, fields, panel["close"], panel.get("volume"), splits, code_cik_map())


def main(argv=None) -> int:
    import argparse
    import sys

    ap = argparse.ArgumentParser(prog="python -m factorlab.fundamentals_us")
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("--processes", type=int, default=4)
    a = ap.parse_args(argv)
    if a.cmd == "build":
        print(json.dumps(build(a.processes), ensure_ascii=False, default=str))
    return 0


if __name__ == "__main__":
    import sys

    sys.exit(main())
