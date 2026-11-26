"""A 股数据源：证券表（沪深北 + 已退市）、东方财富日线（不复权 + 后复权）、派生字段。

命令行：
    uv run python -m factorlab.sources.cn fetch --limit 300      # 分层抽样试下载（含 ≥30 只退市股）
    uv run python -m factorlab.sources.cn fetch                  # 全量（断点续传，已下载的跳过）
    uv run python -m factorlab.sources.cn build                  # 组装 prices / securities / MANIFEST
    uv run python -m factorlab.sources.cn audit                  # 数据审计（不算任何因子或收益预测统计）

数据源与口径详见 docs/research/factorlab/DATA-CN-HK.md。要点：
- 日线：东方财富 push2his kline（fqt=0，不复权，一次请求全历史）；被限流时自动改用腾讯不复权日线。
- 复权：东方财富 fqt=2 实测是「拆送按比例、现金红利按加法」的仿射口径，不是可连乘的总收益，不用；
  adj_factor = 新浪后复权因子（乘法口径，除权日生效）；close_adj = close × adj_factor，open_adj = open × adj_factor。
  没有新浪因子时用东方财富「前收 ÷ 除权参考价（昨收）」连乘作后备。
- 成交量：东方财富 / 腾讯单位为「手」，×100 换成股（带单位自检）。换手率 % ÷100 存为小数。
- 流通市值：流通股本 ≈ Σ20日(成交量/复权因子) ÷ Σ20日换手率 × 当日复权因子，阶梯化后 × 不复权收盘价。
  成交额 ÷ 换手率只用于审计对照。
- 涨跌停：按「板块 × 日期」的涨跌幅比例表（含 ST 5%、注册制新股前 5 日无限制等），
  基准价 = 昨收（除权日为除权参考价），涨停价 = 四舍五入到 0.01 元。
- 停牌：停牌日没有行（数据源本身不给停牌日 K 线；成交量为 0 的行也删掉），is_suspended 恒为 False。
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd

from .. import store
from ..schema import Manifest
from . import http

MARKET = "cn"
KLINE_URL = "https://push2his.eastmoney.com/api/qt/stock/kline/get"
CLIST_URL = "https://push2delay.eastmoney.com/api/qt/clist/get"
KLINE_FIELDS1 = "f1,f2,f3,f4,f5,f6"
KLINE_FIELDS2 = "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61"
KLINE_COLS = ["date", "open", "close", "high", "low", "volume", "amount",
              "amplitude", "pct_chg", "chg", "turnover"]
SOURCE = "eastmoney-kline(fqt=0,2) | fallback tencent-kline+sina-hfq-factor; lists: sse/szse/bse"

# ---------------- 规则常量 ----------------
CHINEXT_REFORM = pd.Timestamp("2020-08-24")   # 创业板注册制：±20%，新股前 5 日不设涨跌幅
STAR_START = pd.Timestamp("2019-07-22")       # 科创板开市：±20%，新股前 5 日不设涨跌幅
MAIN_REG_REFORM = pd.Timestamp("2023-04-10")  # 沪深主板注册制首批上市：新股前 5 日不设涨跌幅
BSE_START = pd.Timestamp("2021-11-15")        # 北交所开市（此前精选层 2020-07-27 起同为 ±30%）
# 沪深主板风险警示（ST）股票涨跌幅由 5% 调整为 10%：2025-06-27 征求意见，2026-04-24 沪深交易所发布
# 修订后的交易规则，2026-07-06 起施行（东方财富 2026-07-05 报道）。审计里用深市点时 ST 股的实际涨跌幅做经验核对。
MAIN_ST_10PCT = pd.Timestamp("2026-07-06")


# ---------------- 代码映射 ----------------
def exchange_of(code: str) -> str:
    code = str(code).zfill(6)
    if code.startswith(("60", "68", "90")):
        return "SSE"
    if code.startswith(("00", "30", "20")):
        return "SZSE"
    if code.startswith(("8", "4", "92")):
        return "BSE"
    raise ValueError(f"无法识别的 A 股代码：{code}")


def board_of(code: str) -> str:
    code = str(code).zfill(6)
    ex = exchange_of(code)
    if ex == "BSE":
        return "北交所"
    if code.startswith(("688", "689")):
        return "科创板"
    if code.startswith(("300", "301", "302")):
        return "创业板"
    return "主板"


def secid(code: str) -> str:
    """东方财富 secid：沪市 1.xxxxxx，深市与北交所 0.xxxxxx。"""
    code = str(code).zfill(6)
    return ("1." if exchange_of(code) == "SSE" else "0.") + code


def is_a_share(code: str) -> bool:
    code = str(code).zfill(6)
    return code.startswith(("600", "601", "603", "605", "688", "689", "000", "001", "002", "003",
                            "300", "301", "302", "920", "430", "830", "831", "832", "833", "834",
                            "835", "836", "837", "838", "839", "870", "871", "872", "873"))


# ---------------- K 线解析 ----------------
def parse_kline(payload: dict | str | bytes) -> pd.DataFrame:
    """东方财富 kline JSON → DataFrame（成交量换成股、换手率换成小数）。无数据返回空表。"""
    if not isinstance(payload, dict):
        payload = http.parse_json(payload)
    data = payload.get("data") or {}
    lines = data.get("klines") or []
    if not lines:
        return pd.DataFrame(columns=KLINE_COLS)
    rows = [ln.split(",") for ln in lines]
    df = pd.DataFrame([r[:11] for r in rows], columns=KLINE_COLS)
    df["date"] = pd.to_datetime(df["date"])
    for c in KLINE_COLS[1:]:
        df[c] = pd.to_numeric(df[c].replace({"-": None, "": None}), errors="coerce")
    df["volume"] = df["volume"] * 100.0          # 手 → 股
    df["turnover"] = df["turnover"] / 100.0      # % → 小数
    df["pct_chg"] = df["pct_chg"] / 100.0
    df["amplitude"] = df["amplitude"] / 100.0
    return df.drop_duplicates("date").sort_values("date").reset_index(drop=True)


def merge_raw_hfq(raw: pd.DataFrame, hfq: pd.DataFrame) -> pd.DataFrame:
    """不复权与后复权对齐：保留不复权 OHLC/量额，加 close_adj、open_adj、adj_factor。"""
    h = hfq[["date", "open", "close"]].rename(columns={"open": "open_adj", "close": "close_adj"})
    df = raw.merge(h, on="date", how="left")
    df["adj_factor"] = df["close_adj"] / df["close"]
    return df


def hfq_consistency(df: pd.DataFrame, tol: float = 0.02) -> dict:
    """检验后复权是否「按比例」（乘法）复权：同一天 OHLC 的 hfq/raw 比值应相同，
    且比值只在除权日变化；加法复权（hfq = raw + 常数）会让比值随价格每天漂移。"""
    out = {"rows": int(len(df))}
    if df.empty:
        return out
    f = df["adj_factor"]
    fo = df["open_adj"] / df["open"]
    within = ((fo - f).abs() / f).replace([np.inf, -np.inf], np.nan)
    out["max_open_close_factor_gap"] = float(within.max())
    ch = f.pct_change().abs()
    out["factor_change_days"] = int((ch > 1e-3).sum())
    # 非事件日比值的漂移（四舍五入到 0.01 元导致的噪声应 < 约 0.5%）
    out["max_nonevent_drift"] = float(ch[ch <= tol].max()) if (ch <= tol).any() else 0.0
    out["factor_monotone_nondecreasing"] = bool((f.diff().dropna() >= -1e-6 * f.shift().dropna()).mean() > 0.99)
    return out


# ---------------- 涨跌停 ----------------
def round_price(x):
    """四舍五入到 0.01 元（交易所口径），向量化。"""
    return np.floor(np.asarray(x, dtype="float64") * 100.0 + 0.5 + 1e-7) / 100.0


def limit_ratio(board: str, dates: pd.Series, trade_no: pd.Series, is_st: pd.Series | None = None,
                list_date: pd.Timestamp | None = None) -> pd.Series:
    """板块 × 日期 → 涨跌幅比例；NaN 表示当日不设涨跌幅（或规则未知）。

    trade_no：上市后第几个交易日（1 = 上市首日），用于新股无涨跌幅期。
    is_st：点时 ST 标记（可为 NA = 未知，按非 ST 处理）。
    """
    dates = pd.to_datetime(pd.Series(dates)).reset_index(drop=True)
    trade_no = pd.Series(trade_no).reset_index(drop=True)
    st = (pd.Series(is_st).reset_index(drop=True).astype("boolean").fillna(False).astype(bool)
          if is_st is not None else pd.Series(False, index=dates.index))
    r = pd.Series(np.nan, index=dates.index)
    if board == "主板":
        r[:] = 0.10
        r[st & (dates < MAIN_ST_10PCT)] = 0.05
        r[trade_no == 1] = np.nan                                   # 首日：2014 起 +44%/-36% 相对发行价，基准不同 → 不判
        ipo_reg = list_date is not None and pd.Timestamp(list_date) >= MAIN_REG_REFORM
        if ipo_reg:
            r[trade_no <= 5] = np.nan
    elif board == "创业板":
        r[:] = np.where(dates >= CHINEXT_REFORM, 0.20, 0.10)
        r[st & (dates < CHINEXT_REFORM)] = 0.05
        r[trade_no == 1] = np.nan
        if list_date is not None and pd.Timestamp(list_date) >= CHINEXT_REFORM:
            r[trade_no <= 5] = np.nan
    elif board == "科创板":
        r[:] = 0.20
        r[trade_no <= 5] = np.nan
    elif board == "北交所":
        r[:] = 0.30
        r[trade_no == 1] = np.nan
    return r


def compute_limits(df: pd.DataFrame, board: str, list_date=None, is_st: pd.Series | None = None,
                   trade_offset: int = 0) -> pd.DataFrame:
    """输入：单只股票按日期排序的表（需 date/open/high/low/close/chg，可选 adj_factor）。
    输出列：ref_close, limit_ratio, limit_up_price, limit_down_price, limit_up, limit_down,
    limit_up_oneword, limit_down_oneword。

    基准价：优先用东方财富昨收（close - chg，除权日即除权参考价）；chg 缺失时用
    「前收 × 前一日复权因子 / 当日复权因子」。
    trade_no 按本表行序计（行 = 有成交的交易日）；表不是从上市首日开始时传 trade_offset（例如 1000）。
    """
    out = pd.DataFrame(index=df.index)
    close = df["close"].astype(float)
    ref = round_price(close - df["chg"]) if "chg" in df else np.full(len(df), np.nan)
    ref = pd.Series(ref, index=df.index)
    if "adj_factor" in df:
        alt = df["close"].shift() * df["adj_factor"].shift() / df["adj_factor"]
    else:
        alt = df["close"].shift()
    ref = ref.where(ref.notna() & (ref > 0), pd.Series(round_price(alt), index=df.index))
    out["ref_close"] = ref
    trade_no = pd.Series(np.arange(1, len(df) + 1) + trade_offset, index=df.index)
    ratio = limit_ratio(board, df["date"], trade_no, is_st, list_date)
    ratio.index = df.index
    out["limit_ratio"] = ratio
    up = pd.Series(round_price(ref * (1 + ratio)), index=df.index)
    dn = pd.Series(round_price(ref * (1 - ratio)), index=df.index)
    out["limit_up_price"] = up
    out["limit_down_price"] = dn
    # 收盘相对基准价的涨跌幅明显超过当日比例（> 比例 + 0.6%）→ 当日实际没有涨跌幅限制
    # （股改复牌首日、暂停上市后恢复上市首日、退市整理期首日、重组复牌等），不判涨跌停
    move = (close / ref - 1).abs()
    beyond = ratio.notna() & ref.notna() & (move > ratio + 0.006)
    out["no_limit_inferred"] = beyond
    ratio = ratio.where(~beyond)
    out["limit_ratio"] = ratio
    up = up.where(~beyond)
    dn = dn.where(~beyond)
    out["limit_up_price"] = up
    out["limit_down_price"] = dn
    known = ratio.notna() & ref.notna()
    lu = (close >= up - 0.0049) & known
    ld = (close <= dn + 0.0049) & known
    one = (df["open"] == df["high"]) & (df["high"] == df["low"]) & (df["low"] == df["close"])
    out["limit_up"] = lu.astype("boolean").where(known, pd.NA)
    out["limit_down"] = ld.astype("boolean").where(known, pd.NA)
    out["limit_up_oneword"] = (lu & one).astype("boolean").where(known, pd.NA)
    out["limit_down_oneword"] = (ld & one).astype("boolean").where(known, pd.NA)
    return out


# ---------------- 流通市值 ----------------
def float_shares_estimate(df: pd.DataFrame, window: int = 20, min_obs: int = 5, step_tol: float = 0.02) -> pd.Series:
    """点时流通股本估计（只用当日及以前的数据）。

    n_t = Σ(volume/F) / Σ(turnover)（最近 window 个 turnover > 0 的交易日），F = 复权因子；
    送转时 volume 翻倍、F 翻倍、换手率不变 → n 不跳，故按 F 归一后再乘回当日 F。
    阶梯化：n 偏离当前台阶超过 step_tol 才换台阶。turnover 缺失或为 0 的日子不参与。
    """
    F = df["adj_factor"] if "adj_factor" in df else pd.Series(1.0, index=df.index)
    F = F.where(F > 0).ffill().bfill().fillna(1.0)
    ok = (df["turnover"] > 0) & (df["volume"] > 0)
    v = (df["volume"] / F).where(ok)
    t = df["turnover"].where(ok)
    vs = v.rolling(window, min_periods=min_obs).sum()
    ts = t.rolling(window, min_periods=min_obs).sum()
    n = (vs / ts).to_numpy()
    step = np.full(len(n), np.nan)
    cur = np.nan
    for i, x in enumerate(n):
        if np.isnan(x):
            continue            # 窗口内有效日不足 → 当日 NaN（不把旧台阶无限期沿用）
        if np.isnan(cur) or abs(x / cur - 1) > step_tol:
            cur = x
        step[i] = cur
    return pd.Series(step, index=df.index) * F


def mcap_proxy_amount(df: pd.DataFrame) -> pd.Series:
    """旧口径（只作审计对照）：成交额 ÷ 换手率；换手率为 0 时 NaN。"""
    t = df["turnover"].where(df["turnover"] > 0)
    return df["amount"] / t


# ---------------- 证券表 ----------------
def _meta_cache(name: str, fn, refresh: bool = False) -> pd.DataFrame:
    p = http.raw_dir(MARKET, "meta") / f"{name}.parquet"
    if p.exists() and not refresh:
        return pd.read_parquet(p)
    df = fn()
    df = df.astype({c: "string" for c in df.columns if df[c].dtype == object})
    df.to_parquet(p, index=False)
    return df


def _clist(fs: str, fields: str = "f12,f13,f14,f20,f21,f26", market: str = MARKET, max_pages: int = 200,
           fid: str = "f12", po: int = 0, pages: int | None = None) -> pd.DataFrame:
    """东方财富 clist 分页（每页最多 100 条）。"""
    c = http.client(market)
    out, pn = [], 1
    while pn <= max_pages:
        d = c.get_json(CLIST_URL, dict(pn=pn, pz=100, po=po, np=1, fltt=2, invt=2, fid=fid, fs=fs, fields=fields),
                       cache=False)
        data = d.get("data") or {}
        diff = data.get("diff") or []
        out.extend(diff)
        total = int(data.get("total") or 0)
        if not diff or len(out) >= total or (pages and pn >= pages):
            break
        pn += 1
    return pd.DataFrame(out)


def _to_date(s) -> pd.Series:
    s = pd.Series(s).astype("string").str.replace(r"\.0$", "", regex=True)
    return pd.to_datetime(s, errors="coerce", format="mixed")


def security_master(refresh: bool = False) -> pd.DataFrame:
    """当前上市（沪：主板 A + 科创板；深：A 股列表；北：东方财富北交所列表）+ 已退市（沪、深交易所终止上市名单）。"""
    import akshare as ak

    frames = []
    sh_main = _meta_cache("sse_main", lambda: ak.stock_info_sh_name_code(symbol="主板A股"), refresh)
    sh_star = _meta_cache("sse_star", lambda: ak.stock_info_sh_name_code(symbol="科创板"), refresh)
    for d in (sh_main, sh_star):
        frames.append(pd.DataFrame({"code": d["证券代码"].astype(str).str.zfill(6), "name": d["证券简称"],
                                    "list_date": _to_date(d["上市日期"]), "status": "listed"}))
    sz = _meta_cache("szse_a", lambda: ak.stock_info_sz_name_code(symbol="A股列表"), refresh)
    frames.append(pd.DataFrame({"code": sz["A股代码"].astype(str).str.zfill(6), "name": sz["A股简称"],
                                "list_date": _to_date(sz["A股上市日期"]), "status": "listed"}))
    bj = _meta_cache("bse_em", lambda: _clist("m:0 t:81 s:2048"), refresh)
    frames.append(pd.DataFrame({"code": bj["f12"].astype(str).str.zfill(6), "name": bj["f14"],
                                "list_date": _to_date(bj["f26"]), "status": "listed"}))
    listed = pd.concat(frames, ignore_index=True)
    listed["delist_date"] = pd.NaT

    shd = _meta_cache("sse_delist", lambda: ak.stock_info_sh_delist(symbol="全部"), refresh)
    szd = _meta_cache("szse_delist", lambda: ak.stock_info_sz_delist(symbol="终止上市公司"), refresh)
    delisted = pd.concat([
        pd.DataFrame({"code": shd["公司代码"].astype(str).str.zfill(6), "name": shd["公司简称"],
                      "list_date": _to_date(shd["上市日期"]), "delist_date": _to_date(shd["暂停上市日期"])}),
        pd.DataFrame({"code": szd["证券代码"].astype(str).str.zfill(6), "name": szd["证券简称"],
                      "list_date": _to_date(szd["上市日期"]), "delist_date": _to_date(szd["终止上市日期"])}),
    ], ignore_index=True)
    delisted["status"] = "delisted"

    allsec = pd.concat([listed, delisted], ignore_index=True)
    allsec = allsec[allsec["code"].map(is_a_share)]
    # 同一代码既在当前名单又在退市名单：以当前名单为准（代码重新启用 / 名单滞后）
    allsec["_prio"] = (allsec["status"] == "listed").astype(int)
    allsec = allsec.sort_values(["code", "_prio"], ascending=[True, False]).drop_duplicates("code").drop(columns="_prio")
    allsec["market"] = MARKET
    allsec["exchange"] = allsec["code"].map(exchange_of)
    allsec["board"] = allsec["code"].map(board_of)
    allsec["currency"] = "CNY"
    allsec["source"] = "sse/szse/bse(eastmoney) lists"
    return allsec.reset_index(drop=True)


# ---------------- 点时 ST（深市：交易所简称变更记录） ----------------
def szse_name_changes(refresh: bool = False) -> pd.DataFrame:
    import akshare as ak

    d = _meta_cache("szse_name_changes", lambda: ak.stock_info_sz_change_name(symbol="简称变更"), refresh)
    d = d.rename(columns={"变更日期": "date", "证券代码": "code", "变更前简称": "before", "变更后简称": "after"})
    d["date"] = pd.to_datetime(d["date"])
    d["code"] = d["code"].astype(str).str.zfill(6)
    return d[["date", "code", "before", "after"]].sort_values(["code", "date"]).reset_index(drop=True)


def _has_st(name) -> bool:
    return isinstance(name, str) and "ST" in name.upper().replace("Ｓ", "S").replace("Ｔ", "T")


def st_flags(code: str, dates: pd.Series, changes: pd.DataFrame | None) -> pd.Series:
    """点时 ST 标记：深市用交易所简称变更记录重建（变更日当日生效）；沪市 / 北交所无免费点时来源 → NA。"""
    dates = pd.to_datetime(pd.Series(dates)).reset_index(drop=True)
    if changes is None or exchange_of(code) != "SZSE":
        return pd.Series(pd.NA, index=dates.index, dtype="boolean")
    ch = changes[changes["code"] == code]
    if ch.empty:
        return pd.Series(False, index=dates.index, dtype="boolean")
    first_before = ch["before"].iloc[0]
    idx = np.searchsorted(ch["date"].to_numpy(), dates.to_numpy(), side="right") - 1
    names = np.where(idx >= 0, ch["after"].to_numpy()[np.clip(idx, 0, None)], first_before)
    return pd.Series([_has_st(n) for n in names], index=dates.index, dtype="boolean")


# ---------------- 下载 ----------------
def kline_params(code: str, fqt: int, beg: str = "19900101") -> dict:
    return dict(secid=secid(code), fields1=KLINE_FIELDS1, fields2=KLINE_FIELDS2, klt=101, fqt=fqt,
                beg=beg, end="20500101", lmt=1000000)


def _kline_ok(body: bytes) -> bool:
    try:
        d = http.parse_json(body)
    except Exception:
        return False
    return isinstance(d, dict) and "data" in d   # data 为 null 也缓存（= 东方财富无此代码数据）


def fetch_kline(code: str, fqt: int, market: str = MARKET, sec: str | None = None, refresh: bool = False) -> dict:
    c = http.client(market)
    params = kline_params(code, fqt)
    if sec:
        params["secid"] = sec
    return c.get_json(KLINE_URL, params, cache_file=f"kline/fqt{fqt}/{code}.json",
                      max_age=0 if refresh else None, validate=_kline_ok)


# ---------- 腾讯日线（东方财富被限流时的后备） ----------
TENCENT_URL = "https://proxy.finance.qq.com/ifzqgtimg/appstock/app/newfqkline/get"
TENCENT_PAGE = 2000   # 每次最多返回 2000 行（从 end 往前数）


def tencent_symbol(code: str) -> str:
    ex = exchange_of(code)
    return {"SSE": "sh", "SZSE": "sz", "BSE": "bj"}[ex] + str(code).zfill(6)


def tencent_rows_to_klines(rows: list, volume_mult: float = 1.0, detect_unit: bool = True) -> list[str]:
    """腾讯行 [日期, 开, 收, 高, 低, 量(手), {}, 换手率%, 成交额(万元), ...] → 东方财富格式的 klines 字符串
    （振幅 / 涨跌幅 / 涨跌额留空：涨跌停基准价改用复权因子推算）。"""
    out = []
    # 单位自检：腾讯多数代码成交量为「手」，个别板块（如科创板）为「股」→ 用 成交额 /(量 × 收盘) 判断，统一成手
    try:
        ratios = sorted(float(r[8]) * 1e4 / (float(r[5]) * float(r[2])) for r in rows[-250:]
                        if len(r) > 8 and not isinstance(r[8], dict) and float(r[5]) > 0 and float(r[2]) > 0)
        med = ratios[len(ratios) // 2] if ratios else 100.0
    except (ValueError, TypeError):
        med = 100.0
    if detect_unit and med < 10:          # 量单位是股 → ÷100 转成手
        volume_mult = volume_mult / 100.0
    for r in rows:
        if len(r) < 6:
            continue
        turn = r[7] if len(r) > 7 and not isinstance(r[7], dict) else ""
        amt = r[8] if len(r) > 8 and not isinstance(r[8], dict) else ""
        try:
            amt_yuan = f"{float(amt) * 1e4:.2f}" if amt not in ("", None) else ""
        except ValueError:
            amt_yuan = ""
        vol = f"{float(r[5]) * volume_mult:.2f}"
        out.append(",".join([r[0], r[1], r[2], r[3], r[4], vol, amt_yuan, "", "", "", str(turn)]))
    return out


SINA_HFQ_URL = "https://finance.sina.com.cn/realstock/company/{sym}/hfq.js"


def parse_sina_hfq(text: str) -> pd.DataFrame:
    """新浪后复权因子表（var xxhfq={"total":n,"data":[{"d":日期,"f":因子},...]}）→ 按日期升序的 (date, factor)。
    因子是乘法口径：后复权价 = 不复权价 × 当日适用因子（适用 = 日期 ≤ 当日的最后一条）。"""
    i = text.find("{")
    j = text.rfind("}")
    d = json.loads(text[i:j + 1]) if i >= 0 else {"data": []}
    df = pd.DataFrame(d.get("data") or [], columns=["d", "f"])
    df = pd.DataFrame({"date": pd.to_datetime(df["d"]), "factor": pd.to_numeric(df["f"])})
    return df.sort_values("date").reset_index(drop=True)


def apply_factor(dates: pd.Series, factors: pd.DataFrame) -> np.ndarray:
    if factors.empty:
        return np.ones(len(dates))
    idx = np.searchsorted(factors["date"].to_numpy(), pd.to_datetime(dates).to_numpy(), side="right") - 1
    f = factors["factor"].to_numpy()
    return np.where(idx >= 0, f[np.clip(idx, 0, None)], 1.0)


def fetch_tencent_raw(code: str, start: str = "1990-01-01", market: str = MARKET, refresh: bool = False,
                      symbol: str | None = None, detect_unit: bool = True) -> dict:
    """腾讯不复权日线（东方财富限流时的后备）：每次最多 2000 行，从最新往前翻页；按东方财富格式写入
    raw/kline/fqt0/{code}.json（带 source=tencent）。腾讯自带的后复权是减现金的加法口径（会出现负价），不用。"""
    c = http.client(market)
    path = c.cache_path("", None, cache_file=f"kline/fqt0/{code}.json")
    if path.exists() and not refresh:
        return json.loads(path.read_text())
    sym = symbol or tencent_symbol(code)
    end = (date.today() + timedelta(days=1)).isoformat()
    rows: list = []
    for _ in range(20):
        d = c.get_json(TENCENT_URL, {"param": f"{sym},day,{start},{end},{TENCENT_PAGE},"}, ns="tencent",
                       max_age=0 if refresh else None)
        data = d.get("data")
        node = data.get(sym) if isinstance(data, dict) else None
        chunk = (node.get("day") or []) if isinstance(node, dict) else []
        chunk = [r for r in chunk if not rows or r[0] < rows[0][0]]
        rows = chunk + rows
        if len(chunk) < TENCENT_PAGE - 5:
            break
        end = (pd.Timestamp(chunk[0][0]) - pd.Timedelta(days=1)).strftime("%Y-%m-%d")
        if end < start:
            break
    payload = {"source": "tencent",
               "data": {"code": code, "klines": tencent_rows_to_klines(rows, detect_unit=detect_unit)} if rows else None}
    path.write_text(json.dumps(payload, ensure_ascii=False))
    return payload


def fetch_sina_factor(code: str, market: str = MARKET, refresh: bool = False, url: str | None = None) -> str:
    """新浪后复权因子表（一次请求，全历史），存 raw/kline/sina_hfq/{code}.js。"""
    return http.client(market).get_text(url or SINA_HFQ_URL.format(sym=tencent_symbol(code)),
                                        cache_file=f"kline/sina_hfq/{code}.js", max_age=0 if refresh else None)


def factor_from_ref(raw: pd.DataFrame) -> np.ndarray:
    """由东方财富不复权日线的「昨收」（close - chg；除权日 = 交易所除权参考价）构造乘法复权因子：
    除权日因子 × 前收 / 除权参考价（Wind 等的通行口径）。只在没有新浪因子时作后备。"""
    close = raw["close"].to_numpy(dtype=float)
    ref = round_price(raw["close"] - raw["chg"]) if "chg" in raw else np.full(len(raw), np.nan)
    prev = np.r_[np.nan, close[:-1]]
    step = np.where(np.isfinite(ref) & (ref > 0) & np.isfinite(prev) & (np.abs(ref - prev) >= 0.005), prev / ref, 1.0)
    step[0] = 1.0
    return np.cumprod(step)


def pilot_sample(sec: pd.DataFrame, limit: int, n_delisted: int | None = None, seed: int = 20261126) -> list[str]:
    """分层抽样：当前上市按板块等比例（每板块至少 limit/12），另加退市股（默认 max(30, limit/10)）。"""
    rng = random.Random(seed)
    listed = sec[sec["status"] == "listed"]
    n_delisted = max(30, limit // 10) if n_delisted is None else n_delisted
    boards = listed.groupby(["exchange", "board"])["code"].apply(sorted).to_dict()
    total = sum(len(v) for v in boards.values())
    floor = max(1, limit // 12)
    alloc = {k: max(floor, round(limit * len(v) / total)) for k, v in boards.items()}
    while sum(alloc.values()) > limit:
        k = max(alloc, key=alloc.get)
        alloc[k] -= 1
    codes = []
    for k, v in sorted(boards.items()):
        codes += rng.sample(v, min(len(v), alloc[k]))
    dl = sec[(sec["status"] == "delisted") & (sec["delist_date"] >= pd.Timestamp("2005-01-01"))]
    dl = dl.sort_values("code")
    # 退市股按退市年份分层，保证各年代都有
    by_year = dl.groupby(dl["delist_date"].dt.year)["code"].apply(list).to_dict()
    picked: list[str] = []
    years = sorted(by_year)
    while len(picked) < n_delisted and any(by_year.values()):
        for y in years:
            if by_year[y] and len(picked) < n_delisted:
                picked.append(by_year[y].pop(rng.randrange(len(by_year[y]))))
    return codes + picked


def fetch_cn(codes: list[str] | None = None, start: str = "2005-01-01", limit: int | None = None,
             refresh: bool = False, progress: bool = True, source: str = "auto") -> list[str]:
    """断点续传下载。每只股票：不复权日线（东方财富 1 次请求；腾讯后备约 1–3 次）+ 新浪后复权因子 1 次。
    原始数据存 raw/kline/fqt0/{code}.json 与 raw/kline/sina_hfq/{code}.js，已存在的跳过。

    为什么不用东方财富 fqt=2：试下载发现其后复权是「拆送股按比例、现金红利按加法」的仿射口径
    （600000 在 2026-11 的 hfq ≈ 6.58 × 不复权 + 39.4），不是可连乘的总收益（见 DATA-CN-HK.md）。
    codes=None 且 limit=None → 全部（含退市）；limit=N → 分层抽样 N 只 + 退市股。
    start 只影响 build 的截取：下载取全历史，以便正确识别新股期与上市首日。
    source：auto（东方财富，连续失败自动切腾讯）/ eastmoney / tencent。
    """
    sec = security_master()
    if codes is None:
        codes = pilot_sample(sec, limit) if limit else sec["code"].tolist()
    sel_path = http.raw_dir(MARKET) / "selected_codes.json"
    prev = set(json.loads(sel_path.read_text())) if sel_path.exists() else set()
    sel_path.write_text(json.dumps(sorted(prev | set(codes))))
    failed = []
    em_fail = 0
    use_tencent = source == "tencent"
    for i, code in enumerate(codes, 1):
        try:
            if not use_tencent:
                try:
                    fetch_kline(code, 0, refresh=refresh)
                    em_fail = 0
                except http.HttpError as e:
                    em_fail += 1
                    print(f"[cn] {code} 东方财富失败：{e}", file=sys.stderr)
                    if source != "auto":
                        raise
                    if em_fail >= 2:
                        print("[cn] 东方财富连续失败，改用腾讯日线（后备源）", file=sys.stderr)
                        use_tencent = True
                    else:
                        failed.append(code)
                        continue
            if use_tencent:
                fetch_tencent_raw(code, refresh=refresh)
            fetch_sina_factor(code, refresh=refresh)
        except http.HttpError as e:
            failed.append(code)
            print(f"[cn] {code} 失败：{e}", file=sys.stderr)
        if progress and (i % 25 == 0 or i == len(codes)):
            print(f"[cn] {i}/{len(codes)}  http={http.stats()}", file=sys.stderr)
    if failed and use_tencent:
        retry, failed = failed, []
        for code in retry:
            try:
                fetch_tencent_raw(code, refresh=refresh)
                fetch_sina_factor(code, refresh=refresh)
            except http.HttpError:
                failed.append(code)
    if failed:
        print(f"[cn] 失败 {len(failed)} 只：{failed[:20]}", file=sys.stderr)
    return codes


# ---------------- 组装 ----------------
def fix_volume_unit(raw: pd.DataFrame, code: str = "") -> pd.DataFrame:
    """成交量单位自检：成交额 /(成交量 × 收盘) 的中位数应 ≈ 1；偏离 10 倍以上按 10 的幂纠正并提示。"""
    ok = (raw["volume"] > 0) & (raw["close"] > 0) & (raw["amount"] > 0)
    if ok.sum() < 5:
        return raw
    med = float((raw.loc[ok, "amount"] / (raw.loc[ok, "volume"] * raw.loc[ok, "close"])).tail(250).median())
    if 0.2 < med < 5:
        return raw
    mult = 10.0 ** round(np.log10(med))
    print(f"[sources] {code} 成交量单位异常（额/(量×价) 中位数 {med:.3g}），成交量 × {mult:g}", file=sys.stderr)
    out = raw.copy()
    out["volume"] = out["volume"] * mult
    return out


def adjust_from_factor(raw: pd.DataFrame, F: np.ndarray) -> pd.DataFrame:
    df = raw.copy()
    df["adj_factor"] = F
    df["close_adj"] = df["close"] * F
    df["open_adj"] = df["open"] * F
    return df


def load_code(code: str, sec_row: dict | None, changes: pd.DataFrame | None, start: str | None = None,
              market: str = MARKET) -> pd.DataFrame:
    d = http.raw_dir(market, "kline")
    p0, ps = d / "fqt0" / f"{code}.json", d / "sina_hfq" / f"{code}.js"
    if not p0.exists():
        return pd.DataFrame()
    j0 = json.loads(p0.read_text())
    src = j0.get("source", "eastmoney")
    raw = parse_kline(j0)
    if raw.empty:
        return pd.DataFrame()
    raw = fix_volume_unit(raw, code)
    if ps.exists():
        F = apply_factor(raw["date"], parse_sina_hfq(ps.read_text()))
        src += "+sina_factor"
    elif src == "eastmoney":
        F = factor_from_ref(raw)
        src += "+ref_factor"
    else:
        return pd.DataFrame()
    board = board_of(code)
    list_date = sec_row.get("list_date") if sec_row else None
    list_date = pd.Timestamp(list_date) if list_date is not None and pd.notna(list_date) else None
    df = adjust_from_factor(raw, F)
    if list_date is not None:
        # 北交所旧代码（43/83/87）带新三板时期历史：只保留上市日之后
        df = df[df["date"] >= list_date].reset_index(drop=True)
    df = df[df["volume"] > 0].reset_index(drop=True)   # 停牌日不留行
    if df.empty:
        return df
    # 首行不是上市首日（上市日期未知且早于 2005，或数据源截断）→ 不按新股处理
    first = df["date"].iloc[0]
    is_ipo_start = (list_date is not None and first <= list_date + pd.Timedelta(days=15)) or \
                   (list_date is None and first > pd.Timestamp("2005-01-31"))
    df["is_st"] = st_flags(code, df["date"], changes)
    lim = compute_limits(df, board, list_date, df["is_st"], trade_offset=0 if is_ipo_start else 1000)
    df = pd.concat([df, lim], axis=1)
    df["float_shares"] = float_shares_estimate(df)
    df["mcap_float"] = df["float_shares"] * df["close"]
    df["mcap_total"] = np.nan
    df["is_suspended"] = False
    df["code"] = code
    df["src"] = src
    if start:
        df = df[df["date"] >= pd.Timestamp(start)]
    return df


PRICE_EXTRA = ["open_adj", "adj_factor", "pct_chg", "ref_close", "limit_ratio", "limit_up_oneword",
               "limit_down_oneword", "no_limit_inferred", "is_st", "float_shares", "src"]


def build_cn(start: str = "2005-01-01", codes: list[str] | None = None, market: str = MARKET) -> dict:
    sec = security_master()
    changes = szse_name_changes()
    if codes is None:
        sel = http.raw_dir(market) / "selected_codes.json"
        codes = json.loads(sel.read_text()) if sel.exists() else sec["code"].tolist()
    rows = sec.set_index("code").to_dict("index")
    frames = []
    for code in codes:
        df = load_code(code, rows.get(code), changes, start, market)
        if not df.empty:
            frames.append(df)
    prices = pd.concat(frames, ignore_index=True)
    from ..schema import PRICES_COLUMNS
    keep = list(PRICES_COLUMNS) + PRICE_EXTRA
    prices = prices[keep]
    with_bars = set(prices["code"].unique())
    sec_out = sec[sec["code"].isin(set(codes))].copy()
    # 证券表补：东方财富首个 K 线日期作为 list_date 的后备
    first = prices.groupby("code")["date"].min()
    sec_out["list_date"] = sec_out["list_date"].fillna(sec_out["code"].map(first))
    p1 = store.write_prices(market, prices)
    p2 = store.write_securities(market, sec_out)

    dl = sec_out[sec_out["status"] == "delisted"]
    # 只有在样本期内仍在交易的退市股才应有行：退市日早于 start 的不计入分母
    dl_rel = dl[dl["delist_date"].isna() | (dl["delist_date"] >= pd.Timestamp(start))]
    dl_with = int(dl_rel["code"].isin(with_bars).sum())
    surv = "A" if len(dl_rel) > 0 and dl_with / len(dl_rel) >= 0.9 else "B"
    full = len(codes) >= 0.95 * len(sec)
    src_counts = prices.groupby("code")["src"].first().value_counts().to_dict()
    src_text = "；".join(f"{k}: {v} 只" for k, v in src_counts.items())
    uses_em = any(k == "eastmoney" for k in src_counts)
    uses_tx = any(str(k).startswith("tencent") for k in src_counts)
    notes = [
        f"样本：{len(codes)} 只（{'全量' if full else '试下载抽样，不是全市场'}）；退市股 {len(dl)} 只，其中退市日在 {start} 之后的 "
        f"{len(dl_rel)} 只、有 K 线 {dl_with} 只。",
        f"日线来源（按股票计）：{src_text}。",
        "幸存者偏差：证券表含沪深交易所终止上市名单（含吸收合并退市；北交所退市股、B 股未收录），东方财富与腾讯对已退市代码都仍返回历史日线。"
        + ("" if surv == "A" else " 样本期内退市股有数据的比例 < 90%，降为 B。"),
    ]
    if uses_em:
        notes.append("东方财富来源：OHLC / 量 / 额 / 换手率取东方财富不复权日线（fqt=0）；其 fqt=2 后复权是仿射口径，不用。")
    if uses_tx:
        notes.append("腾讯来源（东方财富限流时的后备）：OHLC / 量 / 额 / 换手率取腾讯不复权日线；腾讯自带后复权是减现金的加法口径（会出现负价），不用。")
    notes.append("复权：close_adj / open_adj = 不复权价 × 新浪后复权因子（乘法口径，因子在除权日生效；src 含 +ref_factor 的为东方财富昨收推算的后备因子）。"
                 "北交所 920 代码的新浪因子只从切换代码日开始，此前分红未复权。")
    notes += [
        "adj_factor = close_adj / close。volume 单位：股；turnover：小数（源数据精度 0.01%）。",
        "mcap_float：流通股本 ≈ Σ20日(成交量/复权因子) ÷ Σ20日换手率 × 当日复权因子，阶梯化（偏离 >2% 才换台阶）后 × 不复权收盘；"
        "试下载对照腾讯当前流通市值，中位绝对误差约 0.7%；mcap_total 无历史股本 → NaN。",
        "停牌：停牌日没有行（成交量为 0 的行已删除），is_suspended 恒为 False。",
        "涨跌停：基准价 = 昨收（除权日为除权参考价），比例按板块 × 日期（主板 10%、ST 5%（2026-07-06 起主板 ST 10%）、"
        "创业板 2020-08-24 起 20%、科创板 20%、北交所 30%）；上市首日不判，注册制新股前 5 日不设涨跌幅；"
        "收盘涨跌幅超过当日比例 0.6% 以上的日子视为当日无涨跌幅（股改 / 恢复上市 / 退市整理首日等），不判（no_limit_inferred）。"
        "ST 只有深市能点时重建（交易所简称变更记录，is_st 列），沪市 / 北交所 ST 未知（NA）按非 ST 处理 → 沪市 ST 股 5% 涨跌停会漏判。",
    ]
    m = Manifest(market=market, source=SOURCE, survivorship=surv,
                 downloaded_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                 coverage=(str(prices["date"].min().date()), str(prices["date"].max().date())),
                 rows=int(len(prices)), securities=int(prices["code"].nunique()),
                 sha256={p1.name: "", p2.name: ""}, notes="\n".join(notes))
    store.write_manifest(m)
    return {"rows": len(prices), "codes": int(prices["code"].nunique()), "survivorship": surv,
            "delisted": int(len(dl)), "delisted_in_window": int(len(dl_rel)), "delisted_with_bars": dl_with,
            "sources": src_counts}


# ---------------- 审计 ----------------
def audit_prices(market: str, reference: pd.DataFrame | None = None, top_extreme: int = 15) -> dict:
    """通用数据质量审计（cn / hk 共用）：行数、覆盖、缺口、重复、复权一致性、极端日收益、市值对照、退市覆盖。
    只看数据本身，不计算任何因子或收益预测统计。reference：当前市值参考（code, mcap_float_ref, mcap_total_ref）。"""
    px = store.read_prices(market, raw=True)
    sec = store.read_securities(market)
    out: dict = {"market": market}
    out["rows"] = int(len(px))
    out["codes_with_bars"] = int(px["code"].nunique())
    out["codes_in_securities"] = int(len(sec))
    out["coverage"] = [str(px["date"].min().date()), str(px["date"].max().date())]
    out["duplicates_date_code"] = int(px.duplicated(["date", "code"]).sum())
    out["null_close"] = int(px["close"].isna().sum())
    out["null_close_adj"] = int(px["close_adj"].isna().sum())
    out["nonpositive_close_adj"] = int((px["close_adj"] <= 0).sum())
    ohlc_bad = (px["high"] < px[["open", "close", "low"]].max(axis=1) - 1e-9) | (px["low"] > px[["open", "close", "high"]].min(axis=1) + 1e-9)
    out["ohlc_inconsistent_rows"] = int(ohlc_bad.sum())
    # 交易日历：全样本出现过的日期并集；每只股票首末日之间缺了多少个日历日（= 停牌，因为停牌无行）
    cal = np.sort(px["date"].unique())
    per = px.groupby("code")["date"].agg(["min", "max", "count"])
    pos = {d: i for i, d in enumerate(cal)}
    per["span"] = per["max"].map(pos) - per["min"].map(pos) + 1
    per["missing"] = per["span"] - per["count"]
    out["calendar_days"] = int(len(cal))
    out["rows_per_code_median"] = float(per["count"].median())
    out["missing_days_share_total"] = float(per["missing"].sum() / per["span"].sum())
    out["codes_missing_gt_20pct"] = int((per["missing"] / per["span"] > 0.2).sum())
    # 最长连续缺口（停牌）
    px = px.sort_values(["code", "date"])
    di = px["date"].map(pos)
    gap = di.groupby(px["code"]).diff() - 1
    g = px.assign(gap=gap)
    longest = g.nlargest(5, "gap")[["code", "date", "gap"]]
    out["longest_gaps"] = [{"code": r.code, "resume_date": str(r.date.date()), "missing_trading_days": int(r.gap)}
                           for r in longest.itertuples()]
    # 每年行数 / 股票数
    yr = px.groupby(px["date"].dt.year).agg(rows=("code", "size"), codes=("code", "nunique"))
    out["by_year"] = {int(y): {"rows": int(r.rows), "codes": int(r.codes)} for y, r in yr.iterrows()}
    # 复权：adj_factor 非事件日漂移、下降次数
    if "adj_factor" in px:
        f = px["adj_factor"]
        fch = f / f.groupby(px["code"]).shift() - 1
        out["adj_factor_change_days"] = int((fch.abs() > 1e-3).sum())
        out["adj_factor_decreases_gt_1pct"] = int((fch < -0.01).sum())
        small = fch[(fch.abs() <= 1e-3)]
        out["adj_factor_nonevent_max_drift"] = float(small.abs().max()) if len(small) else 0.0
        if "open_adj" in px:
            fo = px["open_adj"] / px["open"]
            out["open_vs_close_factor_max_gap"] = float(((fo - f).abs() / f).max())
    # 极端日收益（后复权）
    r = px["close_adj"] / px.groupby("code")["close_adj"].shift() - 1
    px = px.assign(ret=r)
    out["abs_ret_gt_50pct"] = int((px["ret"].abs() > 0.5).sum())
    out["abs_ret_gt_25pct"] = int((px["ret"].abs() > 0.25).sum())
    ext = px.reindex(px["ret"].abs().sort_values(ascending=False).index).head(top_extreme)
    out["extreme_returns"] = [{"code": e.code, "date": str(e.date.date()), "ret": round(float(e.ret), 4),
                               "close": float(e.close), "prev_days_gap": None} for e in ext.itertuples()]
    # 涨跌停
    if px["limit_up"].notna().any():
        out["limit_up_share"] = float(px["limit_up"].astype("float").mean())
        out["limit_down_share"] = float(px["limit_down"].astype("float").mean())
        out["limit_unknown_share"] = float(px["limit_up"].isna().mean())
        if "limit_up_oneword" in px:
            out["limit_up_oneword_share"] = float(px["limit_up_oneword"].astype("float").mean())
        # 收益超过当日涨跌幅上限（说明规则表错或基准价错）
        if "limit_ratio" in px and "ref_close" in px:
            rr = px["close"] / px["ref_close"] - 1
            over = (rr.abs() > px["limit_ratio"] + 0.006) & px["limit_ratio"].notna()
            out["rows_exceeding_limit_ratio"] = int(over.sum())
            if "no_limit_inferred" in px:
                out["rows_no_limit_inferred"] = int(px["no_limit_inferred"].fillna(False).sum())
                nl = px[px["no_limit_inferred"].fillna(False).astype(bool)]
                out["no_limit_inferred_by_year"] = nl["date"].dt.year.value_counts().sort_index().astype(int).to_dict()
            out["rows_exceeding_limit_examples"] = px.loc[over, ["code", "date", "close", "ref_close", "limit_ratio"]].head(10).astype(str).to_dict("records")
            # 东方财富昨收 vs 复权因子推算的基准价
            alt = px.groupby("code")["close"].shift() * px.groupby("code")["adj_factor"].shift() / px["adj_factor"]
            dev = (px["ref_close"] / alt - 1).abs()
            out["ref_close_vs_factor_ref_gt_1pct"] = int((dev > 0.01).sum())
    # 市值
    if px["mcap_float"].notna().any():
        out["mcap_float_null_share"] = float(px["mcap_float"].isna().mean())
        last = px.sort_values("date").groupby("code").tail(1).set_index("code")
        amt = (px["amount"] / px["turnover"].where(px["turnover"] > 0))
        ratio = (px["mcap_float"] / amt).replace([np.inf, -np.inf], np.nan)
        out["mcap_vs_amount_over_turnover_ratio_pctiles"] = {q: round(float(ratio.quantile(q)), 4) for q in (0.05, 0.25, 0.5, 0.75, 0.95)}
        if reference is not None and len(reference):
            ref = reference.set_index("code")
            j = last.join(ref, how="inner")
            j = j[j["date"] == px["date"].max()]
            if len(j):
                j["amt_proxy"] = j["amount"] / j["turnover"].where(j["turnover"] > 0)
                j["err_step"] = j["mcap_float"] / j["mcap_float_ref"] - 1
                j["err_amt"] = j["amt_proxy"] / j["mcap_float_ref"] - 1
                out["mcap_reference_check"] = {
                    "n": int(len(j)),
                    "median_abs_err_volume_turnover_step": round(float(j["err_step"].abs().median()), 4),
                    "median_abs_err_amount_turnover": round(float(j["err_amt"].abs().median()), 4),
                    "p90_abs_err_volume_turnover_step": round(float(j["err_step"].abs().quantile(0.9)), 4),
                    "p90_abs_err_amount_turnover": round(float(j["err_amt"].abs().quantile(0.9)), 4),
                    "examples": j.sort_values("mcap_float_ref", ascending=False).head(5)[
                        ["mcap_float", "amt_proxy", "mcap_float_ref", "turnover"]].round(4).reset_index().astype(str).to_dict("records"),
                }
    # 退市覆盖
    if (sec["status"] == "delisted").any():
        dl = sec[sec["status"] == "delisted"].copy()
        have = set(px["code"].unique())
        lastbar = px.groupby("code")["date"].max()
        dl["has_bars"] = dl["code"].isin(have)
        dl["last_bar"] = dl["code"].map(lastbar)
        dl["lag_days"] = (dl["delist_date"] - dl["last_bar"]).dt.days
        out["delisted_total"] = int(len(dl))
        out["delisted_with_bars"] = int(dl["has_bars"].sum())
        by = dl.groupby(dl["delist_date"].dt.year).agg(n=("code", "size"), with_bars=("has_bars", "sum"))
        out["delisted_by_year"] = {int(y): f"{int(r.with_bars)}/{int(r.n)}" for y, r in by.iterrows()}
        out["delist_lag_days_median"] = float(dl["lag_days"].median()) if dl["lag_days"].notna().any() else None
        out["delist_lag_days_max"] = float(dl["lag_days"].max()) if dl["lag_days"].notna().any() else None
    return out


def reference_mcap_cn(n_pages: int = 1) -> pd.DataFrame:
    """东方财富当前流通 / 总市值（按总市值降序前 100 只 × n_pages），只作审计参考。"""
    fs = "m:0 t:6,m:0 t:80,m:1 t:2,m:1 t:23,m:0 t:81 s:2048"
    d = _clist(fs, fields="f12,f14,f20,f21,f8", fid="f20", po=1, pages=n_pages)
    d = d.rename(columns={"f12": "code", "f14": "name", "f20": "mcap_total_ref", "f21": "mcap_float_ref"})
    for c in ("mcap_total_ref", "mcap_float_ref"):
        d[c] = pd.to_numeric(d[c], errors="coerce")
    return d[["code", "name", "mcap_float_ref", "mcap_total_ref"]]


TENCENT_QT_URL = "https://qt.gtimg.cn/q="


def reference_mcap_tencent(symbols: list[str], market: str = MARKET, batch: int = 60) -> pd.DataFrame:
    """腾讯实时行情（当前流通市值 f44、总市值 f45，单位亿元 / 亿港元）作审计参考；symbols 如 sh600519、hk00700。"""
    c = http.client(market)
    rows = []
    for i in range(0, len(symbols), batch):
        part = symbols[i:i + batch]
        body = c.get(TENCENT_QT_URL + ",".join(part), cache=False)
        for line in body.decode("gbk", errors="replace").split(";"):
            f = line.strip().split("~")
            if len(f) < 46 or not f[2]:
                continue
            try:
                rows.append({"code": f[2], "name": f[1], "mcap_float_ref": float(f[44]) * 1e8,
                             "mcap_total_ref": float(f[45]) * 1e8, "price_ref": float(f[3])})
            except ValueError:
                continue
    return pd.DataFrame(rows, columns=["code", "name", "mcap_float_ref", "mcap_total_ref", "price_ref"])


def st_rule_check(market: str = MARKET) -> dict:
    """经验核对 ST 涨跌幅：深市点时 ST 股在各时期的最大 |收盘/基准 - 1| 分布（只看规则，不看收益）。"""
    px = store.read_prices(market, ["close", "ref_close", "is_st", "limit_ratio"], raw=True)
    st = px[px["is_st"].fillna(False).astype(bool) & px["code"].str.startswith(("00", "30"))].copy()
    if st.empty:
        return {}
    st["absmove"] = (st["close"] / st["ref_close"] - 1).abs()
    st["period"] = np.where(st["date"] >= MAIN_ST_10PCT, "2026-07-06起", "2026-07-06前")
    st["board"] = st["code"].map(board_of)
    g = st.groupby(["board", "period"])["absmove"]
    res = {f"{b}|{p}": {"rows": int(len(v)), "share_gt_5.5pct": round(float((v > 0.055).mean()), 4),
                        "max": round(float(v.max()), 4)} for (b, p), v in g}
    return res


def audit_cn(market: str = MARKET) -> dict:
    try:
        sec = store.read_securities(market)
        listed = sec.loc[sec["status"] == "listed", "code"].tolist()
        ref = reference_mcap_tencent([tencent_symbol(c) for c in listed], market)
    except http.HttpError as e:
        print(f"[cn] 市值参考下载失败：{e}", file=sys.stderr)
        ref = None
    out = audit_prices(market, ref)
    out["st_rule_check"] = st_rule_check(market)
    return out


def probe_delisted(n_per_year: int = 5, seed: int = 7, market: str = MARKET) -> dict:
    """退市股覆盖抽查（不下全量）：每个退市年份抽 n 只，向腾讯要退市日之前的最后 1 根日线（每只 1 次请求）。"""
    sec = security_master()
    dl = sec[sec["status"] == "delisted"].copy()
    rng = random.Random(seed)
    rows = []
    c = http.client(market)
    for y, g in dl.groupby(dl["delist_date"].dt.year):
        codes = sorted(g["code"])
        for code in rng.sample(codes, min(n_per_year, len(codes))):
            dd = g.loc[g["code"] == code, "delist_date"].iloc[0]
            sym = tencent_symbol(code)
            end = (dd + pd.Timedelta(days=1)).strftime("%Y-%m-%d") if pd.notna(dd) else date.today().isoformat()
            d = c.get_json(TENCENT_URL, {"param": f"{sym},day,1990-01-01,{end},1,"}, ns="probe_delisted")
            node = (d.get("data") or {}).get(sym) if isinstance(d.get("data"), dict) else None
            k = (node.get("day") or []) if isinstance(node, dict) else []
            last = pd.Timestamp(k[-1][0]) if k else pd.NaT
            rows.append({"code": code, "year": int(y), "delist_date": dd, "has_bar": bool(k), "last_bar": last})
    r = pd.DataFrame(rows)
    r["lag_days"] = (r["delist_date"] - r["last_bar"]).dt.days
    by = r.groupby("year").agg(n=("code", "size"), with_bars=("has_bar", "sum"))
    return {"sampled": int(len(r)), "with_bars": int(r["has_bar"].sum()),
            "by_year": {int(y): f"{int(v.with_bars)}/{int(v.n)}" for y, v in by.iterrows()},
            "lag_days_median": float(r["lag_days"].median()), "lag_days_p90": float(r["lag_days"].quantile(0.9)),
            "missing": r.loc[~r["has_bar"], ["code", "delist_date"]].astype(str).to_dict("records"),
            "requests": int(len(r))}


def affine_fit(raw: pd.DataFrame, hfq: pd.DataFrame) -> pd.DataFrame:
    """逐日用最高 / 最低价估计 hfq = a × raw + b（高低价相差 ≥ 2 分才估计）。
    乘法复权 → b ≈ 0；加法 / 仿射复权 → b 显著不为 0。"""
    j = raw[["date", "high", "low", "close"]].merge(
        hfq[["date", "high", "low", "close"]].rename(columns={"high": "hh", "low": "hl", "close": "hc"}), on="date")
    rng = j["high"] - j["low"]
    a = ((j["hh"] - j["hl"]) / rng).where(rng >= 0.02)
    j["a"] = a
    j["b"] = j["hc"] - a * j["close"]
    j["b_over_hfq"] = j["b"] / j["hc"]
    return j[["date", "a", "b", "b_over_hfq"]]


def check_hfq_eastmoney(codes: list[str], market: str = MARKET) -> dict:
    """东方财富可用时运行：取 fqt=0/2，检验后复权是否按比例（乘法）：逐日拟合 hfq = a·raw + b，
    报告近 250 日 b / hfq 的中位数（乘法口径应 ≈ 0）；并与新浪因子口径对比日收益。原始响应存 raw/http/em_check/。"""
    c = http.client(market)
    out = {}
    for code in codes:
        raw = parse_kline(c.get_json(KLINE_URL, kline_params(code, 0), ns="em_check"))
        hfq = parse_kline(c.get_json(KLINE_URL, kline_params(code, 2), ns="em_check"))
        df = merge_raw_hfq(raw, hfq)
        rep = hfq_consistency(df)
        fit = affine_fit(raw, hfq).tail(250)
        rep["affine_b_over_hfq_median_last250"] = float(fit["b_over_hfq"].median())
        rep["affine_a_median_last250"] = float(fit["a"].median())
        ps = http.raw_dir(market, "kline", "sina_hfq") / f"{code}.js"
        if ps.exists():
            F = apply_factor(raw["date"], parse_sina_hfq(ps.read_text()))
            r_sina = pd.Series(raw["close"].to_numpy() * F).pct_change()
            r_em = df["close_adj"].pct_change()
            r_ref = pd.Series(raw["close"].to_numpy() * factor_from_ref(raw)).pct_change()
            rep["em_hfq_vs_sina_ret_diff_gt_0.5pct_days"] = int(((r_em - r_sina).abs() > 0.005).sum())
            rep["ref_factor_vs_sina_ret_diff_gt_0.5pct_days"] = int(((r_ref - r_sina).abs() > 0.005).sum())
            rep["cum_growth_em_hfq"] = float(df["close_adj"].iloc[-1] / df["close_adj"].iloc[0])
            rep["cum_growth_sina"] = float(raw["close"].iloc[-1] * F[-1] / (raw["close"].iloc[0] * F[0]))
        out[code] = rep
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(prog="factorlab.sources.cn")
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--limit", type=int, default=None)
    f.add_argument("--codes", type=str, default=None, help="逗号分隔代码")
    f.add_argument("--start", default="2005-01-01")
    f.add_argument("--rps", type=float, default=None, help="限速（次/秒），默认 2")
    f.add_argument("--refresh", action="store_true", help="忽略缓存重新下载（用于更新到最新日）")
    f.add_argument("--source", choices=["auto", "eastmoney", "tencent"], default="auto")
    b = sub.add_parser("build")
    b.add_argument("--start", default="2005-01-01")
    sub.add_parser("audit")
    pd_ = sub.add_parser("probe-delisted", help="退市股覆盖抽查（每年抽 n 只，各 1 次请求）")
    pd_.add_argument("--per-year", type=int, default=5)
    ch = sub.add_parser("check-hfq", help="东方财富后复权乘法一致性检验 + 与新浪因子对比")
    ch.add_argument("--codes", default="600000,000002,600519,300750,000651")
    a = ap.parse_args(argv)
    if a.cmd == "fetch":
        if a.rps:
            http.set_rate(a.rps)
        codes = a.codes.split(",") if a.codes else None
        fetch_cn(codes=codes, start=a.start, limit=a.limit, refresh=a.refresh, source=a.source)
        print(json.dumps(http.stats()))
    elif a.cmd == "build":
        print(json.dumps(build_cn(start=a.start), ensure_ascii=False, indent=2))
    elif a.cmd == "audit":
        print(json.dumps(audit_cn(), ensure_ascii=False, indent=2, default=str))
    elif a.cmd == "probe-delisted":
        print(json.dumps(probe_delisted(a.per_year), ensure_ascii=False, indent=2, default=str))
    elif a.cmd == "check-hfq":
        print(json.dumps(check_hfq_eastmoney(a.codes.split(",")), ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
