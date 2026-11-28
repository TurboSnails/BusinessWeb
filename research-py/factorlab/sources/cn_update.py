"""A 股行情增量更新：只补 prices.parquet 最后交易日之后的日线，不碰 fin_pit。

命令行：
    uv run python -m factorlab.sources.cn_update --dry-run
    uv run python -m factorlab.sources.cn_update --codes 600000,000001
    uv run python -m factorlab.sources.cn_update --until 2026-12-01
    uv run python -m factorlab.sources.cn_update --until 2026-12-01 --resume

口径：
- 日线：腾讯不复权（与全量 ``cn fetch --source tencent`` 一致）；缓存写到
  ``raw/kline/update/``，**不覆盖**全量下载用的 ``raw/kline/fqt0/``。
- 正常运行按股票保存下载缓存；中断后使用原 ``--until`` 加 ``--resume`` 复用，
  重新校验并计算追加行，价格表与 MANIFEST 仍在整批处理后写回。
- 复权：重新拉取新浪后复权因子（后复权历史因子不变，新除权只加新行；重叠日
  ``close`` / ``close_adj`` 超容差则跳过该股，提示全量重下）。
- 新行的 is_st / 涨跌停：复用 ``cn.st_flags`` + ``cn.compute_limits``（有 st_pit 时沪/北交所走点时）。
- mcap_total / industry / total_shares：优先用已有 shares_pit / industry_pit 点时查；
  查不到则按该股**最后已知值向前沿用**（写入 MANIFEST notes）。
- **绝不读写** ``fin_pit.parquet``。
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from time import sleep

import numpy as np
import pandas as pd
from requests import exceptions as request_errors

from .. import store
from ..schema import Manifest, PRICES_COLUMNS, validate_frame
from . import cn, cn_pit, http

MARKET = "cn"
UPDATE_SUBDIR = "kline/update"
OVERLAP_CALENDAR_DAYS = 7          # 重叠回看日历日（覆盖约 5 个交易日）
PRICE_RTOL = 1e-4                  # close / close_adj 相对容差
PRICE_ATOL = 5e-3                  # 绝对容差（约半分）
MANIFEST_NOTE_TAG = "[cn_update]"
TRANSIENT_ERRORS = (
    request_errors.ChunkedEncodingError, request_errors.ConnectionError,
    request_errors.ReadTimeout, request_errors.ContentDecodingError,
)
RETRY_DELAYS = (1, 2)

# 与 cn.build_cn 写出的列对齐（含 pit 增补）
PRICE_EXTRA = list(cn.PRICE_EXTRA) + ["total_shares", "industry"]


def _fin_pit_path(market: str = MARKET) -> Path:
    return store.market_dir(market) / "fin_pit.parquet"


def last_trade_dates(prices: pd.DataFrame) -> pd.Series:
    """code → 最后交易日。"""
    return prices.groupby("code", sort=False)["date"].max()


def codes_to_update(securities: pd.DataFrame, prices: pd.DataFrame,
                    codes: list[str] | None = None) -> tuple[list[str], list[str]]:
    """返回 (待更新的仍上市代码, 跳过的退市代码)。只对 prices 里已有、且仍上市的股票请求。"""
    have = set(prices["code"].astype(str).str.zfill(6).unique())
    sec = securities.copy()
    sec["code"] = sec["code"].astype(str).str.zfill(6)
    if codes is not None:
        want = {str(c).zfill(6) for c in codes}
        have &= want
    listed = set(sec.loc[sec["status"] == "listed", "code"])
    delisted_skip = sorted(have - listed)
    return sorted(have & listed), delisted_skip


def overlap_start(last: pd.Timestamp, overlap_days: int = OVERLAP_CALENDAR_DAYS) -> pd.Timestamp:
    return pd.Timestamp(last) - pd.Timedelta(days=overlap_days)


def fetch_tencent_range(code: str, start: str, end: str | None = None, market: str = MARKET,
                        refresh: bool = True, *, cache_dir: str = UPDATE_SUBDIR) -> pd.DataFrame:
    """增量腾讯日线 → DataFrame；完整响应按股票原子保存，可按请求窗口复用。"""
    c = http.client(market)
    end_s = end or (date.today() + timedelta(days=1)).isoformat()
    start_s = pd.Timestamp(start).strftime("%Y-%m-%d")
    cache_file = (f"{cache_dir}/fqt0/{code}-{start_s}.json" if cache_dir != UPDATE_SUBDIR
                  else f"{cache_dir}/fqt0/{code}.json")
    path = c.cache_path("", None, cache_file=cache_file)
    if path.exists() and not refresh:
        payload = json.loads(path.read_text())
        return cn.parse_kline(payload)
    sym = cn.tencent_symbol(code)
    rows: list = []
    cur_end = end_s
    for _ in range(5):
        d = c.get_json(cn.TENCENT_URL, {"param": f"{sym},day,{start_s},{cur_end},{cn.TENCENT_PAGE},"},
                       ns="tencent_update", max_age=0 if refresh else None)
        data = d.get("data")
        node = data.get(sym) if isinstance(data, dict) else None
        chunk = (node.get("day") or []) if isinstance(node, dict) else []
        chunk = [r for r in chunk if not rows or r[0] < rows[0][0]]
        rows = chunk + rows
        if len(chunk) < cn.TENCENT_PAGE - 5:
            break
        cur_end = (pd.Timestamp(chunk[0][0]) - pd.Timedelta(days=1)).strftime("%Y-%m-%d")
        if cur_end < start_s:
            break
    payload = {"source": "tencent",
               "data": {"code": code, "klines": cn.tencent_rows_to_klines(rows)} if rows else None}
    result = cn.parse_kline(payload)
    with NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, suffix=".tmp", delete=False) as f:
        tmp = Path(f.name)
        try:
            json.dump(payload, f, ensure_ascii=False)
            f.close()
            tmp.replace(path)
        finally:
            tmp.unlink(missing_ok=True)
    return result


def fetch_sina_factor_update(code: str, market: str = MARKET, refresh: bool = True,
                             *, cache_dir: str = UPDATE_SUBDIR) -> pd.DataFrame:
    """新浪后复权因子；缓存 ``raw/kline/update/sina_hfq/{code}.js``，不碰全量 sina_hfq。"""
    text = http.client(market).get_text(
        cn.SINA_HFQ_URL.format(sym=cn.tencent_symbol(code)),
        cache_file=f"{cache_dir}/sina_hfq/{code}.js",
        max_age=0 if refresh else None,
    )
    return cn.parse_sina_hfq(text)


def _retry_download(download, *args):
    """HTTP 客户端已处理普通重试；这里补上越过其重试层的响应流异常。"""
    for delay in RETRY_DELAYS:
        try:
            return download(*args)
        except TRANSIENT_ERRORS:
            sleep(delay)
    try:
        return download(*args)
    except TRANSIENT_ERRORS as error:
        raise http.HttpError(
            f"{len(RETRY_DELAYS) + 1} 次下载仍失败：{type(error).__name__}: {error}"
        ) from error


def _values_close(a: pd.Series, b: pd.Series, rtol: float = PRICE_RTOL, atol: float = PRICE_ATOL) -> bool:
    aa = pd.to_numeric(a, errors="coerce").to_numpy(dtype=float)
    bb = pd.to_numeric(b, errors="coerce").to_numpy(dtype=float)
    if len(aa) != len(bb) or len(aa) == 0:
        return False
    if np.isnan(aa).any() or np.isnan(bb).any():
        return False
    return bool(np.allclose(aa, bb, rtol=rtol, atol=atol))


def validate_overlap(stored: pd.DataFrame, rebuilt: pd.DataFrame,
                     rtol: float = PRICE_RTOL, atol: float = PRICE_ATOL) -> str | None:
    """重叠日校验：close、close_adj 须一致。返回跳过原因，通过则 None。"""
    if stored.empty or rebuilt.empty:
        return "重叠区间为空"
    s = stored.sort_values("date").reset_index(drop=True)
    r = rebuilt.sort_values("date").reset_index(drop=True)
    if list(s["date"]) != list(r["date"]):
        return f"重叠日集合不一致 stored={list(s['date'].dt.date)} rebuilt={list(r['date'].dt.date)}"
    if not _values_close(s["close"], r["close"], rtol, atol):
        return "重叠日 close 不一致"
    if not _values_close(s["close_adj"], r["close_adj"], rtol, atol):
        return "重叠日 close_adj 不一致（新浪后复权因子可能已改写历史，请全量重下）"
    return None


def _sec_row(securities: pd.DataFrame, code: str) -> dict | None:
    m = securities[securities["code"].astype(str).str.zfill(6) == code]
    return m.iloc[0].to_dict() if len(m) else None


def _load_pit_helpers(market: str = MARKET) -> dict:
    """可选点时表；缺文件时返回空，增量用最后已知值向前沿用。"""
    out: dict = {"st_pit": None, "shares_steps": None, "industry_iv": None, "changes": None}
    try:
        out["changes"] = cn.szse_name_changes()
    except Exception:
        out["changes"] = None
    st = cn_pit.load_st_pit(market)
    out["st_pit"] = st
    sp = cn_pit.pit_path("shares_pit", market)
    if sp.exists():
        sh = pd.read_parquet(sp)
        out["shares_steps"] = cn_pit.all_steps(sh) if not sh.empty else None
    ip = cn_pit.pit_path("industry_pit", market)
    if ip.exists():
        out["industry_iv"] = pd.read_parquet(ip)
    return out


def build_incremental_rows(
    code: str,
    stored: pd.DataFrame,
    raw_new: pd.DataFrame,
    factors: pd.DataFrame,
    sec_row: dict | None,
    pit: dict,
    until: str | date | None = None,
) -> tuple[pd.DataFrame | None, str | None, dict]:
    """对一只股票：重叠校验 → 只返回需追加的新行。失败返回 (None, reason, meta)。"""
    meta: dict = {"overlap_days": 0, "new_days": 0, "ffill_shares": False, "ffill_industry": False}
    if stored.empty:
        return None, "prices 中无该股历史", meta
    if raw_new.empty:
        return None, "无新日线", meta

    last = pd.Timestamp(stored["date"].max())
    raw = cn.fix_volume_unit(raw_new.copy(), code)
    raw = raw[raw["volume"] > 0].reset_index(drop=True)
    if until is not None:
        raw = raw[raw["date"] <= pd.Timestamp(until)].reset_index(drop=True)
    # 只要重叠日起的行
    ostart = overlap_start(last)
    raw = raw[raw["date"] >= ostart].reset_index(drop=True)
    if raw.empty:
        return None, "增量区间无成交行", meta

    F = cn.apply_factor(raw["date"], factors)
    adj = cn.adjust_from_factor(raw, F)
    overlap_dates = set(stored.loc[stored["date"] >= ostart, "date"]) & set(adj["date"])
    if not overlap_dates:
        # 无重叠（例如停牌后直接跳日）：仍允许追加，但要求新行全部晚于 last
        only_new = adj[adj["date"] > last].reset_index(drop=True)
        if only_new.empty:
            return None, "无新于最后交易日的行", meta
        rebuilt_overlap = adj.iloc[0:0]
        stored_overlap = stored.iloc[0:0]
    else:
        stored_overlap = stored[stored["date"].isin(overlap_dates)].sort_values("date")
        rebuilt_overlap = adj[adj["date"].isin(overlap_dates)].sort_values("date")
        reason = validate_overlap(stored_overlap, rebuilt_overlap)
        if reason:
            return None, reason, meta
        only_new = adj[adj["date"] > last].reset_index(drop=True)
    meta["overlap_days"] = int(len(stored_overlap))
    meta["new_days"] = int(len(only_new))
    if only_new.empty:
        return pd.DataFrame(), None, meta  # 已是最新，无需追加

    # ---- 派生列：用「全历史 stored OHLCV+因子 + 新行」对齐全量 build 口径 ----
    hist = stored.sort_values("date").reset_index(drop=True)
    # 拼工作表：历史用已存 OHLC/量额/换手/复权；新行用刚算的
    base_cols = ["date", "open", "high", "low", "close", "volume", "amount", "turnover",
                 "adj_factor", "close_adj", "open_adj"]
    for c in base_cols:
        if c not in hist.columns:
            if c == "open_adj":
                hist[c] = hist["open"] * hist["adj_factor"]
            elif c == "turnover":
                hist[c] = np.nan
            else:
                raise KeyError(c)
    work_old = hist[base_cols].copy()
    work_new = only_new[base_cols].copy()
    work = pd.concat([work_old, work_new], ignore_index=True)

    list_date = sec_row.get("list_date") if sec_row else None
    list_date = pd.Timestamp(list_date) if list_date is not None and pd.notna(list_date) else None
    board = cn.board_of(code)
    first = work["date"].iloc[0]
    is_ipo_start = (list_date is not None and first <= list_date + pd.Timedelta(days=15)) or \
                   (list_date is None and first > pd.Timestamp("2005-01-31"))
    trade_offset = 0 if is_ipo_start else 1000

    # is_st：整段重算（与 load_code 一致），再取新行
    st_pit = pit.get("st_pit")
    changes = pit.get("changes")
    is_st = cn.st_flags(code, work["date"], changes, st_pit)
    work["is_st"] = is_st.to_numpy()

    # 涨跌停：腾讯无 chg → compute_limits 走复权因子推算基准价
    lim = cn.compute_limits(work, board, list_date, work["is_st"], trade_offset=trade_offset)
    for c in lim.columns:
        work[c] = lim[c].to_numpy()

    work["float_shares"] = cn.float_shares_estimate(work)
    work["mcap_float"] = work["float_shares"] * work["close"]
    work["is_suspended"] = False
    work["code"] = code
    work["src"] = "tencent+sina_factor"
    # 腾讯不提供 pct_chg；新行置 NaN（与全量 tencent build 一致）
    new_idx = work.index[len(work_old):]
    work.loc[new_idx, "pct_chg"] = np.nan

    # total_shares / mcap_total / industry
    q = work.loc[new_idx, ["code", "date"]].copy()
    steps = pit.get("shares_steps")
    if steps is not None and not steps.empty:
        ts = cn_pit.shares_asof(q, steps)
        work.loc[new_idx, "total_shares"] = ts.to_numpy()
    else:
        work.loc[new_idx, "total_shares"] = np.nan
    # 点时查不到 → 最后已知总股本向前沿用
    last_ts = hist["total_shares"].dropna().iloc[-1] if "total_shares" in hist and hist["total_shares"].notna().any() else np.nan
    miss = work.loc[new_idx, "total_shares"].isna() if "total_shares" in work.columns else pd.Series(True, index=new_idx)
    if miss.any() and pd.notna(last_ts):
        work.loc[new_idx[miss.to_numpy()], "total_shares"] = float(last_ts)
        meta["ffill_shares"] = True
    work.loc[new_idx, "mcap_total"] = work.loc[new_idx, "total_shares"] * work.loc[new_idx, "close"]

    ind_iv = pit.get("industry_iv")
    if ind_iv is not None and not ind_iv.empty:
        ind = cn_pit.sw_level1_lookup(q, ind_iv)
        work.loc[new_idx, "industry"] = ind.to_numpy()
    else:
        work.loc[new_idx, "industry"] = pd.NA
    last_ind = hist["industry"].dropna().iloc[-1] if "industry" in hist and hist["industry"].notna().any() else pd.NA
    if "industry" in work.columns:
        miss_i = work.loc[new_idx, "industry"].isna()
        if miss_i.any() and pd.notna(last_ind):
            work.loc[new_idx[miss_i.to_numpy()], "industry"] = last_ind
            meta["ffill_industry"] = True

    out = work.loc[new_idx].reset_index(drop=True)
    return out, None, meta


def _ensure_columns(df: pd.DataFrame) -> pd.DataFrame:
    keep = list(PRICES_COLUMNS) + [c for c in PRICE_EXTRA if c not in PRICES_COLUMNS]
    for c in keep:
        if c not in df.columns:
            df[c] = pd.NA
    return df[keep]


def atomic_write_prices(market: str, df: pd.DataFrame) -> Path:
    """先写临时文件再 replace，避免中途失败留下半写 parquet。"""
    from .. import store as st

    df = st._coerce(df, PRICES_COLUMNS).sort_values(["code", "date"]).reset_index(drop=True)
    problems = validate_frame(df, PRICES_COLUMNS, "prices")
    if problems:
        raise ValueError("；".join(problems))
    p = st.market_dir(market) / "prices.parquet"
    tmp = p.with_suffix(".parquet.tmp")
    if tmp.exists():
        tmp.unlink()
    try:
        df.to_parquet(tmp, index=False)
        tmp.replace(p)
    except Exception:
        if tmp.exists():
            tmp.unlink(missing_ok=True)
        raise
    return p


def plan_dry_run(prices: pd.DataFrame, securities: pd.DataFrame, codes: list[str] | None = None,
                 until: str | None = None, overlap_days: int = OVERLAP_CALENDAR_DAYS) -> dict:
    """不联网：报告每只股票要补的日历跨度与预计请求数。"""
    listed, delisted_skip = codes_to_update(securities, prices, codes)
    lasts = last_trade_dates(prices)
    end = pd.Timestamp(until) if until else pd.Timestamp(date.today())
    per = []
    for code in listed:
        last = pd.Timestamp(lasts[code])
        # 粗估交易日 ≈ 日历日 × 5/7
        cal = max(0, (end - last).days)
        est_bars = max(0, int(round(cal * 5 / 7)))
        per.append({"code": code, "last_date": str(last.date()), "calendar_gap": int(cal),
                    "est_new_bars": est_bars, "overlap_calendar_days": overlap_days,
                    "requests": 2 if est_bars > 0 or cal >= 0 else 0})  # 腾讯 1 + 新浪 1
    # 已最新的也仍可能 refresh 因子；dry-run 里 gap=0 记 0 请求
    for row in per:
        if row["est_new_bars"] == 0 and row["calendar_gap"] <= 0:
            row["requests"] = 0
        elif row["est_new_bars"] == 0:
            row["requests"] = 2  # 可能有新交易日但粗估为 0；保守按要请求计
    return {
        "dry_run": True,
        "codes_listed": len(listed),
        "codes_delisted_skipped": delisted_skip,
        "est_requests": int(sum(r["requests"] for r in per)),
        "until": str(end.date()),
        "per_code": per,
    }


def update_cn(
    codes: list[str] | None = None,
    until: str | None = None,
    dry_run: bool = False,
    overlap_days: int = OVERLAP_CALENDAR_DAYS,
    market: str = MARKET,
    refresh: bool = True,
    progress: bool = True,
    *,
    # 测试钩子：注入 (code, start, end) → raw DataFrame / factors DataFrame
    fetch_bars=None,
    fetch_factors=None,
    pit: dict | None = None,
) -> dict:
    """增量更新 prices.parquet。dry_run 只报告；成功写回并更新 MANIFEST。"""
    # 明确不碰财报
    fin = _fin_pit_path(market)
    fin_sha_before = None
    if fin.exists():
        import hashlib
        fin_sha_before = hashlib.sha256(fin.read_bytes()).hexdigest()

    prices_path = store.market_dir(market) / "prices.parquet"
    if not prices_path.exists():
        raise FileNotFoundError(f"缺少 {prices_path}，请先全量 build")
    prices = store.read_prices(market, raw=True)
    securities = store.read_securities(market)

    if dry_run:
        return plan_dry_run(prices, securities, codes, until, overlap_days)

    listed, delisted_skip = codes_to_update(securities, prices, codes)
    lasts = last_trade_dates(prices)
    pit = pit if pit is not None else _load_pit_helpers(market)

    request_end = (date.fromisoformat(until) if until else date.today() + timedelta(days=1)).isoformat()
    cache_dir = f"{UPDATE_SUBDIR}/checkpoints/{request_end}"
    fetch_bars = fetch_bars or (lambda code, start, _end: fetch_tencent_range(
        code, start, request_end, market, refresh, cache_dir=cache_dir))
    fetch_factors = fetch_factors or (lambda code: fetch_sina_factor_update(
        code, market, refresh, cache_dir=cache_dir))

    appended: list[pd.DataFrame] = []
    skipped: list[dict] = []
    unchanged: list[str] = []
    ffill_shares_codes: list[str] = []
    ffill_industry_codes: list[str] = []
    failed: list[dict] = []
    n_new_rows = 0

    for i, code in enumerate(listed, 1):
        last = pd.Timestamp(lasts[code])
        start = overlap_start(last, overlap_days).strftime("%Y-%m-%d")
        end = until
        try:
            raw = _retry_download(fetch_bars, code, start, end)
            fac = _retry_download(fetch_factors, code)
        except http.HttpError as e:
            failed.append({"code": code, "reason": str(e)})
            print(f"[cn_update] {code} 下载失败：{e}", file=sys.stderr)
            continue
        stored = prices[prices["code"].astype(str).str.zfill(6) == code]
        rows, reason, meta = build_incremental_rows(
            code, stored, raw, fac, _sec_row(securities, code), pit, until=until)
        if reason:
            skipped.append({"code": code, "reason": reason, **{k: meta[k] for k in ("overlap_days", "new_days")}})
            print(f"[cn_update] 跳过 {code}：{reason}", file=sys.stderr)
            continue
        if rows is None or rows.empty:
            unchanged.append(code)
            continue
        appended.append(rows)
        n_new_rows += len(rows)
        if meta.get("ffill_shares"):
            ffill_shares_codes.append(code)
        if meta.get("ffill_industry"):
            ffill_industry_codes.append(code)
        if progress and (i % 25 == 0 or i == len(listed)):
            print(f"[cn_update] {i}/{len(listed)} 新增行累计 {n_new_rows}  http={http.stats()}",
                  file=sys.stderr)

    report = {
        "added_rows": n_new_rows,
        "codes_updated": [str(df["code"].iloc[0]) for df in appended],
        "codes_unchanged": unchanged,
        "codes_skipped": skipped,
        "codes_delisted_skipped": delisted_skip,
        "codes_failed": failed,
        "ffill_shares_codes": ffill_shares_codes,
        "ffill_industry_codes": ffill_industry_codes,
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }

    if not appended:
        # 无写入；仍核对 fin_pit
        if fin_sha_before is not None:
            import hashlib
            assert hashlib.sha256(fin.read_bytes()).hexdigest() == fin_sha_before
        report["prices_written"] = False
        return report

    new_part = _ensure_columns(pd.concat(appended, ignore_index=True))
    # 保留未更新股票的全部行 + 更新股票的旧行 + 新行
    updated_set = set(report["codes_updated"])
    kept = prices[~prices["code"].astype(str).str.zfill(6).isin(updated_set)].copy()
    old_of_updated = prices[prices["code"].astype(str).str.zfill(6).isin(updated_set)].copy()
    # 对齐列
    for frame in (kept, old_of_updated, new_part):
        for c in list(PRICES_COLUMNS) + [x for x in PRICE_EXTRA if x not in PRICES_COLUMNS]:
            if c not in frame.columns:
                frame[c] = pd.NA
    combined = pd.concat([kept, old_of_updated, new_part], ignore_index=True)
    combined = _ensure_columns(combined)

    p1 = atomic_write_prices(market, combined)

    # MANIFEST
    old_m = store.read_manifest(market) if (store.market_dir(market) / "MANIFEST.json").exists() else {}
    notes_lines = [ln for ln in str(old_m.get("notes", "")).split("\n") if ln and not ln.startswith(MANIFEST_NOTE_TAG)]
    notes_lines.append(
        f"{MANIFEST_NOTE_TAG} 增量更新 {report['updated_at']}：新增 {n_new_rows} 行，"
        f"更新 {len(report['codes_updated'])} 只，跳过 {len(skipped)} 只，退市未请求 {len(delisted_skip)} 只，"
        f"失败 {len(failed)} 只。"
        f"股本/行业：有 shares_pit/industry_pit 时点时查；否则（及查不到时）按最后已知值向前沿用"
        f"（本批 ffill 股本 {len(ffill_shares_codes)} 只、行业 {len(ffill_industry_codes)} 只）。"
        f"跳过明细见报告 codes_skipped（重叠校验失败请对该股全量重下）。"
        f"不读写 fin_pit.parquet。"
    )
    coverage = (str(combined["date"].min().date()), str(combined["date"].max().date()))
    m = Manifest(
        market=market,
        source=old_m.get("source", cn.SOURCE) + " | cn_update(tencent+sina)",
        survivorship=old_m.get("survivorship", "A"),
        downloaded_at=report["updated_at"],
        coverage=coverage,
        rows=int(len(combined)),
        securities=int(combined["code"].nunique()),
        sha256={p1.name: "", "securities.parquet": ""},
        notes="\n".join(notes_lines),
    )
    # 保留旧 sha 里 fin_pit 等其它文件名（若有），但 write_manifest 只哈希 m.sha256 里点名的文件
    store.write_manifest(m)

    if fin_sha_before is not None:
        import hashlib
        assert hashlib.sha256(fin.read_bytes()).hexdigest() == fin_sha_before, "fin_pit.parquet 被改动"
    report["prices_written"] = True
    report["coverage"] = coverage
    report["rows"] = int(len(combined))
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(prog="factorlab.sources.cn_update",
                                 description="A 股行情增量更新（不重建财报）")
    ap.add_argument("--dry-run", action="store_true", help="只报告每只股票要补多少天与预计请求数，不联网不写盘")
    ap.add_argument("--codes", type=str, default=None, help="逗号分隔代码；默认 prices 内全部仍上市股")
    ap.add_argument("--until", type=str, default=None, help="只补到该日（含），YYYY-MM-DD")
    ap.add_argument("--resume", action="store_true", help="复用同一截止日及请求窗口已落盘的行情缓存")
    ap.add_argument("--overlap-days", type=int, default=OVERLAP_CALENDAR_DAYS)
    ap.add_argument("--rps", type=float, default=None, help="限速（次/秒），默认沿用 FACTORLAB_RPS / 2")
    a = ap.parse_args(argv)
    if a.rps:
        http.set_rate(a.rps)
    codes = [c.strip() for c in a.codes.split(",")] if a.codes else None
    rep = update_cn(codes=codes, until=a.until, dry_run=a.dry_run, overlap_days=a.overlap_days,
                    refresh=not a.resume)
    print(json.dumps(rep, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
