#!/usr/bin/env python3
"""L-051 主实现（PREREG 冻结 be7deaa4 + CLARIFY-1.md）。探索层 + 验证层；不读锁箱、不做锁箱确认。

用法：cd research-py && uv run python ../docs/research/dead-cat-bounce-2026-11-28/run_main.py [--quick]
输出（本目录）：results.json、events.csv、trials.jsonl、RESULTS.md

口径全部写在 results.schema.json 的 conventions 段；与 PREREG / CLARIFY-1 冲突时以后两者为准。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(ROOT / "research-py"))

PREREG_COMMIT = "be7deaa4"
SEED = 20261128
START, END = "2005-01-01", "2023-10-31"
LOCKBOX_START = pd.Timestamp("2023-11-01")
EXPLORE_END = pd.Timestamp("2014-12-31")
VALID_START = pd.Timestamp("2015-01-01")
VALID_END = pd.Timestamp("2023-10-31")
HOLD = 60
COOLDOWN = 120
CRASH_DAYS = 10
CRASH_RET = -0.25
BOUNCE = 0.10
BOUNCE_WINDOW = 20
LONG_SUSP = 60
CTRL_MIN = 10
RECENT_CRASH_LOOKBACK = 30
CAPITAL = 1e8
NW_LAG = 60
BOOT_BLOCK = 63
BOOT_N = 10000
PLACEBO_N = 1000
REGIME_DATES = ["2019-07-22", "2020-08-24", "2023-04-10", "2026-07-06"]
EXPECTED_SHA = {
    "prices.parquet": "dd61e3085b6346180b3427ffe27ff18bdfc36980a22216f70baaa2bf059bbd3e",
    "fin_pit.parquet": "da32cbced36ba631453e4959f627d8a5abfeadc530f72f0485ca30b6c380c6df",
    "securities.parquet": "398590347a823de1a6dcf7a7b3b8d1ed61cc6cfda1d368181e3b59cc8562271d",
    "st_pit.parquet": "4981bdcb711d6e04620e7101cd140be9768ecd166ffcdda07110239e840a2a0a",
}
MANAGER_RULINGS = [
    "CLARIFY-1 第一批 1：探索变体只报主推断均值、NW t、事件数、信号月数",
    "CLARIFY-1 第一批 2：价值因子 = 注册 cn_ep_ttm（compute_strict，fin 点时、可见上界 2023-11-01），缺财报即缺失，报告覆盖率",
    "CLARIFY-1 第一批 3：低波安慰剂按事件逐个配对，s 日同板块×市值三档×vol 三档、s+1 不在任何回避窗中，1000 次，种子 20261128",
    "CLARIFY-1 第二批 1：S3 组合路径（前收流通市值权重、成员=严格早于当日的最近月末池、s+1 开盘卖 s+61 开盘买回、两步归一、毛收益；成本只进 S5；rf=0）",
    "CLARIFY-1 第二批 2：暴跌未反弹对照按字面（同日同板块同市值三档、dd_60 与 rev_1m 同五分位、剔除 [s−60,s] 有信号者）",
    "CLARIFY-1 第二批 3：分档用 quantile_labels，在 s 日全底池切再与板块求交",
    "CLARIFY-1 第二批 4：S2 与集中度在日历时间序列上算",
    "CLARIFY-1 第二批 5：C2 合并分级（都支持→支持；都不支持→不支持；其余部分成立），C1∖C2 上下界都须 ≤0",
    "CLARIFY-1 第二批 6：块自助对去均值序列，p=(1+#{boot≤obs})/(N+1)",
    "CLARIFY-1 第二批 7：长停牌只从首个有效行情日起计；终止上市子条款空操作，另报 s 后 60 日内退市诊断",
]


# ============================================================ 通用统计
def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 22), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_inputs() -> dict:
    d = ROOT / "research-py/factor-data/cn"
    out = {}
    for name, exp in EXPECTED_SHA.items():
        h = sha256(d / name)
        if h != exp:
            raise SystemExit(f"SHA mismatch {name}: got {h} expected {exp}")
        out[name] = h
    return out


def norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def nw_mean(x: np.ndarray, lag: int = NW_LAG):
    """均值的 Newey–West（Bartlett 权 1−L/(lag+1)，自协方差除以 n）t；单边 p = Φ(t)（H1：均值 < 0）。"""
    x = np.asarray(x, float)
    n = len(x)
    if n < 3:
        return float("nan"), float("nan"), float("nan")
    mu = float(x.mean())
    xc = x - mu
    var = float(xc @ xc) / n
    for L in range(1, min(lag, n - 1) + 1):
        var += 2.0 * (1.0 - L / (lag + 1.0)) * float(xc[L:] @ xc[:-L]) / n
    se = math.sqrt(max(var, 0.0) / n)
    if se <= 0:
        return mu, float("nan"), float("nan")
    t = mu / se
    return mu, t, norm_cdf(t)


def block_bootstrap_p(x: np.ndarray, block: int = BOOT_BLOCK, n_boot: int = BOOT_N, seed: int = SEED) -> float:
    """去均值序列的循环块自助：p = (1 + #{boot 均值 ≤ 观测均值}) / (N + 1)。
    每次：starts = rng.integers(0, n, size=ceil(n/block))，拼接循环块取前 n 个。"""
    x = np.asarray(x, float)
    n = len(x)
    if n < 2:
        return float("nan")
    mu = x.mean()
    xc = x - mu
    rng = np.random.default_rng(seed)
    nb = int(math.ceil(n / block))
    off = np.arange(block)
    cnt = 0
    for _ in range(n_boot):
        starts = rng.integers(0, n, size=nb)
        idx = ((starts[:, None] + off[None, :]) % n).ravel()[:n]
        if xc[idx].mean() <= mu:
            cnt += 1
    return (1 + cnt) / (n_boot + 1)


def holm(pvals: dict) -> dict:
    items = sorted(((k, v) for k, v in pvals.items() if v is not None and np.isfinite(v)), key=lambda kv: kv[1])
    m = len(items)
    out = {k: None for k in pvals}
    run = 0.0
    for i, (k, p) in enumerate(items):
        run = max(run, min(1.0, (m - i) * p))
        out[k] = run
    return out


def perf(r: np.ndarray) -> dict:
    """年化波动（ddof=1，×√252）、最大回撤、夏普（rf=0）。r 为按日收益（无 NaN）。"""
    r = np.asarray(r, float)
    if len(r) < 2:
        return {"vol": float("nan"), "mdd": float("nan"), "sharpe": float("nan"), "n_days": int(len(r))}
    sd = r.std(ddof=1)
    nav = np.cumprod(1.0 + r)
    return {"vol": float(sd * math.sqrt(252)),
            "mdd": float((nav / np.maximum.accumulate(nav) - 1.0).min()),
            "sharpe": float(r.mean() / sd * math.sqrt(252)) if sd > 0 else float("nan"),
            "ann_ret": float(nav[-1] ** (252 / len(r)) - 1.0),
            "n_days": int(len(r))}


def fnum(x):
    if x is None:
        return None
    if isinstance(x, (bool, np.bool_)):
        return bool(x)
    if isinstance(x, (int, np.integer)):
        return int(x)
    x = float(x)
    return x if np.isfinite(x) else None


# ============================================================ 数据
class Data:
    pass


def load_data(market: str = "cn", quick: bool = False) -> Data:
    from factorlab import store
    from factorlab.universe import UniverseSpec, build_universe
    from factorlab.registry import FACTORS
    import factorlab.factors  # noqa: F401

    D = Data()
    D.market = market
    fields = ["close_adj", "open_adj", "open", "close", "amount", "volume", "turnover", "mcap_float",
              "mcap_total", "is_suspended", "limit_down"]
    if market == "cn":
        fields += ["limit_down_oneword", "no_limit_inferred", "is_st", "industry"]
    start = "2012-01-01" if quick else START
    print(f"[{market}] load panel…", flush=True)
    panel = store.load_panel(market, fields, start=start, end=END, raw=False)
    assert panel["close_adj"].index.max() < LOCKBOX_START
    sec = store.read_securities(market)
    D.panel, D.sec = panel, sec
    dates = panel["close_adj"].index
    codes = pd.Index([str(c) for c in panel["close_adj"].columns])
    D.dates, D.codes = dates, codes
    n, m = len(dates), len(codes)
    print(f"[{market}] days={n} codes={m}", flush=True)

    def arr(k, dtype=float):
        return panel[k].to_numpy(dtype)

    D.close = arr("close_adj")
    D.open = arr("open_adj")
    D.close_raw = arr("close")
    D.open_raw = arr("open")
    D.amount = arr("amount")
    D.valid = np.isfinite(D.close) & (D.close > 0)
    D.has_open = D.valid & np.isfinite(D.open) & (D.open > 0)

    def boolarr(k):
        if k not in panel:
            return np.zeros((n, m), dtype=bool)
        return panel[k].astype("boolean").fillna(False).to_numpy(bool)

    D.oneword = boolarr("limit_down_oneword")
    D.nli = boolarr("no_limit_inferred")
    D.limit_down = boolarr("limit_down")
    D.mcap = arr("mcap_float")
    D.mcap_ff = pd.DataFrame(D.mcap).ffill().to_numpy(float)
    D.close_ff = pd.DataFrame(D.close).ffill().to_numpy(float)
    if "industry" in panel:
        codes_ind, _ = pd.factorize(panel["industry"].to_numpy(object).ravel(), use_na_sentinel=True)
        D.ind_id = codes_ind.reshape(n, m)
    else:
        D.ind_id = np.full((n, m), -1)

    # 月末底池
    print(f"[{market}] universe…", flush=True)
    s = pd.Series(np.arange(n), index=dates)
    me_pos = s.groupby([dates.year, dates.month]).max().to_numpy()
    D.me_pos = me_pos
    uni_me = build_universe(panel, dates[me_pos], market, securities=sec, spec=UniverseSpec())
    U = uni_me.reindex(columns=panel["close_adj"].columns).to_numpy(bool)
    pos = np.arange(n)
    k_le = np.searchsorted(me_pos, pos, side="right") - 1
    k_lt = np.searchsorted(me_pos, pos, side="left") - 1
    D.U_le = np.where((k_le >= 0)[:, None], U[np.clip(k_le, 0, None)], False)   # s 日底池（最近月末 ≤ t）
    D.U_lt = np.where((k_lt >= 0)[:, None], U[np.clip(k_lt, 0, None)], False)   # 组合路径成员（最近月末 < t）
    D.U_me = U
    D.k_lt = k_lt

    secu = sec.drop_duplicates("code").assign(code=lambda x: x["code"].astype(str)).set_index("code")
    board = secu["board"].reindex(codes).astype(object).fillna("NA")
    bmap = {b: i for i, b in enumerate(sorted(board.unique()))}
    D.board_id = board.map(bmap).to_numpy(int)
    D.board_names = {i: b for b, i in bmap.items()}
    D.status = secu["status"].reindex(codes).astype(object).fillna("NA").to_numpy()
    D.delisted = D.status == "delisted"
    dl = pd.to_datetime(secu["delist_date"].reindex(codes))
    D.delist_date = dl.to_numpy()
    # 退市日 → 第一个 ≥ 退市日的交易日序号（无则 -1）
    dpos = np.full(m, -1)
    ok = ~pd.isna(dl).to_numpy()
    p = dates.searchsorted(dl[ok].to_numpy())
    dpos[np.flatnonzero(ok)] = np.where(p < n, p, -1)
    D.delist_pos = dpos
    D.tie = None

    # 日收益
    with np.errstate(divide="ignore", invalid="ignore"):
        prev_ok = np.vstack([np.zeros((1, m), bool), D.valid[:-1]])
        prevc = np.vstack([np.full((1, m), np.nan), D.close[:-1]])
        D.rc = np.where(D.valid & prev_ok, D.close / prevc, np.nan) - 1.0          # 收盘到收盘（两日都有行情）
        D.rin_open = np.where(D.has_open, D.close / D.open, np.nan) - 1.0          # 开盘到收盘
        cff_prev = np.vstack([np.full((1, m), np.nan), D.close_ff[:-1]])
        r_on = np.where(D.has_open, D.open / cff_prev - 1.0, np.where(D.valid, D.close / cff_prev - 1.0, 0.0))
        r_in = np.where(D.has_open, D.close / D.open - 1.0, 0.0)
        D.r_on = np.nan_to_num(r_on, nan=0.0, posinf=0.0, neginf=0.0)
        D.r_in = np.nan_to_num(r_in, nan=0.0, posinf=0.0, neginf=0.0)

    # 特征（注册因子定义）
    print(f"[{market}] features…", flush=True)
    feat = {}
    for name in ("vol_60d", "dd_60", "rev_1m", "max_ret_21d", "peak_fall", "turnover_20d", "size", "mom_12_1"):
        feat[name] = FACTORS[name](panel, dates).reindex(columns=panel["close_adj"].columns).to_numpy(float)
    D.feat = feat
    # 近 30 日内出现过 10 日跌幅 ≤ −25%
    with np.errstate(divide="ignore", invalid="ignore"):
        r10 = np.full((n, m), np.nan)
        ok10 = D.valid[CRASH_DAYS:] & D.valid[:-CRASH_DAYS]
        r10[CRASH_DAYS:] = np.where(ok10, D.close[CRASH_DAYS:] / D.close[:-CRASH_DAYS] - 1.0, np.nan)
    crash = (np.isfinite(r10) & (r10 <= CRASH_RET)).astype(np.int32)
    cs = np.vstack([np.zeros((1, m), np.int32), np.cumsum(crash, axis=0)])
    lo = np.clip(pos - (RECENT_CRASH_LOOKBACK - 1), 0, None)
    D.recent_crash = (cs[pos + 1] - cs[lo]) > 0
    # t 之前 20 日成交额中位数（AdvCache 口径）
    print(f"[{market}] adv…", flush=True)
    a = pd.DataFrame(D.amount).shift(1).rolling(20, min_periods=10).median().to_numpy(float)
    D.adv = a
    return D


def load_cn_extras(D: Data):
    from factorlab import store
    from factorlab.sources.cn_fin import load_fin_pit

    st = pd.read_parquet(store.market_dir("cn") / "st_pit.parquet")
    st["start_date"] = pd.to_datetime(st["start_date"])
    st["end_date"] = pd.to_datetime(st["end_date"])
    dmap = defaultdict(list)
    for r in st[st["flag"] == "delisting"].itertuples():
        dmap[str(r.code)].append((np.datetime64(r.start_date),
                                  np.datetime64(r.end_date) if pd.notna(r.end_date) else np.datetime64("2262-01-01")))
    D.delisting_iv = dmap
    term = st[st["event"].astype(str).str.contains("终止", na=False)]
    D.n_terminate_rows = int(len(term))
    fin = load_fin_pit("cn")  # 默认截掉 avail_date ≥ 2023-11-01
    assert fin["avail_date"].max() < LOCKBOX_START
    fin = fin[(fin["doc_type"] == "periodic") & fin["announce_rule"].isin(["declared", "declared_same_report"])
              & fin["announce_date"].notna()]
    fin = fin.assign(announce_date=pd.to_datetime(fin["announce_date"]))
    D.ann = {str(c): np.sort(g["announce_date"].drop_duplicates().to_numpy())
             for c, g in fin.groupby("code", sort=False)}


# ============================================================ 事件检测
def detect_events(D: Data, crash_ret=CRASH_RET, bounce=BOUNCE, cooldown=COOLDOWN, triple_limit=False):
    """PREREG 伪代码（count_h2.py 79–141 + v2 过滤）。返回 (events, all_signals, skips)。"""
    n, m = D.close.shape
    dates64 = D.dates.to_numpy()
    events, all_signals = [], defaultdict(list)
    skips = defaultdict(int)
    for j in range(m):
        v = D.valid[:, j]
        if not v.any():
            continue
        px = D.close[:, j]
        code = D.codes[j]
        # 长停牌复牌首日：首个有效行情日之后连续无行情 ≥ 60 行后的第一个有效日
        resump = np.zeros(n, dtype=bool)
        vi = np.flatnonzero(v)
        gaps = np.diff(vi) - 1
        resump[vi[1:][gaps >= LONG_SUSP]] = True
        rcs = np.concatenate([[0], np.cumsum(resump)])
        ncs = np.concatenate([[0], np.cumsum(D.nli[:, j])])
        ow = D.oneword[:, j]
        ld = D.limit_down[:, j]
        uni = D.U_le[:, j]
        iv = D.delisting_iv.get(code, []) if hasattr(D, "delisting_iv") else []
        last_signal = -10 ** 9
        i = CRASH_DAYS if not triple_limit else 2
        while i < n:
            if i - last_signal < cooldown:
                i += 1
                continue
            if triple_limit:
                if not (v[i] and v[i - 1] and v[i - 2] and ld[i] and ld[i - 1] and ld[i - 2]):
                    i += 1
                    continue
                crash_start, crash_end = i - 2, i
            else:
                if not v[i] or not v[i - CRASH_DAYS]:
                    i += 1
                    continue
                if px[i] / px[i - CRASH_DAYS] - 1.0 > crash_ret:
                    i += 1
                    continue
                crash_start, crash_end = i - CRASH_DAYS, i
            roll_min = px[crash_end]
            trough = crash_end
            signal = None
            for k in range(crash_end + 1, min(n, crash_end + BOUNCE_WINDOW + 1)):
                if not v[k]:
                    continue
                if px[k] < roll_min:
                    roll_min = px[k]
                    trough = k
                if px[k] >= roll_min * (1.0 + bounce):
                    if ow[k]:
                        skips["signal_oneword"] += 1
                        break
                    signal = k
                    break
            if signal is None:
                i += 1
                continue
            s = signal
            # 第 9 条
            excl = None
            if ncs[s + 1] - ncs[crash_start] > 0:
                excl = "no_limit_inferred"
            elif rcs[s + 1] - rcs[crash_start] > 0:
                excl = "long_suspend_resumption"
            else:
                sd = dates64[s]
                for a, b in iv:
                    if a <= sd <= b:
                        excl = "delisting"
                        break
            if excl is not None:
                skips[excl] += 1
                i += 1
                continue
            last_signal = s
            all_signals[j].append(s)
            if not uni[s]:
                skips["not_in_universe_on_s"] += 1
                i = s + 1
                continue
            events.append(dict(j=j, code=code, crash_start=crash_start, crash_end=crash_end, trough=trough,
                               roll_min=float(roll_min), s=s))
            i = s + 1
    # 层与 C2 标注
    for e in events:
        s = e["s"]
        sd = D.dates[s]
        if sd <= EXPLORE_END:
            e["layer"] = "explore"
            e["cross_2015"] = bool(s + HOLD < n and D.dates[s + HOLD] >= VALID_START)
        elif sd >= VALID_START and s + HOLD < n and D.dates[s + HOLD] <= VALID_END:
            e["layer"], e["cross_2015"] = "validate", False
        elif sd >= VALID_START:
            e["layer"], e["cross_2015"] = "validate_truncated", False
        else:
            e["layer"], e["cross_2015"] = "other", False
        e["is_delisted"] = bool(D.delisted[e["j"]])
        anns = getattr(D, "ann", {}).get(e["code"])
        has, has_full = False, False
        if anns is not None and len(anns):
            t0 = np.datetime64(D.dates[e["crash_start"]])
            a = np.searchsorted(anns, t0, side="left")
            has = np.searchsorted(anns, np.datetime64(D.dates[e["crash_end"]]), side="right") > a
            has_full = np.searchsorted(anns, np.datetime64(sd), side="right") > a
        e["c2_raw"], e["c2full_raw"] = bool(has), bool(has_full)
        e["c2_lo"] = False if e["is_delisted"] else bool(has)
        e["c2_hi"] = True if e["is_delisted"] else bool(has)
        e["c2full_lo"] = False if e["is_delisted"] else bool(has_full)
        e["c2full_hi"] = True if e["is_delisted"] else bool(has_full)
        dp = D.delist_pos[e["j"]]
        e["delist_within_60"] = bool(D.delisted[e["j"]] and not pd.isna(D.delist_date[e["j"]])
                                     and np.datetime64(sd) < D.delist_date[e["j"]]
                                     and (s + HOLD >= n or D.delist_date[e["j"]] <= np.datetime64(D.dates[s + HOLD])))
        e["delist_pos"] = int(dp)
    events.sort(key=lambda e: (e["s"], e["code"]))
    return events, all_signals, dict(skips)


# ============================================================ 对照
_label_cache: dict = {}


def day_labels(D: Data, s: int):
    """s 日全底池（U_le ∩ 有效收盘）上的 市值三档 / vol 三档 / dd_60 五档 / rev_1m 五档（quantile_labels）。"""
    key = (id(D), s)
    if key in _label_cache:
        return _label_cache[key]
    from factorlab.backtest import quantile_labels, tie_keys
    if D.tie is None:
        D.tie = tie_keys(D.codes)
    pool = D.U_le[s] & D.valid[s]

    def lab(x, q):
        vals = np.where(pool, x, np.nan)
        return quantile_labels(vals, D.tie, q)

    out = dict(pool=pool, mc=lab(D.mcap[s], 3), vol=lab(D.feat["vol_60d"][s], 3),
               dd=lab(D.feat["dd_60"][s], 5), rev=lab(D.feat["rev_1m"][s], 5))
    _label_cache[key] = out
    return out


def assign_controls(D: Data, events, all_signals, by_industry: bool = False):
    """主对照：同日、同板块（或申万行业）、同市值三档、同 vol 三档；排除近 30 日暴跌者与事件股本身；
    < 10 只时只放宽 vol（板块 × 市值）；仍为 0 只则该事件无对照（不进主推断）。另配「暴跌未反弹」诊断对照。"""
    n, m = D.close.shape
    sig_recent = np.zeros(0)
    # [s−60, s] 内有反弹信号（全市场检测、第 9 条后、不论底池）
    sig_mat = defaultdict(list)
    for j, ss in all_signals.items():
        for s in ss:
            sig_mat[j].append(s)
    sig_j = np.array([j for j, ss in sig_mat.items() for _ in ss], dtype=int)
    sig_s = np.array([s for j, ss in sig_mat.items() for s in ss], dtype=int)
    order = np.argsort(sig_s, kind="stable")
    sig_j, sig_s = sig_j[order], sig_s[order]
    for e in events:
        s, j = e["s"], e["j"]
        L = day_labels(D, s)
        pool = L["pool"]
        if by_industry:
            ind = D.ind_id[s]
            same = (ind == ind[j]) if ind[j] >= 0 else np.zeros(m, bool)
        else:
            same = D.board_id == D.board_id[j]
        base = pool & same & ~D.recent_crash[s]
        base[j] = False
        mc_j, vol_j = L["mc"][j], L["vol"][j]
        if np.isfinite(mc_j) and np.isfinite(vol_j):
            idx = np.flatnonzero(base & (L["mc"] == mc_j) & (L["vol"] == vol_j))
        else:
            idx = np.array([], dtype=int)
        relaxed = False
        if len(idx) < CTRL_MIN:
            relaxed = True
            idx = np.flatnonzero(base & (L["mc"] == mc_j)) if np.isfinite(mc_j) else np.array([], dtype=int)
        key = "ctrl_ind" if by_industry else "ctrl"
        e[key], e[key + "_relaxed"] = idx, relaxed
        if by_industry:
            continue
        # 诊断对照
        a = np.searchsorted(sig_s, s - HOLD, side="left")
        b = np.searchsorted(sig_s, s, side="right")
        recent = np.zeros(m, bool)
        recent[sig_j[a:b]] = True
        dmask = pool & (D.board_id == D.board_id[j]) & ~recent
        if np.isfinite(mc_j) and np.isfinite(L["dd"][j]) and np.isfinite(L["rev"][j]):
            dmask &= (L["mc"] == mc_j) & (L["dd"] == L["dd"][j]) & (L["rev"] == L["rev"][j])
            dmask[j] = False
            e["diag"] = np.flatnonzero(dmask)
        else:
            e["diag"] = np.array([], dtype=int)


# ============================================================ 事件收益路径
def ctrl_daily(D: Data, idx: np.ndarray, days: np.ndarray, open_first: bool) -> np.ndarray:
    """对照等权日收益：首日（open_first）用开盘到收盘，其余用收盘到收盘（两日都有行情）；无可用股票的日子为 0。"""
    if len(idx) == 0:
        return np.full(len(days), np.nan)
    blk = D.rc[np.ix_(days, idx)].copy()
    if open_first:
        blk[0] = D.rin_open[days[0], idx]
    with np.errstate(invalid="ignore"):
        cnt = np.isfinite(blk).sum(1)
        r = np.where(cnt > 0, np.nansum(blk, 1) / np.maximum(cnt, 1), 0.0)
    return r


def event_segments(D: Data, j: int, s: int, idx: np.ndarray, hold: int = HOLD, m100: bool = False):
    """返回 [(t_end, d_seg)]：事件股每个有行情日结束一段，段收益 − 对照同段复利收益。
    起点：s+1 有开盘价则从 s+1 开盘，否则从 s 收盘。终点：s+hold 有行情则为 s+hold；否则复牌后首个收盘；
    之后再无行情（退市 / 面板结束）则止于窗口内最后一个收盘。m100：退市股在其退市日补 −100%（报告项）。"""
    n = D.close.shape[0]
    if len(idx) == 0:
        return []
    v = D.valid[:, j]
    end_nom = min(s + hold, n - 1)
    if v[end_nom]:
        end = end_nom
    else:
        later = np.flatnonzero(v[end_nom + 1:])
        if len(later):
            end = end_nom + 1 + later[0]
        else:
            prior = np.flatnonzero(v[s + 1:end_nom + 1])
            end = s + 1 + prior[-1] if len(prior) else s
    open_first = bool(D.has_open[s + 1, j]) if s + 1 < n else False
    if end <= s:
        return []
    days = np.arange(s + 1, end + 1)
    rc_ctrl = ctrl_daily(D, idx, days, open_first)
    if np.all(np.isnan(rc_ctrl)):
        return []
    ref = D.open[s + 1, j] if open_first else D.close[s, j]
    out = []
    grow = 1.0
    for k, t in enumerate(days):
        grow *= 1.0 + rc_ctrl[k]
        if v[t]:
            out.append((t, D.close[t, j] / ref - 1.0 - (grow - 1.0)))
            ref = D.close[t, j]
            grow = 1.0
    if m100 and D.delisted[j]:
        dp = D.delist_pos[j]
        if s < dp <= min(s + hold, n - 1) and (not out or out[-1][0] < dp):
            out.append((dp, -1.0))
    return out


class Pairs:
    """事件 × 交易日 的段差，支持按事件子集求日历时间组合序列。"""

    def __init__(self, n_days: int, n_events: int, segs: list):
        self.n = n_days
        ev, t, d = [], [], []
        for i, sg in enumerate(segs):
            for tt, dd in sg:
                ev.append(i)
                t.append(tt)
                d.append(dd)
        self.ev = np.array(ev, dtype=int)
        self.t = np.array(t, dtype=int)
        self.d = np.array(d, dtype=float)
        self.E = np.bincount(self.ev, weights=self.d, minlength=n_events) if len(ev) else np.zeros(n_events)
        self.has = np.bincount(self.ev, minlength=n_events) > 0 if len(ev) else np.zeros(n_events, bool)

    def series(self, emask: np.ndarray, day_mask: np.ndarray | None = None):
        pm = emask[self.ev]
        if day_mask is not None:
            pm &= day_mask[self.t]
        s = np.bincount(self.t[pm], weights=self.d[pm], minlength=self.n)
        c = np.bincount(self.t[pm], minlength=self.n)
        days = np.flatnonzero(c > 0)
        return days, s[days] / c[days]


def inference(x: np.ndarray, boot: bool = True) -> dict:
    mu, t, p = nw_mean(x)
    return {"mean_x60": fnum(mu * HOLD) if np.isfinite(mu) else None, "daily_mean": fnum(mu),
            "nw_t": fnum(t), "nw_p_onesided": fnum(p),
            "block_bootstrap_p": fnum(block_bootstrap_p(x)) if boot and len(x) > 1 else None,
            "n_days": int(len(x))}


# ============================================================ 组合路径
class Pool:
    """S3 组合路径（CLARIFY-1 第二批 1）。W[t,j] = 前一日流通市值（前推）× 成员（最近月末 < t）。"""

    def __init__(self, D: Data, ew: bool = False, m100: bool = False):
        n, m = D.close.shape
        W = np.zeros((n, m))
        mc_prev = np.vstack([np.full((1, m), np.nan), D.mcap_ff[:-1]])
        if ew:
            W[D.U_lt] = 1.0
        else:
            W = np.where(D.U_lt & np.isfinite(mc_prev) & (mc_prev > 0), mc_prev, 0.0)
        r_on, r_in = D.r_on, D.r_in
        if m100:
            r_on = r_on.copy()
            r_in = r_in.copy()
            for j in np.flatnonzero(D.delist_pos > 0):
                dp = D.delist_pos[j]
                r_on[dp, j], r_in[dp, j] = -1.0, 0.0
                W[dp + 1:, j] = 0.0
        self.W = W
        self.A = W
        self.B = W * r_on
        self.C = W * (1.0 + r_on)
        self.Dm = self.C * (1.0 + r_in)
        self.Wr = W * ((1.0 + r_on) * (1.0 + r_in) - 1.0)
        self.sA, self.sB, self.sC, self.sD = (x.sum(1) for x in (self.A, self.B, self.C, self.Dm))
        self.sWr = self.Wr.sum(1)
        self.ok = self.sA > 0
        self.n, self.m = n, m

    def full(self) -> np.ndarray:
        with np.errstate(invalid="ignore", divide="ignore"):
            return np.where(self.ok, self.sD / np.where(self.ok, self.sA, 1.0) - 1.0, np.nan)

    def _gather(self, X, ts, js):
        if len(ts) == 0:
            return np.zeros(self.n)
        return np.bincount(ts, weights=X[ts, js], minlength=self.n)

    @staticmethod
    def removal_pairs(starts: np.ndarray, picks: np.ndarray, n: int, hold: int = HOLD):
        """R_a：t ∈ [s+1, s+hold]（日内不持有）；R_b：t ∈ [s+2, s+hold+1]（隔夜不持有）。同日同股去重。"""
        off = np.arange(hold)
        ta = (starts[:, None] + 1 + off[None, :]).ravel()
        tb = ta + 1
        ja = np.repeat(picks, hold)
        out = []
        for t in (ta, tb):
            ok = t < n
            key = np.unique(t[ok].astype(np.int64) * 100000 + ja[ok])
            out.append((key // 100000, key % 100000))
        return out

    def removed_share(self, starts, picks, hold: int = HOLD) -> np.ndarray:
        """日内步被剔除的权重占比（诊断：候选与安慰剂剔除的市值权重是否可比）。"""
        (ta, ja), _ = self.removal_pairs(np.asarray(starts), np.asarray(picks), self.n, hold)
        with np.errstate(invalid="ignore", divide="ignore"):
            return np.where(self.ok, self._gather(self.C, ta, ja) / np.where(self.ok, self.sC, 1.0), np.nan)

    def avoid(self, starts, picks, hold: int = HOLD, cash: bool = False) -> np.ndarray:
        (ta, ja), (tb, jb) = self.removal_pairs(np.asarray(starts), np.asarray(picks), self.n, hold)
        if cash:  # Bc：被回避权重当天放现金（收益 0），按收盘到收盘一步近似
            rem = self._gather(self.Wr, ta, ja)
            with np.errstate(invalid="ignore", divide="ignore"):
                return np.where(self.ok, (self.sWr - rem) / np.where(self.ok, self.sA, 1.0), np.nan)
        Ab, Bb = self._gather(self.A, tb, jb), self._gather(self.B, tb, jb)
        Ca, Da = self._gather(self.C, ta, ja), self._gather(self.Dm, ta, ja)
        with np.errstate(invalid="ignore", divide="ignore"):
            den_b = self.sA - Ab
            den_a = self.sC - Ca
            ok = self.ok & (den_b > 0) & (den_a > 0)
            r_on = (self.sB - Bb) / np.where(ok, den_b, 1.0)
            r_in = (self.sD - Da) / np.where(ok, den_a, 1.0)
            return np.where(ok, (1.0 + r_on) * r_in - 1.0, np.nan)


# ============================================================ 成本
def leg_rate(D: Data, cm, sm, j: int, t: int, side: str, V: float, lots: bool = True) -> float:
    """单边费率（占成交额）：佣金（整手 + 最低 5 元）+ 过户费 + 印花税 + 滑点（t 之前 20 日成交额中位数分档）。"""
    n = D.close.shape[0]
    t = min(t, n - 1)
    b, s_ = cm.stamp_rates(D.dates[t])
    stamp = b if side == "buy" else s_
    slip = float(sm.rate(np.array([D.adv[t, j]]))[0])
    if lots:
        px = D.open_raw[t, j] if (D.has_open[t, j] and np.isfinite(D.open_raw[t, j]) and D.open_raw[t, j] > 0) else np.nan
        if not np.isfinite(px):
            last = np.flatnonzero(np.isfinite(D.close_raw[:t + 1, j]) & (D.close_raw[:t + 1, j] > 0))
            px = D.close_raw[last[-1], j] if len(last) else np.nan
        if np.isfinite(px) and px > 0 and V > 0:
            shares = math.floor(V / (px * cm.lot_size)) * cm.lot_size
            shares = max(shares, cm.lot_size)
            traded = shares * px
            comm = max(cm.commission * traded, cm.min_commission) / traded
        else:
            comm = cm.commission
    else:
        comm = cm.commission
    return comm + cm.other + stamp + slip


# ============================================================ 候选评估
LAYER_RANGE = {"explore": (pd.Timestamp(START), EXPLORE_END), "validate": (VALID_START, VALID_END)}


class Evaluator:
    def __init__(self, D: Data, events: list, pairs: Pairs, diag_pairs: Pairs, pool: Pool, cm, sm):
        self.D, self.events, self.P, self.DP, self.pool, self.cm, self.sm = D, events, pairs, diag_pairs, pool, cm, sm
        self.full = pool.full()
        self.s_arr = np.array([e["s"] for e in events], dtype=int)
        self.j_arr = np.array([e["j"] for e in events], dtype=int)
        self.year = np.array([D.dates[e["s"]].year for e in events], dtype=int)
        self.month = np.array([D.dates[e["s"]].strftime("%Y-%m") for e in events])
        self.costs = None

    def layer_days(self, layer):
        a, b = LAYER_RANGE[layer]
        return (self.D.dates >= a) & (self.D.dates <= b)

    def calendar(self, emask, day_mask=None):
        return self.P.series(emask & self.P.has, day_mask)

    def event_costs(self):
        if self.costs is None:
            D = self.D
            c = np.zeros(len(self.events))
            for i, e in enumerate(self.events):
                s, j = e["s"], e["j"]
                pool = D.U_le[s] & np.isfinite(D.mcap_ff[s]) & (D.mcap_ff[s] > 0)
                w = D.mcap_ff[s, j] / D.mcap_ff[s, pool].sum() if pool[j] else 0.0
                V = w * CAPITAL
                c[i] = leg_rate(D, self.cm, self.sm, j, s + 1, "sell", V) + leg_rate(D, self.cm, self.sm, j, s + HOLD + 1, "buy", V)
            self.costs = c
        return self.costs

    def placebo_pools(self, emask):
        """按事件：s 日同板块 × 市值三档 × vol 三档、s+1 不在本候选任何回避窗中的底池股；空则放宽 vol，再空则板块。"""
        D = self.D
        idx_ev = np.flatnonzero(emask)
        s_sel = self.s_arr[idx_ev]
        j_sel = self.j_arr[idx_ev]
        pools = []
        relaxed = 0
        for s, j in zip(s_sel, j_sel):
            L = day_labels(D, s)
            inwin = np.zeros(D.close.shape[1], bool)
            act = (s_sel + 1 <= s + 1) & (s + 1 <= s_sel + HOLD)
            inwin[j_sel[act]] = True
            base = L["pool"] & (D.board_id == D.board_id[j]) & ~inwin
            cand = np.flatnonzero(base & (L["mc"] == L["mc"][j]) & (L["vol"] == L["vol"][j]))
            if len(cand) == 0:
                relaxed += 1
                cand = np.flatnonzero(base & (L["mc"] == L["mc"][j]))
            if len(cand) == 0:
                cand = np.flatnonzero(base)
            pools.append(cand)  # 已按代码列序（升序）
        return s_sel, pools, relaxed

    def evaluate(self, emask: np.ndarray, layer: str, label: str, placebo: bool = True) -> dict:
        D = self.D
        emask = emask.copy()
        n_ev_all = int(emask.sum())
        no_ctrl = int((emask & ~self.P.has).sum())
        used = emask & self.P.has
        days, x = self.calendar(used)
        inf = inference(x)
        mean = inf["mean_x60"]
        # 事件层：信号月聚类 t（只报告）
        E = self.P.E
        ms = pd.Series(E[used]).groupby(self.month[used]).mean()
        mct = float(ms.mean() / (ms.std(ddof=1) / math.sqrt(len(ms)))) if len(ms) > 2 and ms.std(ddof=1) > 0 else None
        inf["event_level_month_cluster_t"] = fnum(mct)
        inf["event_mean_excess"] = fnum(E[used].mean()) if used.any() else None
        # S1
        s1 = bool(mean is not None and inf["nw_t"] is not None and mean <= -0.015 and inf["nw_t"] <= -2.0)
        # S2
        yrs, cnt = np.unique(self.year[used], return_counts=True)
        top_year = int(yrs[np.argmax(cnt)]) if len(yrs) else None
        _, xa = self.calendar(used & (self.year != top_year))
        mean_a = float(xa.mean() * HOLD) if len(xa) else float("nan")
        big = {}
        for y, c in zip(yrs, cnt):
            if c >= 50:
                _, xy = self.calendar(used & (self.year == y))
                big[int(y)] = float(xy.mean() * HOLD)
        frac_neg = (sum(1 for v in big.values() if v < 0) / len(big)) if big else float("nan")
        s2a = bool(np.isfinite(mean_a) and mean_a <= -0.0075)
        s2b = bool(np.isfinite(frac_neg) and frac_neg >= 0.60)
        s2 = s2a and s2b
        # 集中度：交易日所在日历年汇总日差
        yr_day = D.dates.year.to_numpy()[days]
        tot = float(x.sum())
        by_y = pd.Series(x).groupby(yr_day).sum()
        if tot < 0:
            share = (by_y / tot)
            max_share = float(share.max())
            max_share_year = int(share.idxmax())
        else:
            max_share = float((by_y.abs() / abs(tot)).max()) if tot != 0 else float("nan")
            max_share_year = int((by_y.abs()).idxmax()) if len(by_y) else None
        conc = bool(np.isfinite(max_share) and max_share > 0.5)
        # 诊断对照
        dused = emask & self.DP.has
        _, xd = self.DP.series(dused)
        diag_mean = float(xd.mean() * HOLD) if len(xd) else float("nan")
        diag_inf = inference(xd, boot=False) if len(xd) else {}
        diag_bad = bool(np.isfinite(diag_mean) and diag_mean >= 0)
        # S3 组合路径
        dm = self.layer_days(layer)
        starts = self.s_arr[emask]
        picks = self.j_arr[emask]
        r_av = self.pool.avoid(starts, picks)
        okd = dm & np.isfinite(self.full) & np.isfinite(r_av)
        pf, pa = perf(self.full[okd]), perf(r_av[okd])
        vol_ratio = pa["vol"] / pf["vol"]
        mdd_better = pa["mdd"] - pf["mdd"]
        s3_pool = bool((vol_ratio <= 0.98 or mdd_better >= 0.01) and pa["sharpe"] >= pf["sharpe"] - 0.02)
        pl = {"p5": None, "percentile": None, "n": 0, "relaxed_events": None}
        s3_placebo = False
        if placebo:
            s_sel, pools, relaxed = self.placebo_pools(emask)
            sizes = np.array([len(p) for p in pools], dtype=np.int64)
            has = sizes > 0
            rng = np.random.default_rng(SEED)
            ratios = np.empty(PLACEBO_N)
            rshare = np.empty(PLACEBO_N)
            offs = np.concatenate([[0], np.cumsum(sizes)])
            flat = np.concatenate(pools) if len(pools) else np.array([], int)
            for b in range(PLACEBO_N):
                k = rng.integers(0, np.maximum(sizes, 1))
                pk = flat[np.minimum(offs[:-1] + k, len(flat) - 1)]
                rp = self.pool.avoid(s_sel[has], pk[has])
                ok2 = okd & np.isfinite(rp)
                ratios[b] = rp[ok2].std(ddof=1) * math.sqrt(252) / pf["vol"]
                rshare[b] = float(np.nanmean(self.pool.removed_share(s_sel[has], pk[has])[okd]))
            p5 = float(np.percentile(ratios, 5))
            pl = {"p5": p5, "percentile": float(np.mean(ratios <= vol_ratio)), "n": PLACEBO_N,
                  "mean": float(ratios.mean()), "relaxed_events": int(relaxed),
                  "events_without_pool": int((~has).sum()),
                  "removed_weight_share_mean_placebo": float(rshare.mean()),
                  "removed_weight_share_mean_candidate": float(np.nanmean(self.pool.removed_share(starts, picks)[okd]))}
            s3_placebo = bool(vol_ratio < p5)
        s3 = s3_pool and s3_placebo
        # S5
        costs = self.event_costs()
        net = -E[used] - costs[used]
        net_mean = float(net.mean()) if len(net) else float("nan")
        s5 = bool(np.isfinite(net_mean) and net_mean >= 0.01)
        gates = {"excess_nonneg": bool(mean is None or mean >= 0), "concentration_year_gt_50pct": conc,
                 "diag_crash_no_bounce_excess_nonneg": diag_bad, "c1_minus_c2_excess_le_0": None}
        grade = grade_of(gates, s1, s2, s3, s5)
        # 退市诊断（第二批 7）
        dl60 = np.array([e["delist_within_60"] for e in self.events]) & used
        _, xdl = self.calendar(used & ~dl60)
        res = {
            "inference": inf,
            "S1": {"pass": s1, "detail": {"mean_x60": mean, "nw_t": inf["nw_t"], "thr_mean": -0.015, "thr_t": -2.0}},
            "S2": {"pass": s2, "detail": {"top_year": top_year, "mean_x60_ex_top_year": fnum(mean_a), "a_pass": s2a,
                                          "year_means_ge50": big, "frac_neg_ge50": fnum(frac_neg), "b_pass": s2b}},
            "S3": {"pass": s3, "detail": {"vol_full": pf["vol"], "vol_avoid": pa["vol"], "vol_ratio": fnum(vol_ratio),
                                          "mdd_full": pf["mdd"], "mdd_avoid": pa["mdd"], "mdd_shallower": fnum(mdd_better),
                                          "sharpe_full": pf["sharpe"], "sharpe_avoid": pa["sharpe"],
                                          "s3_pool": s3_pool, "placebo_p5": pl["p5"],
                                          "placebo_percentile": pl["percentile"], "s3_placebo": s3_placebo,
                                          "placebo": pl, "n_days": pf["n_days"]}},
            "S4": {"detail": {}, "note": "只报告，不作判定（spanning 见下）"},
            "S5": {"pass": s5, "detail": {"avoid_net_mean": fnum(net_mean), "cost_mean": fnum(costs[used].mean()) if used.any() else None,
                                          "n": int(used.sum()), "thr": 0.01}},
            "gates": gates,
            "grade": grade,
            "diagnostics": {
                "n_events": n_ev_all, "n_events_used": int(used.sum()), "n_events_no_control": no_ctrl,
                "n_events_ctrl_vol_relaxed": int(sum(1 for i in np.flatnonzero(emask) if self.events[i]["ctrl_relaxed"])),
                "n_signal_months": int(len(set(self.month[emask]))),
                "max_year_share": fnum(max_share), "max_share_year": max_share_year,
                "year_sums": {int(k): float(v) for k, v in by_y.items()},
                "diag_crash_no_bounce": {"mean_x60": fnum(diag_mean), "nw_t": diag_inf.get("nw_t"),
                                          "n_events": int(dused.sum())},
                "delist_within_60": {"n": int(dl60.sum()), "share": fnum(dl60.sum() / max(used.sum(), 1)),
                                     "mean_x60_excluding": fnum(xdl.mean() * HOLD) if len(xdl) else None},
            },
            "_r_av": r_av,
            "_days": days,
            "_x": x,
        }
        return res


def grade_of(g, s1, s2, s3, s5) -> str:
    if g["excess_nonneg"] or not s1 or not s2:
        return "不支持"
    grade = "支持" if (s3 and s5) else "部分成立"
    if g["concentration_year_gt_50pct"] or g["diag_crash_no_bounce_excess_nonneg"]:
        grade = "部分成立"
    return grade


def combine_c2(lo: str, hi: str) -> str:
    if lo == "支持" and hi == "支持":
        return "支持"
    if lo == "不支持" and hi == "不支持":
        return "不支持"
    return "部分成立"


def strip(d):
    if isinstance(d, dict):
        return {k: strip(v) for k, v in d.items() if not str(k).startswith("_")}
    if isinstance(d, (list, tuple)):
        return [strip(v) for v in d]
    if isinstance(d, (np.floating, float)):
        return fnum(d)
    if isinstance(d, (np.integer,)):
        return int(d)
    if isinstance(d, np.bool_):
        return bool(d)
    return d


# ============================================================ spanning
def factor_returns(D: Data, pool: Pool, panel_ep: dict | None):
    """月末前 20%（注册方向）对底池的市值加权日超额；成员 = 最近月末 < t。市场 = 底池毛收益（rf=0）。"""
    from factorlab.backtest import select_top, tie_keys
    from factorlab.registry import FACTORS, compute_strict
    n, m = D.close.shape
    me = D.me_pos
    full = pool.full()
    out, cov = {}, {}
    tie = tie_keys(D.codes)
    names = ["rev_1m", "max_ret_21d", "dd_60", "peak_fall", "vol_60d", "size", "turnover_20d", "mom_12_1"]
    vals = {k: D.feat[k][me] for k in names}
    if panel_ep is not None:
        ep = compute_strict(FACTORS["cn_ep_ttm"], panel_ep, D.dates[me]).reindex(columns=D.panel["close_adj"].columns)
        vals["cn_ep_ttm"] = ep.to_numpy(float)
    for k, V in vals.items():
        direction = FACTORS[k].direction
        legs = np.zeros((len(me), m), bool)
        c = []
        for r in range(len(me)):
            v = np.where(D.U_me[r] & np.isfinite(V[r]), V[r] * direction, np.nan)
            nv = int(np.isfinite(v).sum())
            c.append(nv / max(int(D.U_me[r].sum()), 1))
            if nv >= 5:
                legs[r] = select_top(v, tie, top_q=0.2)
        cov[k] = float(np.mean(c))
        L = np.where((D.k_lt >= 0)[:, None], legs[np.clip(D.k_lt, 0, None)], False)
        Wl = np.where(L, pool.W, 0.0)
        sw = Wl.sum(1)
        with np.errstate(invalid="ignore", divide="ignore"):
            leg = np.where(sw > 0, (Wl * ((1 + D.r_on) * (1 + D.r_in) - 1)).sum(1) / np.where(sw > 0, sw, 1), np.nan)
        out[k] = leg - full
    out["mkt"] = full
    cov["mkt"] = 1.0
    return out, cov


def ols_nw(y: np.ndarray, X: np.ndarray, lag: int):
    n, k = X.shape
    XtX_inv = np.linalg.pinv(X.T @ X)
    beta = XtX_inv @ X.T @ y
    u = y - X @ beta
    g = X * u[:, None]
    S = g.T @ g
    for L in range(1, min(lag, n - 1) + 1):
        w = 1.0 - L / (lag + 1.0)
        G = g[L:].T @ g[:-L]
        S += w * (G + G.T)
    V = XtX_inv @ S @ XtX_inv
    se = np.sqrt(np.maximum(np.diag(V), 0))
    return beta, se


def spanning_portfolio(y: np.ndarray, F: dict, day_mask: np.ndarray) -> dict:
    names = list(F)
    ok = day_mask & np.isfinite(y)
    for k in names:
        ok &= np.isfinite(F[k])
    X = np.column_stack([np.ones(ok.sum())] + [F[k][ok] for k in names])
    beta, se = ols_nw(y[ok], X, NW_LAG)
    return {"alpha_daily": float(beta[0]), "alpha_ann": float(beta[0] * 252), "alpha_nw_t": float(beta[0] / se[0]) if se[0] > 0 else None,
            "pass_report": bool(beta[0] > 0 and se[0] > 0 and beta[0] / se[0] >= 2),
            "n_days": int(ok.sum()), "betas": {k: float(beta[i + 1]) for i, k in enumerate(names)},
            "factors": names}


def fama_macbeth(D: Data, events: list, emask: np.ndarray, layer: str) -> dict:
    """每周（周最后一个交易日 t）截面：r(i, t+1 开 → t+60 收) = a + γ·Event + b'X。
    Event = 本候选事件 s ∈ (上周末, t]。X：rev_1m、max_ret_21d、dd_60、peak_fall 幅度（缺→0）与前 20% 指示，
    vol_60d、size(log 市值)、turnover_20d、板块虚拟变量。γ 的 NW（滞后 12）t；只用有事件的周。"""
    from factorlab.backtest import select_top, tie_keys
    n, m = D.close.shape
    dates = D.dates
    wk = pd.Series(np.arange(n), index=dates).groupby([dates.isocalendar().year.to_numpy(), dates.isocalendar().week.to_numpy()]).max().to_numpy()
    wk = np.sort(wk)
    a, b = LAYER_RANGE[layer]
    tie = tie_keys(D.codes)
    ev_s = np.array([events[i]["s"] for i in np.flatnonzero(emask)], dtype=int)
    ev_j = np.array([events[i]["j"] for i in np.flatnonzero(emask)], dtype=int)
    gam = []
    boards = sorted(set(D.board_id))
    prev = -1
    for t in wk:
        p0, prev = prev, t
        if t + HOLD >= n or dates[t] < a or dates[t] > b:
            continue
        sel = (ev_s > p0) & (ev_s <= t)
        if not sel.any():
            continue
        pool = D.U_le[t] & D.valid[t] & D.has_open[t + 1]
        y = D.close_ff[t + HOLD] / D.open[t + 1] - 1.0
        cols = []
        for k in ("rev_1m", "max_ret_21d", "dd_60", "peak_fall"):
            v = D.feat[k][t]
            from factorlab.registry import FACTORS
            d = FACTORS[k].direction
            top = select_top(np.where(pool & np.isfinite(v), v * d, np.nan), tie, top_q=0.2)
            cols += [np.nan_to_num(v, nan=0.0), top.astype(float)]
        cols += [D.feat["vol_60d"][t], D.feat["size"][t], D.feat["turnover_20d"][t]]
        for bb in boards[1:]:
            cols.append((D.board_id == bb).astype(float))
        ev = np.zeros(m)
        ev[ev_j[sel]] = 1.0
        X = np.column_stack([np.ones(m), ev] + cols)
        ok = pool & np.isfinite(y) & np.all(np.isfinite(X), axis=1)
        if ok.sum() < X.shape[1] + 20 or ev[ok].sum() == 0:
            continue
        Xo = X[ok]
        keep = Xo.std(0) > 0
        keep[0] = True
        beta, *_ = np.linalg.lstsq(Xo[:, keep], y[ok], rcond=None)
        gam.append(beta[1])
    gam = np.array(gam)
    if len(gam) < 3:
        return {"n_weeks": int(len(gam))}
    mu, t, p = nw_mean(gam, lag=12)
    return {"gamma_mean": float(mu), "gamma_nw_t": float(t), "n_weeks": int(len(gam)),
            "gamma_negative_t_le_-2": bool(mu < 0 and t <= -2)}


# ============================================================ 主流程
def build_pairs(D, events, key="ctrl", hold=HOLD, m100=False):
    segs = [event_segments(D, e["j"], e["s"], e.get(key, np.array([], int)), hold=hold, m100=m100) for e in events]
    return Pairs(D.close.shape[0], len(events), segs)


def breach_and_vol(D: Data, events, emask):
    """跌破反弹前低（trough 收盘）比例；事件股 vs 对照的窗口已实现波动与最大回撤（只报告）。"""
    n = D.close.shape[0]
    br_e, br_c, br_d, ve, vc, me_, mc_ = [], [], [], [], [], [], []
    for i in np.flatnonzero(emask):
        e = events[i]
        s, j = e["s"], e["j"]
        end = min(s + HOLD, n - 1)
        win = slice(s + 1, end + 1)
        px = D.close[win, j]
        br_e.append(bool(np.nanmin(px) < e["roll_min"]) if np.isfinite(px).any() else False)
        for key, acc in (("ctrl", br_c), ("diag", br_d)):
            idx = e.get(key, np.array([], int))
            if len(idx) == 0:
                continue
            ref = np.nanmin(D.close[e["crash_end"]:s + 1, idx], axis=0)
            fut = np.nanmin(D.close[win, idx], axis=0)
            okk = np.isfinite(ref) & np.isfinite(fut)
            if okk.any():
                acc.append(float(np.mean(fut[okk] < ref[okk])))
        r = D.rc[win, j]
        r = r[np.isfinite(r)]
        if len(r) > 2:
            ve.append(float(r.std(ddof=1) * math.sqrt(252)))
            nav = np.cumprod(1 + r)
            me_.append(float((nav / np.maximum.accumulate(nav) - 1).min()))
        idx = e.get("ctrl", np.array([], int))
        if len(idx):
            rcv = ctrl_daily(D, idx, np.arange(s + 1, end + 1), False)
            rcv = rcv[np.isfinite(rcv)]
            if len(rcv) > 2:
                vc.append(float(rcv.std(ddof=1) * math.sqrt(252)))
                nav = np.cumprod(1 + rcv)
                mc_.append(float((nav / np.maximum.accumulate(nav) - 1).min()))
    f = lambda a: float(np.mean(a)) if len(a) else None
    return ({"event": f(br_e), "main_control": f(br_c), "diag_control": f(br_d)},
            {"event_vol": f(ve), "control_ew_vol": f(vc), "event_mdd": f(me_), "control_ew_mdd": f(mc_)})


def variant_block(D, events, pairs, emask, label, hold=HOLD):
    days, x = pairs.series(emask & pairs.has)
    mu, t, _ = nw_mean(x)
    return {"n_events": int(emask.sum()), "n_signal_months": int(len({D.dates[events[i]['s']].strftime('%Y-%m') for i in np.flatnonzero(emask)})),
            "mean_x60": fnum(mu * HOLD), "mean_xH": fnum(mu * hold), "hold": hold, "nw_t": fnum(t), "layer": label}


def run_variants(D, base_events, base_pairs, quick=False):
    out = {}
    specs = [("triple_limit_down", dict(triple_limit=True)), ("bounce_05", dict(bounce=0.05)),
             ("bounce_15", dict(bounce=0.15)), ("cooldown_60", dict(cooldown=60)), ("cooldown_180", dict(cooldown=180))]
    for name, kw in specs:
        print(f"  variant {name}…", flush=True)
        evs, sigs, _ = detect_events(D, **kw)
        evs = [e for e in evs if e["layer"] in ("explore", "validate")]
        assign_controls(D, evs, sigs)
        pr = build_pairs(D, evs)
        for layer in ("explore", "validate"):
            for cand, f in (("C1", lambda e: True), ("C2_lo", lambda e: e["c2_lo"]), ("C2_hi", lambda e: e["c2_hi"])):
                em = np.array([e["layer"] == layer and f(e) for e in evs], bool)
                out[f"{name}|{layer}|{cand}"] = variant_block(D, evs, pr, em, layer)
    for hold in (20, 120):
        print(f"  variant window {hold}…", flush=True)
        pr = build_pairs(D, base_events, hold=hold)
        for layer in ("explore", "validate"):
            for cand, f in (("C1", lambda e: True), ("C2_lo", lambda e: e["c2_lo"]), ("C2_hi", lambda e: e["c2_hi"])):
                em = np.array([e["layer"] == layer and f(e) for e in base_events], bool)
                out[f"avoid_window_{hold}|{layer}|{cand}"] = variant_block(D, base_events, pr, em, layer, hold=hold)
    return out


def run_hk(quick=False):
    print("=== HK 大盘（报告，不能否决）===", flush=True)
    H = load_data("hk", quick=quick)
    H.delisting_iv, H.ann = {}, {}
    evs, sigs, skips = detect_events(H)
    evs = [e for e in evs if e["layer"] in ("explore", "validate")]
    assign_controls(H, evs, sigs)
    pr = build_pairs(H, evs)
    out = {}
    for layer in ("explore", "validate"):
        em = np.array([e["layer"] == layer for e in evs], bool)
        out[f"hk_large|{layer}|C1"] = variant_block(H, evs, pr, em, layer)
    out["hk_large|skips"] = skips
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true", help="冒烟：2015 起、安慰剂/自助缩小，不写 results.json")
    ap.add_argument("--no-hk", action="store_true")
    args = ap.parse_args()
    global PLACEBO_N, BOOT_N
    if args.quick:
        PLACEBO_N, BOOT_N = 20, 200
    t0 = time.time()
    print("verify inputs…", flush=True)
    inputs = verify_inputs()
    from factorlab.backtest import cost_model, slippage_model
    from factorlab import fundamentals_cn
    cm, sm = cost_model("cn"), slippage_model("cn")

    D = load_data("cn", quick=args.quick)
    load_cn_extras(D)
    print("detect…", flush=True)
    events_all, all_signals, skips = detect_events(D)
    layer_counts = pd.Series([e["layer"] for e in events_all]).value_counts().to_dict()
    print("layers", layer_counts, "skips", skips, flush=True)
    events = [e for e in events_all if e["layer"] in ("explore", "validate")]
    print("controls…", flush=True)
    assign_controls(D, events, all_signals)
    print("pairs…", flush=True)
    pairs = build_pairs(D, events)
    diag_pairs = build_pairs(D, events, key="diag")
    pool = Pool(D)
    ev = Evaluator(D, events, pairs, diag_pairs, pool, cm, sm)
    layer_arr = np.array([e["layer"] for e in events])
    c2lo = np.array([e["c2_lo"] for e in events], bool)
    c2hi = np.array([e["c2_hi"] for e in events], bool)

    # 报告用路径
    pool_ew = Pool(D, ew=True)
    pool_m100 = Pool(D, m100=True)
    pairs_m100 = build_pairs(D, events, m100=True)
    print("SW industry controls…", flush=True)
    listed_mask = np.array([D.status[e["j"]] == "listed" for e in events], bool)
    assign_controls(D, events, all_signals, by_industry=True)
    pairs_ind = build_pairs(D, events, key="ctrl_ind")

    # spanning 因子
    print("spanning factors…", flush=True)
    panel_ep = None
    try:
        fp = fundamentals_cn.panel_fields(["fin_ni_ttm", "fin_mcap"], D.panel, LOCKBOX_START, None)
        panel_ep = {"fin_ni_ttm": fp["fin_ni_ttm"], "fin_mcap": fp["fin_mcap"], "close_adj": D.panel["close_adj"]}
    except Exception as exc:  # noqa: BLE001
        print("EP failed", exc)
    F, Fcov = factor_returns(D, pool, panel_ep)

    layers_out, internal = {}, {}
    for layer in ("explore", "validate"):
        print(f"=== {layer} ===", flush=True)
        lm = layer_arr == layer
        res = {}
        for cand, em in (("C1", lm), ("C2_lo", lm & c2lo), ("C2_hi", lm & c2hi)):
            print(f"  {cand} n={int(em.sum())}", flush=True)
            res[cand] = ev.evaluate(em, layer, cand)
        # C1 ∖ C2（上下界）
        c1mc2 = {}
        for bname, cm2 in (("lo", c2lo), ("hi", c2hi)):
            _, xx = ev.calendar(lm & ~cm2)
            c1mc2[bname] = {"mean_x60": fnum(xx.mean() * HOLD) if len(xx) else None, "n_events": int((lm & ~cm2).sum())}
        ok_c1mc2 = all(v["mean_x60"] is not None and v["mean_x60"] <= 0 for v in c1mc2.values())
        res["C1"]["gates"]["c1_minus_c2_excess_le_0"] = ok_c1mc2
        res["C1"]["diagnostics"]["c1_minus_c2"] = c1mc2
        if res["C1"]["grade"] == "支持" and not ok_c1mc2:
            res["C1"]["grade"] = "部分成立"
        c2_grade = combine_c2(res["C2_lo"]["grade"], res["C2_hi"]["grade"])
        both = res["C2_lo"]["grade"] == "支持" and res["C2_hi"]["grade"] == "支持"
        # spanning（组合层，报告）+ FM（事件层，报告）
        dm = ev.layer_days(layer)
        for cand, em in (("C1", lm), ("C2_lo", lm & c2lo), ("C2_hi", lm & c2hi)):
            y = res[cand]["_r_av"] - ev.full
            try:
                sp = spanning_portfolio(y, F, dm)
            except Exception as exc:  # noqa: BLE001
                sp = {"error": str(exc)}
            print(f"  FM {cand}…", flush=True)
            fm = fama_macbeth(D, events, em, layer)
            res[cand]["S4"] = {"detail": {"portfolio_spanning": sp, "event_fama_macbeth": fm, "factor_coverage": Fcov},
                               "note": "只报告，不作判定"}
        # Holm（族 = {C1, C2}，C2 分上下界各算一次）
        holm_lo = holm({"C1": res["C1"]["inference"]["nw_p_onesided"], "C2": res["C2_lo"]["inference"]["nw_p_onesided"]})
        holm_hi = holm({"C1": res["C1"]["inference"]["nw_p_onesided"], "C2": res["C2_hi"]["inference"]["nw_p_onesided"]})
        # 报告项
        rep = {}
        for cand, em in (("C1", lm), ("C2_lo", lm & c2lo), ("C2_hi", lm & c2hi)):
            okd = dm & np.isfinite(ev.full)
            starts, picks = ev.s_arr[em], ev.j_arr[em]
            r_full_ew = pool_ew.full()
            r_av_ew = pool_ew.avoid(starts, picks)
            r_bc = pool.avoid(starts, picks, cash=True)
            r_full_m = pool_m100.full()
            r_av_m = pool_m100.avoid(starts, picks)
            # 净路径（比例成本）
            net = res[cand]["_r_av"].copy()
            cost_day = np.zeros(D.close.shape[0])
            for s, j in zip(starts, picks):
                for t, side_x, side_o in ((s + 1, "sell", "buy"), (s + HOLD + 1, "buy", "sell")):
                    if t >= D.close.shape[0] or pool.sA[t] <= 0 or pool.W[t, j] <= 0:
                        continue
                    w = pool.W[t, j] / pool.sA[t]
                    rx = leg_rate(D, cm, sm, j, t, side_x, 0.0, lots=False)
                    bst, sst = cm.stamp_rates(D.dates[t])
                    slip_avg = float((pool.W[t] * sm.rate(D.adv[t])).sum() / pool.sA[t])
                    ro = cm.commission + cm.other + (bst if side_o == "buy" else sst) + slip_avg
                    cost_day[t] += w * (rx + ro)
            net = (1 + net) * (1 - cost_day) - 1

            def ps(a, b):
                ok = okd & np.isfinite(a) & np.isfinite(b)
                pa_, pb_ = perf(a[ok]), perf(b[ok])
                return {"vol_full": pa_["vol"], "vol_avoid": pb_["vol"], "vol_ratio": pb_["vol"] / pa_["vol"],
                        "mdd_full": pa_["mdd"], "mdd_avoid": pb_["mdd"], "sharpe_full": pa_["sharpe"],
                        "sharpe_avoid": pb_["sharpe"], "ann_ret_full": pa_["ann_ret"], "ann_ret_avoid": pb_["ann_ret"]}
            br, vm = breach_and_vol(D, events, em)
            # 全窗口 C2
            c2f = {}
            if cand == "C1":
                for bname in ("lo", "hi"):
                    fm_ = np.array([e[f"c2full_{bname}"] for e in events], bool) & lm
                    _, xf = ev.calendar(fm_)
                    mu, tt, _ = nw_mean(xf)
                    c2f[bname] = {"mean_x60": fnum(mu * HOLD), "nw_t": fnum(tt), "n_events": int(fm_.sum())}
            _, xi = pairs_ind.series(em & listed_mask & pairs_ind.has)
            mu_i, t_i, _ = nw_mean(xi)
            _, xm = pairs_m100.series(em & pairs_m100.has)
            mu_m, t_m, _ = nw_mean(xm)
            seg = {}
            days, x = res[cand]["_days"], res[cand]["_x"]
            bounds = [pd.Timestamp("1900-01-01")] + [pd.Timestamp(d) for d in REGIME_DATES] + [pd.Timestamp("2100-01-01")]
            for a_, b_ in zip(bounds[:-1], bounds[1:]):
                dd = D.dates[days]
                sel = (dd >= a_) & (dd < b_)
                if sel.sum() > 2:
                    mu_s, t_s, _ = nw_mean(x[sel])
                    seg[f"{a_.date()}..{b_.date()}"] = {"mean_x60": fnum(mu_s * HOLD), "nw_t": fnum(t_s), "n_days": int(sel.sum())}
            # 70/30 证券切分（报告）
            from factorlab.guard import split_codes
            ex_codes = set(split_codes([e["code"] for e in events], "explore"))
            sp70 = {}
            for part in ("explore70", "validate30"):
                pm = np.array([(e["code"] in ex_codes) == (part == "explore70") for e in events], bool) & em
                _, xp = ev.calendar(pm)
                sp70[part] = {"mean_x60": fnum(xp.mean() * HOLD) if len(xp) else None, "n_events": int(pm.sum())}
            rep[cand] = {
                "pool_mcap": strip({k: res[cand]["S3"]["detail"][k] for k in ("vol_full", "vol_avoid", "vol_ratio", "mdd_full", "mdd_avoid", "sharpe_full", "sharpe_avoid")}),
                "pool_mcap_net_prop_cost": ps(ev.full, net),
                "pool_ew": ps(r_full_ew, r_av_ew),
                "pool_Bc_cash": {**ps(ev.full, r_bc), "note": "剔除权重放现金：危机后等价于市场择时（L-047 同类），不能作为回避选股有效的证据"},
                "delist_m100_upper": {"pool": ps(r_full_m, r_av_m), "event_excess_mean_x60": fnum(mu_m * HOLD), "event_nw_t": fnum(t_m),
                                      "note": "退市补 −100%：对回避有利的上界"},
                "breach_trough_rate": br,
                "event_vol_mdd_vs_control": vm,
                "c2_full_window": c2f or None,
                "sw_industry_subsample": {"mean_x60": fnum(mu_i * HOLD), "nw_t": fnum(t_i), "n_events": int((em & listed_mask & pairs_ind.has).sum()),
                                          "note": "当前上市股子样本、点时行业 × 市值 × vol 匹配；有幸存者偏差"},
                "regime_segments": seg,
                "split_70_30": sp70,
            }
        c2_block = {k: res["C2_lo"][k] for k in ("inference", "S1", "S2", "S3", "S4", "S5", "gates", "diagnostics")}
        c2_block.update({"grade": c2_grade, "both_bounds_support": both,
                         "bound_lo": {k: res["C2_lo"][k] for k in ("inference", "S1", "S2", "S3", "S4", "S5", "gates", "diagnostics", "grade")},
                         "bound_hi": {k: res["C2_hi"][k] for k in ("inference", "S1", "S2", "S3", "S4", "S5", "gates", "diagnostics", "grade")},
                         "note": "顶层 inference/S1–S5 = 下界；分级按两界合并（CLARIFY-1 第二批 5）"})
        lme = [e for e in events if e["layer"] == layer]
        layers_out[layer] = {
            "meta": {"n_events_C1": int(lm.sum()), "n_signal_months_C1": int(len({D.dates[e['s']].strftime('%Y-%m') for e in lme})),
                     "n_events_C2_lo": int((lm & c2lo).sum()), "n_events_C2_hi": int((lm & c2hi).sum()),
                     "date_start": str(LAYER_RANGE[layer][0].date()), "date_end": str(LAYER_RANGE[layer][1].date()),
                     "explore_cross_2015_n": int(sum(e["cross_2015"] for e in lme)) if layer == "explore" else None},
            "C1": strip(res["C1"]),
            "C2": strip(c2_block),
            "holm": {"C1|lo": holm_lo["C1"], "C2|lo": holm_lo["C2"], "C1|hi": holm_hi["C1"], "C2|hi": holm_hi["C2"]},
            "report": strip(rep),
        }
        internal[layer] = res

    print("variants…", flush=True)
    variants = run_variants(D, events, pairs, quick=args.quick)
    if not args.no_hk:
        try:
            variants.update(run_hk(quick=args.quick))
        except Exception as exc:  # noqa: BLE001
            variants["hk_large|error"] = {"error": str(exc)}

    # 判定汇总
    def el(c):
        return layers_out["explore"][c]["grade"] == "支持" and layers_out["validate"][c]["grade"] == "支持"
    c1_el, c2_el = el("C1"), el("C2")
    v1 = layers_out["validate"]["C1"]
    headline = {"layer": "validate", "candidate": "C1",
                "pool_vol_full": v1["S3"]["detail"]["vol_full"], "pool_vol_avoid": v1["S3"]["detail"]["vol_avoid"],
                "pool_mdd_full": v1["S3"]["detail"]["mdd_full"], "pool_mdd_avoid": v1["S3"]["detail"]["mdd_avoid"],
                "event_excess_sign": ("na" if v1["inference"]["mean_x60"] is None else
                                      "negative" if v1["inference"]["mean_x60"] < 0 else "non_negative"),
                "placebo_vol_ratio_percentile": v1["S3"]["detail"]["placebo_percentile"]}

    # 试验日志
    now = pd.Timestamp.now(tz="UTC").isoformat()
    trials = []
    for layer in ("explore", "validate"):
        for cand in ("C1", "C2_lo", "C2_hi"):
            r = internal[layer][cand]
            trials.append({"ts": now, "market": "cn", "event": "prereg_trial", "ledger": "L-051", "prereg_commit": PREREG_COMMIT,
                           "family": "cn_crash_rebound", "zone": layer, "candidate": cand, "variant": None,
                           "mean_x60": r["inference"]["mean_x60"], "nw_t": r["inference"]["nw_t"],
                           "n_events": r["diagnostics"]["n_events"], "grade": r["grade"], "exploratory": False})
    for k, v in variants.items():
        if "|skips" in k or "error" in k:
            continue
        trials.append({"ts": now, "market": "hk" if k.startswith("hk") else "cn", "event": "prereg_trial", "ledger": "L-051",
                       "prereg_commit": PREREG_COMMIT, "family": "cn_crash_rebound", "zone": v.get("layer"), "candidate": k.split("|")[-1],
                       "variant": k.split("|")[0], "mean_x60": v.get("mean_x60"), "nw_t": v.get("nw_t"),
                       "n_events": v.get("n_events"), "grade": None, "exploratory": True})
    distinct = len({(t["variant"], t["candidate"]) for t in trials})

    # 事件清单
    rows = []
    for i, e in enumerate(events):
        rows.append({"code": e["code"], "crash_start": D.dates[e["crash_start"]].date(), "crash_end": D.dates[e["crash_end"]].date(),
                     "trough": D.dates[e["trough"]].date(), "signal": D.dates[e["s"]].date(), "layer": e["layer"],
                     "cross_2015": e["cross_2015"], "c2_lo": e["c2_lo"], "c2_hi": e["c2_hi"], "is_delisted": e["is_delisted"],
                     "delist_within_60": e["delist_within_60"], "n_ctrl": len(e["ctrl"]), "ctrl_vol_relaxed": e["ctrl_relaxed"],
                     "n_diag": len(e["diag"]), "event_excess": pairs.E[i] if pairs.has[i] else np.nan,
                     "cost_roundtrip": ev.event_costs()[i]})
    trunc = [e for e in events_all if e["layer"] == "validate_truncated"]
    for e in trunc:
        rows.append({"code": e["code"], "crash_start": D.dates[e["crash_start"]].date(), "crash_end": D.dates[e["crash_end"]].date(),
                     "trough": D.dates[e["trough"]].date(), "signal": D.dates[e["s"]].date(), "layer": e["layer"],
                     "cross_2015": False, "c2_lo": e["c2_lo"], "c2_hi": e["c2_hi"], "is_delisted": e["is_delisted"],
                     "delist_within_60": e["delist_within_60"]})

    payload = {
        "meta": {"ledger": "L-051", "preregCommit": PREREG_COMMIT,
                 "preregPath": "docs/research/dead-cat-bounce-2026-11-28/PREREG.md",
                 "clarifyPath": "docs/research/dead-cat-bounce-2026-11-28/CLARIFY-1.md",
                 "impl": "main-python", "seed": SEED, "quick": bool(args.quick),
                 "notes": ["不读锁箱：store raw=False（面板止于 2023-10-31）；fin 经 load_fin_pit（avail_date < 2023-11-01）",
                           "价值因子 cn_ep_ttm 由 fundamentals_cn.panel_fields（可见上界 2023-11-01）+ compute_strict；其缓存写在 factor-data/cn/derived/",
                           f"st_pit 中含「终止」的行数 = {D.n_terminate_rows}（终止上市子条款为空操作）",
                           f"runtime_sec={time.time() - t0:.0f}"],
                 "managerRulings": MANAGER_RULINGS},
        "inputs": inputs,
        "counts": {"layers": {k: int(v) for k, v in layer_counts.items()}, "skips": skips,
                   "count_h2_filtered_reference": json.loads((HERE / "counts_h2_filtered.json").read_text())["skips"]},
        "headline": headline,
        "layers": layers_out,
        "variants": strip(variants),
        "trials": {"logPath": "docs/research/dead-cat-bounce-2026-11-28/trials.jsonl", "n_recorded": len(trials),
                   "n_effective": distinct},
        "verdict": {
            "C1": {"explore": layers_out["explore"]["C1"]["grade"], "validate": layers_out["validate"]["C1"]["grade"], "eligible": c1_el},
            "C2": {"explore": layers_out["explore"]["C2"]["grade"], "validate": layers_out["validate"]["C2"]["grade"], "eligible": c2_el},
            "promote_eligible": {"C1": c1_el, "C2": c2_el},
            "summary": (f"C1 探索={layers_out['explore']['C1']['grade']} / 验证={layers_out['validate']['C1']['grade']}；"
                        f"C2 探索={layers_out['explore']['C2']['grade']} / 验证={layers_out['validate']['C2']['grade']}；"
                        f"晋级资格 C1={c1_el} C2={c2_el}（是否解封由 manager 决定；本任务不做锁箱确认）"),
        },
    }
    suffix = ".quick" if args.quick else ""
    (HERE / f"results{suffix}.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str) + "\n")
    pd.DataFrame(rows).to_csv(HERE / f"events{suffix}.csv", index=False)
    with (HERE / f"trials{suffix}.jsonl").open("w") as f:
        for t in trials:
            f.write(json.dumps(strip(t), ensure_ascii=False) + "\n")
    print(payload["verdict"]["summary"])
    print(f"done in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
