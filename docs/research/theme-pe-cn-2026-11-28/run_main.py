#!/usr/bin/env python3
"""L-052 主实现（PREREG v3 冻结 60ebdb8b；口径澄清 CLARIFY-1 / CLARIFY-2）。探索（只描述）+ 验证（判定）；不读锁箱。

用法：cd research-py && uv run python ../docs/research/theme-pe-cn-2026-11-28/run_main.py
输出：results.json（结构见 results.schema.json）、trials.jsonl、RESULTS.md

要点（详见 results.meta.notes）：
- 信号层沿用冻结计数脚本 count_theme_pe.py 的口径，并逐项核对其聚合计数（results.countsCheck）。
- 执行：月末 t 信号，t 后第一个交易日开盘（open_adj）成交；一字涨停买不进的目标权重留现金（0 收益）
  到下个调仓日；一字跌停 / 停牌卖不出继续持有，复牌后第一个可成交开盘卖出；持有期停牌冻结、复牌日计涨跌。
- 成本（CLARIFY-2 第 1 条，偏离 PREREG 原文）：factorlab 比例成本模式；100 万元整手 + 最低佣金只作可执行性报告项。
- 安慰剂 / 循环平移：行业层无摩擦模拟（CLARIFY-2 第 3 条），实际值同法计算。
"""
from __future__ import annotations

import hashlib
import json
import math
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / "research-py"))
from sw_canon import SW2014_LAUNCH, SW_CANON, UNMAPPED_SPLITS, canon  # noqa: E402

PREREG_COMMIT = "60ebdb8b"
SEED = 20261128
WARM_START, COUNT_START, END = "2000-01-01", "2005-01-01", "2023-10-31"
WINDOWS = {"explore": ("2005-01-01", "2014-12-31"), "validate": ("2015-01-01", "2023-10-31"),
           "full": ("2005-01-01", "2023-10-31")}
K, EXIT_RANK = 2, 4
LOOK_6, LOOK_3 = 126, 63
AMT_A, AMT_B, AMT_BASE = 60, 20, 250
PE_HIST, PE_MIN = 60, 36
IND_MIN = 5
PE_THR, EP_THR = 0.90, 0.10
C2_THR, C2_LAG = 0.95, 60
CRASH_REBOUND, CRASH_DROP = 0.20, -0.20
N_PLACEBO = 1000
BOOT_BLOCKS = (6, 12, 24)
N_BOOT = 5000
RF_FILL_ANNUAL = 0.015
CAPITAL_FEAS = 1_000_000.0
EXPECTED_SHA = {
    "prices.parquet": "dd61e3085b6346180b3427ffe27ff18bdfc36980a22216f70baaa2bf059bbd3e",
    "fin_pit.parquet": "da32cbced36ba631453e4959f627d8a5abfeadc530f72f0485ca30b6c380c6df",
    "industry_pit.parquet": "a75ebc7e31768ec52830b7e62563f031b88ea2af6bac89f8a3dc444c0b499de7",
    "securities.parquet": "398590347a823de1a6dcf7a7b3b8d1ed61cc6cfda1d368181e3b59cc8562271d",
}
FIRST_SENTENCE = (
    "本研究检验的是申万一级行业的「6 个月相对强 + 成交额集中 + 行业 PE 自身分位过滤」，不是题材或概念本身"
    "（AI、机器人这类主线跨越多个一级行业）；C1a / C1b 结构上集中持有 1–2 个行业，不是降波动写法；验证段不是样本外；"
    "已退市股票不在行业篮子里；整行业篮子普通账户难以执行，行业 ETF 多跟踪中证指数且大多 2013 年后才有。"
)
DEVIATIONS = [
    "成本模式（CLARIFY-2 第 1 条）：冻结 PREREG 写「本金 100 万元、计最低佣金与整手」；实测 100 万元整手下 B0 只能买到目标权重的 "
    "25–35%、B1 约 25%，不截断则最低佣金约 2%/月，均不能代表行业 / 全市场篮子。主口径改为 factorlab 比例成本模式（佣金 + 印花 + 过户 + "
    "分档滑点，无整手、无最低佣金）；100 万元整手 + 最低佣金只作可执行性报告项（feasibility1e6），不参与判定。依据可行性测量修正、未看收益。",
]


# ================================================================ 小工具
def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
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


def tie_hex(n: str) -> str:
    return hashlib.sha256(f"tie:{n}".encode()).hexdigest()


def month_ends(dates: pd.DatetimeIndex) -> pd.DatetimeIndex:
    s = pd.Series(dates, index=dates)
    return pd.DatetimeIndex(pd.to_datetime(s.groupby(dates.to_period("M")).max().values))


def cum_ret(series: np.ndarray, L: int) -> np.ndarray:
    out = np.full(len(series), np.nan)
    log1 = np.where(np.isfinite(series), np.log1p(np.clip(series, -0.95, 10)), np.nan)
    need = int(L * 0.8)
    for i in range(L - 1, len(series)):
        w = log1[i - L + 1: i + 1]
        if np.isfinite(w).sum() >= need:
            out[i] = float(np.expm1(np.nansum(w)))
    return out


def resume_returns(px: np.ndarray) -> np.ndarray:
    """以前一有效收盘为基准；停牌缺行时复牌日计入期间涨跌。"""
    n_d, n_c = px.shape
    out = np.full((n_d, n_c), np.nan)
    last = np.full(n_c, np.nan)
    for t in range(n_d):
        cur = px[t]
        ok = np.isfinite(cur) & (cur > 0)
        both = ok & np.isfinite(last) & (last > 0)
        out[t, both] = cur[both] / last[both] - 1.0
        last[ok] = cur[ok]
    return out


def fnum(x):
    if x is None:
        return None
    x = float(x)
    return x if math.isfinite(x) else None


def perf(r: np.ndarray, rf: np.ndarray) -> dict:
    """与 factorlab.backtest.perf_stats 同口径：CAGR（252 日）、年化波动、日超额夏普、最大回撤。"""
    r = np.asarray(r, float)
    rf = np.asarray(rf, float)
    if len(r) < 2:
        return {"cagr": None, "vol": None, "sharpe": None, "maxdd": None, "n": int(len(r))}
    nav = np.cumprod(1 + r)
    ex = r - rf
    sd = ex.std(ddof=1)
    return {"cagr": fnum(nav[-1] ** (252 / len(r)) - 1), "vol": fnum(r.std(ddof=1) * math.sqrt(252)),
            "sharpe": fnum(ex.mean() / sd * math.sqrt(252)) if sd > 0 else None,
            "maxdd": fnum((nav / np.maximum.accumulate(nav) - 1).min()), "n": int(len(r))}


def holm(p: dict[str, float]) -> dict[str, float]:
    items = sorted(p.items(), key=lambda kv: kv[1])
    m = len(items)
    out, run = {}, 0.0
    for i, (k, v) in enumerate(items):
        run = max(run, min(1.0, (m - i) * v))
        out[k] = run
    return out


def polyline_segments(I: np.ndarray, min_drop: float = CRASH_DROP, rebound: float = CRASH_REBOUND) -> list[tuple]:
    """折线法：从低点反弹 ≥ rebound 后再跌算新段；返回全部跌幅 ≤ min_drop 的 (峰位, 谷位, 跌幅)，按时间排序。"""
    n = len(I)
    segs = []
    if n < 3:
        return segs
    peak_i = trough_i = 0
    peak = trough = I[0]
    for i in range(1, n):
        if I[i] >= peak:
            peak, peak_i = I[i], i
            trough, trough_i = I[i], i
        elif I[i] < trough:
            trough, trough_i = I[i], i
        if trough < peak and I[i] >= trough * (1.0 + rebound):
            drop = trough / peak - 1.0
            if drop <= min_drop:
                segs.append((peak_i, trough_i, drop))
            peak, peak_i = I[i], i
            trough, trough_i = I[i], i
    if trough < peak:
        drop = trough / peak - 1.0
        if drop <= min_drop:
            segs.append((peak_i, trough_i, drop))
    return sorted(segs, key=lambda s: s[0])


def seg_returns(r: np.ndarray, segs) -> list[float]:
    nav = np.cumprod(1 + np.asarray(r, float))
    return [float(nav[t] / nav[p] - 1.0) for p, t, _ in segs]


def L_ratio(rc: np.ndarray, rb: np.ndarray, segs) -> tuple[float | None, list[float], list[float]]:
    c, b = seg_returns(rc, segs), seg_returns(rb, segs)
    sb = sum(b)
    return (sum(c) / sb if sb != 0 else None), c, b


def single_seg_share(c: list[float], b: list[float]) -> float | None:
    imp = [(-bi) - (-ci) for ci, bi in zip(c, b)]   # B1 损失 − 候选损失
    tot = sum(imp)
    return float(max(imp) / tot) if imp and tot > 0 else None


def strict_ni_ttm(fc, end_ex, dates: pd.DatetimeIndex, codes) -> pd.DataFrame:
    """CLARIFY-2 第 12 条报告项：PREREG 括注严格口径——TTM = 最近一期累计 + 上年年报 − 上年同期（年报期直接取年报），
    缺任一项即无 TTM（不退回最近年报）。其余（科目 net_income_parent、可见范围、同一报告期取最晚 avail_date、
    12 季窗口、15 个月陈旧度）与 factorlab.fundamentals_cn.core_fields 完全相同。"""
    codes = pd.Index([str(c) for c in codes])
    fin = fc.guard_fin(fc.read_fin(codes), end_ex, None)
    f = fin[fin["item"] == "net_income_parent"]
    rp = pd.DatetimeIndex(f["report_period"])
    qe = (rp.month.isin([3, 6, 9, 12])) & (((rp.month.isin([3, 12])) & (rp.day == 31))
                                           | ((rp.month.isin([6, 9])) & (rp.day == 30)))
    f = f.loc[np.asarray(qe) & f["value"].notna().to_numpy()]
    ci = codes.get_indexer(f["code"].astype(str))
    ok = ci >= 0
    f, ci = f.loc[ok], ci[ok]
    qi = fc._qidx(f["report_period"])
    av = f["avail_date"].to_numpy("datetime64[D]")
    val = f["value"].to_numpy(float)
    o = np.argsort(av, kind="stable")
    ci, qi, av, val = ci[o], qi[o], av[o], val[o]
    nC, nD, W = len(codes), len(dates), fc.WINDOW_Q + 1
    dq = fc._qidx(dates)
    dd = dates.to_numpy("datetime64[D]")
    rows = np.arange(nC)
    out = np.full((nD, nC), np.nan)
    for t in range(nD):
        base = dq[t] - fc.WINDOW_Q
        k = int(np.searchsorted(av, dd[t], side="right"))
        sel = (qi[:k] >= base) & (qi[:k] <= dq[t])
        c_, q_, v_ = ci[:k][sel], qi[:k][sel] - base, val[:k][sel]
        key = c_ * W + q_
        _, first_rev = np.unique(key[::-1], return_index=True)
        last = len(key) - 1 - first_rev
        V = np.full((nC, W), np.nan)
        V[c_[last], q_[last]] = v_[last]
        qend = fc._q_end(np.arange(base, base + W))
        fresh_q = (dd[t] - qend) / np.timedelta64(1, "D") <= fc.STALE_DAYS
        qoy = np.arange(base, base + W) % 4
        has = ~np.isnan(V)
        P = np.where(has.any(1), W - 1 - np.argmax(has[:, ::-1], axis=1), -1)

        def at(q):
            okq = (q >= 0) & (q < W)
            r = np.full(nC, np.nan)
            r[okq] = V[rows[okq], q[okq]]
            return r

        ytd = at(P)
        qo = np.where(P >= 0, qoy[np.clip(P, 0, W - 1)], -1)
        v = np.where(qo == 3, ytd, ytd + at(P - qo - 1) - at(P - 4))
        fr = (P >= 0) & fresh_q[np.clip(P, 0, W - 1)]
        out[t] = np.where(fr, v, np.nan)
    return pd.DataFrame(out, index=dates, columns=codes)


# ================================================================ 主程序
def main() -> None:
    t_start = time.time()
    print("verify inputs…", flush=True)
    shas = verify_inputs()

    from factorlab import fundamentals_cn as fc
    from factorlab import store
    from factorlab.backtest import DEFAULT_COSTS, DEFAULT_SLIPPAGE
    from factorlab.backtest import allocate as fl_allocate
    from factorlab.universe import AdvCache

    end_ex = store.lockbox_start("cn")
    print("load panel (raw=False)…", flush=True)
    fields = ["close", "close_adj", "open_adj", "open", "high", "low", "amount", "volume", "industry",
              "mcap_float", "mcap_total", "limit_up", "limit_down"]
    panel = store.load_panel("cn", fields, start=WARM_START, end=END, raw=False)
    for k in list(panel):
        panel[k] = panel[k].loc[:END]
    sec = store.read_securities("cn")
    print("fin_ni_ttm…", flush=True)
    fin_ni = fc.panel_fields(["fin_ni_ttm"], panel, end_ex, None)["fin_ni_ttm"]

    close_adj = panel["close_adj"]
    dates = close_adj.index
    codes = list(close_adj.columns)
    n_d, n_c = close_adj.shape
    industry = panel["industry"].map(lambda x: canon(x) if isinstance(x, str) else x)
    ind_v = industry.to_numpy(object)
    px_v = close_adj.to_numpy(float)
    has_px = np.isfinite(px_v) & (px_v > 0)
    cov_v = has_px & pd.notna(industry).to_numpy()
    mf_v = panel["mcap_float"].where(panel["mcap_float"] > 0).to_numpy(float)
    mt_v = panel["mcap_total"].where(panel["mcap_total"] > 0).to_numpy(float)
    amt_v = panel["amount"].to_numpy(float)
    ret_v = resume_returns(px_v)
    all_inds = sorted({x for x in ind_v.ravel() if isinstance(x, str)})
    print(f"days={n_d} codes={n_c} inds={len(all_inds)} {dates[0].date()}…{dates[-1].date()}", flush=True)

    # ---------------------------------------------------------------- 行业日序列（同冻结计数）
    print("aggregate industries…", flush=True)
    ind_ret = {i: np.full(n_d, np.nan) for i in all_inds}
    ind_amt = {i: np.full(n_d, np.nan) for i in all_inds}
    ind_n = {i: np.full(n_d, np.nan) for i in all_inds}
    mkt_amt = np.zeros(n_d)
    b0_fr = np.zeros(n_d)        # 覆盖池市值加权无摩擦（t−1 mcap_float）
    full_fr = np.zeros(n_d)      # 全市场（不要求行业）
    b0_ff = np.zeros(n_d)        # 诊断：权重取最近一个有效 mcap_float（复牌日计入）
    last_mf = np.full(n_c, np.nan)
    resume_excl = np.zeros(n_d)  # 诊断：因 t−1 无行而未计入的复牌收益占（ffill 权重）比例
    for t in range(n_d):
        w_prev = mf_v[t - 1] if t > 0 else np.full(n_c, np.nan)
        g, r, a, cov = ind_v[t], ret_v[t], amt_v[t], cov_v[t]
        mkt_amt[t] = float(np.nansum(a[cov & np.isfinite(a) & (a > 0)]))
        okw = np.isfinite(w_prev) & (w_prev > 0) & np.isfinite(r)
        m0 = okw & cov
        b0_fr[t] = float(np.dot(w_prev[m0], r[m0]) / w_prev[m0].sum()) if m0.any() else 0.0
        mff = np.isfinite(last_mf) & (last_mf > 0) & np.isfinite(r) & cov
        if mff.any():
            b0_ff[t] = float(np.dot(last_mf[mff], r[mff]) / last_mf[mff].sum())
            resume_excl[t] = float(last_mf[mff & ~m0].sum() / last_mf[mff].sum())
        okm = np.isfinite(mf_v[t]) & (mf_v[t] > 0)
        last_mf[okm] = mf_v[t][okm]
        m1 = okw & has_px[t]
        full_fr[t] = float(np.dot(w_prev[m1], r[m1]) / w_prev[m1].sum()) if m1.any() else 0.0
        for name in {x for x in g if isinstance(x, str)}:
            mask = (g == name) & cov
            if not np.any(mask):
                continue
            ww, rr, aa = w_prev[mask], r[mask], a[mask]
            ok = np.isfinite(ww) & (ww > 0) & np.isfinite(rr)
            n_ok = int(ok.sum())
            ind_n[name][t] = n_ok
            if n_ok >= IND_MIN:
                ind_ret[name][t] = float(np.dot(ww[ok], rr[ok]) / ww[ok].sum())
            aok = np.isfinite(aa) & (aa > 0)
            if aok.any():
                ind_amt[name][t] = float(aa[aok].sum())
    mkt_ret = np.array([np.nanmean(ret_v[t, cov_v[t]]) if cov_v[t].any() else np.nan for t in range(n_d)])
    mkt_c3, mkt_c6 = cum_ret(mkt_ret, LOOK_3), cum_ret(mkt_ret, LOOK_6)
    ind_c3 = {i: cum_ret(ind_ret[i], LOOK_3) for i in all_inds}
    ind_c6 = {i: cum_ret(ind_ret[i], LOOK_6) for i in all_inds}

    def shares(win: int):
        sh, elev = {}, {}
        m = pd.Series(mkt_amt).rolling(win, min_periods=win).sum().to_numpy()
        for name in all_inds:
            a = pd.Series(ind_amt[name]).rolling(win, min_periods=win).sum().to_numpy()
            s = np.where((m > 0) & np.isfinite(a), a / m, np.nan)
            sh[name] = s
            base = pd.Series(s).rolling(AMT_BASE, min_periods=120).mean().to_numpy()
            elev[name] = (s > base) & np.isfinite(s) & np.isfinite(base)
        return sh, elev

    share_a, elev_a = shares(AMT_A)
    share_b, elev_b = shares(AMT_B)

    mes_all = month_ends(dates)
    date_pos = {d: i for i, d in enumerate(dates)}
    mes_idx = {me: j for j, me in enumerate(mes_all)}
    ni_m = fin_ni.reindex(index=mes_all, columns=codes)
    pe_stock = {}
    for me in mes_all:
        t = date_pos[me]
        mt = mt_v[t]
        ni = ni_m.loc[me].to_numpy(float)
        ok = np.isfinite(mt) & (mt > 0) & np.isfinite(ni)
        pe_stock[me] = (mt, ni, ok)

    def agg_at(me, mem):
        """t 时成分 mem 在月末 me 的（Σmcap_total, ΣNI）；成员 < 5 或 Σmcap ≤ 0 → None。"""
        mt, ni, ok = pe_stock[me]
        m = mem & ok & cov_v[date_pos[me]]
        if int(m.sum()) < IND_MIN:
            return None
        mc = float(mt[m].sum())
        if mc <= 0:
            return None
        return mc, float(ni[m].sum())

    pe_cache: dict = {}

    def pe_info(me, name) -> dict:
        key = (me, name)
        if key in pe_cache:
            return pe_cache[key]
        t = date_pos[me]
        mem = (ind_v[t] == name) & cov_v[t]
        idx = mes_idx[me]
        window = mes_all[max(0, idx - PE_HIST + 1): idx + 1]
        aggs = [agg_at(m2, mem) for m2 in window]
        cur = aggs[-1]
        info = {"pe_class": None, "pe_pct": None, "ep_class": None, "ep_pct": None}
        # PE（冻结口径）
        if cur is not None and cur[1] <= 0:
            info["pe_class"] = "neg_ni"
        elif cur is None:
            info["pe_class"] = "hist"
        else:
            pe_now = cur[0] / cur[1]
            hist = [a[0] / a[1] for a in aggs if a is not None and a[1] > 0]
            if len(hist) < PE_MIN:
                info["pe_class"] = "hist"
            else:
                info["pe_pct"] = float(np.mean(np.asarray(hist) <= pe_now))
        # E/P（E5：亏损连续处理）
        if cur is None:
            info["ep_class"] = "hist"
        else:
            ep_now = cur[1] / cur[0]
            hist = [a[1] / a[0] for a in aggs if a is not None]
            if len(hist) < PE_MIN:
                info["ep_class"] = "hist"
            else:
                info["ep_pct"] = float(np.mean(np.asarray(hist) <= ep_now))
        pe_cache[key] = info
        return info

    def rank_df(t: int, elev: dict, use_3: bool, tie_mode: str) -> pd.DataFrame:
        rows = []
        for name in all_inds:
            if not (np.isfinite(ind_n[name][t]) and ind_n[name][t] >= IND_MIN):
                continue
            if not bool(elev[name][t]):
                continue
            r6 = ind_c6[name][t]
            if not (np.isfinite(r6) and np.isfinite(mkt_c6[t])):
                continue
            rel3 = None
            if use_3:
                r3 = ind_c3[name][t]
                if not (np.isfinite(r3) and np.isfinite(mkt_c3[t])):
                    continue
                rel3 = float(r3 - mkt_c3[t])
            rows.append({"ind": name, "rel6": float(r6 - mkt_c6[t]), "rel3": rel3})
        if not rows:
            return pd.DataFrame(columns=["ind", "rel6", "rel3", "score", "rank"])
        df = pd.DataFrame(rows)
        if use_3:
            df["score"] = df["rel3"].rank(ascending=False, method="average") + df["rel6"].rank(
                ascending=False, method="average")
        else:
            df["score"] = df["rel6"].rank(ascending=False, method="average")
        df["_tie"] = df["ind"].map(tie_hex)
        keys = ["score", "rel6", "_tie"] if tie_mode == "count" else ["score", "_tie"]
        df = df.sort_values(keys).reset_index(drop=True)
        df["rank"] = np.arange(1, len(df) + 1)
        return df.drop(columns=["_tie"])

    TIE_MODE = "count"  # 见 notes：与冻结计数脚本一致
    print("monthly rank tables…", flush=True)
    rows_a, rows_b = [], []
    for me in mes_all:
        t = date_pos[me]
        rows_a.append({"me": me, "t": t, "df": rank_df(t, elev_a, False, TIE_MODE)})
        rows_b.append({"me": me, "t": t, "df": rank_df(t, elev_b, True, TIE_MODE)})
    n_m = len(mes_all)

    def skip_class(info: dict, mode: tuple) -> str | None:
        kind = mode[0]
        if kind == "ep":
            if info["ep_class"] == "hist":
                return "hist"
            return "pe90" if info["ep_pct"] < mode[1] else None
        if info["pe_class"] in ("neg_ni", "hist"):
            return info["pe_class"]
        if kind == "pe" and info["pe_pct"] > mode[1]:
            return "pe90"
        return None

    def apply_filter(pool, me, k, mode):
        held, st = [], {"pe90": 0, "hist": 0, "neg_ni": 0}
        for name in pool:
            if len(held) >= k:
                break
            c = skip_class(pe_info(me, name), mode)
            if c is not None:
                st[c] += 1
                continue
            held.append(name)
        return held, st

    def run_c1a(k=K, exit_rank=EXIT_RANK, mode=("pe", PE_THR)):
        active, prev_topk = set(), set()
        held_l, skip_l = [], []
        for row in rows_a:
            df = row["df"]
            rank_map = dict(zip(df["ind"], df["rank"])) if len(df) else {}
            topk = {n for n, r in rank_map.items() if r <= k}
            top_exit = {n for n, r in rank_map.items() if r <= exit_rank}
            enter = {n for n in topk if n in prev_topk}
            still = {n for n in active if n in top_exit}
            active = still | enter
            pool = sorted(active, key=lambda n: (rank_map.get(n, 999), tie_hex(n)))
            held, st = apply_filter(pool, row["me"], k, mode)
            held_l.append(held)
            skip_l.append(st)
            prev_topk = topk
        return {"held": held_l, "skips": skip_l, "k": k, "rows": rows_a}

    def run_monthly(rows, k=K, mode=("pe", PE_THR)):
        held_l, skip_l = [], []
        for row in rows:
            ordered = row["df"]["ind"].tolist() if len(row["df"]) else []
            held, st = apply_filter(ordered[: 2 * k], row["me"], k, mode)
            held_l.append(held)
            skip_l.append(st)
        return {"held": held_l, "skips": skip_l, "k": k, "rows": rows}

    print("strategies…", flush=True)
    S = {}
    S["C1a"] = run_c1a()
    S["C1b"] = run_monthly(rows_b)
    S["B2p"] = run_c1a(mode=("pe_none",))
    S["B2b"] = run_monthly(rows_b, mode=("pe_none",))
    S["B4"] = run_monthly(rows_a)
    sens_specs = {
        "E1_C1a_K1": lambda: run_c1a(k=1, exit_rank=max(EXIT_RANK, 3)),
        "E1_C1a_K3": lambda: run_c1a(k=3, exit_rank=max(EXIT_RANK, 5)),
        "E1_C1b_K1": lambda: run_monthly(rows_b, k=1),
        "E1_C1b_K3": lambda: run_monthly(rows_b, k=3),
        "E2_C1a_exit3": lambda: run_c1a(exit_rank=3),
        "E2_C1a_exit5": lambda: run_c1a(exit_rank=5),
        "E5_C1a_EP": lambda: run_c1a(mode=("ep", EP_THR)),
        "E5_C1b_EP": lambda: run_monthly(rows_b, mode=("ep", EP_THR)),
        "E6_C1a_thr080": lambda: run_c1a(mode=("pe", 0.80)),
        "E6_C1a_thr095": lambda: run_c1a(mode=("pe", 0.95)),
        "E6_C1b_thr080": lambda: run_monthly(rows_b, mode=("pe", 0.80)),
        "E6_C1b_thr095": lambda: run_monthly(rows_b, mode=("pe", 0.95)),
    }
    for name, fn in sens_specs.items():
        S[name] = fn()
    # E3：空槽改持 B1（持仓同 C1a / C1b）
    S["E3_C1a_emptyB1"] = {**S["C1a"], "fill": "B1"}
    S["E3_C1b_emptyB1"] = {**S["C1b"], "fill": "B1"}
    # C2 作用于 B2′ 持仓
    c2_events = []
    b2_alloc_c2 = []
    for j, me in enumerate(mes_all):
        t = date_pos[me]
        flagged = []
        for name in S["B2p"]["held"][j]:
            info = pe_info(me, name)
            pct = info["pe_pct"]
            if pct is None or pct <= C2_THR:
                continue
            sh = share_a[name]
            if t < C2_LAG or not np.isfinite(sh[t]) or not np.isfinite(sh[t - C2_LAG]):
                continue
            if sh[t] < sh[t - C2_LAG]:
                flagged.append(name)
                if me >= pd.Timestamp(COUNT_START):
                    c2_events.append({"date": str(me.date()), "pe_pct": pct})
        b2_alloc_c2.append(flagged)

    # 并列次序核对：PREREG 文字只写「average 秩 + sha256」，冻结计数脚本在 sha256 前多了 rel6 升序。
    rows_b_alt = [{"me": r["me"], "t": r["t"], "df": rank_df(r["t"], elev_b, True, "prereg")} for r in rows_b]
    rows_a_alt = [{"me": r["me"], "t": r["t"], "df": rank_df(r["t"], elev_a, False, "prereg")} for r in rows_a]
    c1b_alt = run_monthly(rows_b_alt)
    tie_check = {
        "C1b_monthsHeldDiffer": int(sum(1 for a, b in zip(S["C1b"]["held"], c1b_alt["held"]) if set(a) != set(b))),
        "C1b_monthsHeldDiffer_validate": int(sum(1 for me, a, b in zip(mes_all, S["C1b"]["held"], c1b_alt["held"])
                                                 if me >= pd.Timestamp("2015-01-01") and set(a) != set(b))),
        "rankA_monthsOrderDiffer": int(sum(1 for x, y in zip(rows_a, rows_a_alt)
                                           if x["df"]["ind"].tolist() != y["df"]["ind"].tolist())),
        "rankB_monthsOrderDiffer": int(sum(1 for x, y in zip(rows_b, rows_b_alt)
                                           if x["df"]["ind"].tolist() != y["df"]["ind"].tolist())),
    }
    print("tieCheck:", tie_check, flush=True)
    S["E0_C1b_tiePrereg"] = c1b_alt  # 报告项：按 PREREG 文字（只用 sha256 打破并列）的 C1b

    # ---------------------------------------------------------------- 计数核对
    in_count =np.array([me >= pd.Timestamp(COUNT_START) for me in mes_all])

    def hold_stats(held_l, sel):
        hs = [h for h, s in zip(held_l, sel) if s]
        runs, run_len = [], {}
        for h in hs:
            for n in list(run_len):
                if n not in h:
                    runs.append(run_len.pop(n))
            for n in h:
                run_len[n] = run_len.get(n, 0) + 1
        runs += list(run_len.values())
        turns = [0.0 if not set(a) and not set(b) else 1.0 - len(set(a) & set(b)) / max(1, len(set(a) | set(b)))
                 for a, b in zip(hs[:-1], hs[1:])]
        return {"months": len(hs), "months_with_held": sum(1 for h in hs if h),
                "months_empty": sum(1 for h in hs if not h),
                "switches": sum(1 for a, b in zip(hs[:-1], hs[1:]) if set(a) != set(b)),
                "mean_held": float(np.mean([len(h) for h in hs])) if hs else 0.0,
                "median_run": float(np.median(runs)) if runs else None,
                "mean_run": float(np.mean(runs)) if runs else None,
                "max_run": int(np.max(runs)) if runs else None,
                "mean_turnover_jaccard": float(np.mean(turns)) if turns else None}

    def skip_sum(skip_l, sel):
        out = {"pe90": 0, "hist": 0, "neg_ni": 0}
        for st, s in zip(skip_l, sel):
            if s:
                for k2 in out:
                    out[k2] += st[k2]
        return out

    def win_sel(lo, hi):
        return np.array([pd.Timestamp(lo) <= me <= pd.Timestamp(hi) for me in mes_all])

    counts_ref = json.loads((HERE / "counts_theme_pe.json").read_text())
    diffs = []

    def cmp(label, mine: dict, ref: dict, keys):
        for kk in keys:
            if kk not in ref:
                continue
            a, b = mine.get(kk), ref[kk]
            if isinstance(b, dict):
                for k3 in b:
                    if a.get(k3) != b[k3]:
                        diffs.append(f"{label}.{kk}.{k3}: mine={a.get(k3)} ref={b[k3]}")
            elif b is None or a is None:
                if a != b:
                    diffs.append(f"{label}.{kk}: mine={a} ref={b}")
            elif abs(float(a) - float(b)) > 1e-9:
                diffs.append(f"{label}.{kk}: mine={a} ref={b}")

    full_keys = ["months", "months_with_held", "months_empty", "switches", "mean_held", "median_run", "mean_run",
                 "max_run", "mean_turnover_jaccard", "skips"]
    for nm, ref_key in (("C1a", "C1a"), ("C1b", "C1b"), ("B2p", "B2_persistent_no_pe90"),
                        ("B2b", "B2b_monthly_no_pe90"), ("B4", "B4_monthly_c1a_signal")):
        mine = {**hold_stats(S[nm]["held"], in_count), "skips": skip_sum(S[nm]["skips"], in_count)}
        cmp(nm, mine, counts_ref[ref_key], full_keys)
    for wname, (lo, hi) in (("explore", ("2005-01-01", "2014-12-31")), ("validate", ("2015-01-01", "2023-10-31"))):
        for nm in ("C1a", "C1b"):
            cmp(f"{wname}_{nm}", hold_stats(S[nm]["held"], win_sel(lo, hi)), counts_ref["windows"][f"{wname}_{nm}"],
                ["months", "months_with_held", "months_empty", "switches", "mean_held"])
    for kk, nm in (("K=1", "E1_C1a_K1"), ("K=2", "C1a"), ("K=3", "E1_C1a_K3")):
        mine = {**hold_stats(S[nm]["held"], in_count), "skips": skip_sum(S[nm]["skips"], in_count)}
        cmp(f"sensK.{kk}", mine, counts_ref["sensitivity_C1a_K"][kk], full_keys)
    if len(c2_events) != counts_ref["c2_on_B2"]["n"]:
        diffs.append(f"c2.n: mine={len(c2_events)} ref={counts_ref['c2_on_B2']['n']}")
    print("countsCheck diffs:", diffs if diffs else "none", flush=True)

    # 严格 TTM 报告项（CLARIFY-2 第 12 条）：只换 PE 用的 NI，信号其余不变；完成后恢复主口径
    print("strict TTM…", flush=True)
    ni_strict = strict_ni_ttm(fc, end_ex, mes_all, codes).reindex(index=mes_all, columns=codes)
    a_main, a_strict = ni_m.to_numpy(float), ni_strict.to_numpy(float)
    both = np.isfinite(a_main) & np.isfinite(a_strict)
    pe_stock_main, pe_cache_main = pe_stock, pe_cache
    pe_stock = {}
    for me in mes_all:
        t = date_pos[me]
        mt = mt_v[t]
        ni = ni_strict.loc[me].to_numpy(float)
        pe_stock[me] = (mt, ni, np.isfinite(mt) & (mt > 0) & np.isfinite(ni))
    pe_cache = {}
    strict_runs = {"C1a": run_c1a(), "C1b": run_monthly(rows_b), "B2p": run_c1a(mode=("pe_none",)),
                   "B2b": run_monthly(rows_b, mode=("pe_none",)), "B4": run_monthly(rows_a)}
    pe_stock, pe_cache = pe_stock_main, pe_cache_main
    covm = np.vstack([cov_v[date_pos[me]] for me in mes_all])
    strict_ttm = {
        "cellsMainFinite": int(np.isfinite(a_main).sum()),
        "cellsStrictFinite": int(np.isfinite(a_strict).sum()),
        "cellsFallbackOnly": int((np.isfinite(a_main) & ~np.isfinite(a_strict)).sum()),
        "cellsFallbackOnlyCovered": int((np.isfinite(a_main) & ~np.isfinite(a_strict) & covm).sum()),
        "cellsStrictOnly": int((~np.isfinite(a_main) & np.isfinite(a_strict)).sum()),
        "cellsBothDiffer": int((both & ~np.isclose(a_main, a_strict, rtol=1e-12, atol=0)).sum()),
        "heldMonthsDiffer": {},
        "note": "月末 × 股票格。fallbackOnly = 主口径因缺季度退回最近年报、严格口径无 TTM 的格；heldMonthsDiffer = 持仓集合不同的月份",
    }
    for nm, st in strict_runs.items():
        dm = [str(me.date()) for me, a_, b_ in zip(mes_all, S[nm]["held"], st["held"]) if set(a_) != set(b_)]
        strict_ttm["heldMonthsDiffer"][nm] = {"n": len(dm), "nValidate": sum(1 for x in dm if x >= "2015-01-01"),
                                              "months": dm}
    S["E0_C1a_ttmStrict"] = strict_runs["C1a"]
    S["E0_C1b_ttmStrict"] = strict_runs["C1b"]
    print("strictTTM:", {k: v for k, v in strict_ttm.items() if k != "heldMonthsDiffer"},
          {k: v["n"] for k, v in strict_ttm["heldMonthsDiffer"].items()}, flush=True)

    # ---------------------------------------------------------------- 组合目标权重（个股）
    print("target weights…", flush=True)
    basket, b0_vec, b1_vec, b1_members = {}, {}, {}, {}
    for j, me in enumerate(mes_all):
        t = date_pos[me]
        mf = mf_v[t]
        okm = cov_v[t] & np.isfinite(mf) & (mf > 0)
        v = np.where(okm, mf, 0.0)
        b0_vec[j] = v / v.sum()
        g = ind_v[t]
        bk = {}
        for name in all_inds:
            m = okm & (g == name)
            if m.any():
                w = np.where(m, mf, 0.0)
                bk[name] = (np.flatnonzero(m), w[m] / w[m].sum(), int(m.sum()))
        basket[j] = bk
        mem = [n for n, (_, _, cnt) in bk.items() if cnt >= IND_MIN]
        b1_members[j] = mem
        vec = np.zeros(n_c)
        for n in mem:
            ix, ww, _ = bk[n]
            vec[ix] += ww / len(mem)
        b1_vec[j] = vec

    def alloc_of(strat: dict, j: int, flagged: list | None = None) -> dict:
        held = strat["held"][j]
        k = strat["k"]
        fill = strat.get("fill", "B0")
        a = {}
        for n in held:
            if flagged and n in flagged:
                a["B0"] = a.get("B0", 0.0) + 1.0 / k
            else:
                a[n] = a.get(n, 0.0) + 1.0 / k
        rest = 1.0 - len(held) / k
        if rest > 1e-12:
            a[fill] = a.get(fill, 0.0) + rest
        return a

    def target_vec(j: int, alloc: dict) -> np.ndarray:
        vec = np.zeros(n_c)
        for asset, w in alloc.items():
            if asset == "B0":
                vec += w * b0_vec[j]
            elif asset == "B1":
                vec += w * b1_vec[j]
            else:
                ix, ww, _ = basket[j][asset]
                vec[ix] += w * ww
        return vec

    # ---------------------------------------------------------------- 执行引擎
    print("execution arrays…", flush=True)
    cm = DEFAULT_COSTS["cn"]
    slip = DEFAULT_SLIPPAGE["cn"]
    C = close_adj.ffill().to_numpy(float)
    O = panel["open_adj"].to_numpy(float)
    O = np.where(has_px & np.isfinite(O), O, C)
    C_prev = np.vstack([C[:1], C[:-1]])
    r_on = np.nan_to_num(O / C_prev - 1)
    r_in = np.nan_to_num(C / O - 1)
    if "delist_date" in sec:
        dl = pd.to_datetime(sec.drop_duplicates("code").set_index("code")["delist_date"].reindex(codes)).to_numpy()
        delisted = (~pd.isna(dl))[None, :] & (dates.to_numpy()[:, None] >= dl[None, :])
    else:
        delisted = np.zeros((n_d, n_c), bool)
    new_delist = delisted & ~np.vstack([np.zeros((1, n_c), bool), delisted[:-1]])
    vol_raw = panel["volume"].to_numpy(float)
    susp = (~has_px & ~delisted) | (has_px & np.isfinite(vol_raw) & (vol_raw <= 0))
    o_r, h_r, l_r, c_r = (panel[x].to_numpy(float) for x in ("open", "high", "low", "close"))
    flat = np.isclose(o_r, h_r) & np.isclose(o_r, l_r) & np.isclose(o_r, c_r)
    lim_up = panel["limit_up"].fillna(False).to_numpy(bool) & flat
    lim_dn = panel["limit_down"].fillna(False).to_numpy(bool) & flat
    can_sell = ~susp & ~lim_dn & ~delisted
    can_buy = has_px & ~susp & ~lim_up & ~delisted
    px_exec = o_r
    adv = AdvCache(panel["amount"], slip.window, max(1, slip.window // 2))
    del o_r, h_r, l_r, c_r, flat
    exec_day = {j: date_pos[me] + 1 for j, me in enumerate(mes_all) if date_pos[me] + 1 < n_d}
    first_exec = exec_day[0]

    def backtest(alloc_list: list[dict], capital: float | None = None, mode: str = "cash") -> dict:
        """mode='cash'（主口径，CLARIFY-2 第 11 / 11a 条）：锁定持仓保留原权重，其余目标先按剩余预算做超预算缩放，
        再截去买不进的部分（买不进且未持有 → 0；已持有 → 不超过原权重），被截去的权重留现金到下个调仓日；
        mode='truncfirst'（报告项，主实现第一版顺序）：先截断买不进、再超预算缩放（买不进份额被缩放吸收）；
        mode='allocate'（报告项）：factorlab.backtest.allocate，剩余资金按目标权重分给可买入的目标。"""
        targets = {exec_day[j]: target_vec(j, alloc_list[j]) for j in exec_day}
        w = np.zeros(n_c)
        nav = 1.0
        pending = np.zeros(n_c, bool)
        gross = np.zeros(n_d)
        net = np.zeros(n_d)
        invest_ratio, cash_share, n_delist = [], np.zeros(n_d), 0
        to_d = np.zeros(n_d)
        cost_d = np.zeros(n_d)

        def trade(i, new, w_old):
            dw = new - w_old
            if capital is not None:
                V = capital * nav
                px = np.where(np.isfinite(px_exec[i]) & (px_exec[i] > 0), px_exec[i], np.nan)
                sh = np.trunc(np.nan_to_num(dw * V / (px * cm.lot_size))) * cm.lot_size
                dw_lot = np.nan_to_num(sh * px / V)
                dw = np.where(new == 0, -w_old, dw_lot)
                new = w_old + dw
            b, s = cm.stamp_rates(dates[i])
            buy, sell = np.clip(dw, 0, None), np.clip(-dw, 0, None)
            comm = (buy + sell) * (cm.commission + cm.other)
            if capital is not None and cm.min_commission > 0:
                V = capital * nav
                traded = (buy + sell) > 1e-12
                comm = np.where(traded, np.maximum((buy + sell) * cm.commission, cm.min_commission / V)
                                + (buy + sell) * cm.other, 0.0)
            tr = (buy + sell) > 0
            sr = np.zeros(n_c)
            if tr.any():
                a = adv.row(dates[i])
                sr = slip.rate(a if a is not None else np.full(n_c, np.nan))
            c = float(comm.sum() + (buy * b).sum() + (sell * s).sum() + ((buy + sell) * sr).sum())
            to_d[i] += float(np.abs(dw).sum() / 2)
            cost_d[i] += c
            return new, c

        for i in range(first_exec, n_d):
            rp1 = float(w @ r_on[i])
            w = w * (1 + r_on[i]) / (1 + rp1)
            hit = new_delist[i] & (w > 0)
            rp_del = 0.0
            if hit.any():
                n_delist += int(hit.sum())
                rp_del = float(-w[hit].sum())
                w = np.where(hit, 0.0, w) / (1 + rp_del)
                pending &= ~hit
            cost = 0.0
            if pending.any():
                sell_now = pending & can_sell[i]
                if sell_now.any():
                    w, c = trade(i, np.where(sell_now, 0.0, w), w)
                    cost += c
                    pending &= ~sell_now
            if i in targets:
                tgt = targets[i]
                locked = (w > 0) & ~can_sell[i]
                if mode == "allocate":
                    new = fl_allocate(tgt > 0, tgt, w, locked, can_buy[i])
                elif mode == "cash":
                    new = np.where(locked, w, 0.0)
                    budget = max(1.0 - new.sum(), 0.0)
                    desired = np.where(~locked, tgt, 0.0)
                    sd = desired.sum()
                    if sd > budget and sd > 0:
                        desired = desired * (budget / sd)
                    desired = np.where(can_buy[i], desired, np.minimum(desired, w))
                    new = new + desired
                else:  # truncfirst
                    new = np.where(locked, w, 0.0)
                    free = ~locked
                    desired = np.where(free, np.where(can_buy[i], tgt, np.minimum(tgt, w)), 0.0)
                    budget = max(1.0 - new.sum(), 0.0)
                    sd = desired.sum()
                    if sd > budget and sd > 0:
                        desired *= budget / sd
                    new = new + desired
                pending = locked & (tgt <= 0)
                w, c = trade(i, new, w)
                cost += c
                invest_ratio.append(float(w.sum()))
            rp2 = float(w @ r_in[i])
            w = w * (1 + r_in[i]) / (1 + rp2)
            g = (1 + rp1) * (1 + rp_del) * (1 + rp2) - 1
            nt = (1 + g) * (1 - cost) - 1
            nav *= 1 + nt
            gross[i], net[i] = g, nt
            cash_share[i] = 1.0 - float(w.sum())
        n_days_bt = n_d - first_exec
        return {"gross": gross, "net": net, "turnover_ann": to_d.sum() / max(n_days_bt, 1) * 252,
                "cost_ann": cost_d.sum() / max(n_days_bt, 1) * 252, "to_d": to_d, "cost_d": cost_d,
                "invest_ratio_mean": float(np.mean(invest_ratio)) if invest_ratio else None,
                "cash_share_mean": float(cash_share[first_exec:].mean()), "cash_share": cash_share,
                "n_delist_hits": n_delist}

    allocs = {}
    for nm, st in S.items():
        allocs[nm] = [alloc_of(st, j) for j in range(n_m)]
    allocs["B0"] = [{"B0": 1.0} for _ in range(n_m)]
    allocs["B1"] = [{"B1": 1.0} for _ in range(n_m)]
    allocs["B2p_C2"] = [alloc_of(S["B2p"], j, b2_alloc_c2[j]) for j in range(n_m)]

    print("backtests…", flush=True)
    BT = {}
    for nm in allocs:
        t0 = time.time()
        BT[nm] = backtest(allocs[nm])
        print(f"  {nm} {time.time() - t0:.1f}s", flush=True)
    BT_ALLOC, BT_TRUNC = {}, {}
    for nm in ("C1a", "C1b", "B0", "B1", "B2p", "B2b", "B4"):
        BT_ALLOC[nm] = backtest(allocs[nm], mode="allocate")
        BT_TRUNC[nm] = backtest(allocs[nm], mode="truncfirst")
        print(f"  allocate / truncfirst {nm}", flush=True)
    BT_CAP = {}
    for nm in ("C1a", "C1b", "B0", "B1", "B2p", "B2b", "B4"):
        BT_CAP[nm] = backtest(allocs[nm], capital=CAPITAL_FEAS)
        print(f"  cap {nm}", flush=True)

    # ---------------------------------------------------------------- 无风险利率（CLARIFY-1 第 2 条）
    rf_csv = ROOT / "docs/research/factorlab/inputs/CH_4_fac_update_20211231.csv"
    lines = rf_csv.read_text(encoding="utf-8-sig").splitlines()
    hdr = next(i for i, ln in enumerate(lines) if ln.startswith("mnthdt"))
    rfm = {}
    for ln in lines[hdr + 1:]:
        parts = ln.split(",")
        if len(parts) >= 2 and parts[0].strip().isdigit():
            rfm[pd.Timestamp(parts[0]).to_period("M")] = float(parts[1]) / 100.0
    last_csv = max(rfm)
    fill_m = (1 + RF_FILL_ANNUAL) ** (1 / 12) - 1
    periods = dates.to_period("M")
    n_in_month = pd.Series(1, index=dates).groupby(periods).transform("count").to_numpy()
    rf_month = np.array([rfm.get(p, fill_m if p > last_csv else np.nan) for p in periods])
    if np.isnan(rf_month).any():
        raise SystemExit("rf 缺月")
    rf_d = (1 + rf_month) ** (1 / n_in_month) - 1

    # ---------------------------------------------------------------- 度量
    def wmask(lo, hi):
        m = (dates >= pd.Timestamp(lo)) & (dates <= pd.Timestamp(hi))
        m &= np.arange(n_d) >= first_exec
        return np.asarray(m)

    WM = {w: wmask(*v) for w, v in WINDOWS.items()}

    def series_block(bt, wm):
        return {"gross": perf(bt["gross"][wm], rf_d[wm]), "net": perf(bt["net"][wm], rf_d[wm]),
                "turnoverAnn": fnum(bt["to_d"][wm].sum() / max(int(wm.sum()), 1) * 252),
                "costAnn": fnum(bt["cost_d"][wm].sum() / max(int(wm.sum()), 1) * 252),
                "cashShareMean": fnum(bt["cash_share"][wm].mean()), "cashShareMax": fnum(bt["cash_share"][wm].max())}

    metrics = {}
    kstar = {}
    for w, wm in WM.items():
        blk = {nm: series_block(BT[nm], wm) for nm in ("C1a", "C1b", "B0", "B1", "B2p", "B2b", "B4", "B2p_C2")}
        for cand in ("C1a", "C1b"):
            for kind in ("net", "gross"):
                k_ = BT[cand][kind][wm].std(ddof=1) / BT["B1"][kind][wm].std(ddof=1)
                kstar[(w, cand, kind)] = k_
            b1s = {kind: kstar[(w, cand, kind)] * BT["B1"][kind] + (1 - kstar[(w, cand, kind)]) * rf_d
                   for kind in ("net", "gross")}
            blk[f"B1star_{cand}"] = {"gross": perf(b1s["gross"][wm], rf_d[wm]), "net": perf(b1s["net"][wm], rf_d[wm]),
                                     "k": fnum(kstar[(w, cand, "net")]), "kGross": fnum(kstar[(w, cand, "gross")])}
        blk["B0_frictionless"] = {"gross": perf(b0_fr[wm], rf_d[wm]), "net": perf(b0_fr[wm], rf_d[wm])}
        metrics[w] = blk

    # ---------------------------------------------------------------- 急跌段与 L
    seg_store = {}
    crash = {}
    for w in ("validate", "explore", "full"):
        wm = WM[w]
        idx = np.flatnonzero(wm)
        I = np.cumprod(1 + b0_fr[idx])
        segs = polyline_segments(I)
        seg_store[w] = (idx, segs)
        names = ["C1a", "C1b", "B0", "B1", "B2p", "B2b", "B4"]
        rets = {nm: seg_returns(BT[nm]["net"][idx], segs) for nm in names}
        rets_g = {nm: seg_returns(BT[nm]["gross"][idx], segs) for nm in names}
        seg_list = []
        for si, (p, t, d) in enumerate(segs):
            seg_list.append({"peak": str(dates[idx[p]].date()), "trough": str(dates[idx[t]].date()), "dropB0": float(d),
                             "ret": {nm: rets[nm][si] for nm in names},
                             "retGross": {nm: rets_g[nm][si] for nm in names}})
        Ls, shares_ = {}, {}
        for nm in names:
            Ln, c_, b_ = L_ratio(BT[nm]["net"][idx], BT["B1"]["net"][idx], segs)
            Lg, _, _ = L_ratio(BT[nm]["gross"][idx], BT["B1"]["gross"][idx], segs)
            Ls[nm] = {"net": fnum(Ln), "gross": fnum(Lg)}
            shares_[nm] = single_seg_share(c_, b_)
        crash[w] = {"segments": seg_list, "L": Ls, "singleSegShare": shares_, "nSegments": len(segs)}

    # ---------------------------------------------------------------- 行业层无摩擦模拟（安慰剂用）
    ind_ret_f = {n: np.nan_to_num(ind_ret[n]) for n in all_inds}
    month_days = {}
    for j in range(n_m):
        if j + 1 < n_m:
            month_days[j] = np.arange(date_pos[mes_all[j]] + 1, date_pos[mes_all[j + 1]] + 1)

    def asset_ret(a):
        return b0_fr if a == "B0" else ind_ret_f[a]

    def sim_month(j, alloc):
        dd = month_days[j]
        assets = list(alloc)
        w0 = np.array([alloc[a] for a in assets])
        R = np.column_stack([asset_ret(a)[dd] for a in assets])
        vals = w0[None, :] * np.cumprod(1 + R, axis=0)
        V = vals.sum(axis=1)
        Vp = np.concatenate([[w0.sum()], V[:-1]])
        return V / Vp - 1

    def sim_series(alloc_list, js):
        out = np.zeros(n_d)
        for j in js:
            if j in month_days:
                out[month_days[j]] = sim_month(j, alloc_list[j])
        return out

    val_js = [j for j in range(n_m) if j in month_days
              and dates[month_days[j][0]] >= pd.Timestamp(WINDOWS["validate"][0])
              and dates[month_days[j][-1]] <= pd.Timestamp(WINDOWS["validate"][1])]
    # 2014-12-31 的持仓在 2015-01 首日起生效；month_days[j] 首日 = t+1
    b1_alloc_sim = [{n: 1.0 / len(b1_members[j]) for n in b1_members[j]} for j in range(n_m)]
    b1_sim = sim_series(b1_alloc_sim, val_js)
    v_idx, v_segs = seg_store["validate"]

    def sim_stats(r):
        rr, rf_ = r[v_idx], rf_d[v_idx]
        Lv, c_, b_ = L_ratio(rr, b1_sim[v_idx], v_segs)
        p_ = perf(rr, rf_)
        return {"L": Lv, "vol": p_["vol"], "maxdd": p_["maxdd"], "sharpe": p_["sharpe"]}

    print("placebo…", flush=True)
    placebo_rand, placebo_shift, power = {}, {}, {}
    p_L = {}
    for cand, rows in (("C1a", rows_a), ("C1b", rows_b)):
        st = S[cand]
        k = st["k"]
        actual = sim_stats(sim_series(allocs[cand], val_js))
        # 段：持仓集合不变的最大连续月（验证月份内）
        segs_h = []
        prev = None
        for j in val_js:
            h = tuple(sorted(st["held"][j]))
            if h != prev:
                segs_h.append([j, [j], h])
            else:
                segs_h[-1][1].append(j)
            prev = h
        rng = np.random.default_rng(SEED)
        sims = []
        for _ in range(N_PLACEBO):
            al = [None] * n_m
            for start_j, js_, h in segs_h:
                if not h:
                    for j in js_:
                        al[j] = {"B0": 1.0}
                    continue
                pool = rows[start_j]["df"]["ind"].tolist()
                pick = list(rng.choice(pool, size=len(h), replace=False))
                for j in js_:
                    a = {n: 1.0 / k for n in pick}
                    rest = 1.0 - len(pick) / k
                    if rest > 1e-12:
                        a["B0"] = rest
                    al[j] = a
            sims.append(sim_stats(sim_series(al, val_js)))
        arr = {m: np.array([s[m] for s in sims], float) for m in ("L", "vol", "maxdd", "sharpe")}
        pv = {
            "L": float((1 + np.sum(arr["L"] <= actual["L"])) / (1 + N_PLACEBO)),
            "vol": float((1 + np.sum(arr["vol"] <= actual["vol"])) / (1 + N_PLACEBO)),
            "maxdd": float((1 + np.sum(arr["maxdd"] >= actual["maxdd"])) / (1 + N_PLACEBO)),
            "sharpe": float((1 + np.sum(arr["sharpe"] >= actual["sharpe"])) / (1 + N_PLACEBO)),
        }
        p_L[cand] = pv["L"]
        placebo_rand[cand] = {
            "n": N_PLACEBO, "seed": SEED, "nSegments": len(segs_h),
            "nHeldSegments": sum(1 for s in segs_h if s[2]),
            "actualSim": {m: fnum(v) for m, v in actual.items()},
            "p": pv,
            "placeboQuantiles": {m: {q: fnum(np.nanquantile(arr[m], q)) for q in (0.05, 0.25, 0.5, 0.75, 0.95)}
                                 for m in arr},
            "betterDefinition": "L/vol：安慰剂 ≤ 实际；maxdd/sharpe：安慰剂 ≥ 实际",
        }
        # 循环平移
        N = len(val_js)
        Ls_shift = []
        for s_ in range(1, N):
            al = [None] * n_m
            for ii, j in enumerate(val_js):
                al[j] = allocs[cand][val_js[(ii + s_) % N]]
            Ls_shift.append(sim_stats(sim_series(al, val_js))["L"])
        Ls_shift = np.array(Ls_shift, float)
        placebo_shift[cand] = {"nShifts": int(N - 1), "actualL": fnum(actual["L"]),
                               "p": float((1 + np.sum(Ls_shift <= actual["L"])) / N),
                               "quantiles": {q: fnum(np.quantile(Ls_shift, q)) for q in (0.05, 0.5, 0.95)}}
        # 功效：真 L 比随机行业选择的典型值低 0.05（安慰剂分布整体左移 0.05）
        alt = arr["L"] - 0.05
        p_alt = np.array([(1 + np.sum(arr["L"] <= a_)) / (1 + N_PLACEBO) for a_ in alt])
        power[cand] = {"design": "以随机行业安慰剂 L 分布为零分布；备择 = 同一分布整体减 0.05（真 L 改善 0.05）；"
                                 "逐一计算其 p，功效 = P(p ≤ α)。直接针对冻结的主检验（安慰剂 L 单边 p）。",
                       "power_alpha_0.10": float(np.mean(p_alt <= 0.10)),
                       "power_alpha_0.05_holm_worst": float(np.mean(p_alt <= 0.05)),
                       "placeboL_sd": fnum(np.nanstd(arr["L"], ddof=1))}
    holm_p = holm(p_L)

    # ---------------------------------------------------------------- 月度序列、bootstrap、拆分
    def monthly(r, js):
        return np.array([float(np.prod(1 + r[month_days[j]]) - 1) for j in js])

    rf_mon_arr = lambda js: np.array([float(np.prod(1 + rf_d[month_days[j]]) - 1) for j in js])  # noqa: E731
    bootstrap = {}
    rng_b = np.random.default_rng(SEED)
    rfm_v = rf_mon_arr(val_js)
    mB1 = monthly(BT["B1"]["net"], val_js)

    def sh_m(x, rf_):
        ex = x - rf_
        sd = ex.std(ddof=1)
        return ex.mean() / sd * math.sqrt(12) if sd > 0 else np.nan

    for cand in ("C1a", "C1b"):
        mc = monthly(BT[cand]["net"], val_js)
        N = len(mc)
        obs_sh = sh_m(mc, rfm_v) - sh_m(mB1, rfm_v)
        obs_vol = (mc.std(ddof=1) - mB1.std(ddof=1)) * math.sqrt(12)
        out = {"observed": {"sharpeDiff": fnum(obs_sh), "volDiff": fnum(obs_vol)}, "nMonths": N}
        for b in BOOT_BLOCKS:
            shd, vd = np.empty(N_BOOT), np.empty(N_BOOT)
            nb = int(math.ceil(N / b))
            for it in range(N_BOOT):
                starts = rng_b.integers(0, N, size=nb)
                ix = (starts[:, None] + np.arange(b)[None, :]).ravel() % N
                ix = ix[:N]
                shd[it] = sh_m(mc[ix], rfm_v[ix]) - sh_m(mB1[ix], rfm_v[ix])
                vd[it] = (mc[ix].std(ddof=1) - mB1[ix].std(ddof=1)) * math.sqrt(12)
            out[f"block{b}"] = {
                "sharpeDiff": {"ci90": [fnum(np.nanquantile(shd, 0.05)), fnum(np.nanquantile(shd, 0.95))],
                               "p_two": fnum(2 * min(np.nanmean(shd <= 0), np.nanmean(shd >= 0)))},
                "volDiff": {"ci90": [fnum(np.quantile(vd, 0.05)), fnum(np.quantile(vd, 0.95))],
                            "p_two": fnum(2 * min(np.mean(vd <= 0), np.mean(vd >= 0)))},
            }
        bootstrap[cand] = {**out, "method": "循环块 bootstrap，月度净收益配对重抽，N=5000，种子 20261128"}

    def decomp(cand, js):
        mc = monthly(BT[cand]["net"], js)
        mb1 = monthly(BT["B1"]["net"], js)
        mb0 = monthly(BT["B0"]["net"], js)
        empty = np.array([not S[cand]["held"][j] for j in js])
        diff = mc - mb1
        out = {"nMonths": len(js), "totalDiffSum": fnum(diff.sum()), "totalDiffAnn": fnum(diff.mean() * 12)}
        for lab, m in (("emptyMonths", empty), ("heldMonths", ~empty)):
            out[lab] = {"n": int(m.sum()), "diffSum": fnum(diff[m].sum()),
                        "diffMeanMonthly": fnum(diff[m].mean()) if m.any() else None,
                        "contribAnn": fnum(diff[m].sum() / len(js) * 12),
                        "B0minusB1Sum": fnum((mb0 - mb1)[m].sum())}
        out["note"] = "月度净收益（月末→月末持有期）之差；空缺月 C1a = B0，差 = B0 − B1；contribAnn = 该类月份差之和 ÷ 总月数 × 12"
        return out

    win_js = {w: [j for j in month_days if dates[month_days[j][0]] >= pd.Timestamp(lo)
                  and dates[month_days[j][-1]] <= pd.Timestamp(hi)] for w, (lo, hi) in WINDOWS.items()}

    def diff_block(a, b):
        out = {}
        for w in ("explore", "validate"):
            ma, mb = metrics[w][a]["net"], metrics[w][b]["net"]
            out[w] = {k2: fnum(ma[k2] - mb[k2]) if ma[k2] is not None and mb[k2] is not None else None
                      for k2 in ("cagr", "vol", "sharpe", "maxdd")}
            la, lb = crash[w]["L"][a]["net"], crash[w]["L"][b]["net"]
            out[w]["L"] = fnum(la - lb) if la is not None and lb is not None else None
        return out

    decomposition = {
        "C1a_vs_B1": {w: decomp("C1a", win_js[w]) for w in ("explore", "validate")},
        "C1b_vs_B1": {w: decomp("C1b", win_js[w]) for w in ("explore", "validate")},
        "persistence_C1a_minus_B4": diff_block("C1a", "B4"),
        "peIncrement": {"C1a_minus_B2p": diff_block("C1a", "B2p"), "C1b_minus_B2b": diff_block("C1b", "B2b"),
                        "C1b_minus_B2p": diff_block("C1b", "B2p")},
    }

    # ---------------------------------------------------------------- 判定（验证段）
    def conds(cand, kind, b2name):
        m = metrics["validate"]
        c, b1, b1s, b2 = m[cand][kind], m["B1"][kind], m[f"B1star_{cand}"][kind], m[b2name][kind]
        Lc = crash["validate"]["L"][cand][kind]
        c1 = (c["vol"] <= b1["vol"]) and (c["maxdd"] >= b1["maxdd"] - 0.01) and (c["sharpe"] >= b1s["sharpe"] - 0.02)
        c2 = Lc is not None and Lc <= 0.95
        c3 = c["sharpe"] >= b1["sharpe"] - 0.02
        c4 = (c["maxdd"] - b2["maxdd"] >= 0.02) and (c["sharpe"] >= b2["sharpe"] - 0.01)
        return {
            "c1": {"pass": bool(c1), "detail": {"vol": c["vol"], "volB1": b1["vol"], "maxdd": c["maxdd"],
                                                "maxddB1": b1["maxdd"], "sharpe": c["sharpe"],
                                                "sharpeB1star": b1s["sharpe"], "k": m[f"B1star_{cand}"]["k"]}},
            "c2": {"pass": bool(c2), "detail": {"L": Lc, "threshold": 0.95}},
            "c3": {"pass": bool(c3), "detail": {"sharpe": c["sharpe"], "sharpeB1": b1["sharpe"]}},
            "c4": {"pass": bool(c4), "detail": {"vs": b2name, "maxdd": c["maxdd"], "maxddB2": b2["maxdd"],
                                                "sharpe": c["sharpe"], "sharpeB2": b2["sharpe"]}},
        }

    judgments, grades = {}, {}
    for cand, b2name in (("C1a", "B2p"), ("C1b", "B2b")):
        jn, jg = conds(cand, "net", b2name), conds(cand, "gross", b2name)
        c5 = holm_p[cand] <= 0.10
        c6 = all(jn[x]["pass"] for x in ("c1", "c2", "c3", "c4"))
        share = crash["validate"]["singleSegShare"][cand]
        cap = share is not None and share > 0.5
        grade = "通过" if (c6 and c5 and not cap) else ("部分成立" if c6 else "不通过")
        judgments[cand] = {
            "net": jn, "gross": jg,
            "c5": {"pass": bool(c5), "detail": {"pRaw": p_L[cand], "pHolm": holm_p[cand], "threshold": 0.10}},
            "c6": {"pass": bool(c6), "detail": {"rule": "扣成本净值版判定 1–4 全过（CLARIFY-2 第 7 条）"}},
            "singleSegCap": bool(cap), "singleSegShare": share,
            "grade": grade,
            "gradeRule": "通过 = 1–6 全过且 L 改善未过半来自单段；部分成立 = 净值版 1–4 全过但主检验（5）未过或单段过半；其余不通过",
        }
        if cand == "C1b":
            judgments[cand]["c4_vs_B2p"] = conds(cand, "net", "B2p")["c4"]
        grades[cand] = grade

    # ---------------------------------------------------------------- 报告项
    skips = {nm: {w: skip_sum(S[nm]["skips"], win_sel(*WINDOWS[w])) for w in WINDOWS} for nm in S
             if not nm.startswith("E3")}
    holdings = {nm: {w: hold_stats(S[nm]["held"], win_sel(*WINDOWS[w])) for w in WINDOWS} for nm in S
                if not nm.startswith("E3")}
    survivorship = {}
    for w, wm in WM.items():
        pf, pc = perf(full_fr[wm], rf_d[wm]), perf(b0_fr[wm], rf_d[wm])
        survivorship[w] = {"fullMarketB0": pf, "coveredB0": pc, "diffCagr": fnum(pf["cagr"] - pc["cagr"]),
                           "diffVol": fnum(pf["vol"] - pc["vol"])}
    survivorship["method"] = ("无摩擦日度指数：t−1 mcap_float 加权、个股收益以前一有效收盘为基准；全市场 = 当日有价全部股票（含已退市"
                              "股退市前），覆盖池 = 另要求有点时行业。退市股停止交易后不计退市损失，偏差估计偏保守。")
    c2_rep = {"nTriggers": {w: sum(1 for e in c2_events if WINDOWS[w][0] <= e["date"] <= WINDOWS[w][1])
                            for w in WINDOWS},
              "B2pWithC2": {w: metrics[w]["B2p_C2"] for w in ("explore", "validate")},
              "B2p": {w: metrics[w]["B2p"] for w in ("explore", "validate")},
              "rule": "B2′ 持仓中 PE 分位 > 0.95 且 share60 < 60 个交易日前 → 该槽权重改 B0；不判定"}

    sensitivity = {}
    for nm in [x for x in S if x.startswith("E")]:
        base = "C1a" if "C1a" in nm else "C1b"
        b2name = "B2p" if base == "C1a" else "B2b"
        blk = {}
        for w in ("explore", "validate"):
            wm = WM[w]
            idx, segs = seg_store[w]
            Ln, c_, b_ = L_ratio(BT[nm]["net"][idx], BT["B1"]["net"][idx], segs)
            sb = series_block(BT[nm], wm)
            blk[w] = {**sb, "L": fnum(Ln), "singleSegShare": single_seg_share(c_, b_)}
        v, b1v, b2v = blk["validate"]["net"], metrics["validate"]["B1"]["net"], metrics["validate"][b2name]["net"]
        k_ = BT[nm]["net"][WM["validate"]].std(ddof=1) / BT["B1"]["net"][WM["validate"]].std(ddof=1)
        b1s = perf((k_ * BT["B1"]["net"] + (1 - k_) * rf_d)[WM["validate"]], rf_d[WM["validate"]])
        blk["readings"] = {
            "c1": bool(v["vol"] <= b1v["vol"] and v["maxdd"] >= b1v["maxdd"] - 0.01 and v["sharpe"] >= b1s["sharpe"] - 0.02),
            "c2": bool(blk["validate"]["L"] is not None and blk["validate"]["L"] <= 0.95),
            "c3": bool(v["sharpe"] >= b1v["sharpe"] - 0.02),
            "c4": bool(v["maxdd"] - b2v["maxdd"] >= 0.02 and v["sharpe"] >= b2v["sharpe"] - 0.01),
            "note": "报告项，不判定；c4 对照 " + b2name,
        }
        if nm in holdings:
            blk["holdings"] = holdings[nm]
            blk["skips"] = skips[nm]
        sensitivity[nm] = blk

    etf_p = HERE / "inputs/etf_map.json"
    e4 = json.loads(etf_p.read_text()) if etf_p.exists() else {"error": "inputs/etf_map.json 缺失，先运行 fetch_etf.py"}
    if "by_industry" in e4:
        e4["inBacktestIndustries"] = sorted({n for j in range(n_m) for n in b1_members[j]})
        e4["sha256"] = sha256(etf_p)

    # E7 集中度
    def ind_month_ret(n, j):
        return float(np.prod(1 + ind_ret_f[n][month_days[j]]) - 1)

    e7 = {}
    for cand, rows in (("C1a", rows_a), ("C1b", rows_b)):
        js = win_js["validate"]
        rank_dist, contrib = {}, {}
        mb1 = dict(zip(js, monthly(BT["B1"]["net"], js)))
        mc = dict(zip(js, monthly(BT[cand]["net"], js)))
        for j in js:
            df = rows[j]["df"]
            rmap = dict(zip(df["ind"], df["rank"])) if len(df) else {}
            for n in S[cand]["held"][j]:
                r_ = int(rmap.get(n, -1))
                rank_dist[str(r_)] = rank_dist.get(str(r_), 0) + 1
                contrib[n] = contrib.get(n, 0.0) + (1.0 / S[cand]["k"]) * (ind_month_ret(n, j) - mb1[j])
        top5 = sorted(js, key=lambda j: mc[j] - mb1[j], reverse=True)[:5]
        bot5 = sorted(js, key=lambda j: mc[j] - mb1[j])[:5]
        e7[cand] = {
            "rankDistribution": dict(sorted(rank_dist.items(), key=lambda kv: int(kv[0]))),
            "industryContribution": {k2: fnum(v2) for k2, v2 in sorted(contrib.items(), key=lambda kv: -kv[1])},
            "contributionNote": "Σ 槽位权重 ×（行业月收益 − B1 月净收益），行业层无摩擦；验证段",
            "top5Months": [{"month": str(mes_all[j].to_period("M") + 1), "diff": fnum(mc[j] - mb1[j]),
                            "held": S[cand]["held"][j]} for j in top5],
            "bottom5Months": [{"month": str(mes_all[j].to_period("M") + 1), "diff": fnum(mc[j] - mb1[j]),
                               "held": S[cand]["held"][j]} for j in bot5],
        }
        top5_sum = sum(mc[j] - mb1[j] for j in top5)
        e7[cand]["top5ShareOfTotalDiff"] = fnum(top5_sum / sum(mc[j] - mb1[j] for j in js)) \
            if sum(mc[j] - mb1[j] for j in js) != 0 else None

    # E8：2015 上半年与 2015 股灾段
    e8 = {}
    names8 = ["C1a", "C1b", "B0", "B1", "B2p", "B2b", "B4"]
    m15 = wmask("2015-01-01", "2015-06-30")
    e8["2015H1"] = {nm: perf(BT[nm]["net"][m15], rf_d[m15]) for nm in names8}
    e8["crash2015"] = [s for s in crash["validate"]["segments"] if s["peak"].startswith("2015")]
    e8["note"] = "股灾段取验证段折线法急跌段中峰在 2015 年者（机械定义）"

    feas = {}
    for nm, bt in BT_CAP.items():
        feas[nm] = {w: {**series_block(bt, WM[w]), "investRatioMeanFullPeriod": bt["invest_ratio_mean"]}
                    for w in ("explore", "validate")}
        feas[nm]["validateL"] = fnum(L_ratio(bt["net"][v_idx], BT_CAP["B1"]["net"][v_idx], v_segs)[0])
        feas[nm]["costDragVsProportional"] = fnum(BT[nm]["cost_ann"] - bt["cost_ann"])
    feas["note"] = ("100 万元、100 股整手（向零截断，清仓允许零股）、每笔最低佣金 5 元；不参与判定（CLARIFY-2 第 1 条）。"
                    "investRatioMeanFullPeriod = 全期调仓后持股权重之和均值；cashShareMean = 窗口日均现金占比；costDragVsProportional = 比例模式年化成本 − 本模式年化成本（负 = 本模式更贵）")

    # 报告项：买不进的权重转给其他目标（factorlab allocate），CLARIFY-2 第 11 条
    def readings(btc, btb1, btb2, wkey="validate"):
        wm = WM[wkey]
        idx, segs = seg_store[wkey]
        c, b1, b2 = (perf(x["net"][wm], rf_d[wm]) for x in (btc, btb1, btb2))
        k_ = btc["net"][wm].std(ddof=1) / btb1["net"][wm].std(ddof=1)
        b1s = perf((k_ * btb1["net"] + (1 - k_) * rf_d)[wm], rf_d[wm])
        Lc = L_ratio(btc["net"][idx], btb1["net"][idx], segs)[0]
        return {"c1": bool(c["vol"] <= b1["vol"] and c["maxdd"] >= b1["maxdd"] - 0.01 and c["sharpe"] >= b1s["sharpe"] - 0.02),
                "c2": bool(Lc is not None and Lc <= 0.95), "c3": bool(c["sharpe"] >= b1["sharpe"] - 0.02),
                "c4": bool(c["maxdd"] - b2["maxdd"] >= 0.02 and c["sharpe"] >= b2["sharpe"] - 0.01),
                "L": fnum(Lc), "sharpeB1star": b1s["sharpe"]}

    alloc_rep = {"note": "买不进（一字涨停 / 停牌）的目标权重按 factorlab.backtest.allocate 分给其他可买目标（主口径为留现金）；"
                         "L 与读数对照同一 allocate 口径的 B1 / B2；报告项，不判定"}
    for nm, bt in BT_ALLOC.items():
        alloc_rep[nm] = {w: series_block(bt, WM[w]) for w in ("explore", "validate")}
        alloc_rep[nm]["validateL"] = fnum(L_ratio(bt["net"][v_idx], BT_ALLOC["B1"]["net"][v_idx], v_segs)[0])
        alloc_rep[nm]["maxAbsDailyDiffVsMain"] = fnum(np.abs(bt["net"] - BT[nm]["net"]).max())
    for cand, b2name in (("C1a", "B2p"), ("C1b", "B2b")):
        alloc_rep[cand]["readings"] = readings(BT_ALLOC[cand], BT_ALLOC["B1"], BT_ALLOC[b2name])
    trunc_rep = {"note": "主实现第一版顺序：超预算日先截断买不进、再按比例缩放（买不进份额被缩放吸收、接近满仓）；"
                         "CLARIFY-2 第 11a 条改为先缩放再截断留现金，本顺序作报告项，不判定；L 与读数对照同口径 B1 / B2"}
    for nm, bt in BT_TRUNC.items():
        trunc_rep[nm] = {w: series_block(bt, WM[w]) for w in ("explore", "validate")}
        trunc_rep[nm]["validateL"] = fnum(L_ratio(bt["net"][v_idx], BT_TRUNC["B1"]["net"][v_idx], v_segs)[0])
        diffd = np.abs(bt["net"] - BT[nm]["net"])
        trunc_rep[nm]["maxAbsDailyDiffVsMain"] = fnum(diffd.max())
        trunc_rep[nm]["daysDifferVsMain"] = int((diffd > 1e-15).sum())
    for cand, b2name in (("C1a", "B2p"), ("C1b", "B2b")):
        trunc_rep[cand]["readings"] = readings(BT_TRUNC[cand], BT_TRUNC["B1"], BT_TRUNC[b2name])

    # 验证段日度序列导出（CLARIFY-2 第 14 条）
    ddir = HERE / "daily"
    ddir.mkdir(exist_ok=True)
    vm = WM["validate"]
    vdates = [str(d.date()) for d in dates[vm]]
    series_names = [nm for nm in BT]
    def write_csv(path, cols: dict):
        keys = list(cols)
        with path.open("w") as fh:
            fh.write("date," + ",".join(keys) + "\n")
            for ii, d in enumerate(vdates):
                fh.write(d + "," + ",".join(f"{cols[k][ii]:.17g}" for k in keys) + "\n")
    net_cols = {nm: BT[nm]["net"][vm] for nm in series_names}
    for cand in ("C1a", "C1b"):
        k_ = kstar[("validate", cand, "net")]
        net_cols[f"B1star_{cand}"] = (k_ * BT["B1"]["net"] + (1 - k_) * rf_d)[vm]
    net_cols["B0_frictionless"] = b0_fr[vm]
    net_cols["rf"] = rf_d[vm]
    write_csv(ddir / "validate_net_returns.csv", net_cols)
    write_csv(ddir / "validate_gross_returns.csv", {nm: BT[nm]["gross"][vm] for nm in series_names})
    write_csv(ddir / "validate_nav_net.csv", {nm: np.cumprod(1 + v) for nm, v in net_cols.items() if nm != "rf"})
    write_csv(ddir / "validate_cost_turnover.csv",
              {**{f"{nm}_cost": BT[nm]["cost_d"][vm] for nm in ("C1a", "C1b", "B0", "B1", "B2p", "B2b", "B4")},
               **{f"{nm}_turnover": BT[nm]["to_d"][vm] for nm in ("C1a", "C1b", "B0", "B1", "B2p", "B2b", "B4")}})
    daily_meta = {"dir": "docs/research/theme-pe-cn-2026-11-28/daily/",
                  "files": ["validate_net_returns.csv", "validate_gross_returns.csv", "validate_nav_net.csv",
                            "validate_cost_turnover.csv"],
                  "window": [vdates[0], vdates[-1]], "nDays": len(vdates),
                  "note": "日收益（小数，%.17g）；nav 自验证段首日起累乘（首日已含当日收益）；cost = 当日成本占组合比例，turnover = 当日单边换手"}

    # 诊断：B0 执行 vs 无摩擦、复牌收益口径
    diag = {"b0ExecVsFrictionlessByYear": {}, "resumeExcludedWeightShare": {}, "b0FfillIndex": {}}
    for y in range(2005, 2024):
        my = wmask(f"{y}-01-01", f"{y}-12-31")
        if my.sum() < 2:
            continue
        diag["b0ExecVsFrictionlessByYear"][str(y)] = {
            "volExecNet": fnum(BT["B0"]["net"][my].std(ddof=1) * math.sqrt(252)),
            "volFrictionless": fnum(b0_fr[my].std(ddof=1) * math.sqrt(252)),
            "volFfill": fnum(b0_ff[my].std(ddof=1) * math.sqrt(252)),
            "retExecNet": fnum(np.prod(1 + BT["B0"]["net"][my]) - 1),
            "retFrictionless": fnum(np.prod(1 + b0_fr[my]) - 1),
            "retFfill": fnum(np.prod(1 + b0_ff[my]) - 1)}
    for w in ("explore", "validate"):
        wm = WM[w]
        diag["resumeExcludedWeightShare"][w] = {"mean": fnum(resume_excl[wm].mean()), "max": fnum(resume_excl[wm].max())}
        idx = np.flatnonzero(wm)
        segs_ff = polyline_segments(np.cumprod(1 + b0_ff[idx]))
        diag["b0FfillIndex"][w] = {
            "perf": perf(b0_ff[wm], rf_d[wm]),
            "segments": [{"peak": str(dates[idx[p]].date()), "trough": str(dates[idx[t_]].date()), "dropB0": float(d)}
                         for p, t_, d in segs_ff],
            "L": {nm: fnum(L_ratio(BT[nm]["net"][idx], BT["B1"]["net"][idx], segs_ff)[0])
                  for nm in ("C1a", "C1b", "B0", "B2p", "B2b", "B4")}}
    diag["note"] = ("冻结计数脚本的行业日收益与 B0 无摩擦指数用 t−1 当日行的 mcap_float：复牌日前一交易日无行（停牌）时权重缺失，"
                    "该复牌收益不进入指数（执行回测用 ffill 收盘，复牌日涨跌照计）。b0FfillIndex 为改用最近有效 mcap_float 的对照，"
                    "只作诊断，不改判定。执行 B0 波动低于无摩擦主要来自停牌股按停牌前价格计值（2015 年最明显）")

    # ---------------------------------------------------------------- 试验日志
    trials_path = HERE / "trials.jsonl"
    now = pd.Timestamp.utcnow().isoformat()
    roles = {"C1a": "candidate", "C1b": "candidate", "B0": "control", "B1": "control", "B2p": "control",
             "B2b": "control", "B4": "control", "B2p_C2": "report"}
    trials = []
    for nm in BT:
        role = roles.get(nm, "sensitivity")
        v = series_block(BT[nm], WM["validate"])["net"]
        trials.append({"time": now, "ledger": "L-052", "family": "L-052", "prereg": PREREG_COMMIT, "variant": nm,
                       "role": role, "costMode": "proportional", "validate_net": v,
                       "grade": grades.get(nm)})
    for nm in BT_CAP:
        v = series_block(BT_CAP[nm], WM["validate"])["net"]
        trials.append({"time": now, "ledger": "L-052", "family": "L-052", "prereg": PREREG_COMMIT,
                       "variant": nm + "_1e6lot", "role": "feasibility", "costMode": "capital_1e6_lot",
                       "validate_net": v})
    for tag, src in (("allocate", BT_ALLOC), ("truncfirst", BT_TRUNC)):
        for nm in src:
            v = series_block(src[nm], WM["validate"])["net"]
            trials.append({"time": now, "ledger": "L-052", "family": "L-052", "prereg": PREREG_COMMIT,
                           "variant": f"{nm}_{tag}", "role": "report", "costMode": f"proportional_{tag}",
                           "validate_net": v})
    with trials_path.open("w") as f:
        for tr in trials:
            f.write(json.dumps(tr, ensure_ascii=False) + "\n")

    # ---------------------------------------------------------------- 汇总
    mv = metrics["validate"]

    def head(cand, b2name):
        return {"vol": mv[cand]["net"]["vol"], "volB1": mv["B1"]["net"]["vol"],
                "maxdd": mv[cand]["net"]["maxdd"], "maxddB1": mv["B1"]["net"]["maxdd"],
                "L": crash["validate"]["L"][cand]["net"], "sharpe": mv[cand]["net"]["sharpe"],
                "sharpeB1": mv["B1"]["net"]["sharpe"], "sharpeB1star": mv[f"B1star_{cand}"]["net"]["sharpe"],
                "sharpeB2": mv[b2name]["net"]["sharpe"], "maxddB2": mv[b2name]["net"]["maxdd"],
                "sharpeB4": mv["B4"]["net"]["sharpe"], "maxddB4": mv["B4"]["net"]["maxdd"],
                "sharpeB0": mv["B0"]["net"]["sharpe"], "volB0": mv["B0"]["net"]["vol"], "maxddB0": mv["B0"]["net"]["maxdd"],
                "grade": grades[cand]}

    payload = {
        "meta": {
            "ledger": "L-052", "version": "v3", "preregCommit": PREREG_COMMIT,
            "preregPath": "docs/research/theme-pe-cn-2026-11-28/PREREG.md",
            "clarifications": ["docs/research/theme-pe-cn-2026-11-28/CLARIFY-1.md",
                               "docs/research/theme-pe-cn-2026-11-28/CLARIFY-2.md（第 1–14 条及 11a）"],
            "impl": "main-python", "seed": SEED, "generatedAt": now,
            "runtimeSec": round(time.time() - t_start, 1),
            "deviations": DEVIATIONS,
            "lockbox": "未读锁箱：store.load_panel raw=False（截在 2023-11-01 前），fin 经 fundamentals_cn.panel_fields(end_ex=锁箱起点)；未 unseal、未做锁箱确认",
            "notes": [
                "价格数据实际从 2005-01-04 开始：2000-01 预热参数照写，但 rel6 / share / PE 历史均自 2005 起累积，PE 分位最早约 2008 年可用（之前持仓多因 hist 跳过而归 B0）",
                "回测自第一个月末（2005-01-31）信号、2005-02-01 开盘成交起；探索段度量自 2005-02-01 起",
                "信号层与冻结计数脚本 count_theme_pe.py 同口径（包括 C1b 综合分并列时先按 rel6 升序再按 sha256 的次序、"
                "PE 历史取含当月在内最近 60 个月末中有正 PE 的月份 ≥ 36），countsCheck 逐项核对其聚合计数",
                "行业篮子：信号日 t 覆盖池内该规范名行业、mcap_float 有效的股票，按 t 日收盘 mcap_float 定权，月内漂移；B0 = 覆盖池 t 日 mcap_float 加权；"
                "B1 = 成员 ≥ 5 的规范名行业等权（行业内 mcap_float），每月调回",
                "执行：t 后首个交易日开盘；一字涨停（开 = 高 = 低 = 收且封涨停）或停牌买不进的目标权重留现金（0 收益）到下个调仓日，不转给其他目标；锁定（停牌 / 一字跌停）持仓保持原权重，"
                "不在目标内的挂单至首个可卖开盘；其余目标先按剩余预算做超预算缩放、再截去买不进部分（CLARIFY-2 第 11 / 11a 条；"
                "先截断再缩放的第一版顺序见 truncFirstVariant，allocate 版见 allocateVariant）；退市按 factorlab 惯例 −100%",
                "B1* = k·B1 + (1−k)·rf，k = σ(候选)/σ(B1)（同窗口、同净 / 毛口径），每日恒定混合",
                "L：验证段覆盖池 B0 无摩擦日度指数上的折线法急跌段，L = Σ候选峰→谷简单收益 ÷ Σ B1 同区间（CLARIFY-2 第 2 条）",
                "判定 4：C1a 对 B2′、C1b 对 B2b（C1b 另报对 B2′）",
                "TTM：主口径直接复用 fundamentals_cn.fin_ni_ttm（缺季度时退回最近年报）；严格口径（缺任一项即无）作报告项 strictTtm 与 E0_*_ttmStrict（CLARIFY-2 第 12 条）",
                "turnoverAnn / costAnn 按各窗口自身期间（窗口内日换手、日成本之和 ÷ 窗口交易日 × 252；CLARIFY-2 第 13 条）",
                "安慰剂 p 用行业层无摩擦模拟（行业日收益 t−1 float 加权、月内按槽漂移、t+1 收盘至下月末收盘）；actualSim 为同一模拟下的实际值，"
                "与执行回测的 L 数值不同但口径可比",
                "随机数：每个候选各用 numpy default_rng(20261128)，按段顺序抽样；bootstrap 用另一个 default_rng(20261128) 依次给 C1a、C1b",
            ],
        },
        "inputs": {
            "sha256": shas,
            "finPitNote": "本机 fin_pit（da32cbce…）与 L-038 冻结版 MISMATCH；本研究不依赖 L-038 冻结，锁箱确认须在同一快照上运行（CLARIFY-1 第 1 条）",
            "rf": {"source": "docs/research/factorlab/inputs/CH_4_fac_update_20211231.csv rf_mon（%）",
                   "spliceAfter": str(last_csv), "fillAnnual": RF_FILL_ANNUAL, "fillMonthly": fill_m,
                   "dailyRule": "日 = (1 + 月)^(1/当月交易日数) − 1"},
            "panel": {"firstDate": str(dates[0].date()), "lastDate": str(dates[-1].date()), "days": int(n_d),
                      "codes": int(n_c), "industries": all_inds},
            "finSnapshot": fc.snapshot(),
        },
        "params": {
            "K": K, "EXIT_RANK": EXIT_RANK, "LOOK_6": LOOK_6, "LOOK_3": LOOK_3, "AMT_A": AMT_A, "AMT_B": AMT_B,
            "AMT_BASE": AMT_BASE, "AMT_BASE_MIN": 120, "PE_HIST": PE_HIST, "PE_MIN": PE_MIN, "IND_MIN": IND_MIN,
            "PE_THR": PE_THR, "EP_THR": EP_THR, "C2_THR": C2_THR, "C2_LAG": C2_LAG,
            "crash": {"rebound": CRASH_REBOUND, "minDrop": CRASH_DROP}, "nPlacebo": N_PLACEBO,
            "bootBlocks": list(BOOT_BLOCKS), "nBoot": N_BOOT, "windows": WINDOWS,
            "sw_canon": SW_CANON, "unmapped": list(UNMAPPED_SPLITS), "SW2014_LAUNCH": SW2014_LAUNCH,
            "costs": {"commission": cm.commission, "other": cm.other, "stamp": [list(x) for x in cm.stamp],
                      "slippageTiers": [list(x) for x in slip.tiers], "slippageWindow": slip.window,
                      "mode": "proportional (no capital)"},
            "feasibilityCapital": CAPITAL_FEAS, "tieMode": TIE_MODE,
        },
        "headline": {"firstSentence": FIRST_SENTENCE, "C1a": head("C1a", "B2p"), "C1b": head("C1b", "B2b")},
        "countsCheck": {"match": not diffs, "diffs": diffs, "tieCheck": tie_check},
        "metrics": metrics,
        "crash": crash,
        "judgments": judgments,
        "placebo": {"randomIndustry": placebo_rand, "holm": holm_p, "circularShift": placebo_shift,
                    "bootstrap": bootstrap},
        "power": power,
        "decomposition": decomposition,
        "skips": skips,
        "holdings": holdings,
        "survivorship": survivorship,
        "c2": c2_rep,
        "sensitivity": sensitivity,
        "e4Etf": e4,
        "e7Concentration": e7,
        "e8": e8,
        "feasibility1e6": feas,
        "diagnostics": diag,
        "allocateVariant": alloc_rep,
        "truncFirstVariant": trunc_rep,
        "strictTtm": strict_ttm,
        "daily": daily_meta,
        "trials": {"logPath": str(trials_path.relative_to(ROOT)), "nRecorded": len(trials)},
        "verdict": {
            "C1a": grades["C1a"], "C1b": grades["C1b"],
            "summary": f"验证段（扣成本、比例成本模式）：C1a {grades['C1a']}，C1b {grades['C1b']}；"
                       f"主检验安慰剂 L p（Holm）C1a {holm_p['C1a']:.3f}、C1b {holm_p['C1b']:.3f}",
            "lockboxNote": "是否晋级锁箱由 manager 决定；本实现不做锁箱确认（最早 2027Q1）",
        },
    }
    out = HERE / "results.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2, default=str) + "\n")
    print("wrote", out, f"{time.time() - t_start:.0f}s")
    (HERE / "RESULTS.md").write_text(render_md(json.loads(out.read_text())), encoding="utf-8")
    print("wrote RESULTS.md")
    print(payload["verdict"]["summary"])


def _f(x, nd=3, pct=False):
    if x is None:
        return "—"
    return f"{x * 100:.{max(nd - 2, 1)}f}%" if pct else f"{x:.{nd}f}"


def render_md(P: dict) -> str:
    mv, me_ = P["metrics"]["validate"], P["metrics"]["explore"]
    cv, ce = P["crash"]["validate"], P["crash"]["explore"]
    J = P["judgments"]
    L = []
    a = L.append
    a("# L-052 主实现结果（探索 + 验证）\n")
    a(f"预注册 v3 冻结 `{P['meta']['preregCommit']}`；口径澄清 CLARIFY-1、CLARIFY-2。实现 `run_main.py`（Python）。**未做锁箱确认。**\n")
    a("> **偏离冻结 PREREG（显著注明）**：" + P["meta"]["deviations"][0] + "\n")
    a("## 结论口径\n")
    a(P["headline"]["firstSentence"] + "\n")
    hc, hb = P["headline"]["C1a"], P["headline"]["C1b"]
    a(f"验证段（2015-01 至 2023-10，扣成本）：C1a 年化波动 {_f(hc['vol'], pct=True)} 对覆盖池 B1 {_f(hc['volB1'], pct=True)}，"
      f"最大回撤 {_f(hc['maxdd'], pct=True)} 对 {_f(hc['maxddB1'], pct=True)}，急跌段 L {_f(hc['L'])}，夏普 {_f(hc['sharpe'], 2)} 对 B1 "
      f"{_f(hc['sharpeB1'], 2)} / 同波动 B1* {_f(hc['sharpeB1star'], 2)}；对 B2′ 夏普 {_f(hc['sharpeB2'], 2)}、回撤 {_f(hc['maxddB2'], pct=True)}；"
      f"对 B4 夏普 {_f(hc['sharpeB4'], 2)}。C1b 波动 {_f(hb['vol'], pct=True)}、回撤 {_f(hb['maxdd'], pct=True)}、L {_f(hb['L'])}、"
      f"夏普 {_f(hb['sharpe'], 2)}。**分级：C1a {hc['grade']}，C1b {hb['grade']}。**\n")
    a("## 验证段度量（扣成本净值；毛收益见 results.json）\n")
    a("| 组合 | 年化收益 | 年化波动 | 夏普 | 最大回撤 | L(对 B1) | 年化成本 | 日均现金 |")
    a("|---|---:|---:|---:|---:|---:|---:|---:|")
    for nm in ("C1a", "C1b", "B0", "B1", "B1star_C1a", "B1star_C1b", "B2p", "B2b", "B4", "B2p_C2"):
        m = mv[nm]["net"]
        Lx = cv["L"].get(nm, {}).get("net") if nm in cv["L"] else None
        a(f"| {nm} | {_f(m['cagr'], pct=True)} | {_f(m['vol'], pct=True)} | {_f(m['sharpe'], 3)} | {_f(m['maxdd'], pct=True)} | "
          f"{_f(Lx)} | {_f(mv[nm].get('costAnn'), pct=True)} | {_f(mv[nm].get('cashShareMean'), pct=True)} |")
    a("\nB1star_X = k·B1 + (1−k)·rf，k = σ(X)/σ(B1)；B2p = B2′（C1a 持续主线不做分位 >0.90 跳过）；B2p_C2 = B2′ 加 C2 报告项。\n")
    a("## 判定（验证段，扣成本）\n")
    a("| 条件 | C1a | C1b |")
    a("|---|---|---|")
    lab = {"c1": "1 波动 ≤ B1 且回撤不深 >1pp 且夏普 ≥ B1* − 0.02", "c2": "2 L ≤ 0.95", "c3": "3 夏普 ≥ B1 − 0.02",
           "c4": "4 对 B2′/B2b 回撤浅 ≥2pp 且夏普 ≥ −0.01"}
    for c in ("c1", "c2", "c3", "c4"):
        a(f"| {lab[c]} | {'过' if J['C1a']['net'][c]['pass'] else '不过'} | {'过' if J['C1b']['net'][c]['pass'] else '不过'} |")
    a(f"| 5 安慰剂 L 单边 p（Holm ≤ 0.10） | p={_f(J['C1a']['c5']['detail']['pRaw'])} / Holm {_f(J['C1a']['c5']['detail']['pHolm'])} | "
      f"p={_f(J['C1b']['c5']['detail']['pRaw'])} / Holm {_f(J['C1b']['c5']['detail']['pHolm'])} |")
    a(f"| 6 扣成本后 1–4 全过 | {'过' if J['C1a']['c6']['pass'] else '不过'} | {'过' if J['C1b']['c6']['pass'] else '不过'} |")
    a(f"| L 改善单段占比 | {_f(J['C1a']['singleSegShare'])} | {_f(J['C1b']['singleSegShare'])} |")
    a(f"| **分级** | **{J['C1a']['grade']}** | **{J['C1b']['grade']}** |\n")
    tvj = P.get("truncFirstVariant", {})
    for c in ("C1a", "C1b"):
        if c in tvj and tvj[c]["readings"]["c4"] != J[c]["net"]["c4"]["pass"]:
            a(f"> **CLARIFY-2 第 11a 条**（超预算日先缩放、再截去买不进部分留现金）使 {c} 判定 4 由「"
              f"{'过' if tvj[c]['readings']['c4'] else '不过'}」（主实现第一版顺序，见 truncFirstVariant）变为「"
              f"{'过' if J[c]['net']['c4']['pass'] else '不过'}」；分级不变（{J[c]['grade']}）。\n")
    a("C1b 的判定 4 对照 B2b；对 B2′ 的读数：" + ("过" if J["C1b"]["c4_vs_B2p"]["pass"] else "不过") + "。毛收益版判定："
      + "；".join(f"{c} " + "/".join("过" if J[x]["gross"][k]["pass"] else "不过" for k in ("c1", "c2", "c3", "c4"))
                 for c, x in (("C1a", "C1a"), ("C1b", "C1b"))) + "。\n")
    a("## 急跌段（验证段，覆盖池 B0 无摩擦指数，折线法）\n")
    a("| 峰 | 谷 | B0 指数跌幅 | C1a | C1b | B0 | B1 | B2′ | B2b | B4 |")
    a("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|")
    for sg in cv["segments"]:
        r = sg["ret"]
        a(f"| {sg['peak']} | {sg['trough']} | {_f(sg['dropB0'], pct=True)} | " + " | ".join(
            _f(r[k], pct=True) for k in ("C1a", "C1b", "B0", "B1", "B2p", "B2b", "B4")) + " |")
    pr, pl = P["placebo"]["randomIndustry"], P["placebo"]
    a("\n## 统计\n")
    a("| | C1a | C1b |")
    a("|---|---|---|")
    a(f"| 随机行业安慰剂 p（L / 波动 / 回撤 / 夏普） | {' / '.join(_f(pr['C1a']['p'][k]) for k in ('L', 'vol', 'maxdd', 'sharpe'))} | "
      f"{' / '.join(_f(pr['C1b']['p'][k]) for k in ('L', 'vol', 'maxdd', 'sharpe'))} |")
    a(f"| 模拟下实际 L / 安慰剂 L 中位数 | {_f(pr['C1a']['actualSim']['L'])} / {_f(pr['C1a']['placeboQuantiles']['L'][0.5] if 0.5 in pr['C1a']['placeboQuantiles']['L'] else pr['C1a']['placeboQuantiles']['L']['0.5'])} | "
      f"{_f(pr['C1b']['actualSim']['L'])} / {_f(pr['C1b']['placeboQuantiles']['L'][0.5] if 0.5 in pr['C1b']['placeboQuantiles']['L'] else pr['C1b']['placeboQuantiles']['L']['0.5'])} |")
    a(f"| 循环平移 p（L） | {_f(pl['circularShift']['C1a']['p'])} | {_f(pl['circularShift']['C1b']['p'])} |")
    for b in (6, 12, 24):
        a(f"| 块 {b} bootstrap：夏普差 90% 区间 / 双侧 p | "
          + " | ".join(f"[{_f(pl['bootstrap'][c][f'block{b}']['sharpeDiff']['ci90'][0], 2)}, {_f(pl['bootstrap'][c][f'block{b}']['sharpeDiff']['ci90'][1], 2)}] / {_f(pl['bootstrap'][c][f'block{b}']['sharpeDiff']['p_two'])}"
                       for c in ("C1a", "C1b")) + " |")
    pw = P["power"]
    a(f"| 功效（真 L 改善 0.05，α=0.10 / 0.05） | {_f(pw['C1a']['power_alpha_0.10'])} / {_f(pw['C1a']['power_alpha_0.05_holm_worst'])} | "
      f"{_f(pw['C1b']['power_alpha_0.10'])} / {_f(pw['C1b']['power_alpha_0.05_holm_worst'])} |\n")
    a("安慰剂与循环平移用行业层无摩擦模拟（CLARIFY-2 第 3 条），所以「模拟下实际 L」与上表执行回测 L 不同。\n")
    d = P["decomposition"]
    a("## 拆分\n")
    dv = d["C1a_vs_B1"]["validate"]
    a(f"- C1a − B1（验证段月度净收益差，年化贡献）：合计 {_f(dv['totalDiffAnn'], pct=True)}；空缺月 {dv['emptyMonths']['n']} 个贡献 "
      f"{_f(dv['emptyMonths']['contribAnn'], pct=True)}（= B0 − B1），有持仓月 {dv['heldMonths']['n']} 个贡献 {_f(dv['heldMonths']['contribAnn'], pct=True)}。")
    pv = d["persistence_C1a_minus_B4"]["validate"]
    a(f"- 持续性效果 C1a − B4（验证段）：夏普 {_f(pv['sharpe'], 3)}，波动 {_f(pv['vol'], pct=True)}，回撤 {_f(pv['maxdd'], pct=True)}，L {_f(pv['L'])}。")
    for key, lab2 in (("C1a_minus_B2p", "C1a − B2′"), ("C1b_minus_B2b", "C1b − B2b"), ("C1b_minus_B2p", "C1b − B2′")):
        x = d["peIncrement"][key]["validate"]
        a(f"- PE 增量 {lab2}（验证段）：夏普 {_f(x['sharpe'], 3)}，回撤 {_f(x['maxdd'], pct=True)}，L {_f(x['L'])}。")
    a("")
    a("## 探索段（2005-02 至 2014-12，只描述；2014-02-21 前行业非点时）\n")
    a("| 组合 | 年化收益 | 年化波动 | 夏普 | 最大回撤 | L(对 B1) |")
    a("|---|---:|---:|---:|---:|---:|")
    for nm in ("C1a", "C1b", "B0", "B1", "B2p", "B2b", "B4"):
        m = me_[nm]["net"]
        a(f"| {nm} | {_f(m['cagr'], pct=True)} | {_f(m['vol'], pct=True)} | {_f(m['sharpe'], 3)} | {_f(m['maxdd'], pct=True)} | {_f(ce['L'][nm]['net'])} |")
    a(f"\n探索段急跌段 {ce['nSegments']} 个：" + "；".join(f"{s_['peak']}→{s_['trough']} {_f(s_['dropB0'], pct=True)}" for s_ in ce["segments"]) + "。\n")
    a("## 报告项\n")
    sv = P["survivorship"]["validate"]
    a(f"- 幸存者偏差（全市场 B0 − 覆盖池 B0，无摩擦）：验证段年化收益差 {_f(sv['diffCagr'], pct=True)}，探索段 {_f(P['survivorship']['explore']['diffCagr'], pct=True)}。")
    c2 = P["c2"]
    a(f"- C2（作用 B2′）：触发 探索 {c2['nTriggers']['explore']} / 验证 {c2['nTriggers']['validate']} 次；验证段 B2′+C2 夏普 "
      f"{_f(c2['B2pWithC2']['validate']['net']['sharpe'], 3)} 对 B2′ {_f(c2['B2p']['validate']['net']['sharpe'], 3)}（不判定）。")
    sk = P["skips"]
    a(f"- 跳过三分类（pe90 / hist / neg_ni，全期）：C1a {sk['C1a']['full']}，C1b {sk['C1b']['full']}，B4 {sk['B4']['full']}。")
    tc = P["countsCheck"]
    a(f"- 计数复现：{'与冻结 counts_theme_pe.json 全部一致' if tc['match'] else '有差异：' + '; '.join(tc['diffs'])}。并列次序核对：{tc['tieCheck']}。\n")
    a("### 敏感性（报告项，不判定；验证段净值）\n")
    a("| 变体 | 年化波动 | 夏普 | 最大回撤 | L | 读数 1/2/3/4 |")
    a("|---|---:|---:|---:|---:|---|")
    for nm, b in P["sensitivity"].items():
        v = b["validate"]["net"]
        rd = b["readings"]
        a(f"| {nm} | {_f(v['vol'], pct=True)} | {_f(v['sharpe'], 3)} | {_f(v['maxdd'], pct=True)} | {_f(b['validate']['L'])} | "
          + "/".join("过" if rd[c] else "—" for c in ("c1", "c2", "c3", "c4")) + " |")
    e4 = P["e4Etf"]
    a("\n### E4 各行业最早场内 ETF（成立年份；东方财富，现存基金）\n")
    if "by_industry" in e4:
        a("| 申万一级 | 一级行业名 ETF | 含子行业 ETF | 最早一只 |")
        a("|---|---:|---:|---|")
        for ind, v in e4["by_industry"].items():
            ea = v.get("earliest_any") or {}
            a(f"| {ind} | {v.get('earliest_direct_year') or '—'} | {v.get('earliest_any_year') or '—'} | {ea.get('name', '—')} {ea.get('inception', '')} |")
    else:
        a(str(e4.get("error")))
    e7 = P["e7Concentration"]
    a("\n### E7 集中度（验证段）\n")
    for c in ("C1a", "C1b"):
        top = list(e7[c]["industryContribution"].items())
        a(f"- {c} 持仓名次分布 {e7[c]['rankDistribution']}；贡献最高行业 " + "、".join(f"{k} {_f(v, pct=True)}" for k, v in top[:3])
          + "；最低 " + "、".join(f"{k} {_f(v, pct=True)}" for k, v in top[-3:]) + f"；最好 5 个月差合计占全段差 {_f(e7[c]['top5ShareOfTotalDiff'])}（全段差为负时该比值为负）。")
    a("\n### E8 2015 年\n")
    h1 = P["e8"]["2015H1"]
    a("- 2015 上半年（2015-01-01 至 06-30，年化口径）：" + "，".join(f"{k} 夏普 {_f(v['sharpe'], 2)} 回撤 {_f(v['maxdd'], pct=True)}" for k, v in h1.items()) + "。")
    a("- 2015 股灾段见上方急跌段表（峰在 2015 年的段）。\n")
    av = P["allocateVariant"]
    a("### 买不进权重转给其他目标（allocate 报告项，不判定；主口径为留现金）\n")
    a("| 组合 | 验证段年化波动 | 夏普 | 最大回撤 | L | 与主口径最大日收益差 |")
    a("|---|---:|---:|---:|---:|---:|")
    for nm, v in av.items():
        if nm == "note":
            continue
        x = v["validate"]["net"]
        a(f"| {nm} | {_f(x['vol'], pct=True)} | {_f(x['sharpe'], 3)} | {_f(x['maxdd'], pct=True)} | {_f(v['validateL'])} | {v['maxAbsDailyDiffVsMain']:.2e} |")
    a("\nallocate 口径读数（判定 1/2/3/4）：" + "；".join(
        f"{c} " + "/".join("过" if av[c]["readings"][k] else "不过" for k in ("c1", "c2", "c3", "c4")) for c in ("C1a", "C1b")) + "。\n")
    tv = P["truncFirstVariant"]
    a("### 先截断再缩放（主实现第一版顺序，报告项，不判定；CLARIFY-2 第 11a 条）\n")
    a("| 组合 | 验证段年化波动 | 夏普 | 最大回撤 | L | 与主口径不同的交易日 | 最大日收益差 |")
    a("|---|---:|---:|---:|---:|---:|---:|")
    for nm, v in tv.items():
        if nm == "note":
            continue
        x = v["validate"]["net"]
        a(f"| {nm} | {_f(x['vol'], pct=True)} | {_f(x['sharpe'], 3)} | {_f(x['maxdd'], pct=True)} | {_f(v['validateL'])} | {v['daysDifferVsMain']} | {v['maxAbsDailyDiffVsMain']:.2e} |")
    a("\n第一版顺序读数（判定 1/2/3/4）：" + "；".join(
        f"{c} " + "/".join("过" if tv[c]["readings"][k] else "不过" for k in ("c1", "c2", "c3", "c4")) for c in ("C1a", "C1b")) + "。\n")
    st_ = P["strictTtm"]
    a("### 严格 TTM（报告项；主口径复用 fin_ni_ttm）\n")
    a(f"- 月末 × 股票格：主口径有值 {st_['cellsMainFinite']}，严格口径有值 {st_['cellsStrictFinite']}；仅靠「退回最近年报」才有值 "
      f"{st_['cellsFallbackOnly']} 格（其中覆盖池内 {st_['cellsFallbackOnlyCovered']}），两者都有值但不同 {st_['cellsBothDiffer']} 格。")
    a("- 持仓集合不同的月份（全期 / 验证段）：" + "，".join(
        f"{k} {v['n']} / {v['nValidate']}" for k, v in st_["heldMonthsDiffer"].items()) + "。严格口径 C1a / C1b 的度量见敏感性表 E0_*_ttmStrict。\n")
    a("### 100 万元整手 + 最低佣金（可执行性报告项，不判定）\n")
    a("| 组合 | 验证段年化波动 | 夏普 | 最大回撤 | 日均现金 | L |")
    a("|---|---:|---:|---:|---:|---:|")
    for nm, v in P["feasibility1e6"].items():
        if nm == "note":
            continue
        x = v["validate"]
        a(f"| {nm} | {_f(x['net']['vol'], pct=True)} | {_f(x['net']['sharpe'], 3)} | {_f(x['net']['maxdd'], pct=True)} | {_f(x['cashShareMean'], pct=True)} | {_f(v['validateL'])} |")
    a("\n" + P["feasibility1e6"]["note"] + "\n")
    a("## 说明\n")
    for n_ in P["meta"]["notes"]:
        a(f"- {n_}")
    a(f"- 诊断：{P['diagnostics']['note']}")
    a(f"\n验证段日度序列：`{P['daily']['dir']}`（{', '.join(P['daily']['files'])}）。")
    a(f"\n试验日志 `{P['trials']['logPath']}`（{P['trials']['nRecorded']} 条，族 L-052；manager 计算完成后并入 factor-ledger）。是否晋级锁箱由 manager 决定。")
    return "\n".join(L) + "\n"


if __name__ == "__main__":
    main()
