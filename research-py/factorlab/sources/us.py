"""美股个股适配器（market = 'us'，幸存者偏差等级 B）。

数据源：
- 证券表：Nasdaq Trader 符号目录 nasdaqlisted.txt（纳斯达克）与 otherlisted.txt（NYSE / NYSE American 等），
  只含**当前上市**证券 → 有幸存者偏差（等级 B）。过滤 ETF、测试证券、权证、权利、SPAC 单位、优先股、债券、ADR。
- 日线：Yahoo chart API v8（events=div|split，includeAdjustedClose=true，UA "Mozilla/5.0"，限速 ≤ 1 次/秒）。
  Yahoo 的 quote.close / open / high / low / volume **已按拆股调整**（不按分红调整），本模块用 events.splits
  还原成真正的不复权价（close = 不复权收盘）；adjclose 是拆股 + 分红（总收益）调整、以最新价为锚，
  本模块把它整体缩放成「首日 = 首日不复权收盘」的后复权口径写入 close_adj（比值不变，收益可连乘）。
- 东方财富美股 K 线（secid 105 纳斯达克 / 106 NYSE / 107 AMEX）作为备用（fetch_eastmoney），未在主流程使用。

市值：没有免费、可回溯的历史股本数据源 → mcap_float / mcap_total 为 NaN（SEC 财报里的股本见 sec.py）。

命令行：
    uv run python -m factorlab.sources.us fetch [--limit 200] [--codes AAPL,MSFT] [--start 1995-01-01]
    uv run python -m factorlab.sources.us build
    uv run python -m factorlab.sources.us audit
"""

from __future__ import annotations

import argparse
import gzip
import json
import random
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from .. import store
from ..schema import Manifest

MARKET = "us"
UA = "Mozilla/5.0"
NASDAQ_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
OTHER_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"
YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
EASTMONEY_KLINE_URL = "https://push2his.eastmoney.com/api/qt/stock/kline/get"
NY = ZoneInfo("America/New_York")


# ----------------------------------------------------------------------------------------------
# 极简 HTTP（factorlab/sources/http.py 由另一处并行编写；在其接口稳定前，美股 / KF / SEC 共用这里的私有实现）
# ----------------------------------------------------------------------------------------------
class HttpError(RuntimeError):
    def __init__(self, status: int, url: str, msg: str = ""):
        super().__init__(f"HTTP {status} {url} {msg}".strip())
        self.status = status
        self.url = url


class _Http:
    """限速（两次请求之间至少 min_interval 秒）+ 重试（429 / 5xx / 网络错误，指数退避）+ curl 兜底。"""

    def __init__(self, min_interval: float = 1.0, headers: dict | None = None, timeout: float = 60,
                 retries: int = 4):
        self.min_interval = min_interval
        self.headers = {"User-Agent": UA, **(headers or {})}
        self.timeout = timeout
        self.retries = retries
        self._last = 0.0
        self.requests = 0
        try:
            import requests  # noqa: F401
            self._session = requests.Session()
        except ImportError:  # pragma: no cover
            self._session = None

    def _wait(self) -> None:
        dt = time.monotonic() - self._last
        if dt < self.min_interval:
            time.sleep(self.min_interval - dt)
        self._last = time.monotonic()

    def get(self, url: str, params: dict | None = None) -> bytes:
        last_err: Exception | None = None
        for attempt in range(self.retries + 1):
            self._wait()
            self.requests += 1
            try:
                status, body = self._get_once(url, params)
            except Exception as e:  # 网络错误
                last_err = e
                time.sleep(min(60, 2 ** attempt * 2))
                continue
            if status == 200:
                return body
            if status in (429, 500, 502, 503, 504):
                last_err = HttpError(status, url)
                time.sleep(min(120, 2 ** attempt * 5))
                continue
            raise HttpError(status, url, body[:200].decode("utf-8", "replace"))
        raise last_err if last_err else HttpError(-1, url)

    def _get_once(self, url: str, params: dict | None) -> tuple[int, bytes]:
        if self._session is not None:
            try:
                r = self._session.get(url, params=params, headers=self.headers, timeout=self.timeout)
                return r.status_code, r.content
            except Exception:
                pass  # 落到 curl
        import urllib.parse
        full = url + ("?" + urllib.parse.urlencode(params) if params else "")
        cmd = ["curl", "-sS", "-L", "--max-time", str(int(self.timeout)), "-w", "\n%{http_code}"]
        for k, v in self.headers.items():
            cmd += ["-H", f"{k}: {v}"]
        out = subprocess.run(cmd + [full], capture_output=True, check=True).stdout
        body, _, code = out.rpartition(b"\n")
        return int(code or 0), body


def _write_bytes(p: Path, data: bytes) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(p.suffix + ".part")
    tmp.write_bytes(data)
    tmp.replace(p)


# ----------------------------------------------------------------------------------------------
# 证券表
# ----------------------------------------------------------------------------------------------
NASDAQ_BOARD = {"Q": "NASDAQ Global Select", "G": "NASDAQ Global Market", "S": "NASDAQ Capital Market"}
OTHER_EXCHANGE = {"N": "NYSE", "A": "AMEX", "P": "ARCA", "Z": "BATS", "V": "IEX"}
KEEP_TYPES = ("common", "ordinary", "unspecified")


def classify_security(name: str, symbol: str = "") -> str:
    """按证券名称粗分类（词边界匹配，避免 UnitedHealth 被当成 unit）。
    返回 common / ordinary / unspecified / adr / preferred / warrant / right / unit / note / fund。"""
    n = " ".join(str(name).lower().split())

    def has(pat: str) -> bool:
        return re.search(pat, n) is not None

    if "$" in symbol or "^" in symbol:
        return "preferred"
    if has(r"\bwarrants?\b"):
        return "warrant"
    if has(r"\brights?\b") and not has(r"common (stock|shares?)"):
        return "right"
    if has(r"\bpreferred\b|\bpreference\b|\bpfd\b"):
        return "preferred"
    if has(r"\bnotes?\b|\bdebentures?\b|\bdue 20\d\d\b|\bbonds?\b|\bsubordinated\b"):
        return "note"
    if has(r"depositary shares?") and "%" in n:
        return "preferred"
    if has(r"american deposit[ao]ry|\badss?\b|\badrs?\b|deposit[ao]ry receipts?|new york registry"):
        return "adr"
    if has(r"common units?"):  # MLP 普通单位
        return "common"
    if has(r"\bunits?\b"):
        return "unit"
    if has(r"\betf\b|\betn\b|exchange traded|\bfund\b"):
        return "fund"
    if has(r"common (stock|shares?)|capital stock|class [a-c] (stock|shares?)"):
        return "common"
    if has(r"ordinary shares?"):
        return "ordinary"
    if "%" in n or has(r"\bstrats\b|\bcorts\b|trust certificates|backed tr"):
        return "note"  # 结构化 / 固定收益产品
    if has(r"\btrust\b") and has(r"income|municipal|dividend|target term|credit|equity|opportunit|strategic|"
                                   r"premium|enhanced|yield|duration|resources|sciences|infrastructure"):
        return "fund"  # 封闭式基金（名称里没有 Common Stock 的那部分）
    return "unspecified"


def _read_pipe_table(text: str) -> pd.DataFrame:
    lines = [ln for ln in text.replace("\r\n", "\n").replace("\r", "\n").split("\n") if ln.strip()]
    lines = [ln for ln in lines if not ln.startswith("File Creation Time")]
    header = [h.strip() for h in lines[0].split("|")]
    rows = [[c.strip() for c in ln.split("|")][: len(header)] for ln in lines[1:]]
    rows = [r + [""] * (len(header) - len(r)) for r in rows]
    return pd.DataFrame(rows, columns=header)


def parse_nasdaq_listed(text: str) -> pd.DataFrame:
    df = _read_pipe_table(text)
    out = pd.DataFrame({
        "code": df["Symbol"], "name": df["Security Name"], "exchange": "NASDAQ",
        "board": df["Market Category"].map(NASDAQ_BOARD).fillna(df["Market Category"]),
        "is_etf": df["ETF"].eq("Y"), "is_test": df["Test Issue"].eq("Y"),
        "financial_status": df.get("Financial Status", ""),
    })
    return out


def parse_other_listed(text: str) -> pd.DataFrame:
    df = _read_pipe_table(text)
    out = pd.DataFrame({
        "code": df["ACT Symbol"], "name": df["Security Name"],
        "exchange": df["Exchange"].map(OTHER_EXCHANGE).fillna(df["Exchange"]),
        "board": df["Exchange"].map(OTHER_EXCHANGE).fillna(df["Exchange"]),
        "is_etf": df["ETF"].eq("Y"), "is_test": df["Test Issue"].eq("Y"), "financial_status": "",
    })
    return out


def yahoo_symbol(code: str) -> str:
    return code.replace(".", "-").replace("$", "-P")


def build_security_master(nasdaq_text: str, other_text: str, keep_types=KEEP_TYPES) -> pd.DataFrame:
    """当前上市的美股普通股（NASDAQ / NYSE / AMEX）。额外列：sec_type / is_spac / yahoo / financial_status。"""
    df = pd.concat([parse_nasdaq_listed(nasdaq_text), parse_other_listed(other_text)], ignore_index=True)
    df = df[df["code"].ne("") & ~df["is_test"] & ~df["is_etf"]]
    df = df[df["exchange"].isin(["NASDAQ", "NYSE", "AMEX"])]
    df["sec_type"] = [classify_security(n, c) for n, c in zip(df["name"], df["code"])]
    df = df[df["sec_type"].isin(keep_types)]
    df = df[~df["code"].str.contains(r"[\$\^=+]", regex=True)]
    df = df.drop_duplicates("code", keep="first")
    lname = df["name"].str.lower()
    df["is_spac"] = lname.str.contains("acquisition corp") | lname.str.contains("blank check")
    df["yahoo"] = df["code"].map(yahoo_symbol)
    df["market"] = MARKET
    df["status"] = "listed"
    df["currency"] = "USD"
    df["source"] = "nasdaqtrader-symdir"
    df["list_date"] = pd.NaT
    df["delist_date"] = pd.NaT
    df["name"] = df["name"].str.strip()
    return df.drop(columns=["is_etf", "is_test"]).sort_values("code").reset_index(drop=True)


def fetch_security_master(http: _Http | None = None, refresh: bool = False) -> pd.DataFrame:
    raw = store.market_dir(MARKET) / "raw" / "symdir"
    http = http or _Http(min_interval=1.0)
    texts = {}
    for name, url in (("nasdaqlisted.txt", NASDAQ_LISTED_URL), ("otherlisted.txt", OTHER_LISTED_URL)):
        p = raw / name
        if refresh or not p.exists():
            _write_bytes(p, http.get(url))
        texts[name] = p.read_text(encoding="latin-1")
    return build_security_master(texts["nasdaqlisted.txt"], texts["otherlisted.txt"])


# ----------------------------------------------------------------------------------------------
# Yahoo chart 解析
# ----------------------------------------------------------------------------------------------
def parse_yahoo_chart(payload: dict, code: str, now: datetime | None = None) -> tuple[pd.DataFrame, dict]:
    """Yahoo chart v8 JSON → (prices 长表, info)。

    info: {splits: [(date, ratio)], dividends: [(date, amount)], first_trade_date, dropped: {...}, meta}
    """
    chart = payload.get("chart") or {}
    if chart.get("error"):
        raise ValueError(f"{code}: Yahoo error {chart['error']}")
    res = (chart.get("result") or [None])[0]
    if not res:
        raise ValueError(f"{code}: Yahoo 返回空结果")
    meta = res.get("meta", {})
    tz = ZoneInfo(meta.get("exchangeTimezoneName") or "America/New_York")
    ev = res.get("events") or {}
    splits = sorted(
        (pd.Timestamp(datetime.fromtimestamp(int(s["date"]), tz).date()),
         float(s["numerator"]) / float(s["denominator"]))
        for s in (ev.get("splits") or {}).values() if s.get("denominator"))
    divs = sorted(
        (pd.Timestamp(datetime.fromtimestamp(int(d["date"]), tz).date()), float(d["amount"]))
        for d in (ev.get("dividends") or {}).values())
    ftd = meta.get("firstTradeDate")
    info = {"splits": splits, "dividends": divs, "meta": {k: meta.get(k) for k in (
        "symbol", "exchangeName", "fullExchangeName", "instrumentType", "currency", "longName")},
            "first_trade_date": (pd.Timestamp(datetime.fromtimestamp(int(ftd), tz).date())
                                 if ftd is not None else pd.NaT), "dropped": {}}
    ts = res.get("timestamp") or []
    cols = ["date", "code", "open", "high", "low", "close", "close_adj", "volume", "amount"]
    if not ts:
        return pd.DataFrame(columns=cols), info
    q = (res.get("indicators", {}).get("quote") or [{}])[0]
    adj = (res.get("indicators", {}).get("adjclose") or [{}])[0].get("adjclose")
    n = len(ts)

    def arr(v):
        return np.array([np.nan if x is None else x for x in (v or [None] * n)], dtype="float64")

    dates = (pd.to_datetime(pd.Series(ts, dtype="int64"), unit="s", utc=True)
             .dt.tz_convert(tz).dt.tz_localize(None).dt.normalize())
    df = pd.DataFrame({"date": dates.values, "open": arr(q.get("open")), "high": arr(q.get("high")),
                       "low": arr(q.get("low")), "close_s": arr(q.get("close")),
                       "volume_s": arr(q.get("volume")), "adjclose": arr(adj)})
    # 未收盘的当日 K 线不要
    now = now or datetime.now(timezone.utc)
    now_ex = now.astimezone(tz)
    if now_ex.hour * 60 + now_ex.minute < 16 * 60 + 30:
        partial = df["date"] >= pd.Timestamp(now_ex.date())
        info["dropped"]["partial_today"] = int(partial.sum())
        df = df[~partial]
    bad = df["close_s"].isna() | (df["close_s"] <= 0)
    info["dropped"]["null_or_nonpositive_close"] = int(bad.sum())
    df = df[~bad]
    dup = df["date"].duplicated(keep="last")
    info["dropped"]["duplicate_date"] = int(dup.sum())
    df = df[~dup].sort_values("date").reset_index(drop=True)
    noadj = df["adjclose"].isna() | (df["adjclose"] <= 0)
    info["dropped"]["null_adjclose"] = int(noadj.sum())
    df = df[~noadj].reset_index(drop=True)
    if df.empty:
        return pd.DataFrame(columns=cols), info
    # 还原不复权：t 日之后的所有拆股比例连乘
    factor = np.ones(len(df))
    for d, r in splits:
        factor[(df["date"] < d).to_numpy()] *= r
    out = pd.DataFrame({"date": df["date"], "code": code})
    for c in ("open", "high", "low"):
        out[c] = df[c].to_numpy() * factor
    out["close"] = df["close_s"].to_numpy() * factor
    out["volume"] = np.round(df["volume_s"].to_numpy() / factor)  # Yahoo 成交量按拆股调整过，还原后取整
    k = out["close"].iloc[0] / df["adjclose"].iloc[0]
    out["close_adj"] = df["adjclose"].to_numpy() * k
    out["amount"] = out["close"] * out["volume"]  # 近似成交额：不复权收盘 × 不复权成交量
    return out[cols], info


# ----------------------------------------------------------------------------------------------
# 下载
# ----------------------------------------------------------------------------------------------
LARGE_CAPS = [
    "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "GOOG", "META", "BRK.B", "TSLA", "AVGO", "LLY", "JPM", "V", "WMT",
    "XOM", "UNH", "MA", "ORCL", "COST", "HD", "PG", "JNJ", "NFLX", "BAC", "ABBV", "KO", "CVX", "CRM", "MRK",
    "AMD", "PEP", "TMO", "CSCO", "ADBE", "MCD", "WFC", "IBM", "GE", "INTC", "QCOM", "TXN", "CAT", "DIS", "AMGN",
    "PFE", "T", "VZ", "C", "AIG", "F", "GM", "BA", "MMM", "CMG", "SMCI", "MU", "NKE", "SBUX", "LOW", "GS",
]
RECENT_IPOS = [  # 2023–2025 上市（若已不在证券表则忽略）
    "ARM", "CART", "KVYO", "CAVA", "RDDT", "ALAB", "RBRK", "CRWV", "CRCL", "CHYM", "ETOR", "FIG", "KLAR",
    "SAIL", "VG", "LOAR", "TEM", "WAY", "OKLO", "NBIS", "BIRK", "SFD", "MNTN", "GRND", "PONY", "HNGE",
]


def pilot_sample(master: pd.DataFrame, n: int = 200, seed: int = 20261126) -> list[str]:
    """试下载样本：大盘股 + 近年新股 + 证券表里其余股票的固定种子随机抽样（偏向中小盘）。"""
    codes = set(master["code"])
    pick = [c for c in LARGE_CAPS if c in codes][: n // 3]
    pick += [c for c in RECENT_IPOS if c in codes and c not in pick]
    rest = sorted(codes - set(pick))
    rng = random.Random(seed)
    rng.shuffle(rest)
    pick += rest[: max(0, n - len(pick))]
    return pick[:n]


def _yahoo_path(code: str) -> Path:
    return store.market_dir(MARKET) / "raw" / "yahoo" / f"{code}.json.gz"


def _status_path() -> Path:
    return store.market_dir(MARKET) / "raw" / "yahoo" / "_status.json"


def _load_status() -> dict:
    p = _status_path()
    return json.loads(p.read_text()) if p.exists() else {}


def _save_status(st: dict) -> None:
    p = _status_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(st, ensure_ascii=False, indent=1, sort_keys=True))


def fetch_us(codes: list[str] | None = None, start: str = "1995-01-01", limit: int | None = None,
             refresh: bool = False, retry_failed: bool = False, min_interval: float = 1.1,
             verbose: bool = True) -> dict:
    """断点续传下载 Yahoo 日线到 {root}/us/raw/yahoo/{CODE}.json.gz。

    - codes 为空：用当前证券表；limit 给定时取 pilot_sample(master, limit)（大盘 + 新股 + 随机）。
    - 已下载的跳过（refresh=True 重下）；失败记入 _status.json，retry_failed=True 时重试。
    - 限速：两次请求之间 ≥ min_interval 秒（默认 1.1 秒，满足 ≤ 1 次/秒）。
    """
    http = _Http(min_interval=min_interval)
    master = fetch_security_master(http)
    if codes is None:
        codes = pilot_sample(master, limit) if limit else list(master["code"])
    elif limit:
        codes = codes[:limit]
    ymap = dict(zip(master["code"], master["yahoo"]))
    status = _load_status()
    p1 = int(pd.Timestamp(start, tz="UTC").timestamp())
    p2 = int(time.time()) + 86400
    done = skipped = failed = 0
    for i, code in enumerate(codes):
        p = _yahoo_path(code)
        st = status.get(code, {})
        if not refresh and p.exists():
            skipped += 1
            continue
        if not refresh and st.get("ok") is False and not retry_failed:
            skipped += 1
            continue
        sym = ymap.get(code, yahoo_symbol(code))
        try:
            body = http.get(YAHOO_CHART_URL.format(symbol=sym), params={
                "period1": p1, "period2": p2, "interval": "1d", "events": "div|split",
                "includeAdjustedClose": "true"})
            payload = json.loads(body)
            _, info = parse_yahoo_chart(payload, code)  # 校验能解析
            _write_bytes(p, gzip.compress(body))
            status[code] = {"ok": True, "yahoo": sym, "start": start,
                            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
            done += 1
        except Exception as e:  # noqa: BLE001
            status[code] = {"ok": False, "yahoo": sym, "error": str(e)[:300],
                            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
            failed += 1
        if verbose and (i + 1) % 25 == 0:
            print(f"[us] {i + 1}/{len(codes)} 新下载 {done} 跳过 {skipped} 失败 {failed}", flush=True)
            _save_status(status)
    _save_status(status)
    summary = {"requested": len(codes), "downloaded": done, "skipped": skipped, "failed": failed,
               "http_requests": http.requests}
    if verbose:
        print(f"[us] 完成 {summary}")
    return summary


def fetch_eastmoney(code: str, exchange: str, fqt: int = 0, beg: str = "19950101",
                    http: _Http | None = None) -> pd.DataFrame:
    """备用：东方财富美股日 K（secid 105 纳斯达克 / 106 NYSE / 107 AMEX；fqt 0 不复权 / 1 前复权 / 2 后复权）。

    注意：2026-11-26 在本机测试时 push2his.eastmoney.com 返回空响应，未能验证；东方财富美股复权口径是否含分红
    也未核实，因此主流程不用它。
    """
    secid = {"NASDAQ": 105, "NYSE": 106, "AMEX": 107}[exchange]
    http = http or _Http(min_interval=1.0, headers={"Referer": "https://quote.eastmoney.com/"})
    body = http.get(EASTMONEY_KLINE_URL, params={
        "secid": f"{secid}.{code}", "fields1": "f1,f2,f3,f4,f5,f6",
        "fields2": "f51,f52,f53,f54,f55,f56,f57", "klt": 101, "fqt": fqt, "beg": beg, "end": "20500101"})
    klines = ((json.loads(body) or {}).get("data") or {}).get("klines") or []
    rows = [k.split(",") for k in klines]
    df = pd.DataFrame(rows, columns=["date", "open", "close", "high", "low", "volume", "amount"])
    df["date"] = pd.to_datetime(df["date"])
    for c in ("open", "close", "high", "low", "volume", "amount"):
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df["code"] = code
    return df


# ----------------------------------------------------------------------------------------------
# 构建 + 审计
# ----------------------------------------------------------------------------------------------
def _read_cached(code: str) -> dict:
    return json.loads(gzip.decompress(_yahoo_path(code).read_bytes()))


def build_us(start: str | None = None) -> dict:
    """把已缓存的 Yahoo JSON 转成 prices.parquet / securities.parquet / actions.parquet / MANIFEST.json。"""
    raw = store.market_dir(MARKET) / "raw"
    master = build_security_master((raw / "symdir" / "nasdaqlisted.txt").read_text(encoding="latin-1"),
                                   (raw / "symdir" / "otherlisted.txt").read_text(encoding="latin-1"))
    files = sorted((raw / "yahoo").glob("*.json.gz"))
    frames, actions, ftd, dropped = [], [], {}, {}
    for p in files:
        code = p.name[: -len(".json.gz")]
        df, info = parse_yahoo_chart(_read_cached(code), code)
        if start:
            df = df[df["date"] >= pd.Timestamp(start)]
        frames.append(df)
        ftd[code] = info["first_trade_date"]
        dropped[code] = info["dropped"]
        actions += [(d, code, "split", r) for d, r in info["splits"]]
        actions += [(d, code, "dividend", a) for d, a in info["dividends"]]
    prices = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    # 显式补齐可空列（store._coerce 对缺列填 pd.NA 后转 float64 会报错，这里先填 NaN）
    for c in ("turnover", "mcap_float", "mcap_total"):
        prices[c] = np.nan
    for c in ("limit_up", "limit_down", "is_suspended"):
        prices[c] = pd.array([pd.NA] * len(prices), dtype="boolean")
    store.write_prices(MARKET, prices)
    have = set(prices["code"].unique()) if len(prices) else set()
    # 证券表：当前上市全集；list_date 用 Yahoo firstTradeDate（数据起点，老股票会被截断，不等于真实上市日）
    sec = master.copy()
    sec["list_date"] = sec["code"].map(ftd)
    sec["has_prices"] = sec["code"].isin(have)
    extra = sorted(have - set(sec["code"]))  # 已不在证券表里（下载后退市 / 改代码）
    if extra:
        sec = pd.concat([sec, pd.DataFrame({"code": extra, "name": "", "market": MARKET, "status": "unknown",
                                            "currency": "USD", "source": "yahoo", "has_prices": True,
                                            "list_date": [ftd[c] for c in extra]})], ignore_index=True)
    store.write_securities(MARKET, sec)
    act = pd.DataFrame(actions, columns=["date", "code", "action", "value"])
    act.to_parquet(store.market_dir(MARKET) / "actions.parquet", index=False)
    cov = (str(prices["date"].min().date()), str(prices["date"].max().date())) if len(prices) else ("", "")
    notes = ("幸存者偏差等级 B：证券表来自 Nasdaq Trader 符号目录，只含当前上市证券（无已退市股票），"
             "个股结论必须注明幸存者偏差、不能单独据此采用。日线来自 Yahoo chart v8：close/open/high/low/volume "
             "为用 events.splits 还原的不复权值；close_adj = Yahoo adjclose（拆股 + 现金分红再投资的总收益口径），"
             "整体缩放到首日等于首日不复权收盘（后复权，比值不变）。amount = close × volume（近似）。"
             "turnover / mcap_float / mcap_total 为 NaN（无免费历史股本）。停牌 / 无成交日 Yahoo 给 volume = 0 的行（无法区分两者）；limit_up/limit_down/"
             "is_suspended 为空。securities.list_date = Yahoo firstTradeDate（数据起点，非真实上市日）。"
             "actions.parquet：拆股（value = 新股/旧股）与现金分红（value = 每股金额，不复权）。"
             "代码 = 下载当日的 ticker；ticker 会被重复使用（退市公司的代码可能被新公司拿走），跨期合并须以 SEC CIK 为准。"
             "Yahoo 对无成交日也给行（volume = 0、价格沿用前值），反向拆股恰逢无成交时会出现虚假的大幅复权收益，"
             "使用时应剔除 volume = 0 的日子或设价格 / 成交额门槛。")
    m = Manifest(market=MARKET, source="nasdaqtrader symdir + Yahoo chart v8 (query1.finance.yahoo.com)",
                 survivorship="B", downloaded_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                 coverage=cov, rows=int(len(prices)), securities=len(have),
                 sha256={"prices.parquet": "", "securities.parquet": "", "actions.parquet": ""}, notes=notes)
    store.write_manifest(m)
    summary = {"rows": len(prices), "codes_with_prices": len(have), "master_size": len(master),
               "coverage": cov, "actions": len(act),
               "dropped_rows_total": {k: int(sum(d.get(k, 0) for d in dropped.values()))
                                      for k in ("null_or_nonpositive_close", "duplicate_date", "null_adjclose",
                                                "partial_today")}}
    print(f"[us] build {summary}")
    return summary


def audit_us(jump: float = 0.5) -> dict:
    """数据审计（不计算任何因子或预测性统计）：行数、覆盖、缺口、重复、拆股日比值核对、极端收益。"""
    prices = store.read_prices(MARKET, raw=True)
    act = pd.read_parquet(store.market_dir(MARKET) / "actions.parquet")
    sec = store.read_securities(MARKET)
    out: dict = {}
    out["rows"] = int(len(prices))
    out["codes"] = int(prices["code"].nunique())
    out["duplicates_date_code"] = int(prices.duplicated(["date", "code"]).sum())
    out["nan_close_adj"] = int(prices["close_adj"].isna().sum())
    out["nonpositive_close_adj"] = int((prices["close_adj"] <= 0).sum())
    out["ohlc_inconsistent"] = int(((prices["high"] < prices["low"]) |
                                    (prices["close"] > prices["high"] * 1.0001) |
                                    (prices["close"] < prices["low"] * 0.9999)).sum())
    out["zero_volume_rows"] = int((prices["volume"] == 0).sum())
    g = prices.groupby("code")["date"]
    cov = pd.DataFrame({"first": g.min(), "last": g.max(), "n": g.size()})
    out["first_date_by_year"] = cov["first"].dt.year.value_counts().sort_index().to_dict()
    out["last_date_counts"] = {str(k.date()): int(v) for k, v in cov["last"].value_counts().head(5).items()}
    # 交易日历：用全部样本日期的并集作参照（1995 年以来样本内至少 20% 的股票有行的日子）
    cnt = prices.groupby("date").size()
    active = cov.apply(lambda r: ((cnt.index >= r["first"]) & (cnt.index <= r["last"])).sum(), axis=1)
    cal = cnt[cnt >= 0.2 * cnt.rolling(250, min_periods=1).max()].index
    cal_set = pd.Index(cal)
    missing = {}
    for code, d in g:
        d = pd.Index(d)
        exp = cal_set[(cal_set >= d.min()) & (cal_set <= d.max())]
        miss = exp.difference(d)
        if len(miss):
            missing[code] = len(miss)
    out["codes_with_missing_days_vs_calendar"] = len(missing)
    out["missing_days_top"] = dict(sorted(missing.items(), key=lambda kv: -kv[1])[:15])
    out["missing_days_total"] = int(sum(missing.values()))
    out["expected_days_total"] = int(active.sum())
    # 间隔 > 7 个日历日的缺口
    gaps = []
    for code, d in g:
        d = d.sort_values()
        diff = d.diff().dt.days
        for idx in diff[diff > 7].index:
            gaps.append((code, str(d.loc[idx].date()), int(diff.loc[idx])))
    out["gaps_gt7d"] = len(gaps)
    out["gaps_gt7d_examples"] = gaps[:20]
    # 拆股日核对。比值 k = close_adj / close（后复权因子）：
    #   - 拆股日 k 应恰好乘以拆股比例 r（k_t / k_{t-1} ≈ r，与当天真实涨跌无关）；
    #   - 非拆股日 k 只会因分红而上升（下降 > 0.5% 视为异常）。
    px = prices.sort_values(["code", "date"]).copy()
    px["r_raw"] = px.groupby("code")["close"].pct_change()
    px["r_adj"] = px.groupby("code")["close_adj"].pct_change()
    px["k"] = px["close_adj"] / px["close"]
    px["k_chg"] = px["k"] / px.groupby("code")["k"].shift(1)
    sp = act[act["action"] == "split"].merge(px, on=["date", "code"], how="left")
    in_range = sp.dropna(subset=["k_chg"])
    in_range = in_range.assign(k_vs_r=in_range["k_chg"] / in_range["value"])
    ok = in_range["k_vs_r"].between(0.98, 1.02)
    out["splits_in_sample"] = int(len(sp))
    out["splits_with_price_on_date"] = int(len(in_range))
    out["splits_factor_consistent_share"] = round(float(ok.mean()), 4) if len(in_range) else None
    out["splits_factor_inconsistent"] = [
        {"code": r.code, "date": str(r.date.date()), "ratio": round(float(r.value), 5),
         "k_chg": round(float(r.k_chg), 5), "raw_ret": round(float(r.r_raw), 4),
         "adj_ret": round(float(r.r_adj), 4), "volume": float(r.volume)}
        for r in in_range[~ok].itertuples()][:25]
    out["splits_adj_ret_abs_gt_25pct"] = [
        {"code": r.code, "date": str(r.date.date()), "ratio": round(float(r.value), 5),
         "raw_ret": round(float(r.r_raw), 4), "adj_ret": round(float(r.r_adj), 4), "volume": float(r.volume)}
        for r in in_range[in_range["r_adj"].abs() > 0.25].itertuples()]
    split_keys = set(zip(sp["code"], sp["date"]))
    nonsplit = px[[(c, d) not in split_keys for c, d in zip(px["code"], px["date"])]]
    dec = nonsplit[nonsplit["k_chg"] < 0.995]
    out["k_decrease_on_non_split_days"] = int(len(dec))
    out["k_decrease_examples"] = [(r.code, str(r.date.date()), round(float(r.k_chg), 4))
                                  for r in dec.head(15).itertuples()]
    out["extreme_adj_returns_count"] = int((px["r_adj"].abs() > jump).sum())
    out["extreme_adj_returns_codes"] = int(px.loc[px["r_adj"].abs() > jump, "code"].nunique())
    out["extreme_adj_returns_on_zero_volume"] = int(((px["r_adj"].abs() > jump) & (px["volume"] == 0)).sum())
    ext = px[px["r_adj"].abs() > jump].sort_values("r_adj", key=np.abs, ascending=False)
    out["extreme_adj_returns_top"] = [(r.code, str(r.date.date()), round(float(r.r_adj), 3),
                                       round(float(r.close), 4), float(r.volume)) for r in ext.head(30).itertuples()]
    # 大盘股（LARGE_CAPS）里的极端收益（应很少；有则多为真实事件）
    big = ext[ext["code"].isin(LARGE_CAPS)]
    out["extreme_adj_returns_large_caps"] = [(r.code, str(r.date.date()), round(float(r.r_adj), 3))
                                             for r in big.itertuples()]
    zv = px.groupby("code")["volume"].apply(lambda v: float((v == 0).mean()))
    out["codes_zero_volume_share_gt_10pct"] = int((zv > 0.10).sum())
    # 价格量级：不复权收盘 < 0.5 美元的行（多为仙股 / 反向拆股前）
    out["penny_rows_close_lt_0_5"] = int((prices["close"] < 0.5).sum())
    out["securities_rows"] = int(len(sec))
    out["securities_has_prices"] = int(sec["has_prices"].sum()) if "has_prices" in sec else None
    return out


# ----------------------------------------------------------------------------------------------
def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m factorlab.sources.us", description="美股个股（等级 B）")
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch", help="下载证券表与 Yahoo 日线（断点续传，≤1 次/秒）")
    f.add_argument("--limit", type=int, default=None, help="只下载 N 只（大盘 + 新股 + 随机抽样）")
    f.add_argument("--codes", default=None, help="逗号分隔的代码")
    f.add_argument("--start", default="1995-01-01")
    f.add_argument("--refresh", action="store_true")
    f.add_argument("--retry-failed", action="store_true")
    b = sub.add_parser("build", help="缓存 → parquet + MANIFEST")
    b.add_argument("--start", default=None)
    sub.add_parser("audit", help="数据审计（JSON 输出）")
    sub.add_parser("master", help="只下载 / 解析证券表并打印统计")
    a = ap.parse_args(argv)
    if a.cmd == "fetch":
        codes = a.codes.split(",") if a.codes else None
        fetch_us(codes, start=a.start, limit=a.limit, refresh=a.refresh, retry_failed=a.retry_failed)
    elif a.cmd == "build":
        build_us(a.start)
    elif a.cmd == "audit":
        print(json.dumps(audit_us(), ensure_ascii=False, indent=1, default=str))
    elif a.cmd == "master":
        m = fetch_security_master()
        print(m.groupby(["exchange", "sec_type"]).size().to_string())
        print("合计", len(m), "SPAC", int(m["is_spac"].sum()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
