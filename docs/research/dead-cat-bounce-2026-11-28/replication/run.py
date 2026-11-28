#!/usr/bin/env python3
"""L-051 第二实现（独立；不读主实现 run_main.py 及其中间产物）。

口径来源（优先级从高到低）：PREREG.md（冻结 be7deaa4）> CLARIFY-1.md（manager 裁定）> ../results.schema.json
的 conventions 段（两实现共同口径）。结构对齐 ../results.schema.json。代码为本实现独立编写（接手前任 Cursor
半成品后重写）。口径选择、映射与边界核对见 CROSSCHECK.md。

用法：
  cd research-py && uv run python ../docs/research/dead-cat-bounce-2026-11-28/replication/run.py [--quick] [--out PATH]
输出：replication/results.json、replication/events.csv、replication/trials.jsonl
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy.stats import norm

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
sys.path.insert(0, str(ROOT / "research-py"))

from factorlab import store  # noqa: E402
from factorlab.backtest import (DEFAULT_COSTS, DEFAULT_SLIPPAGE, perf_stats, quantile_labels,  # noqa: E402
                                select_top, tie_keys)
from factorlab.fundamentals_cn import compute_fields, core_fields  # noqa: E402
from factorlab.guard import code_bucket  # noqa: E402
from factorlab.registry import compute_strict, get as get_factor  # noqa: E402
from factorlab.sources.cn_fin import load_fin_pit  # noqa: E402
from factorlab.universe import AdvCache, UniverseSpec, build_universe  # noqa: E402

OUT = HERE / "results.json"
EVENTS_CSV = HERE / "events.csv"
TRIALS = HERE / "trials.jsonl"
SEED = 20261128
PREREG_COMMIT = "be7deaa4"
PREREG_PATH = "docs/research/dead-cat-bounce-2026-11-28/PREREG.md"
CLARIFY_PATH = "docs/research/dead-cat-bounce-2026-11-28/CLARIFY-1.md"

START, END = "2005-01-01", "2023-10-31"
EXPLORE_END = pd.Timestamp("2014-12-31")
VALIDATE_START = pd.Timestamp("2015-01-01")
VALIDATE_END = pd.Timestamp("2023-10-31")
REGIME_CUTS = ["2019-07-22", "2020-08-24", "2023-04-10", "2026-07-06"]
CAPITAL = 1e8
N_PLACEBO = 1000
N_BOOT = 10000
BLOCK = 63

BASE = dict(mode="ret10", crash_days=10, crash_ret=-0.25, bounce_window=20, bounce=0.10, cooldown=120, hold=60)
CANDS = ("C1", "C2_lo", "C2_hi")

EXPECTED_SHA = {
    "prices.parquet": "dd61e3085b6346180b3427ffe27ff18bdfc36980a22216f70baaa2bf059bbd3e",
    "fin_pit.parquet": "da32cbced36ba631453e4959f627d8a5abfeadc530f72f0485ca30b6c380c6df",
    "securities.parquet": "398590347a823de1a6dcf7a7b3b8d1ed61cc6cfda1d368181e3b59cc8562271d",
    "st_pit.parquet": "4981bdcb711d6e04620e7101cd140be9768ecd166ffcdda07110239e840a2a0a",
}
COUNT_REF = {"explore": 2766, "validate": 5376, "validate_truncated": 32,
             "skips": {"no_limit_inferred": 224, "long_suspend_resumption": 463, "delisting_or_terminate": 81,
                       "not_in_universe_on_s": 6275},
             "note": "counts_h2_filtered.json（上市前空白算停牌的旧计法）"}
RULINGS = [
    "第一批(1) 探索变体只报告主推断均值、NW t、事件数、信号月数",
    "第一批(2) 价值因子经 load_fin_pit 点时现算 TTM EP（已注册 cn_ep_ttm 的 compute_strict），缺失不进回归、报告覆盖率",
    "第一批(3) 低波安慰剂按事件逐个配对（同板块 × 市值三档 × vol_60d 三档、当时不在任何回避窗中），1000 次，种子 20261128",
    "第二批 1–7：S3 组合毛收益路径（隔夜/日内两步、前一日市值、成员 = 严格早于当日的月末池），成本只进 S5；诊断对照按字面；"
    "分档 quantile_labels 全底池；S2 / 集中度在日历序列上；C2 合并（都支持 / 都不支持 / 其余部分成立），C1∖C2 上下界都 ≤ 0；"
    "块自助 p 公式；停牌计数从首个有效行情日起，另报 s 后 60 日内退市诊断",
]


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fnum(x):
    if x is None:
        return None
    if isinstance(x, (bool, np.bool_)):
        return bool(x)
    if isinstance(x, (int, np.integer)):
        return int(x)
    x = float(x)
    return None if not math.isfinite(x) else x


def nw_t(x, L: int) -> float:
    """均值的 NW t：Bartlett 权 1 − k/(L+1)，自协方差除以 n；t = 均值 / sqrt(长期方差 / n)。"""
    x = np.asarray(x, float)
    n = len(x)
    if n < 3:
        return float("nan")
    u = x - x.mean()
    lrv = u @ u / n
    for k in range(1, min(L, n - 1) + 1):
        lrv += 2.0 * (1.0 - k / (L + 1)) * (u[k:] @ u[:-k]) / n
    if lrv <= 0:
        return float("nan")
    return float(x.mean() / math.sqrt(lrv / n))


# =============================================================== 数据
class Data:
    pass


def load_data() -> Data:
    D = Data()
    fields = ["close_adj", "open_adj", "open", "close", "volume", "amount", "turnover", "mcap_float", "mcap_total",
              "limit_down", "limit_down_oneword", "no_limit_inferred", "is_suspended", "industry"]
    log("load panel")
    panel = store.load_panel("cn", fields, start=START, end=END, raw=False)
    c = panel["close_adj"]
    D.dates, D.codes = c.index, c.columns
    for k in fields:
        panel[k] = panel[k].reindex(index=D.dates, columns=D.codes)
    D.panel = panel
    D.n, D.m = c.shape
    D.sec = store.read_securities("cn")
    D.close = c.to_numpy(float)
    D.valid = np.isfinite(D.close) & (D.close > 0)          # 停牌 = 当日无有效行情
    D.oneword = panel["limit_down_oneword"].fillna(False).to_numpy(bool)
    D.limit_down = panel["limit_down"].fillna(False).to_numpy(bool)
    D.nli = panel["no_limit_inferred"].fillna(False).to_numpy(bool)
    D.mcap = panel["mcap_float"].to_numpy(float)
    D.mcff = panel["mcap_float"].ffill().to_numpy(float)
    D.cff = c.ffill().to_numpy(float)
    oa = panel["open_adj"].to_numpy(float)
    D.open_adj = np.where(D.valid & np.isfinite(oa) & (oa > 0), oa, np.nan)
    D.open_raw = panel["open"].to_numpy(float)
    D.close_raw_ff = panel["close"].ffill().to_numpy(float)
    D.industry = panel["industry"].to_numpy(object)
    secu = D.sec.drop_duplicates("code").set_index("code")
    D.board = secu["board"].reindex(D.codes).fillna("unknown").astype(str).to_numpy()
    D.delisted_codes = set(D.sec.loc[D.sec["status"] == "delisted", "code"].astype(str))
    D.listed_now = np.array([cc not in D.delisted_codes for cc in D.codes])
    D.delist_date = pd.to_datetime(secu["delist_date"].reindex(D.codes)).to_numpy()
    D.delist_row = np.array([D.dates.searchsorted(pd.Timestamp(d)) if not pd.isna(d) else -1 for d in D.delist_date])

    log("universe")
    s = pd.Series(np.arange(D.n), index=D.dates)
    D.me_idx = s.groupby([D.dates.year, D.dates.month]).max().to_numpy()
    D.me_dates = D.dates[D.me_idx]
    uni = build_universe(panel, D.me_dates, "cn", securities=D.sec, spec=UniverseSpec())
    D.uni = uni.reindex(D.dates).ffill().fillna(False).infer_objects().astype(bool).to_numpy(bool)  # U_le(t)

    log("price factors")
    D.f = {nm: get_factor(nm)(panel, D.dates).reindex(columns=D.codes).to_numpy(float)
           for nm in ("vol_60d", "rev_1m", "dd_60", "max_ret_21d", "peak_fall", "turnover_20d", "mom_12_1", "size")}
    D.recent_crash = recent_crash(D.close, D.valid)

    log("st_pit / fin_pit")
    st = pd.read_parquet(store.market_dir("cn") / "st_pit.parquet")
    st["start_date"] = pd.to_datetime(st["start_date"])
    st["end_date"] = pd.to_datetime(st["end_date"])
    D.delist_iv = defaultdict(list)
    for r_ in st[st["flag"] == "delisting"].itertuples():
        D.delist_iv[str(r_.code)].append((r_.start_date, r_.end_date if pd.notna(r_.end_date) else pd.Timestamp.max))
    term = st[st["event"].astype(str).str.contains("终止", na=False)]
    D.term = defaultdict(list)
    for r_ in term.itertuples():
        D.term[str(r_.code)].append(r_.start_date)
    D.n_term_events = int(len(term))
    fin = load_fin_pit("cn", raw=False)
    D.fin_all = fin
    ok = (fin["doc_type"] == "periodic") & fin["announce_rule"].isin(["declared", "declared_same_report"]) \
        & fin["announce_date"].notna()
    f2 = fin.loc[ok, ["code", "announce_date"]].copy()
    f2["announce_date"] = pd.to_datetime(f2["announce_date"])
    D.ann = {str(k): np.sort(g["announce_date"].drop_duplicates().to_numpy()) for k, g in f2.groupby("code", sort=False)}
    D.adv = AdvCache(panel["amount"], 20, 10)
    D.keys = tie_keys(D.codes)
    return D


def recent_crash(close, valid):
    """[t−29, t] 内任一行 close[u]/close[u−10] − 1 ≤ −25%（两端都有效）。"""
    n, m = close.shape
    with np.errstate(invalid="ignore", divide="ignore"):
        r10 = np.full((n, m), np.nan)
        r10[10:] = close[10:] / close[:-10] - 1.0
    flag = np.isfinite(r10) & (r10 <= -0.25)
    flag[10:] &= valid[10:] & valid[:-10]
    cs = np.cumsum(flag.astype(np.int32), axis=0)
    prev = np.zeros_like(cs)
    prev[30:] = cs[:-30]
    return (cs - prev) > 0


# =============================================================== 事件检测
def resumption_days(v: np.ndarray, count_prelisting: bool = False) -> np.ndarray:
    """长停牌复牌首日：与上一个有效行之间缺 ≥ 60 行的有效行（默认只从首个有效行情日起计）。"""
    out = np.zeros(len(v), bool)
    run, seen = 0, count_prelisting
    for t in range(len(v)):
        if not v[t]:
            if seen:
                run += 1
        else:
            if run >= 60:
                out[t] = True
            run, seen = 0, True
    return out


def has_ann(D, code, t0, t1) -> bool:
    a = D.ann.get(code)
    if a is None or not len(a):
        return False
    return bool(np.searchsorted(a, np.datetime64(t1), side="right") > np.searchsorted(a, np.datetime64(t0), side="left"))


def detect(D, P: dict, count_prelisting: bool = False):
    """PREREG 伪代码（count_h2.py 79–141 + v2 增量）。返回（底池事件，全部接受信号 [(j, s)]，跳过计数）。"""
    n = D.n
    cd, cr, bw, b, cool = P["crash_days"], P["crash_ret"], P["bounce_window"], P["bounce"], P["cooldown"]
    H = P["hold"]
    events, accepted = [], []
    skips = Counter()
    i0 = 2 if P["mode"] == "limit3" else cd
    for j, code in enumerate(D.codes):
        v = D.valid[:, j]
        if not v.any():
            continue
        px, ow, un, ld = D.close[:, j], D.oneword[:, j], D.uni[:, j], D.limit_down[:, j]
        res_cum = np.cumsum(resumption_days(v, count_prelisting))
        nl_cum = np.cumsum(D.nli[:, j])
        last = -10**9
        i = i0
        while i < n:
            if i - last < cool:
                i += 1
                continue
            if P["mode"] == "ret10":
                if not v[i] or not v[i - cd]:
                    i += 1
                    continue
                cret = px[i] / px[i - cd] - 1.0
                if cret > cr:
                    i += 1
                    continue
                cs_, ce = i - cd, i
            else:  # triple_limit_down：第 i−2、i−1、i 行都有行情且封跌停
                if not (v[i] and v[i - 1] and v[i - 2] and ld[i] and ld[i - 1] and ld[i - 2]):
                    i += 1
                    continue
                cs_, ce = i - 2, i
                cret = float("nan")
            roll_min, trough, sig = px[ce], ce, None
            for k in range(ce + 1, min(n, ce + 1 + bw)):
                if not v[k]:
                    continue
                if px[k] < roll_min:
                    roll_min, trough = px[k], k
                if px[k] >= roll_min * (1.0 + b):
                    if ow[k]:
                        skips["signal_oneword"] += 1
                        break
                    sig = k
                    break
            if sig is None:
                i += 1
                continue
            base = cs_ - 1
            if nl_cum[sig] - (nl_cum[base] if base >= 0 else 0) > 0:
                skips["no_limit_inferred"] += 1
                i += 1
                continue
            if res_cum[sig] - (res_cum[base] if base >= 0 else 0) > 0:
                skips["long_suspend_resumption"] += 1
                i += 1
                continue
            sd = D.dates[sig]
            if any(a <= sd <= e for a, e in D.delist_iv.get(code, ())) or any(td <= sd for td in D.term.get(code, ())):
                skips["delisting"] += 1
                i += 1
                continue
            last = sig
            accepted.append((j, sig))
            if not un[sig]:
                skips["not_in_universe_on_s"] += 1
                i = sig + 1
                continue
            t0, t1 = D.dates[cs_], D.dates[ce]
            obs, obs_full = has_ann(D, code, t0, t1), has_ann(D, code, t0, sd)
            dl = code in D.delisted_codes
            he = sig + H
            if sd <= EXPLORE_END:
                layer = "explore"
                cross = bool(he < n and D.dates[he] >= VALIDATE_START)
            elif sd >= VALIDATE_START and he < n and D.dates[he] <= VALIDATE_END:
                layer, cross = "validate", False
            else:
                layer, cross = "validate_truncated", False
            events.append(dict(code=code, j=j, s=sig, cs=cs_, ce=ce, trough=trough, roll_min=float(roll_min),
                               crash_ret=float(cret), bounce=float(px[sig] / roll_min - 1.0), layer=layer,
                               cross_2015=cross, year=int(sd.year), month=sd.strftime("%Y-%m"),
                               c2_obs=obs, C2_lo=(False if dl else obs), C2_hi=(True if dl else obs),
                               c2f_lo=(False if dl else obs_full), c2f_hi=(True if dl else obs_full),
                               delisted_stock=dl))
            i = sig + 1
    return events, accepted, dict(skips)


def accepted_mask(D, accepted, back: int = 60) -> np.ndarray:
    a = np.zeros((D.n, D.m), np.int32)
    for j, s in accepted:
        a[s, j] += 1
    cs = np.cumsum(a, axis=0)
    prev = np.zeros_like(cs)
    prev[back + 1:] = cs[:-(back + 1)]
    return (cs - prev) > 0          # [t−back, t] 内有接受信号


# =============================================================== 对照
def assign_controls(D, events, acc_mask):
    by_s = defaultdict(list)
    for e in events:
        by_s[e["s"]].append(e)
    has_ind = getattr(D, "industry", None) is not None
    for s, evs in by_s.items():
        pool = D.uni[s] & D.valid[s]
        lab = {}
        for name, arr, q in (("mt", D.mcap[s], 3), ("vt", D.f["vol_60d"][s], 3),
                             ("dq", D.f["dd_60"][s], 5), ("rq", D.f["rev_1m"][s], 5)):
            lab[name] = quantile_labels(np.where(pool, arr, np.nan), D.keys, q)
        base_ok = pool & ~D.recent_crash[s]
        for e in evs:
            j = e["j"]
            mt, vt, dq, rq = lab["mt"][j], lab["vt"][j], lab["dq"][j], lab["rq"][j]
            notself = np.ones(D.m, bool)
            notself[j] = False
            same_b = D.board == D.board[j]
            e["mt"] = None if np.isnan(mt) else int(mt)
            e["vt"] = None if np.isnan(vt) else int(vt)

            def match(group):
                if np.isnan(mt):
                    return np.array([], int), None
                cell = base_ok & group & (lab["mt"] == mt) & notself
                if not np.isnan(vt):
                    strict = np.flatnonzero(cell & (lab["vt"] == vt))
                    if len(strict) >= 10:
                        return strict, False
                return np.flatnonzero(cell), True
            e["ctrl"], e["ctrl_relaxed"] = match(same_b)
            if has_ind and isinstance(D.industry[s, j], str):
                e["ctrl_sw"], _ = match(D.industry[s] == D.industry[s, j])
            else:
                e["ctrl_sw"] = np.array([], int)
            if np.isnan(mt) or np.isnan(dq) or np.isnan(rq):
                e["diag"] = np.array([], int)
            else:
                e["diag"] = np.flatnonzero(pool & same_b & (lab["mt"] == mt) & (lab["dq"] == dq) & (lab["rq"] == rq)
                                           & ~acc_mask[s] & notself)
            # 安慰剂候选（窗口排除在抽样时按候选做）：严格格 → 去 vol 档 → 只板块
            e["plc"] = [np.flatnonzero(pool & same_b & (lab["mt"] == mt) & (lab["vt"] == vt) & notself)
                        if not (np.isnan(mt) or np.isnan(vt)) else np.array([], int),
                        np.flatnonzero(pool & same_b & (lab["mt"] == mt) & notself) if not np.isnan(mt)
                        else np.array([], int),
                        np.flatnonzero(pool & same_b & notself)]


# =============================================================== 事件路径（分段）与日历组合
def event_end(D, e, H):
    j, s = e["j"], e["s"]
    tgt = s + H
    v = D.valid[:, j]
    if tgt < D.n and v[tgt]:
        return tgt
    if tgt < D.n:
        nxt = np.flatnonzero(v[tgt + 1:])
        if len(nxt):
            return tgt + 1 + int(nxt[0])
    lastv = np.flatnonzero(v[s + 1:min(tgt, D.n - 1) + 1])
    return s + 1 + int(lastv[-1]) if len(lastv) else s


def ctrl_daily(D, ctrl, t, first_open):
    """对照等权日收益：首日（ref 为开盘时）close/open − 1；其余 close[t]/close[t−1] − 1（两日都有行情）；无可用股 = 0。"""
    c = D.close[np.ix_(t, ctrl)]
    with np.errstate(invalid="ignore", divide="ignore"):
        r = c / D.close[np.ix_(t - 1, ctrl)] - 1.0
        if first_open:
            r[0] = c[0] / D.open_adj[t[0], ctrl] - 1.0
    ok = np.isfinite(r)
    cnt = ok.sum(1)
    return np.where(cnt > 0, np.where(ok, r, 0.0).sum(1) / np.maximum(cnt, 1), 0.0)


def seg_path(D, e, ctrl, H, m100=False):
    """返回（段末行数组, 段差 d, 段收益 re, 对照段收益 rc）或 None。"""
    end = event_end(D, e, H)
    s, j = e["s"], e["j"]
    if end <= s or ctrl is None or len(ctrl) == 0:
        return None
    t = np.arange(s + 1, end + 1)
    first_open = bool(np.isfinite(D.open_adj[s + 1, j]))
    cum = np.cumprod(1.0 + ctrl_daily(D, ctrl, t, first_open))
    ref = D.open_adj[s + 1, j] if first_open else D.close[s, j]
    ends, re, rc = [], [], []
    prev_cum = 1.0
    for k in np.flatnonzero(D.valid[t, j]):
        px = D.close[t[k], j]
        re.append(px / ref - 1.0)
        rc.append(cum[k] / prev_cum - 1.0)
        ends.append(t[k])
        ref, prev_cum = px, cum[k]
    ends, re, rc = np.array(ends, int), np.array(re), np.array(rc)
    d = re - rc
    dr = D.delist_row[j]
    if m100 and dr >= 0 and s < dr <= s + 60 and dr < D.n:
        ends, d, re, rc = np.append(ends, dr), np.append(d, -1.0), np.append(re, -1.0), np.append(rc, 0.0)
    return ends, d, re, rc


def paths(D, events, H, key="ctrl", tag="main", m100=False):
    for e in events:
        e[f"path_{tag}"] = seg_path(D, e, e.get(key), H, m100=m100)


def calendar(D, events, tag="main"):
    s_sum = np.zeros(D.n)
    s_cnt = np.zeros(D.n)
    for e in events:
        p = e.get(f"path_{tag}")
        if p is None:
            continue
        np.add.at(s_sum, p[0], p[1])
        np.add.at(s_cnt, p[0], 1)
    days = np.flatnonzero(s_cnt > 0)
    return days, s_sum[days] / s_cnt[days]


def block_boot_p(x: np.ndarray, n_boot=None, block=BLOCK) -> float:
    n_boot = N_BOOT if n_boot is None else n_boot
    T = len(x)
    if T < 2:
        return float("nan")
    m = x.mean()
    xc = x - m
    rng = np.random.default_rng(SEED)
    nb = int(math.ceil(T / block))
    ar = np.arange(block)
    cnt = 0
    for _ in range(n_boot):
        st = rng.integers(0, T, size=nb)
        idx = ((st[:, None] + ar[None, :]) % T).ravel()[:T]
        if xc[idx].mean() <= m:
            cnt += 1
    return (1 + cnt) / (n_boot + 1)


def excess(e, tag="main"):
    p = e.get(f"path_{tag}")
    return None if p is None else float(p[1].sum())


def inference(D, events, tag="main", boot=True):
    days, x = calendar(D, events, tag)
    out = {"mean_x60": None, "daily_mean": None, "nw_t": None, "nw_p_onesided": None, "block_bootstrap_p": None,
           "n_days": int(len(x)), "event_level_month_cluster_t": None, "event_mean_excess": None}
    if len(x) >= 3:
        t = nw_t(x, 60)
        out.update(mean_x60=float(x.mean() * 60), daily_mean=float(x.mean()), nw_t=t,
                   nw_p_onesided=float(norm.cdf(t)) if math.isfinite(t) else None)
        if boot:
            out["block_bootstrap_p"] = float(block_boot_p(x))
    E = [(excess(e, tag), e["month"]) for e in events if excess(e, tag) is not None]
    if E:
        out["event_mean_excess"] = float(np.mean([v for v, _ in E]))
        by = defaultdict(list)
        for v, mm in E:
            by[mm].append(v)
        mm = np.array([np.mean(v) for v in by.values()])
        if len(mm) >= 2 and mm.std(ddof=1) > 0:
            out["event_level_month_cluster_t"] = float(mm.mean() / (mm.std(ddof=1) / math.sqrt(len(mm))))
    return out, days, x


def mean_x60(D, events, tag="main"):
    _, x = calendar(D, events, tag)
    return float(x.mean() * 60) if len(x) else None


# =============================================================== 判定条件
def gate_S1(inf):
    m, t = inf["mean_x60"], inf["nw_t"]
    ok = bool(m is not None and t is not None and m <= -0.015 and t <= -2.0)
    return {"pass": ok, "detail": {"mean_x60": m, "nw_t": t, "thr_mean": -0.015, "thr_t": -2.0}}


def gate_S2(D, events, tag="main"):
    cnt = Counter(e["year"] for e in events)
    if not cnt:
        return {"pass": False, "detail": {"note": "无事件"}}
    top = sorted(cnt.items(), key=lambda kv: (-kv[1], kv[0]))[0][0]
    m_ex = mean_x60(D, [e for e in events if e["year"] != top], tag)
    a_ok = bool(m_ex is not None and m_ex <= -0.0075)
    big = sorted(y for y, c in cnt.items() if c >= 50)
    ym = {str(y): mean_x60(D, [e for e in events if e["year"] == y], tag) for y in big}
    vals = [v for v in ym.values() if v is not None]
    frac = (sum(1 for v in vals if v < 0) / len(big)) if big else None
    b_ok = bool(frac is not None and frac >= 0.60)
    return {"pass": bool(a_ok and b_ok), "detail": {
        "top_year": int(top), "top_year_n": int(cnt[top]), "mean_x60_ex_top_year": m_ex, "a_pass": a_ok,
        "year_means_ge50": ym, "frac_neg_ge50": frac, "b_pass": b_ok,
        "events_by_year": {str(k): v for k, v in sorted(cnt.items())}}}


def concentration(D, events, tag="main"):
    days, x = calendar(D, events, tag)
    by = defaultdict(float)
    for y, v in zip(D.dates[days].year, x):
        by[int(y)] += float(v)
    tot = float(x.sum()) if len(x) else 0.0
    share, yr = None, None
    if tot < 0 and by:
        yr = max(by, key=lambda y: by[y] / tot)
        share = by[yr] / tot
    return {"gt_50pct": bool(share is not None and share > 0.5), "max_year_share": share, "max_share_year": yr,
            "year_sums": {str(k): v for k, v in sorted(by.items())}, "total": tot}


def leg_rate(D, j, r, V, side):
    cm, slip = DEFAULT_COSTS["cn"], DEFAULT_SLIPPAGE["cn"]
    p = D.open_raw[r, j]
    if not (np.isfinite(p) and p > 0):
        p = D.close_raw_ff[r, j]
    lots = math.floor(V / (p * 100))
    amt = max(lots * 100, 100) * p
    comm = max(cm.commission * amt, cm.min_commission) / amt
    b, s_ = cm.stamp_rates(D.dates[r])
    sl = float(slip.rate(np.array([D.adv.row(D.dates[r])[j]]))[0])
    return comm + cm.other + (s_ if side == "sell" else b) + sl, lots < 1


def event_cost(D, e, H):
    j, s = e["j"], e["s"]
    # 分母 = U_le(s) 成员前推流通市值之和（停牌成员按最后市值计，与组合路径「停牌日市值前推」一致）
    pool = D.uni[s] & np.isfinite(D.mcff[s]) & (D.mcff[s] > 0)
    V = D.mcap[s, j] / D.mcff[s][pool].sum() * CAPITAL
    c1, p1 = leg_rate(D, j, s + 1, V, "sell")
    c2, p2 = leg_rate(D, j, min(s + H + 1, D.n - 1), V, "buy")
    return c1 + c2, int(p1) + int(p2)


def gate_S5(D, events, H, tag="main"):
    nets, costs, pad = [], [], 0
    for e in events:
        E = excess(e, tag)
        if E is None:
            continue
        c, p = event_cost(D, e, H)
        nets.append(-E - c)
        costs.append(c)
        pad += p
    m = float(np.mean(nets)) if nets else None
    return {"pass": bool(m is not None and m >= 0.01), "detail": {
        "avoid_net_mean": m, "cost_mean": float(np.mean(costs)) if costs else None, "n": len(nets), "thr": 0.01,
        "n_legs_padded_to_100_shares": pad}}


# =============================================================== 组合路径
def layer_rows(D, layer):
    """收益日 t ∈ (lo, hi]。"""
    if layer == "explore":
        return int(D.me_idx[0]), int(np.flatnonzero(D.dates <= EXPLORE_END)[-1])
    return int(np.flatnonzero(D.dates <= EXPLORE_END)[-1]), D.n - 1


def pstats(r) -> dict:
    s = perf_stats(pd.Series(r))
    return {"vol": s["vol"], "mdd": s["maxdd"], "sharpe": s["sharpe"], "cagr": s["cagr"], "n": s["n"]}


def pool_compare(full, avoid) -> dict:
    a, b = pstats(full), pstats(avoid)
    return {"vol_full": a["vol"], "vol_avoid": b["vol"], "vol_ratio": b["vol"] / a["vol"], "mdd_full": a["mdd"],
            "mdd_avoid": b["mdd"], "sharpe_full": a["sharpe"], "sharpe_avoid": b["sharpe"],
            "ann_ret_full": a["cagr"], "ann_ret_avoid": b["cagr"], "n_days": a["n"]}


class Engine:
    """毛收益路径（隔夜 / 日内两步）：W = 前推流通市值[t−1] × U_lt(t)；回避股 t ∈ [s+1, s+60] 不参与日内、
    t ∈ [s+2, s+61] 不参与隔夜；其余按权重比例重新归一。"""

    def __init__(self, D, lo, hi, weighting="cap", delist_m100=False):
        self.D, self.lo, self.hi = D, lo, hi
        t = np.arange(lo + 1, hi + 1)
        self.t, self.index = t, D.dates[t]
        member = D.uni[t - 1]
        if weighting == "cap":
            mc = D.mcff[t - 1]
            w = np.where(member & np.isfinite(mc) & (mc > 0), mc, 0.0)
        else:
            w = member.astype(float)
        prev = D.cff[t - 1]
        v = D.valid[t]
        o = D.open_adj[t]
        with np.errstate(invalid="ignore", divide="ignore"):
            on = np.where(v, np.where(np.isfinite(o), o, D.close[t]) / prev - 1.0, 0.0)
            inn = np.where(v & np.isfinite(o), D.close[t] / o - 1.0, 0.0)
        if delist_m100:
            dr = D.delist_row
            for j in np.flatnonzero((dr > lo) & (dr <= hi)):
                k = dr[j] - (lo + 1)
                on[k, j], inn[k, j] = -1.0, 0.0
                w[k + 1:, j] = 0.0
        w = np.where(np.isfinite(prev), w, 0.0)
        on = np.where(w > 0, np.nan_to_num(on), 0.0)
        inn = np.where(w > 0, np.nan_to_num(inn), 0.0)
        self.w, self.on, self.inn = w, on, inn
        self.V = w * (1 + on)
        self.B = w.sum(1)
        self.A_on = (w * on).sum(1)
        self.A_in = (self.V * inn).sum(1)
        self.B_in = self.V.sum(1)
        self.Rcc = (1 + on) * (1 + inn) - 1
        self.A_cc = (w * self.Rcc).sum(1)

    def _sub(self, keys, arr):
        k = keys // self.D.m - (self.lo + 1)
        j = keys % self.D.m
        ok = (k >= 0) & (k < len(self.t))
        return np.bincount(k[ok], weights=arr[k[ok], j[ok]], minlength=len(self.t))

    def full(self):
        return (1 + self.A_on / self.B) * (1 + self.A_in / self.B_in) - 1

    def path(self, e1, e2):
        a_on, b_on = self._sub(e1, self.w * self.on), self._sub(e1, self.w)
        a_in, b_in = self._sub(e2, self.V * self.inn), self._sub(e2, self.V)
        return (1 + (self.A_on - a_on) / (self.B - b_on)) * (1 + (self.A_in - a_in) / (self.B_in - b_in)) - 1

    def cash(self, e2):
        """Bc：Σ_{∉R_a} W·r / Σ W（收盘到收盘一步）。"""
        return (self.A_cc - self._sub(e2, self.w * self.Rcc)) / self.B

    def net(self, e1, e2, gross):
        """报告：(1 + 毛) × (1 − 当日比例成本) − 1；成本 = 回避股权重 ×（自身费率 + 底池市值加权平均对手费率）。"""
        D = self.D
        cm, slip = DEFAULT_COSTS["cn"], DEFAULT_SLIPPAGE["cn"]
        cost = np.zeros(len(self.t))
        for keys, side in ((np.setdiff1d(e2, e1, assume_unique=True), "sell"),
                           (np.setdiff1d(e1, e2, assume_unique=True), "buy")):
            k = keys // D.m - (self.lo + 1)
            j = keys % D.m
            ok = (k >= 0) & (k < len(self.t))
            k, j = k[ok], j[ok]
            for kk in np.unique(k):
                sel = j[k == kk]
                d = self.index[kk]
                sl_all = slip.rate(D.adv.row(d))
                b, s_ = cm.stamp_rates(d)
                own = cm.commission + cm.other + (s_ if side == "sell" else b) + sl_all[sel]
                wk = self.w[kk]
                opp = cm.commission + cm.other + (b if side == "sell" else s_) + float((wk * sl_all).sum() / wk.sum())
                cost[kk] += float((wk[sel] / self.B[kk] * (own + opp)).sum())
        return (1 + gross) * (1 - cost) - 1


def window_keys(D, js, ss, H=60):
    js = np.asarray(js, dtype=np.int64)
    ss = np.asarray(ss, dtype=np.int64)
    if not len(js):
        return np.array([], np.int64), np.array([], np.int64)
    out = []
    for off in (np.arange(2, H + 2), np.arange(1, H + 1)):
        t = (ss[:, None] + off[None, :]).ravel()
        j = np.repeat(js, len(off))
        ok = t < D.n
        out.append(np.unique(t[ok] * D.m + j[ok]))
    return out[0], out[1]


def vol_of(r):
    r = np.asarray(r)
    r = r[np.isfinite(r)]
    return float(np.std(r, ddof=1) * math.sqrt(252))


def placebo(D, events, eng: Engine, H=60):
    v_full = vol_of(eng.full())
    evs = sorted(events, key=lambda e: (e["s"], e["code"]))
    ss = np.array([e["s"] for e in evs], dtype=np.int64)
    e1, e2 = window_keys(D, [e["j"] for e in evs], ss, H)
    cand = vol_of(eng.path(e1, e2)) / v_full
    inwin = np.zeros((D.n, D.m), bool)
    for e in evs:
        inwin[e["s"] + 1:min(e["s"] + H + 1, D.n), e["j"]] = True
    pools, relaxed, empty = [], 0, 0
    for e in evs:
        r = e["s"] + 1
        chosen = np.array([], int)
        for lvl, c in enumerate(e["plc"]):
            c = c[~inwin[r, c]] if (len(c) and r < D.n) else c
            if len(c):
                chosen = c
                relaxed += int(lvl > 0)
                break
        if not len(chosen):
            empty += 1
        pools.append(chosen)
    sizes = np.array([len(p) for p in pools], dtype=np.int64)
    has = sizes > 0
    flat = np.concatenate([p for p in pools if len(p)]).astype(np.int64) if has.any() else np.array([], np.int64)
    offs = (np.concatenate([[0], np.cumsum(sizes)])[:-1]).astype(np.int64)
    rng = np.random.default_rng(SEED)
    ratios = np.empty(N_PLACEBO)
    for b in range(N_PLACEBO):
        k = rng.integers(0, np.maximum(sizes, 1))
        pick = flat[(offs + k)[has]]
        p1, p2 = window_keys(D, pick, ss[has], H)
        ratios[b] = vol_of(eng.path(p1, p2)) / v_full
    p5 = float(np.percentile(ratios, 5))
    return {"cand_vol_ratio": cand, "p5": p5, "percentile": float((ratios <= cand).mean()), "n": N_PLACEBO,
            "mean": float(ratios.mean()), "relaxed_events": int(relaxed), "events_without_pool": int(empty)}


def gate_S3(cmp_, plc):
    vr = cmp_["vol_ratio"]
    shallower = bool(cmp_["mdd_avoid"] - cmp_["mdd_full"] >= 0.01)
    s3_pool = bool((vr <= 0.98 or shallower) and cmp_["sharpe_avoid"] >= cmp_["sharpe_full"] - 0.02)
    s3_plc = bool(vr < plc["p5"])
    return {"pass": bool(s3_pool and s3_plc), "detail": {
        "vol_full": cmp_["vol_full"], "vol_avoid": cmp_["vol_avoid"], "vol_ratio": vr, "mdd_full": cmp_["mdd_full"],
        "mdd_avoid": cmp_["mdd_avoid"], "mdd_shallower": cmp_["mdd_avoid"] - cmp_["mdd_full"],
        "mdd_shallower_ge_1pct": shallower,
        "sharpe_full": cmp_["sharpe_full"], "sharpe_avoid": cmp_["sharpe_avoid"], "s3_pool": s3_pool,
        "placebo_p5": plc["p5"], "placebo_percentile": plc["percentile"], "s3_placebo": s3_plc,
        "placebo": {k: plc[k] for k in ("p5", "percentile", "n", "mean", "relaxed_events", "events_without_pool")},
        "n_days": cmp_["n_days"]}}


# =============================================================== spanning
def ep_monthly(D):
    log("cn_ep_ttm (load_fin_pit + compute_strict)")
    fin = D.fin_all[D.fin_all["avail_date"].notna()]
    core = core_fields(fin, D.me_dates, D.codes)
    flds = compute_fields(core, ["fin_ni_ttm", "fin_mcap"], D.panel["close"], D.panel["close_adj"],
                          D.panel["mcap_total"], None)
    ep = compute_strict(get_factor("cn_ep_ttm"), {"fin_ni_ttm": flds["fin_ni_ttm"], "fin_mcap": flds["fin_mcap"]},
                        D.me_dates).reindex(columns=D.codes)
    full = np.full((D.n, D.m), np.nan)
    full[D.me_idx] = ep.to_numpy(float)
    return full


def factor_returns(D, eng: Engine, factors: dict):
    lo, hi = eng.lo, eng.hi
    full = eng.full()
    out = {"mkt": full}
    me_set = {int(i) for i in D.me_idx if i <= hi}
    t = eng.t
    for name, (vals, direction) in factors.items():
        sel = np.zeros((D.n, D.m), bool)
        cur = None
        for i in range(0, hi + 1):
            if i in me_set:
                cur = select_top(np.where(D.uni[i], vals[i] * direction, np.nan), D.keys, top_q=0.2)
            if cur is not None and i >= lo:
                sel[i] = cur
        W = eng.w * sel[t - 1]
        sw = W.sum(1)
        out[name] = (W * eng.Rcc).sum(1) / np.where(sw > 0, sw, np.nan) - full
    return out


def spanning_portfolio(eng: Engine, y, fr: dict):
    X = pd.DataFrame(fr, index=eng.index)
    df = pd.concat([pd.Series(y, index=eng.index, name="y"), X], axis=1).dropna()
    res = sm.OLS(df["y"], sm.add_constant(df.drop(columns="y"))).fit(cov_type="HAC", cov_kwds={"maxlags": 60})
    a, t = float(res.params["const"]), float(res.tvalues["const"])
    return {"alpha_daily": a, "alpha_ann": a * 252, "alpha_nw_t": t, "pass_report": bool(a > 0 and t >= 2),
            "n_days": int(len(df)), "betas": {k: float(res.params[k]) for k in X.columns}, "factors": list(X.columns)}


def fama_macbeth(D, events, lo, hi, H=60):
    wk_end = pd.Series(np.arange(D.n), index=D.dates).groupby(D.dates.to_period("W-SUN")).max().to_numpy()
    boards = sorted(set(D.board))
    ev_by_s = defaultdict(set)
    for e in events:
        ev_by_s[e["s"]].add(e["j"])
    gam = []
    prev_end = -1
    for d in (int(x) for x in wk_end):
        lo_w, prev_end = prev_end, d
        if not (lo < d <= hi) or d + H >= D.n:
            continue
        evj = set()
        for s in range(lo_w + 1, d + 1):
            evj |= ev_by_s.get(s, set())
        if not evj:
            continue
        o1 = D.open_adj[d + 1]
        cs = D.uni[d] & D.valid[d] & np.isfinite(o1)
        with np.errstate(invalid="ignore", divide="ignore"):
            y = D.cff[d + H] / o1 - 1.0
        f = D.f
        core = {k: f[k][d] for k in ("vol_60d", "size", "turnover_20d")}
        ok = cs & np.isfinite(y)
        for v in core.values():
            ok &= np.isfinite(v)
        idx = np.flatnonzero(ok)
        if len(idx) < 30:
            continue
        ev = np.isin(idx, list(evj)).astype(float)
        if ev.sum() == 0:
            continue
        cols = [np.ones(len(idx)), ev]
        for k, dirn in (("rev_1m", 1), ("max_ret_21d", -1), ("dd_60", 1), ("peak_fall", 1)):
            v = f[k][d]
            cols.append(np.nan_to_num(v[idx]))
            cols.append(select_top(np.where(ok, v * dirn, np.nan), D.keys, top_q=0.2)[idx].astype(float))
        for k in ("vol_60d", "size", "turnover_20d"):
            cols.append(core[k][idx])
        for bname in boards[1:]:
            cols.append((D.board[idx] == bname).astype(float))
        X = np.column_stack(cols)
        keep = np.r_[True, True, X[:, 2:].std(0) > 0]
        beta = np.linalg.lstsq(X[:, keep], y[idx], rcond=None)[0]
        gam.append(beta[1])
    g = np.array(gam)
    t = nw_t(g, 12) if len(g) >= 3 else float("nan")
    return {"gamma_mean": fnum(g.mean()) if len(g) else None, "gamma_nw_t": fnum(t), "n_weeks": int(len(g)),
            "gamma_negative_t_le_-2": bool(len(g) and g.mean() < 0 and math.isfinite(t) and t <= -2)}


# =============================================================== 分级
def grade(inf, S1, S2, S3, S5, conc, diag_nonneg):
    m = inf["mean_x60"]
    if m is None or m >= 0 or not S1["pass"] or not S2["pass"]:
        return "不支持"
    g = "支持" if (S3["pass"] and S5["pass"]) else "部分成立"
    if g == "支持" and (conc["gt_50pct"] or diag_nonneg):
        g = "部分成立"
    return g


def combine_c2(g_lo, g_hi):
    if g_lo == "支持" and g_hi == "支持":
        return "支持"
    if g_lo == "不支持" and g_hi == "不支持":
        return "不支持"
    return "部分成立"


def holm(pd_: dict) -> dict:
    items = sorted(pd_.items(), key=lambda kv: kv[1])
    out, run, m = {}, 0.0, len(items)
    for k, (name, p) in enumerate(items):
        run = max(run, min(1.0, (m - k) * p))
        out[name] = run
    return out


# =============================================================== 层
def delist_within(D, e, H=60):
    dl = D.delist_date[e["j"]]
    if pd.isna(dl):
        return False
    return bool(D.dates[e["s"]] < pd.Timestamp(dl) <= D.dates[min(e["s"] + H, D.n - 1)])


def eval_candidate(D, name, evs, eng, full_r, H):
    log(f"  {name}: n={len(evs)}")
    inf, _, _ = inference(D, evs)
    S1, S2 = gate_S1(inf), gate_S2(D, evs)
    e1, e2 = window_keys(D, [e["j"] for e in evs], [e["s"] for e in evs], H)
    avoid_r = eng.path(e1, e2)
    cmp_ = pool_compare(full_r, avoid_r)
    plc = placebo(D, evs, eng, H)
    S3 = gate_S3(cmp_, plc)
    S5 = gate_S5(D, evs, H)
    conc = concentration(D, evs)
    dinf, _, _ = inference(D, evs, tag="diag", boot=False)
    diag_nonneg = bool(dinf["mean_x60"] is not None and dinf["mean_x60"] >= 0)
    dl = [delist_within(D, e, H) for e in evs]
    rest = [e for e, h in zip(evs, dl) if not h]
    used = [e for e in evs if e.get("path_main") is not None]
    return {
        "inference": inf, "S1": S1, "S2": S2, "S3": S3, "S5": S5,
        "gates": {"excess_nonneg": bool(inf["mean_x60"] is None or inf["mean_x60"] >= 0),
                  "concentration_year_gt_50pct": conc["gt_50pct"], "diag_crash_no_bounce_excess_nonneg": diag_nonneg},
        "grade": grade(inf, S1, S2, S3, S5, conc, diag_nonneg),
        "diagnostics": {"n_events": len(evs), "n_events_used": len(used),
                        "n_events_no_control": sum(1 for e in evs if not len(e["ctrl"])),
                        "n_events_ctrl_vol_relaxed": sum(1 for e in evs if e.get("ctrl_relaxed")),
                        "n_signal_months": len({e["month"] for e in evs}),
                        "max_year_share": conc["max_year_share"], "max_share_year": conc["max_share_year"],
                        "year_sums": conc["year_sums"],
                        "diag_crash_no_bounce": {"mean_x60": dinf["mean_x60"], "nw_t": dinf["nw_t"],
                                                 "n_events": sum(1 for e in evs if e.get("path_diag") is not None),
                                                 "n_days": dinf["n_days"]},
                        "delist_within_60": {"n": int(sum(dl)), "share": (sum(dl) / len(evs)) if evs else None,
                                             "mean_x60_excluding": mean_x60(D, rest) if rest else None}},
        "_avoid_r": avoid_r, "_keys": (e1, e2), "_cmp": cmp_,
    }


def report_block(D, name, evs, B, eng, eng_ew, eng_m, full_r, full_ew, full_m, H):
    e1, e2 = B["_keys"]
    rep = {"pool_mcap": B["_cmp"]}
    rep["pool_mcap_net_prop_cost"] = pool_compare(full_r, eng.net(e1, e2, B["_avoid_r"]))
    rep["pool_ew"] = pool_compare(full_ew, eng_ew.path(e1, e2))
    rep["pool_Bc_cash"] = pool_compare(full_r, eng.cash(e2))
    rep["pool_Bc_cash"]["note"] = "现金路径：危机后等价于市场择时（L-047 同类），不能作为回避选股有效的证据"
    for e in evs:
        e["path_m100"] = seg_path(D, e, e["ctrl"], H, m100=True)
    im, _, _ = inference(D, evs, tag="m100", boot=False)
    rep["delist_m100_upper"] = {"event_mean_x60": im["mean_x60"], "event_nw_t": im["nw_t"],
                                "pool_mcap": pool_compare(full_m, eng_m.path(e1, e2)),
                                "note": "退市补 −100%：对回避有利的上界"}

    def breach(e, who):
        s = e["s"]
        end = event_end(D, e, H)
        if end <= s:
            return None
        if who == "event":
            seg = D.close[s + 1:end + 1, e["j"]]
            return float(np.nanmin(seg) < e["roll_min"]) if np.isfinite(seg).any() else None
        ctrl = e["ctrl"] if who == "ctrl" else e["diag"]
        if not len(ctrl):
            return None
        with np.errstate(all="ignore"):
            import warnings
            with warnings.catch_warnings():
                warnings.simplefilter("ignore")
                lows = np.nanmin(D.close[e["ce"]:s + 1][:, ctrl], axis=0)
                fut = np.nanmin(D.close[s + 1:end + 1][:, ctrl], axis=0)
        ok = np.isfinite(lows) & np.isfinite(fut)
        return float(np.mean(fut[ok] < lows[ok])) if ok.any() else None
    br = {}
    for who in ("event", "ctrl", "diag"):
        vals = [v for v in (breach(e, who) for e in evs) if v is not None]
        br[who] = float(np.mean(vals)) if vals else None
    br["note"] = "s+1…终止日收盘跌破反弹前低点（[crash_end, s] 最低收盘）；对照按各自同区间最低收盘"
    rep["breach_trough_rate"] = br

    def vm(r):
        nav = np.cumprod(1 + r)
        return float(np.std(r, ddof=1) * math.sqrt(252)), float(min(0.0, (nav / np.maximum.accumulate(nav) - 1).min()))
    ev_, ct_ = [], []
    for e in evs:
        p = e.get("path_main")
        if p is None or len(p[2]) < 3:
            continue
        ev_.append(vm(p[2]))
        ct_.append(vm(p[3]))
    rep["event_vol_mdd_vs_control"] = {
        "event_vol": float(np.mean([a for a, _ in ev_])) if ev_ else None,
        "control_vol": float(np.mean([a for a, _ in ct_])) if ct_ else None,
        "event_mdd": float(np.mean([b for _, b in ev_])) if ev_ else None,
        "control_mdd": float(np.mean([b for _, b in ct_])) if ct_ else None, "n": len(ev_),
        "note": "按段收益（停牌段合并）计；对照 = 主对照等权段收益"}
    if name == "C1":
        rep["c2_full_window"] = None
    else:
        key = "c2f_lo" if name == "C2_lo" else "c2f_hi"
        sub = [e for e in D.layer_events if e[key]]
        inf_, _, _ = inference(D, sub, boot=False)
        rep["c2_full_window"] = {"n_events": len(sub), "mean_x60": inf_["mean_x60"], "nw_t": inf_["nw_t"]}
    sw = [e for e in evs if D.listed_now[e["j"]]]
    for e in sw:
        e["path_sw"] = seg_path(D, e, e["ctrl_sw"], H)
    isw, _, _ = inference(D, sw, tag="sw", boot=False)
    rep["sw_industry_subsample"] = {"n_events": len(sw), "n_used": sum(1 for e in sw if e["path_sw"] is not None),
                                    "mean_x60": isw["mean_x60"], "nw_t": isw["nw_t"],
                                    "note": "点时行业代替板块；仅最终 status=listed 的事件（幸存者偏差）"}
    seg = {}
    cuts = [pd.Timestamp(START)] + [pd.Timestamp(c) for c in REGIME_CUTS] + [pd.Timestamp("2100-01-01")]
    idx = eng.index
    for a, b in zip(cuts[:-1], cuts[1:]):
        sub = [e for e in evs if a <= D.dates[e["s"]] < b]
        rr = np.asarray((idx >= a) & (idx < b))
        if not sub and rr.sum() == 0:
            continue
        item = {"n_events": len(sub), "mean_x60": mean_x60(D, sub) if sub else None}
        if rr.sum() > 5:
            item["pool_mcap"] = pool_compare(full_r[rr], B["_avoid_r"][rr])
        seg[f"{a.date()}~{(b - pd.Timedelta(days=1)).date()}"] = item
    rep["regime_segments"] = seg
    sp = {}
    for part in ("explore70", "validate30"):
        sub = [e for e in evs if (code_bucket(e["code"]) < 0.7) == (part == "explore70")]
        inf_, _, _ = inference(D, sub, boot=False)
        sp[part] = {"n_events": len(sub), "mean_x60": inf_["mean_x60"], "nw_t": inf_["nw_t"]}
    a_, b_ = sp["explore70"]["mean_x60"], sp["validate30"]["mean_x60"]
    sp["same_sign"] = bool(a_ is not None and b_ is not None and (a_ < 0) == (b_ < 0))
    rep["split_70_30"] = sp
    return rep


def public(b, g=None):
    return {"inference": b["inference"], "S1": b["S1"], "S2": b["S2"], "S3": b["S3"], "S4": b["S4"], "S5": b["S5"],
            "gates": dict(b["gates"]), "grade": g or b["grade"], "diagnostics": dict(b["diagnostics"])}


def eval_layer(D, layer, events_layer, H, ep_full):
    log(f"layer {layer}: {len(events_layer)}")
    D.layer_events = events_layer
    lo, hi = layer_rows(D, layer)
    eng = Engine(D, lo, hi)
    full_r = eng.full()
    sets = {"C1": events_layer, "C2_lo": [e for e in events_layer if e["C2_lo"]],
            "C2_hi": [e for e in events_layer if e["C2_hi"]]}
    B = {k: eval_candidate(D, k, v, eng, full_r, H) for k, v in sets.items()}

    c1m = {lab: mean_x60(D, [e for e in events_layer if not e[f"C2_{lab}"]]) for lab in ("lo", "hi")}
    c1m_ok = all(v is not None and v <= 0 for v in c1m.values())
    g_c1 = B["C1"]["grade"]
    if g_c1 == "支持" and not c1m_ok:
        g_c1 = "部分成立"
    g_c2 = combine_c2(B["C2_lo"]["grade"], B["C2_hi"]["grade"])

    log(f"  spanning {layer}")
    fv = {nm: (D.f[nm], get_factor(nm).direction) for nm in
          ("rev_1m", "max_ret_21d", "dd_60", "peak_fall", "vol_60d", "size", "turnover_20d", "mom_12_1")}
    fv["cn_ep_ttm"] = (ep_full, 1)
    fr = factor_returns(D, eng, fv)
    cov = [float(np.isfinite(ep_full[i][D.uni[i]]).mean()) for i in D.me_idx if lo <= i <= hi and D.uni[i].any()]
    for k in CANDS:
        B[k]["S4"] = {"detail": {"portfolio_spanning": spanning_portfolio(eng, B[k]["_avoid_r"] - full_r, fr),
                                 "event_fama_macbeth": fama_macbeth(D, sets[k], lo, hi, H),
                                 "factor_coverage": {"cn_ep_ttm_mean_pool_coverage": float(np.mean(cov)) if cov else None}},
                      "note": "只报告：y = 回避毛路径 − 满仓；因子 = 月末前 20% − 满仓；NW(60)。FM 每周、NW(12)"}

    log(f"  report {layer}")
    eng_ew = Engine(D, lo, hi, weighting="equal")
    eng_m = Engine(D, lo, hi, delist_m100=True)
    full_ew, full_m = eng_ew.full(), eng_m.full()
    report = {k: report_block(D, k, sets[k], B[k], eng, eng_ew, eng_m, full_r, full_ew, full_m, H) for k in CANDS}
    del eng_ew, eng_m

    c1 = public(B["C1"], g_c1)
    c1["gates"]["c1_minus_c2_excess_le_0"] = bool(c1m_ok)
    c1["diagnostics"]["c1_minus_c2"] = c1m
    c2 = public(B["C2_lo"], g_c2)
    c2["gates"]["c1_minus_c2_excess_le_0"] = None
    c2["bound_lo"], c2["bound_hi"] = public(B["C2_lo"]), public(B["C2_hi"])
    for bb in ("bound_lo", "bound_hi"):
        c2[bb]["gates"]["c1_minus_c2_excess_le_0"] = None
    c2["both_bounds_support"] = bool(B["C2_lo"]["grade"] == "支持" and B["C2_hi"]["grade"] == "支持")
    p1 = B["C1"]["inference"]["nw_p_onesided"]
    hl = holm({"C1": p1, "C2": B["C2_lo"]["inference"]["nw_p_onesided"]})
    hh = holm({"C1": p1, "C2": B["C2_hi"]["inference"]["nw_p_onesided"]})
    hol = {"C1|lo": hl["C1"], "C2|lo": hl["C2"], "C1|hi": hh["C1"], "C2|hi": hh["C2"]}

    dates_l = [D.dates[e["s"]] for e in events_layer]
    months = {e["month"] for e in events_layer}
    meta = {"n_events_C1": len(events_layer), "n_signal_months_C1": len(months),
            "n_events_C2_lo": len(sets["C2_lo"]), "n_events_C2_hi": len(sets["C2_hi"]),
            "n_signal_months_C2_lo": len({e["month"] for e in sets["C2_lo"]}),
            "n_signal_months_C2_hi": len({e["month"] for e in sets["C2_hi"]}),
            "date_start": "2005-01-01" if layer == "explore" else "2015-01-01",
            "date_end": "2014-12-31" if layer == "explore" else "2023-10-31",
            "signal_first": str(min(dates_l).date()) if dates_l else None,
            "signal_last": str(max(dates_l).date()) if dates_l else None,
            "explore_cross_2015_n": sum(1 for e in events_layer if e["cross_2015"]) if layer == "explore" else None,
            "pool_days": [str(eng.index[0].date()), str(eng.index[-1].date()), int(len(eng.index))],
            "mde_monthly_power50": 1.645 * 0.08 / math.sqrt(len(months)) if months else None,
            "mde_monthly_power80": (1.645 + 0.842) * 0.08 / math.sqrt(len(months)) if months else None}
    grades = {"C1": g_c1, "C2": g_c2, "C2_lo": B["C2_lo"]["grade"], "C2_hi": B["C2_hi"]["grade"]}
    return {"meta": meta, "C1": c1, "C2": c2, "holm": hol, "report": report}, grades


# =============================================================== 变体
def variant_rows(D, name, evs_all, H, cands=CANDS, extra=None):
    out = {}
    for layer in ("explore", "validate"):
        sub = [e for e in evs_all if e["layer"] == layer]
        for c in cands:
            ss = sub if c == "C1" else [e for e in sub if e[c]]
            for e in ss:
                e["path_var"] = seg_path(D, e, e["ctrl"], H)
            inf_, _, x = inference(D, ss, tag="var", boot=False)
            out[f"{name}|{layer}|{c}"] = {"n_events": len(ss), "n_signal_months": len({e["month"] for e in ss}),
                                          "mean_x60": inf_["mean_x60"], "nw_t": inf_["nw_t"],
                                          "mean_xH": float(x.mean() * H) if len(x) else None, "H": H, **(extra or {})}
    return out


def run_variant(D, name, P):
    evs, acc, skips = detect(D, P)
    assign_controls(D, evs, accepted_mask(D, acc))
    return variant_rows(D, name, evs, P["hold"]), skips


def run_hk():
    H = Data()
    fields = ["close_adj", "open_adj", "close", "volume", "amount", "mcap_float", "is_suspended"]
    panel = store.load_panel("hk", fields, start=START, end=END, raw=False)
    c = panel["close_adj"]
    H.dates, H.codes = c.index, c.columns
    for k in fields:
        panel[k] = panel[k].reindex(index=H.dates, columns=H.codes)
    H.n, H.m = c.shape
    H.sec = store.read_securities("hk")
    H.close = c.to_numpy(float)
    H.valid = np.isfinite(H.close) & (H.close > 0)
    oa = panel["open_adj"].to_numpy(float)
    H.open_adj = np.where(H.valid & np.isfinite(oa) & (oa > 0), oa, np.nan)
    z = np.zeros((H.n, H.m), bool)
    H.oneword = H.limit_down = H.nli = z
    s_ = pd.Series(np.arange(H.n), index=H.dates)
    me = s_.groupby([H.dates.year, H.dates.month]).max().to_numpy()
    uni = build_universe(panel, H.dates[me], "hk", securities=H.sec, spec=UniverseSpec())
    H.uni = uni.reindex(H.dates).ffill().fillna(False).infer_objects().astype(bool).to_numpy(bool)
    H.mcap = panel["mcap_float"].to_numpy(float)
    H.f = {nm: get_factor(nm)(panel, H.dates).reindex(columns=H.codes).to_numpy(float) for nm in ("vol_60d", "dd_60", "rev_1m")}
    H.recent_crash = recent_crash(H.close, H.valid)
    H.delist_iv, H.term, H.ann = {}, {}, {}
    H.delisted_codes = set()
    secu = H.sec.drop_duplicates("code").set_index("code")
    H.board = secu["board"].reindex(H.codes).fillna("unknown").astype(str).to_numpy()
    H.industry = None
    H.keys = tie_keys(H.codes)
    H.delist_row = np.full(H.m, -1)
    evs, acc, skips = detect(H, BASE)
    assign_controls(H, evs, accepted_mask(H, acc))
    out = variant_rows(H, "hk_large", evs, BASE["hold"], cands=("C1",),
                       extra={"note": "港股只报告、不能否决；证券表无退市股（偏向反转，等级 B）"})
    out["hk_large|skips"] = skips
    return out


# =============================================================== 主流程
def main():
    global N_PLACEBO, N_BOOT, OUT, EVENTS_CSV, TRIALS
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true", help="调试：安慰剂 20 次、自助 200 次、不跑变体")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    if args.quick:
        N_PLACEBO, N_BOOT = 20, 200
    if args.out:
        OUT = Path(args.out)
        EVENTS_CSV, TRIALS = OUT.with_suffix(".events.csv"), OUT.with_suffix(".trials.jsonl")

    inputs = {}
    for f, exp in EXPECTED_SHA.items():
        h = sha256(store.market_dir("cn") / f)
        inputs[f] = h
        if h != exp:
            raise SystemExit(f"SHA 不一致 {f}: {h} ≠ {exp}（停止，问 manager）")
    log("sha ok")
    D = load_data()
    H = BASE["hold"]
    events, acc, skips = detect(D, BASE)
    ev_alt, _, skips_alt = detect(D, BASE, count_prelisting=True)
    same_alt = sorted((e["code"], e["s"]) for e in ev_alt) == sorted((e["code"], e["s"]) for e in events)
    log(f"events={len(events)} skips={skips} alt_same={same_alt}")
    assign_controls(D, events, accepted_mask(D, acc))
    paths(D, events, H)
    paths(D, events, H, key="diag", tag="diag")
    ep_full = ep_monthly(D)

    layers, grades = {}, {}
    for layer in ("explore", "validate"):
        layers[layer], grades[layer] = eval_layer(D, layer, [e for e in events if e["layer"] == layer], H, ep_full)

    variants, var_skips = {}, {}
    if not args.quick:
        specs = {"triple_limit_down": dict(BASE, mode="limit3"), "bounce_05": dict(BASE, bounce=0.05),
                 "bounce_15": dict(BASE, bounce=0.15), "cooldown_60": dict(BASE, cooldown=60),
                 "cooldown_180": dict(BASE, cooldown=180)}
        for nm, P in specs.items():
            log(f"variant {nm}")
            o, sk = run_variant(D, nm, P)
            variants.update(o)
            var_skips[nm] = sk
        for Hh in (20, 120):
            log(f"variant avoid_window_{Hh}")
            variants.update(variant_rows(D, f"avoid_window_{Hh}", events, Hh))
        log("variant hk_large")
        try:
            variants.update(run_hk())
        except Exception as ex:  # 只报告
            variants["hk_large|error"] = {"error": repr(ex)}

    promote = {c: grades["explore"][c] == "支持" and grades["validate"][c] == "支持" for c in ("C1", "C2")}
    v1 = layers["validate"]["C1"]
    d3 = v1["S3"]["detail"]
    m = v1["inference"]["mean_x60"]
    headline = {"layer": "validate", "candidate": "C1", "pool_vol_full": d3["vol_full"], "pool_vol_avoid": d3["vol_avoid"],
                "pool_mdd_full": d3["mdd_full"], "pool_mdd_avoid": d3["mdd_avoid"],
                "event_excess_sign": "na" if m is None else ("negative" if m < 0 else "non_negative"),
                "placebo_vol_ratio_percentile": d3["placebo_percentile"]}
    summary = (f"同等仓位下（全 A 底池、市值加权毛收益路径、验证层），剔除暴跌后反弹（C1）年化波动 {d3['vol_avoid']:.4f} "
               f"vs 满仓 {d3['vol_full']:.4f}，最大回撤 {d3['mdd_avoid']:.4f} vs {d3['mdd_full']:.4f}；事件超额 mean_x60 = "
               f"{m:.4f}（{headline['event_excess_sign']}）；相对低波安慰剂的波动比分位 {d3['placebo_percentile']:.3f}。"
               f"分级：探索 C1={grades['explore']['C1']}、C2={grades['explore']['C2']}；验证 C1={grades['validate']['C1']}、"
               f"C2={grades['validate']['C2']}。全 A 股票池结论，不等于 ETF / 综合策略持仓结论。")

    trials = []
    for L in ("explore", "validate"):
        for c in ("C1", "C2"):
            b = layers[L][c]
            trials.append({"ledger": "L-051", "impl": "replication", "variant": "main", "layer": L, "candidate": c,
                           "mean_x60": b["inference"]["mean_x60"], "nw_t": b["inference"]["nw_t"], "grade": b["grade"]})
    for k, v in variants.items():
        parts = k.split("|")
        if len(parts) == 3:
            trials.append({"ledger": "L-051", "impl": "replication", "variant": parts[0], "layer": parts[1],
                           "candidate": parts[2], **{kk: v.get(kk) for kk in ("n_events", "n_signal_months", "mean_x60", "nw_t")}})
    TRIALS.write_text("".join(json.dumps(t, ensure_ascii=False, default=fnum) + "\n" for t in trials), encoding="utf-8")
    n_eff = len({(t["variant"], t["candidate"]) for t in trials})

    rows = []
    for e in events:
        rows.append({"code": e["code"], "crash_start": str(D.dates[e["cs"]].date()), "crash_end": str(D.dates[e["ce"]].date()),
                     "trough": str(D.dates[e["trough"]].date()), "signal": str(D.dates[e["s"]].date()), "layer": e["layer"],
                     "cross_2015": e["cross_2015"], "c2_obs": e["c2_obs"], "c2_lo": e["C2_lo"], "c2_hi": e["C2_hi"],
                     "delisted_stock": e["delisted_stock"], "end": str(D.dates[event_end(D, e, H)].date()),
                     "n_ctrl": len(e["ctrl"]), "ctrl_relaxed": e["ctrl_relaxed"], "n_diag": len(e["diag"]),
                     "excess": excess(e), "cost_roundtrip": event_cost(D, e, H)[0] if e["layer"] != "validate_truncated" else None,
                     "crash_ret": e["crash_ret"], "bounce": e["bounce"]})
    pd.DataFrame(rows).to_csv(EVENTS_CSV, index=False, float_format="%.12g")

    lc = Counter(e["layer"] for e in events)
    results = {
        "meta": {"ledger": "L-051", "preregCommit": PREREG_COMMIT, "preregPath": PREREG_PATH, "clarifyPath": CLARIFY_PATH,
                 "impl": "replication-python-claude", "seed": SEED, "quick": bool(args.quick), "managerRulings": RULINGS,
                 "notes": ["独立第二实现；不读 run_main.py；口径 = PREREG > CLARIFY-1 > schema conventions；见 replication/CROSSCHECK.md",
                           "收益 / 波动 / 回撤为小数；夏普 rf = 0；p 单边（H1：超额 < 0）",
                           "未 unseal；价格经 store 默认截断；fin_pit 只经 load_fin_pit()",
                           "事件清单：replication/events.csv"]},
        "inputs": inputs,
        "counts": {"layers": {k: int(lc.get(k, 0)) for k in ("explore", "validate", "validate_truncated")},
                   "skips": skips, "count_h2_filtered_reference": COUNT_REF,
                   "alt_prelisting_counted_as_suspension": {"n_events": len(ev_alt), "skips": skips_alt,
                                                            "same_event_list": same_alt},
                   "terminate_events_in_st_pit": D.n_term_events, "variant_skips": var_skips},
        "headline": headline,
        "layers": layers,
        "variants": variants,
        "trials": {"logPath": "docs/research/dead-cat-bounce-2026-11-28/replication/trials.jsonl",
                   "n_recorded": len(trials), "n_effective": n_eff},
        "verdict": {"C1": {"explore": grades["explore"]["C1"], "validate": grades["validate"]["C1"], "eligible": promote["C1"]},
                    "C2": {"explore": grades["explore"]["C2"], "validate": grades["validate"]["C2"], "eligible": promote["C2"],
                           "bounds": {L: {"lo": grades[L]["C2_lo"], "hi": grades[L]["C2_hi"]} for L in grades}},
                    "promote_eligible": promote, "summary": summary},
    }

    def clean(o):
        if isinstance(o, dict):
            return {str(k): clean(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)):
            return [clean(v) for v in o]
        if isinstance(o, np.ndarray):
            return [clean(v) for v in o.tolist()]
        if isinstance(o, (bool, np.bool_)):
            return bool(o)
        if isinstance(o, (int, np.integer)):
            return int(o)
        if isinstance(o, (float, np.floating)):
            return fnum(o)
        return o
    OUT.write_text(json.dumps(clean(results), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    log("wrote", OUT)
    log("VERDICT", json.dumps(results["verdict"], ensure_ascii=False))


if __name__ == "__main__":
    main()
