"""港股数据源：港交所证券名单（主板 + GEM）、东方财富日线（secid 116.xxxxx，不复权；限流时改用腾讯）、新浪复权记录。

命令行：
    uv run python -m factorlab.sources.hk fetch --limit 150
    uv run python -m factorlab.sources.hk fetch                 # 全量（断点续传）
    uv run python -m factorlab.sources.hk build
    uv run python -m factorlab.sources.hk audit

口径（详见 docs/research/factorlab/DATA-CN-HK.md）：
- 只有当前上市证券（没有免费的港股退市名单）→ 幸存者偏差等级 B。
- 复权：新浪港股复权记录是加法口径（hfq = raw × f + c），按除权前一日收盘换算成乘法因子 adj_factor。
- 港股没有涨跌停 → limit_up / limit_down 为空（NA）。
- 成交量单位：股（东方财富港股 K 线已是股，不做 ×100）。
- 流通市值：东方财富港股换手率若有值，用与 A 股相同的「Σ成交量 ÷ Σ换手率」阶梯估计；否则 NaN。mcap_total 为 NaN。
- 成交量为 0 的行删除（港股无成交日与停牌日都不留行），is_suspended 恒为 False。
- 合股 / 拆股 / 供股：靠复权因子处理；细价股多次合股 / 供股时换算可能失真，审计列出极端日收益供人工核对；
  港股代码会被重复使用（旧公司退市后代码分配给新公司），东方财富按当前公司给历史 → 不会混入旧公司，但旧公司缺失。
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from datetime import date, datetime, timedelta, timezone

import numpy as np
import pandas as pd

from .. import store
from ..schema import PRICES_COLUMNS, Manifest
from . import http
from .cn import (KLINE_URL, _clist, _kline_ok, _meta_cache, _to_date, adjust_from_factor, audit_prices,
                 fetch_tencent_raw, fix_volume_unit, float_shares_estimate, kline_params, parse_kline)

MARKET = "hk"
SOURCE = "eastmoney-kline(secid=116,fqt=0,2) | fallback tencent-kline+sina-hk-hfq; list: hkex ListOfSecurities"
BOARD_FS = {"主板": "m:128 t:3", "GEM": "m:128 t:4"}


def secid(code: str) -> str:
    return "116." + str(code).zfill(5)


def is_equity_code(code: str) -> bool:
    """港股普通股代码：5 位、以 0 开头（排除 8xxxx 人民币柜台、权证、牛熊证等）。"""
    code = str(code)
    return len(code) == 5 and code.isdigit() and code.startswith("0")


HKEX_LIST_URL = "https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx"


def hkex_list(refresh: bool = False) -> pd.DataFrame:
    """港交所官方证券名单（每日更新的 xlsx，一次请求）：只取股本证券（主板 / GEM），港币柜台。"""
    import io

    body = http.client(MARKET).get(HKEX_LIST_URL, cache_file="meta/hkex_ListOfSecurities.xlsx",
                                   max_age=0 if refresh else 7 * 86400)
    df = pd.read_excel(io.BytesIO(body), header=2, dtype={"Stock Code": str})
    df = df[df["Category"] == "Equity"]
    df = df[df["Sub-Category"].isin(["Equity Securities (Main Board)", "Equity Securities (GEM)"])]
    df = df[df["Trading Currency"].fillna("HKD") == "HKD"]
    return pd.DataFrame({
        "code": df["Stock Code"].astype(str).str.strip().str.zfill(5),
        "name_en": df["Name of Securities"].astype(str),
        "board": np.where(df["Sub-Category"].str.contains("GEM"), "GEM", "主板"),
    })


_EM_LIST_FAILED = False


def security_master(refresh: bool = False) -> pd.DataFrame:
    """主表 = 港交所官方名单；东方财富 clist（中文名、上市日期）可得则补充，失败不影响。"""
    sec = hkex_list(refresh)
    sec = sec[sec["code"].map(is_equity_code)].drop_duplicates("code").reset_index(drop=True)
    em_frames = []
    global _EM_LIST_FAILED
    for board, fs in BOARD_FS.items():
        if _EM_LIST_FAILED:
            break
        try:
            d = _meta_cache(f"hk_{'main' if board == '主板' else 'gem'}",
                            lambda fs=fs: _clist(fs, fields="f12,f13,f14,f20,f21,f26", market=MARKET), refresh)
            em_frames.append(pd.DataFrame({"code": d["f12"].astype(str), "name_cn": d["f14"],
                                           "list_date": _to_date(d["f26"])}))
        except http.HttpError as e:
            _EM_LIST_FAILED = True
            print(f"[hk] 东方财富港股列表失败（只用港交所名单）：{e}", file=sys.stderr)
    if em_frames:
        em = pd.concat(em_frames, ignore_index=True).drop_duplicates("code")
        sec = sec.merge(em, on="code", how="left")
    else:
        sec["name_cn"] = pd.NA
        sec["list_date"] = pd.NaT
    sec["name"] = sec["name_cn"].fillna(sec["name_en"])
    sec["market"] = MARKET
    sec["exchange"] = "HKEX"
    sec["delist_date"] = pd.NaT
    sec["status"] = "listed"
    sec["currency"] = "HKD"
    sec["source"] = "hkex ListOfSecurities.xlsx (+eastmoney clist)"
    return sec.drop(columns=["name_cn"])


def reference_mcap_hk() -> pd.DataFrame:
    d = _clist(BOARD_FS["主板"], fields="f12,f14,f20,f21", market=MARKET, fid="f20", po=1, pages=1)
    d = d.rename(columns={"f12": "code", "f14": "name", "f20": "mcap_total_ref", "f21": "mcap_float_ref"})
    for c in ("mcap_total_ref", "mcap_float_ref"):
        d[c] = pd.to_numeric(d[c], errors="coerce")
    return d[d["code"].map(is_equity_code)][["code", "name", "mcap_float_ref", "mcap_total_ref"]]


def pilot_sample(sec: pd.DataFrame, limit: int, seed: int = 20261126) -> list[str]:
    """按板块等比例随机抽样，另保证含市值最大的 10 只（用于市值对照）。"""
    rng = random.Random(seed)
    out: list[str] = []
    total = len(sec)
    for board, g in sec.groupby("board"):
        k = max(5, round(limit * len(g) / total))
        out += rng.sample(sorted(g["code"]), min(k, len(g)))
    return sorted(set(out))[: limit]


def fetch_kline(code: str, fqt: int, refresh: bool = False) -> dict:
    params = kline_params("000000", fqt)
    params["secid"] = secid(code)
    return http.client(MARKET).get_json(KLINE_URL, params, cache_file=f"kline/fqt{fqt}/{code}.json",
                                        max_age=0 if refresh else None, validate=_kline_ok)


# ---------- 后备源：腾讯不复权 + 新浪复权记录（加法口径）换算成乘法因子 ----------
SINA_HK_HFQ_URL = "https://finance.sina.com.cn/stock/hkstock/{code}/hfq.js"


def parse_sina_hk_hfq(text: str) -> pd.DataFrame:
    """新浪港股复权记录：{"d": 生效日, "f": 累计拆合股倍数, "c": 累计现金调整}，含义 hfq = raw × f + c（加法口径）。"""
    i, j = text.find("{"), text.rfind("}")
    d = json.loads(text[i:j + 1]) if i >= 0 else {"data": []}
    df = pd.DataFrame(d.get("data") or [])
    if df.empty:
        return pd.DataFrame(columns=["date", "f", "c"])
    out = pd.DataFrame({"date": pd.to_datetime(df["d"]), "f": pd.to_numeric(df["f"]),
                        "c": pd.to_numeric(df.get("c", 0)).fillna(0.0)})
    return out.sort_values("date").reset_index(drop=True)


def additive_to_multiplicative(raw: pd.DataFrame, rec: pd.DataFrame) -> np.ndarray:
    """把加法复权记录换算成可连乘的后复权因子（每个交易日一个值）。

    第 k 条记录生效日 d_k：加法口径保证 ref × f_k + c_k = prev × f_{k-1} + c_{k-1}，
    其中 prev = d_k 前一交易日不复权收盘、ref = 除权参考价 → ref = (prev·f_{k-1} + c_{k-1} - c_k) / f_k，
    乘法因子在 d_k 乘上 prev / ref（无前收或 ref ≤ 0 时只按拆合股倍数 f_k / f_{k-1}）。
    """
    dates = raw["date"].to_numpy()
    closes = raw["close"].to_numpy()
    if rec.empty:
        return np.ones(len(raw))
    m_dates, m_vals = [], []
    M = 1.0
    for k in range(len(rec)):
        if k > 0:
            fp, cp = rec["f"].iloc[k - 1], rec["c"].iloc[k - 1]
            fk, ck = rec["f"].iloc[k], rec["c"].iloc[k]
            i = np.searchsorted(dates, np.datetime64(rec["date"].iloc[k]), side="left") - 1
            step = fk / fp if fp else 1.0
            if i >= 0 and fk:
                prev = closes[i]
                ref = (prev * fp + cp - ck) / fk
                if ref > 0 and np.isfinite(ref):
                    step = prev / ref
            M *= step
        m_dates.append(rec["date"].iloc[k])
        m_vals.append(M)
    idx = np.searchsorted(np.array(m_dates, dtype="datetime64[ns]"), dates, side="right") - 1
    vals = np.array(m_vals)
    return np.where(idx >= 0, vals[np.clip(idx, 0, None)], 1.0)


def fetch_sina_factor(code: str, refresh: bool = False) -> str:
    return http.client(MARKET).get_text(SINA_HK_HFQ_URL.format(code=code), cache_file=f"kline/sina_hfq/{code}.js",
                                        max_age=0 if refresh else None)


def fetch_hk(codes: list[str] | None = None, start: str = "2005-01-01", limit: int | None = None,
             refresh: bool = False, extra: list[str] | None = None, source: str = "auto") -> list[str]:
    """每只：不复权日线（东方财富 1 次；腾讯后备约 1–3 次）+ 新浪港股复权记录 1 次。"""
    sec = security_master()
    if codes is None:
        codes = pilot_sample(sec, limit) if limit else sec["code"].tolist()
    codes = sorted(set(codes) | set(extra or []))
    sel = http.raw_dir(MARKET) / "selected_codes.json"
    prev = set(json.loads(sel.read_text())) if sel.exists() else set()
    sel.write_text(json.dumps(sorted(prev | set(codes))))
    failed = []
    use_tencent = source == "tencent"
    em_fail = 0
    for i, code in enumerate(codes, 1):
        try:
            if not use_tencent:
                try:
                    fetch_kline(code, 0, refresh)
                    em_fail = 0
                except http.HttpError as e:
                    em_fail += 1
                    print(f"[hk] {code} 东方财富失败：{e}", file=sys.stderr)
                    if source != "auto":
                        raise
                    if em_fail >= 2:
                        print("[hk] 东方财富连续失败，改用腾讯日线（后备源）", file=sys.stderr)
                        use_tencent = True
                    else:
                        failed.append(code)
                        continue
            if use_tencent:
                fetch_tencent_raw(code, market=MARKET, refresh=refresh, symbol="hk" + code, detect_unit=False)
            fetch_sina_factor(code, refresh)
        except http.HttpError as e:
            failed.append(code)
            print(f"[hk] {code} 失败：{e}", file=sys.stderr)
        if i % 25 == 0 or i == len(codes):
            print(f"[hk] {i}/{len(codes)} http={http.stats()}", file=sys.stderr)
    if failed and use_tencent:
        retry, failed = failed, []
        for code in retry:
            try:
                fetch_tencent_raw(code, market=MARKET, refresh=refresh, symbol="hk" + code, detect_unit=False)
                fetch_sina_factor(code, refresh)
            except http.HttpError:
                failed.append(code)
    if failed:
        print(f"[hk] 失败 {len(failed)} 只：{failed[:20]}", file=sys.stderr)
    return codes


def load_code(code: str, start: str | None = None) -> pd.DataFrame:
    d = http.raw_dir(MARKET, "kline")
    p0, ps = d / "fqt0" / f"{code}.json", d / "sina_hfq" / f"{code}.js"
    if not (p0.exists() and ps.exists()):
        return pd.DataFrame()
    j0 = json.loads(p0.read_text())
    raw = parse_kline(j0)
    if raw.empty:
        return pd.DataFrame()
    raw["volume"] = raw["volume"] / 100.0   # parse_kline 按 A 股「手」×100；港股本来就是股
    raw = fix_volume_unit(raw, code)
    df = adjust_from_factor(raw, additive_to_multiplicative(raw, parse_sina_hk_hfq(ps.read_text())))
    df = df[df["volume"] > 0].reset_index(drop=True)
    # 有成交时换手率不可能为 0：腾讯没给换手率时存的是 0（2022 年以前多数如此），一律改成缺失
    df["turnover"] = df["turnover"].where(df["turnover"] > 0)
    if df["turnover"].notna().any():
        df["float_shares"] = float_shares_estimate(df)
        df["mcap_float"] = df["float_shares"] * df["close"]
    else:
        df["float_shares"] = np.nan
        df["mcap_float"] = np.nan
    df["mcap_total"] = np.nan
    for c in ("limit_up", "limit_down"):
        df[c] = pd.NA
    df["is_suspended"] = False
    df["code"] = code
    df["src"] = j0.get("source", "eastmoney") + "+sina_factor(additive→multiplicative)"
    if start:
        df = df[df["date"] >= pd.Timestamp(start)]
    return df


PRICE_EXTRA = ["open_adj", "adj_factor", "pct_chg", "float_shares", "src"]


FACTOR_JUMP = 3.0      # 复权因子单日变化超过 3 倍（或低于 1/3）
ADJ_RET_LIMIT = 1.0    # 且复权日收益绝对值超过 100%


def fix_suspect_factor_jumps(prices: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """清洗新浪复权因子的明显错误：因子单日跳变 > 3 倍且复权收益 |r| > 100% 的日子，视为因子错误，
    当天复权收益改按不复权价计算（因子沿用前一日），之后的因子按同一比例整体平移。返回 (新表, 修正天数)。
    例：00767 2011-04-15 收盘 2.13 → 0.91，因子跳约 15 倍，复权收益却是 +522%。"""
    df = prices.sort_values(["code", "date"]).reset_index(drop=True)
    f = df["adj_factor"].to_numpy(float)
    c = df["close"].to_numpy(float)
    code = df["code"].to_numpy()
    same = np.r_[False, code[1:] == code[:-1]]
    ratio = np.ones(len(df))
    ratio[1:] = np.where(same[1:], f[1:] / f[:-1], 1.0)
    adj_ret = np.full(len(df), np.nan)
    adj_ret[1:] = np.where(same[1:], (c[1:] * f[1:]) / (c[:-1] * f[:-1]) - 1, np.nan)
    bad = same & ((ratio > FACTOR_JUMP) | (ratio < 1 / FACTOR_JUMP)) & (np.abs(adj_ret) > ADJ_RET_LIMIT)
    if not bad.any():
        return prices, 0
    # 每个坏点：把该日起本股票之后的因子都除以该日的跳变比例（等于当天因子不变）
    corr = np.where(bad, ratio, 1.0)
    df["_corr"] = corr
    df["_cum"] = df.groupby("code")["_corr"].cumprod()
    df["adj_factor"] = df["adj_factor"] / df["_cum"]
    df["close_adj"] = df["close"] * df["adj_factor"]
    df["open_adj"] = df["open"] * df["adj_factor"]
    return df.drop(columns=["_corr", "_cum"]), int(bad.sum())


def build_hk(start: str = "2005-01-01", codes: list[str] | None = None) -> dict:
    sec = security_master()
    if codes is None:
        sel = http.raw_dir(MARKET) / "selected_codes.json"
        codes = json.loads(sel.read_text()) if sel.exists() else sec["code"].tolist()
    frames = [df for c in codes if not (df := load_code(c, start)).empty]
    prices = pd.concat(frames, ignore_index=True)[list(PRICES_COLUMNS) + PRICE_EXTRA]
    prices, n_fixed = fix_suspect_factor_jumps(prices)
    sec_out = sec[sec["code"].isin(set(codes))].copy()
    first = prices.groupby("code")["date"].min()
    sec_out["list_date"] = sec_out["list_date"].fillna(sec_out["code"].map(first))
    p1 = store.write_prices(MARKET, prices)
    p2 = store.write_securities(MARKET, sec_out)
    full = len(codes) >= 0.95 * len(sec)
    notes = [
        f"样本：{len(codes)} 只（{'全量' if full else '试下载抽样，不是全市场'}），只含当前上市（主板 + GEM 普通股，代码 0xxxx）。",
        "幸存者偏差 B：没有退市股；港股代码会被重复使用，旧公司历史缺失。",
        "日线来源（按股票计）：" + "；".join(f"{k}: {v} 只" for k, v in prices.groupby("code")["src"].first().value_counts().items()) + "。",
        "复权：新浪港股复权记录是加法口径（hfq = raw × f + c，f = 累计拆合股倍数，c = 累计现金调整），"
        "已按除权前一日收盘换算成可连乘的乘法因子 adj_factor；close_adj = close × adj_factor，open_adj = open × adj_factor"
        "（细价股多次合股 / 供股时换算可能失真，见审计的极端收益清单）。",
        "合股 / 供股：依赖新浪复权记录；审计列出 |日收益| > 50% 的记录需人工核对；股价 < 1 港元时最小价位导致价差常 > 1%。",
        f"复权因子清洗：因子单日跳变 > {FACTOR_JUMP:g} 倍且复权日收益 |r| > {ADJ_RET_LIMIT:.0%} 的 {n_fixed} 天视为因子错误，当天按不复权价计收益、之后因子整体平移（fix_suspect_factor_jumps）。",
        "volume 单位：股；turnover：小数；mcap_float 用 Σ成交量 ÷ Σ换手率 的阶梯估计 × 收盘（换手率缺失则 NaN；腾讯港股换手率多数只从 2022 年后才有，缺失时 turnover 记为空值，不是 0）；mcap_total 为 NaN。",
        "港股无涨跌停 → limit_up / limit_down 为 NA；成交量为 0 的行（无成交 / 停牌）已删除，is_suspended 恒为 False。",
    ]
    m = Manifest(market=MARKET, source=SOURCE, survivorship="B",
                 downloaded_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                 coverage=(str(prices["date"].min().date()), str(prices["date"].max().date())),
                 rows=int(len(prices)), securities=int(prices["code"].nunique()),
                 sha256={p1.name: "", p2.name: ""}, notes="\n".join(notes))
    store.write_manifest(m)
    return {"rows": len(prices), "codes": int(prices["code"].nunique()), "survivorship": "B"}


def audit_hk() -> dict:
    try:
        from .cn import reference_mcap_tencent
        ref = reference_mcap_tencent(["hk" + c for c in store.read_securities(MARKET)["code"]], MARKET)
    except http.HttpError as e:
        print(f"[hk] 市值参考下载失败：{e}", file=sys.stderr)
        ref = None
    return audit_prices(MARKET, ref)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="factorlab.sources.hk")
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--limit", type=int, default=None)
    f.add_argument("--codes", type=str, default=None)
    f.add_argument("--start", default="2005-01-01")
    f.add_argument("--rps", type=float, default=None)
    f.add_argument("--refresh", action="store_true")
    f.add_argument("--source", choices=["auto", "eastmoney", "tencent"], default="auto")
    b = sub.add_parser("build")
    b.add_argument("--start", default="2005-01-01")
    sub.add_parser("audit")
    a = ap.parse_args(argv)
    if a.cmd == "fetch":
        if a.rps:
            http.set_rate(a.rps)
        fetch_hk(codes=a.codes.split(",") if a.codes else None, start=a.start, limit=a.limit,
                 refresh=a.refresh, extra=None if a.codes else ["00700", "00005", "00939"], source=a.source)
        print(json.dumps(http.stats()))
    elif a.cmd == "build":
        print(json.dumps(build_hk(start=a.start), ensure_ascii=False, indent=2))
    else:
        print(json.dumps(audit_hk(), ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
