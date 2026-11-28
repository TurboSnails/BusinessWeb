#!/usr/bin/env python3
"""L-052 第二实现（独立）：信号层见 signals.py；本文件 = 组合构造、执行回测、度量、判定、安慰剂与报告项。

用法：cd research-py && uv run python ../docs/research/theme-pe-cn-2026-11-28/replication/run.py
输出：replication/results.json（结构对齐 ../results.schema.json）、replication/trials.jsonl。

不读锁箱：store.load_panel 默认 raw=False（截到 2023-10-31）；不 unseal、不 evaluate_factor。
执行回测为自写 Executor（PREREG 执行原文；成本参数取 factorlab DEFAULT_COSTS + DEFAULT_SLIPPAGE['cn']，
CLARIFY-2 第 1 条比例成本主口径）；factorlab._backtest 只作诊断对照（其 allocate 会把买不进的权重转给其他目标）。
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
sys.path.insert(0, str(HERE))
import signals as S  # noqa: E402

from factorlab import store  # noqa: E402
from factorlab.backtest import TRADING_DAYS, _backtest, perf_stats  # noqa: E402
from factorlab.universe import AdvCache  # noqa: E402

SEED = 20261128
N_PLACEBO = 1000
N_BOOT = 1000
WIN = {"explore": ("2005-01-01", "2014-12-31"), "validate": ("2015-01-01", "2023-10-31"),
       "full": ("2005-01-01", "2023-10-31")}
RF_CSV = S.REPO / "docs/research/factorlab/inputs/CH_4_fac_update_20211231.csv"
# 执行口径：cash（主口径：先按预算缩放、再截断买不进 → 买不进部分严格留现金）；
# cash_capfirst（先截断买不进、再在超预算时缩放：超预算时买不进部分被缩放吸收；主实现的口径，逐日逐位吻合）；
# redistribute（factorlab allocate：买不进部分转给其他目标，报告项）
ALLOC = next((a.split("=", 1)[1] for a in sys.argv if a.startswith("--alloc=")), "cash")
assert ALLOC in ("cash", "cash_capfirst", "redistribute"), ALLOC
SUFFIX = {"cash": "", "cash_capfirst": "-capfirst", "redistribute": "-allocate"}[ALLOC]
OUT = HERE / f"results{SUFFIX}.json"
TRIALS = HERE / f"trials{SUFFIX}.jsonl"
FIRST_SENTENCE = ("本研究检验的是申万一级行业的「6 个月相对强 + 成交额集中 + 行业 PE 自身分位过滤」，不是题材或概念本身"
                  "（AI、机器人这类主线跨越多个一级行业）；C1a / C1b 结构上集中持有 1–2 个行业，不是降波动写法；"
                  "验证段不是样本外；已退市股票不在行业篮子里；整行业篮子普通账户难以执行，行业 ETF 多跟踪中证指数且大多 2013 年后才有。")


def clean(x):
    """JSON 友好：NaN/inf → None，numpy → python。"""
    if isinstance(x, dict):
        return {str(k): clean(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [clean(v) for v in x]
    if isinstance(x, (np.floating, float)):
        v = float(x)
        return v if math.isfinite(v) else None
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (np.bool_,)):
        return bool(x)
    if isinstance(x, pd.Timestamp):
        return str(x.date())
    return x


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for ch in iter(lambda: f.read(1 << 20), b""):
            h.update(ch)
    return h.hexdigest()


# ================================================================ 无风险利率
def rf_daily(dates: pd.DatetimeIndex) -> tuple[pd.Series, dict]:
    raw = pd.read_csv(RF_CSV, skiprows=9)
    raw = raw[pd.to_numeric(raw["mnthdt"], errors="coerce").notna()]
    m = pd.Series(raw["rf_mon"].astype(float).to_numpy() / 100.0,
                  index=pd.PeriodIndex(pd.to_datetime(raw["mnthdt"].astype(int).astype(str)), freq="M"))
    last = m.index.max()
    fill = (1.015) ** (1 / 12) - 1
    per = dates.to_period("M")
    mon = pd.Series([m.get(p, fill if p > last else np.nan) for p in per], index=dates)
    n_in = pd.Series(1, index=dates).groupby(per).transform("sum")
    rf = (1 + mon) ** (1 / n_in) - 1
    info = {"source": str(RF_CSV.relative_to(S.REPO)) + " rf_mon（%）", "spliceAfter": str(last),
            "fillAnnual": 0.015, "fillMonthly": fill,
            "dailyRule": "(1+月度)^(1/当月交易日数)−1"}
    return rf, info


# ================================================================ 组合构造
def b1_members(d: S.Data, t: int) -> list[int]:
    ok = d.COV[t] & np.isfinite(d.MF[t])
    cnt = np.bincount(d.IND[t][ok].astype(np.int64), minlength=len(d.ind_names))
    return [j for j in range(len(d.ind_names)) if cnt[j] >= S.IND_MIN]


def slot_schedule(sig: S.Signals, held: dict, k: int, rest: str = "B0", c2: set | None = None) -> dict:
    """me → {key: 权重}；key = 行业名 | 'B0' | 'B1'。每个持仓槽 1/K，空槽归 rest。c2：(me, 行业) 改归 B0。"""
    out = {}
    for me in sig.mes:
        h = held[me][0]
        w = {}
        for nm in h:
            if c2 is not None and (me, nm) in c2:
                w["B0"] = w.get("B0", 0.0) + 1.0 / k
            else:
                w[nm] = w.get(nm, 0.0) + 1.0 / k
        r = 1.0 - sum(w.values())
        if r > 1e-12:
            w[rest] = w.get(rest, 0.0) + r
        out[me] = w
    return out


def stock_targets(sig: S.Signals, sched: dict) -> pd.DataFrame:
    d = sig.d
    rows = np.zeros((len(sig.mes), len(d.codes)))
    for i, me in enumerate(sig.mes):
        t = d.pos[me]
        mf = d.MF[t]
        base = d.COV[t] & np.isfinite(mf)
        for key, w in sched[me].items():
            if key == "B0":
                m = base
                rows[i, m] += w * mf[m] / mf[m].sum()
            elif key == "B1":
                mem = b1_members(d, t)
                for j in mem:
                    m = base & (d.IND[t] == j)
                    rows[i, m] += w / len(mem) * mf[m] / mf[m].sum()
            else:
                j = d.ind_names.index(key)
                m = base & (d.IND[t] == j)
                rows[i, m] += w * mf[m] / mf[m].sum()
    return pd.DataFrame(rows, index=pd.DatetimeIndex(sig.mes), columns=d.codes)


class Result:
    def __init__(self, returns, gross, turnover, costs, weights):
        self.returns, self.gross, self.turnover, self.costs, self.weights = returns, gross, turnover, costs, weights


class Executor:
    """第二实现自写的执行回测（PREREG「度量与执行」原文）：
    - 信号日 t 收盘定目标（个股权重 = 行业槽权重 × 行业内 float 权重），t 后首个交易日开盘（open_adj）成交；
    - 一字涨停（开 = 高 = 低 = 收且封涨停）买不进：该部分权重留现金到下个调仓日（不转给其他目标）；
      已持有的一字涨停股只能减不能加；
    - 停牌（无行或成交量 ≤ 0）/ 一字跌停卖不出：保持原权重（锁定）；锁定且不在目标内的挂单，首个可卖开盘卖出，资金留现金；
    - 锁定权重占用预算，其余目标超预算时按比例缩；现金 0 收益（factorlab 惯例，CLARIFY-2 第 5 条）；
    - 成本：DEFAULT_COSTS['cn'] 佣金 + 过户（双边）+ 印花（按日期、按买卖方向）+ DEFAULT_SLIPPAGE['cn']（t 前 20 日成交额中位数分档）；
      capital 给定时按 100 股整手取整（清仓可零股）并计 5 元最低佣金。
    覆盖池股票没有退市（退市股无点时行业），不处理退市。"""

    def __init__(self, d: S.Data):
        from factorlab.backtest import DEFAULT_COSTS, DEFAULT_SLIPPAGE
        from factorlab.universe import bool_values
        self.d = d
        p = d.panel
        self.cm, self.sl = DEFAULT_COSTS["cn"], DEFAULT_SLIPPAGE["cn"]
        has = np.isfinite(d.P)
        C = pd.DataFrame(d.P).ffill().to_numpy()
        O = p["open_adj"].to_numpy(float)
        O = np.where(has & np.isfinite(O) & (O > 0), O, C)
        Cp = np.vstack([C[:1], C[:-1]])
        with np.errstate(invalid="ignore", divide="ignore"):
            self.r_on = np.nan_to_num(O / Cp - 1)
            self.r_in = np.nan_to_num(C / O - 1)
        vol = p["volume"].to_numpy(float)
        susp = ~has | (has & np.isfinite(vol) & (vol <= 0)) | bool_values(p["is_suspended"])
        o, h, lo, c = (p[k].to_numpy(float) for k in ("open", "high", "low", "close"))
        flat = np.isclose(o, h) & np.isclose(o, lo) & np.isclose(o, c)
        lu = bool_values(p["limit_up"]) & flat
        ld = bool_values(p["limit_down"]) & flat
        self.susp = susp
        self.can_buy = has & ~susp & ~lu
        self.can_sell = ~susp & ~ld
        self.px = p["open"].to_numpy(float)
        self.adv = AdvCache(p["amount"], self.sl.window, max(1, self.sl.window // 2))

    def run(self, target: pd.DataFrame, capital: float | None = None, scale: str = "down",
            cb: str | None = None, trace: dict | None = None) -> Result:
        """scale：'down' = 只在超预算时按比例缩（PREREG『超预算时按比例缩』字面）；'both' = 非锁定目标总按比例填满预算。
        cb：'cash' = 买不进部分留现金（PREREG 原文）；'redistribute' = factorlab allocate（转给其他目标）。"""
        from factorlab.backtest import allocate
        cb = cb or ALLOC
        d = self.d
        nD = len(d.dates)
        T = target.reindex(columns=d.codes).to_numpy(float)
        orders = {}
        for k, me in enumerate(target.index):
            i = d.pos[me] + 1
            if i < nD:
                orders[i] = np.nan_to_num(T[k])
        start = d.pos[target.index[0]]
        nC = len(d.codes)
        w = np.zeros(nC)
        pending = np.zeros(nC, dtype=bool)
        nav = 1.0
        gross, net, to_s, cost_s, weights = [], [], {}, {}, {}
        cm, sl = self.cm, self.sl

        def trade(i, new, old):
            dw = new - old
            if capital is not None:
                V = capital * nav
                px = np.where(np.isfinite(self.px[i]) & (self.px[i] > 0), self.px[i], np.nan)
                sh = np.trunc(np.nan_to_num(dw * V / (px * cm.lot_size))) * cm.lot_size
                dlot = np.nan_to_num(sh * px / V)
                dw = np.where(new == 0, -old, dlot)
                new = old + dw
            b, s_ = cm.stamp_rates(d.dates[i])
            buy, sell = np.clip(dw, 0, None), np.clip(-dw, 0, None)
            tr = buy + sell
            if capital is not None:
                V = capital * nav
                comm = np.where(tr > 1e-12, np.maximum(tr * cm.commission, cm.min_commission / V) + tr * cm.other, 0.0)
            else:
                comm = tr * (cm.commission + cm.other)
            adv = self.adv.row(d.dates[i])
            slip = sl.rate(adv if adv is not None else np.full(nC, np.nan))
            c = float(comm.sum() + (buy * b).sum() + (sell * s_).sum() + (tr * slip).sum())
            day = d.dates[i]
            to_s[day] = to_s.get(day, 0.0) + float(np.abs(dw).sum() / 2)
            cost_s[day] = cost_s.get(day, 0.0) + c
            return new, c

        for i in range(start, nD):
            rp1 = float(w @ self.r_on[i])
            if w.any():
                w = w * (1 + self.r_on[i]) / (1 + rp1)
            cost = 0.0
            if pending.any():
                sell_now = pending & self.can_sell[i]
                if sell_now.any():
                    w, c = trade(i, np.where(sell_now, 0.0, w), w)
                    cost += c
                    pending &= ~sell_now
            if i in orders:
                tgt = orders[i]
                locked = (w > 0) & ~self.can_sell[i]
                if cb == "redistribute":
                    new = allocate(tgt > 0, tgt, w, locked, self.can_buy[i])
                elif cb == "cash_capfirst":
                    # 先按买不进截断（新目标买不进 → 0、已持有只减不加），再在超预算时按比例缩
                    new = np.where(locked, w, 0.0)
                    free = np.where(locked, 0.0, tgt)
                    free = np.where(self.can_buy[i], free, np.minimum(free, w))
                    budget = max(1.0 - new.sum(), 0.0)
                    fs = free.sum()
                    if fs > budget:
                        free = free * (budget / fs)
                    new = new + free
                else:
                    new = np.where(locked, w, 0.0)
                    free = np.where(locked, 0.0, tgt)
                    budget = max(1.0 - new.sum(), 0.0)
                    fs = free.sum()
                    if fs > budget or (scale == "both" and fs > 0):
                        free = free * (budget / fs)
                    free = np.where(self.can_buy[i], free, np.minimum(free, w))
                    new = new + free
                if trace is not None and d.dates[i] in trace:
                    trace[d.dates[i]] = {"w_before": w.copy(), "tgt": tgt.copy(), "locked": locked.copy(),
                                         "new": new.copy(), "can_buy": self.can_buy[i].copy(),
                                         "can_sell": self.can_sell[i].copy(), "pending_before": pending.copy()}
                pending = locked & ~(tgt > 0)
                w, c = trade(i, new, w)
                cost += c
                weights[d.dates[i]] = float(w.sum())
            rp2 = float(w @ self.r_in[i])
            if w.any():
                w = w * (1 + self.r_in[i]) / (1 + rp2)
            g = (1 + rp1) * (1 + rp2) - 1
            nt = (1 + g) * (1 - cost) - 1
            nav *= 1 + nt
            gross.append(g)
            net.append(nt)
        idx = d.dates[start:]
        return Result(pd.Series(net, index=idx), pd.Series(gross, index=idx), pd.Series(to_s, dtype=float),
                      pd.Series(cost_s, dtype=float), weights)


class Engine:
    """诊断用：factorlab.backtest._backtest（allocate 会把买不进目标的权重分给其他目标，与 PREREG『留现金』不同）。"""

    def __init__(self, d: S.Data):
        self.d = d
        p = d.panel
        self.base = {k: p[k] for k in ("close_adj", "open_adj", "open", "high", "low", "close", "volume",
                                         "amount", "limit_up", "limit_down", "is_suspended")}
        self.adv = AdvCache(p["amount"], 20, 10)

    def run(self, target: pd.DataFrame, capital: float | None = None):
        panel = dict(self.base)
        panel["mcap_float"] = target
        factor = target.where(target > 0)
        return _backtest(factor, panel, "cn", None, top_q=1.0, weighting="cap", execution="open",
                         capital=capital, adv=self.adv, min_names=1)


# ================================================================ 度量
START = {"day": None}   # 首个持仓日（首个信号日次日开盘成交）；所有序列从这天起算（对齐后改动，见 CROSSCHECK）


def wslice(s: pd.Series, w: str) -> pd.Series:
    a, b = WIN[w]
    if START["day"] is not None:
        a = max(pd.Timestamp(a), START["day"])
    return s.loc[a:b]


def perf(r: pd.Series, rf: pd.Series) -> dict:
    p = perf_stats(r, rf)
    return {k: p[k] for k in ("cagr", "vol", "sharpe", "maxdd", "n")}


def block(res, rf, w) -> dict:
    g, n = wslice(res["gross"], w), wslice(res["net"], w)
    nd = len(n)
    to = res["turnover"]
    co = res["costs"]
    a, b = n.index[0], n.index[-1]
    return {"gross": perf(g, rf), "net": perf(n, rf),
            "turnoverAnn": float(to.loc[a:b].sum() / nd * TRADING_DAYS) if nd else None,
            "costAnn": float(co.loc[a:b].sum() / nd * TRADING_DAYS) if nd else None}


def zigzag(level: np.ndarray, thr: float = 0.20) -> list[tuple[int, int]]:
    """折线法急跌段：峰 → 谷；谷后反弹 ≥thr 结束该段并开新段；保留跌幅 ≥thr 的段（含期末未结束段）。"""
    segs = []
    p = tr = 0
    for i in range(1, len(level)):
        x = level[i]
        if x > level[p] and tr == p:
            p = tr = i
        elif x > level[p]:
            # 已有回撤但未反弹 thr 就创新高（回撤 < thr/(1+thr)），重置峰
            if level[tr] / level[p] - 1 <= -thr:
                segs.append((p, tr))
            p = tr = i
        elif x < level[tr]:
            tr = i
        elif x >= level[tr] * (1 + thr):
            if level[tr] / level[p] - 1 <= -thr:
                segs.append((p, tr))
            p = tr = i
    if tr != p and level[tr] / level[p] - 1 <= -thr:
        segs.append((p, tr))
    return segs


def crash_block(idx_ret: pd.Series, navs: dict, w: str) -> dict:
    """navs：组合 → {'net': 日收益, 'gross': 日收益}。"""
    r = wslice(idx_ret, w).fillna(0.0)
    lvl = np.concatenate([[1.0], (1 + r).cumprod().to_numpy()])
    days = [r.index[0] - pd.Timedelta(days=1)] + list(r.index)   # 0 号 = 窗口起点前
    segs = zigzag(lvl)
    out_segs = []
    sums = {k: {"net": 0.0, "gross": 0.0} for k in navs}
    per_seg = {k: [] for k in navs}
    for p, q in segs:
        pk, tq = days[p], days[q]
        seg = {"peak": str(pk.date()) if p > 0 else str(r.index[0].date()) + "(窗口起点前收盘)",
               "trough": str(tq.date()), "dropB0": float(lvl[q] / lvl[p] - 1), "ret": {}, "retGross": {}}
        for k, sr in navs.items():
            for typ in ("net", "gross"):
                x = wslice(sr[typ], w)
                seg_r = x[(x.index > pk) & (x.index <= tq)]
                v = float((1 + seg_r).prod() - 1)
                sums[k][typ] += v
                (seg["ret"] if typ == "net" else seg["retGross"])[k] = v
            per_seg[k].append(seg["ret"][k])
        out_segs.append(seg)
    L, share = {}, {}
    for k in navs:
        L[k] = {t: (sums[k][t] / sums["B1"][t] if sums["B1"][t] != 0 else None) for t in ("net", "gross")}
        imp = [(-b) - (-c) for b, c in zip(per_seg["B1"], per_seg[k])]  # B1 损失 − 组合损失
        tot = sum(imp)
        share[k] = (max(imp) / tot) if (imp and tot > 0) else None
    return {"segments": out_segs, "L": L, "singleSegShare": share}


# ================================================================ 无摩擦行业层模拟
class Sim:
    def __init__(self, sig: S.Signals):
        self.sig = sig
        d = sig.d
        self.b0 = np.nan_to_num(sig.ind.b0)
        self.R = sig.ind.ret
        self.pos = [d.pos[m] for m in sig.mes]
        self.idx = {nm: j for j, nm in enumerate(d.ind_names)}
        self.dates = d.dates
        self.b1mem = {me: b1_members(d, d.pos[me]) for me in sig.mes}

    def col(self, key, a, b):
        if key == "B0":
            return self.b0[a:b]
        r = self.R[a:b, self.idx[key]]
        return np.where(np.isfinite(r), r, self.b0[a:b])

    def run(self, sched: dict) -> pd.Series:
        """sched：me → {key: w}，key 可为 'B1'（展开为等权成员）。持有区间 = 信号日次日 … 下一信号日（收盘到收盘）。"""
        out = np.zeros(len(self.dates))
        for i in range(len(self.pos) - 1):
            a, b = self.pos[i] + 1, self.pos[i + 1] + 1
            me = self.sig.mes[i]
            keys, ws = [], []
            for key, w in sched[me].items():
                if key == "B1":
                    mem = self.b1mem[me]
                    for j in mem:
                        keys.append(self.sig.d.ind_names[j])
                        ws.append(w / len(mem))
                else:
                    keys.append(key)
                    ws.append(w)
            M = np.column_stack([self.col(k, a, b) for k in keys])
            V = np.asarray(ws)[None, :] * np.cumprod(1 + M, axis=0)
            tot = V.sum(1)
            prev = np.concatenate([[sum(ws)], tot[:-1]])
            out[a:b] = tot / prev - 1
        s = pd.Series(out, index=self.dates)
        return s.loc[self.dates[self.pos[0] + 1]:]


def sim_metrics(r: pd.Series, b1: pd.Series, segs: list, rf: pd.Series) -> dict:
    v = wslice(r, "validate")
    p = perf(v, rf)
    num = den = 0.0
    for pk, tq in segs:
        num += float((1 + v[(v.index > pk) & (v.index <= tq)]).prod() - 1)
        x = wslice(b1, "validate")
        den += float((1 + x[(x.index > pk) & (x.index <= tq)]).prod() - 1)
    return {"L": num / den if den != 0 else None, "vol": p["vol"], "maxdd": p["maxdd"], "sharpe": p["sharpe"]}


def seg_dates(crash: dict) -> list:
    out = []
    for s in crash["segments"]:
        pk = s["peak"]
        pk = pd.Timestamp(pk[:10]) - (pd.Timedelta(days=1) if "前" in pk else pd.Timedelta(0))
        out.append((pk, pd.Timestamp(s["trough"])))
    return out


# ================================================================ 主流程
def main():
    T0 = time.time()
    d = S.load()
    print(f"[{time.time()-T0:.0f}s] loaded {d.P.shape}")
    ind = S.industry_series(d)
    sig = S.build_signals(d, ind)
    # CLARIFY-2 第 12 条报告项：PREREG 括注的严格 TTM（缺任一项即无），独立重算后代入信号层
    import dataclasses
    import os
    from factorlab import fundamentals_cn as fc
    from ttm_check import strict_ttm
    cache = os.environ.get("L052_STRICT_TTM_CACHE")
    if cache and Path(cache).exists():
        st = pd.read_pickle(cache)
    else:
        me_s = d.month_ends[d.month_ends >= pd.Timestamp(S.COUNT_START)]
        fin = fc.guard_fin(fc.read_fin(d.codes), store.lockbox_start("cn"), None)
        st = strict_ttm(fin, me_s, pd.Index([str(c) for c in d.codes]))
        if cache:
            st.to_pickle(cache)
    sig_s = S.build_signals(dataclasses.replace(d, NI=st.reindex(index=d.month_ends).set_axis(d.codes, axis=1)), ind)
    rf, rf_info = rf_daily(d.dates)
    mes = sig.mes
    START["day"] = d.dates[d.pos[mes[0]] + 1]
    print(f"[{time.time()-T0:.0f}s] signals")

    # ---------------- 持仓
    H = {
        "C1a": S.run_persistent(sig),
        "C1b": S.run_monthly(sig, sig.rank_b),
        "B2p": S.run_persistent(sig, rule=S.Rule("none")),
        "B2b": S.run_monthly(sig, sig.rank_b, rule=S.Rule("none")),
        "B4": S.run_monthly(sig, sig.rank_a),
    }
    K = 2
    VAR = {  # 敏感性：名称 → (持仓, K, rest)
        "E1_K1_C1a": (S.run_persistent(sig, 1, 4), 1, "B0"),
        "E1_K3_C1a": (S.run_persistent(sig, 3, 5), 3, "B0"),
        "E1_K1_C1b": (S.run_monthly(sig, sig.rank_b, 1), 1, "B0"),
        "E1_K3_C1b": (S.run_monthly(sig, sig.rank_b, 3), 3, "B0"),
        "E2_exit3_C1a": (S.run_persistent(sig, 2, 3), 2, "B0"),
        "E2_exit5_C1a": (S.run_persistent(sig, 2, 5), 2, "B0"),
        "E3_C1a": (H["C1a"], 2, "B1"),
        "E3_C1b": (H["C1b"], 2, "B1"),
        "E5_C1a": (S.run_persistent(sig, rule=S.Rule("ep")), 2, "B0"),
        "E5_C1b": (S.run_monthly(sig, sig.rank_b, rule=S.Rule("ep")), 2, "B0"),
        "E6_thr080_C1a": (S.run_persistent(sig, rule=S.Rule("pe", 0.80)), 2, "B0"),
        "E6_thr095_C1a": (S.run_persistent(sig, rule=S.Rule("pe", 0.95)), 2, "B0"),
        "E6_thr080_C1b": (S.run_monthly(sig, sig.rank_b, rule=S.Rule("pe", 0.80)), 2, "B0"),
        "E6_thr095_C1b": (S.run_monthly(sig, sig.rank_b, rule=S.Rule("pe", 0.95)), 2, "B0"),
        "E0_C1b_tiePrereg": (S.run_monthly(sig, sig.rank_b_prereg), 2, "B0"),
        "E0_C1a_ttmStrict": (S.run_persistent(sig_s), 2, "B0"),
        "E0_C1b_ttmStrict": (S.run_monthly(sig_s, sig_s.rank_b), 2, "B0"),
    }

    # C2：作用于 B2 持仓
    c2_hits = []
    for me in mes:
        t = d.pos[me]
        for nm in H["B2p"][me][0]:
            pct, cls = sig.pe.pe_info(me, nm)
            if pct is None or pct <= 0.95:
                continue
            j = d.ind_names.index(nm)
            sh = sig.share_a[:, j]
            if t < 60 or not (np.isfinite(sh[t]) and np.isfinite(sh[t - 60])):
                continue
            if sh[t] < sh[t - 60]:
                c2_hits.append((me, nm))

    sched = {k: slot_schedule(sig, h, K) for k, h in H.items()}
    sched["B0"] = {me: {"B0": 1.0} for me in mes}
    sched["B1"] = {me: {"B1": 1.0} for me in mes}
    sched["B2C2"] = slot_schedule(sig, H["B2p"], K, c2=set(c2_hits))
    for nm, (h, k, rest) in VAR.items():
        sched[nm] = slot_schedule(sig, h, k, rest)

    # ---------------- 执行回测
    eng = Executor(d)
    BT = {}
    for nm in ["C1a", "C1b", "B0", "B1", "B2p", "B2b", "B4", "B2C2"] + list(VAR):
        res = eng.run(stock_targets(sig, sched[nm]))
        BT[nm] = {"net": res.returns, "gross": res.gross, "turnover": res.turnover, "costs": res.costs,
                  "weights": res.weights}
        print(f"[{time.time()-T0:.0f}s] bt {nm}")
    # ---------------- 度量
    PORTS = ["C1a", "C1b", "B0", "B1", "B2p", "B2b", "B4"]
    metrics = {w: {} for w in WIN}
    kstar = {}
    for w in WIN:
        for p in PORTS + ["B2C2"]:
            metrics[w][p] = block(BT[p], rf, w)
        for c in ("C1a", "C1b"):
            blk = {}
            ks = {}
            for typ in ("gross", "net"):
                vc = metrics[w][c][typ]["vol"]
                vb = metrics[w]["B1"][typ]["vol"]
                k_ = vc / vb
                ks[typ] = k_
                b1 = wslice(BT["B1"][typ], w)
                s = k_ * b1 + (1 - k_) * rf.reindex(b1.index)
                blk[typ] = perf(s, rf)
            blk["turnoverAnn"] = None
            blk["costAnn"] = None
            blk["k"] = ks["net"]
            blk["kGross"] = ks["gross"]
            metrics[w][f"B1star_{c}"] = blk
            kstar[(w, c)] = ks

    # ---------------- 急跌段与 L
    b0_idx = pd.Series(ind.b0, index=d.dates)
    navs = {p: {"net": BT[p]["net"], "gross": BT[p]["gross"]} for p in PORTS + ["B2C2"]}
    crash = {w: crash_block(b0_idx, navs, w) for w in ("validate", "explore")}
    print(f"[{time.time()-T0:.0f}s] crash segments validate={len(crash['validate']['segments'])}")

    # ---------------- 判定
    def judge(c: str, b2: str, w="validate", crash_w=None, mets=None) -> dict:
        mets = mets or metrics[w]
        cr = crash_w or crash[w]
        out = {}
        for typ in ("net", "gross"):
            m, b1, bb2 = mets[c][typ], mets["B1"][typ], mets[b2][typ]
            sh_star = mets[f"B1star_{c}"][typ]["sharpe"] if f"B1star_{c}" in mets else b1["sharpe"]
            Lv = cr["L"][c][typ]
            c1 = (m["vol"] <= b1["vol"]) and (m["maxdd"] >= b1["maxdd"] - 0.01) and (m["sharpe"] >= sh_star - 0.02)
            out[typ] = {
                "c1": {"pass": bool(c1), "detail": {"vol": m["vol"], "volB1": b1["vol"], "maxdd": m["maxdd"],
                                                     "maxddB1": b1["maxdd"], "sharpe": m["sharpe"],
                                                     "sharpeB1star": sh_star}},
                "c2": {"pass": bool(Lv is not None and Lv <= 0.95), "detail": {"L": Lv}},
                "c3": {"pass": bool(m["sharpe"] >= b1["sharpe"] - 0.02),
                       "detail": {"sharpe": m["sharpe"], "sharpeB1": b1["sharpe"]}},
                "c4": {"pass": bool((m["maxdd"] - bb2["maxdd"] >= 0.02) and (m["sharpe"] >= bb2["sharpe"] - 0.01)),
                       "detail": {"vs": b2, "maxdd": m["maxdd"], "maxddB2": bb2["maxdd"], "sharpe": m["sharpe"],
                                  "sharpeB2": bb2["sharpe"]}},
            }
        return out

    # ---------------- 安慰剂（行业层无摩擦模拟）
    sim = Sim(sig)
    segs_v = seg_dates(crash["validate"])
    b1_sim = sim.run(sched["B1"])
    rng = np.random.default_rng(SEED)
    # 验证段持有区间涉及的信号月：2014-12 … 2023-09
    v_mes = [m for m in mes if m >= pd.Timestamp("2014-12-01") and m < pd.Timestamp("2023-10-01")]
    placebo, circ = {}, {}
    for c in ("C1a", "C1b"):
        table = sig.rank_a if c == "C1a" else sig.rank_b
        act_r = sim.run(sched[c])
        act = sim_metrics(act_r, b1_sim, segs_v, rf)
        # 段 = 持仓集合不变的最大连续月（非空）
        segs = []
        prev = None
        for me in v_mes:
            h = tuple(sorted(H[c][me][0]))
            if h and h == prev:
                segs[-1][1].append(me)
            elif h:
                segs.append((len(h), [me]))
            prev = h
        draws = {"L": [], "vol": [], "maxdd": [], "sharpe": []}
        for _ in range(N_PLACEBO):
            sc = {me: dict(sched[c][me]) for me in mes}
            for n_h, months in segs:
                cand = [nm for nm, _, _ in table[months[0]]]
                pick = list(rng.choice(cand, size=n_h, replace=False))
                for me in months:
                    w = {nm: 1.0 / K for nm in pick}
                    rest = 1.0 - n_h / K
                    if rest > 1e-12:
                        w["B0"] = rest
                    sc[me] = w
            mm = sim_metrics(sim.run(sc), b1_sim, segs_v, rf)
            for k_ in draws:
                draws[k_].append(mm[k_])
        arr = {k_: np.asarray(v, float) for k_, v in draws.items()}
        N = N_PLACEBO
        pv = {"L": (1 + np.sum(arr["L"] <= act["L"])) / (1 + N),
              "vol": (1 + np.sum(arr["vol"] <= act["vol"])) / (1 + N),
              "maxdd": (1 + np.sum(arr["maxdd"] >= act["maxdd"])) / (1 + N),
              "sharpe": (1 + np.sum(arr["sharpe"] >= act["sharpe"])) / (1 + N)}
        placebo[c] = {"n": N, "seed": SEED, "nSegments": len(segs), "actualSim": act, "p": pv,
                      "dist": {k_: {"mean": float(np.mean(v)), "p05": float(np.quantile(v, 0.05)),
                                    "p50": float(np.quantile(v, 0.5)), "p95": float(np.quantile(v, 0.95))}
                               for k_, v in arr.items()},
                      "_Ldraws": arr["L"]}
        # 循环平移：验证段信号月序列整体平移 s = 1…n−1
        seq = [sched[c][me] for me in v_mes]
        n = len(seq)
        Ls = []
        for s_ in range(1, n):
            sc = {me: dict(sched[c][me]) for me in mes}
            for i, me in enumerate(v_mes):
                sc[me] = seq[(i - s_) % n]
            Ls.append(sim_metrics(sim.run(sc), b1_sim, segs_v, rf)["L"])
        Ls = np.asarray(Ls, float)
        circ[c] = {"nShifts": n - 1, "actualL": act["L"], "p": {"L": float((1 + np.sum(Ls <= act["L"])) / n)},
                   "dist": {"mean": float(np.mean(Ls)), "p05": float(np.quantile(Ls, 0.05)),
                            "p95": float(np.quantile(Ls, 0.95))},
                   "note": "平移后行业当日无有效收益时以 B0 收益代替"}
        print(f"[{time.time()-T0:.0f}s] placebo {c} pL={pv['L']:.4f}")
    pa, pb = placebo["C1a"]["p"]["L"], placebo["C1b"]["p"]["L"]
    order = sorted([("C1a", pa), ("C1b", pb)], key=lambda x: x[1])
    adj1 = min(1.0, 2 * order[0][1])
    adj2 = max(adj1, min(1.0, order[1][1]))
    holm = {order[0][0]: adj1, order[1][0]: adj2}

    # ---------------- 块 bootstrap（月度，配对循环块）
    def monthly(r: pd.Series) -> pd.Series:
        return (1 + r).groupby(r.index.to_period("M")).prod() - 1

    rf_m = monthly(wslice(rf, "validate"))
    boot = {}
    for c in ("C1a", "C1b"):
        mc = monthly(wslice(BT[c]["net"], "validate"))
        mb = monthly(wslice(BT["B1"]["net"], "validate"))
        X = np.column_stack([mc.to_numpy(), mb.to_numpy(), rf_m.reindex(mc.index).to_numpy()])
        nM = len(X)

        def stat(Y):
            ex_c, ex_b = Y[:, 0] - Y[:, 2], Y[:, 1] - Y[:, 2]
            shc = ex_c.mean() / ex_c.std(ddof=1) * math.sqrt(12)
            shb = ex_b.mean() / ex_b.std(ddof=1) * math.sqrt(12)
            return shc - shb, (Y[:, 0].std(ddof=1) - Y[:, 1].std(ddof=1)) * math.sqrt(12)

        obs = stat(X)
        boot[c] = {"observed": {"sharpeDiff": obs[0], "volDiff": obs[1]}, "nMonths": nM}
        for bl in (6, 12, 24):
            r_ = np.random.default_rng(SEED + bl)
            sd, vd = [], []
            for _ in range(N_BOOT):
                starts = r_.integers(0, nM, size=math.ceil(nM / bl))
                ix = np.concatenate([(s0 + np.arange(bl)) % nM for s0 in starts])[:nM]
                a_, b_ = stat(X[ix])
                sd.append(a_)
                vd.append(b_)
            sd, vd = np.asarray(sd), np.asarray(vd)
            boot[c][str(bl)] = {
                "sharpeDiff": {"mean": float(sd.mean()), "p05": float(np.quantile(sd, .05)),
                               "p95": float(np.quantile(sd, .95)), "pLE0": float((1 + np.sum(sd <= 0)) / (1 + N_BOOT))},
                "volDiff": {"mean": float(vd.mean()), "p05": float(np.quantile(vd, .05)),
                            "p95": float(np.quantile(vd, .95)), "pGE0": float((1 + np.sum(vd >= 0)) / (1 + N_BOOT))},
                "n": N_BOOT, "seed": SEED + bl, "method": "配对循环块 bootstrap（月度净收益，验证段）"}

    # ---------------- 功效（以安慰剂 L 分布为零假设，真实 L 比随机低 0.05）
    power = {"design": "零分布 = 随机行业安慰剂 L（1000 次）；备择 = 每个安慰剂抽样 L − 0.05 作为『实际』；"
                       "功效 = 备择下单边 p ≤ 0.10（未调整）与 ≤ 0.05（Holm 双候选最紧一档）的比例。"
                       "PREREG 的『月收益相关 0.3 + 块 bootstrap』粗估未复刻（相关 0.3 的设定在行业组合与 B1 之间不现实），此为替代设计。",
             "deltaL": 0.05}
    for c in ("C1a", "C1b"):
        L0 = placebo[c]["_Ldraws"]
        alt = L0 - 0.05
        ps = np.array([(1 + np.sum(L0 <= a)) / (1 + len(L0)) for a in alt])
        power[c] = {"power_p10": float(np.mean(ps <= 0.10)), "power_p05": float(np.mean(ps <= 0.05)),
                    "nullSdL": float(np.std(L0, ddof=1))}
    for c in placebo:
        placebo[c].pop("_Ldraws")

    # ---------------- 判定与分级
    judgments = {}
    for c, b2 in (("C1a", "B2p"), ("C1b", "B2b")):
        j = judge(c, b2)
        jj = {"net": j["net"], "gross": j["gross"]}
        if c == "C1b":
            jj["c4_vs_B2p"] = judge(c, "B2p")["net"]["c4"]
        jj["c5"] = {"pass": bool(holm[c] <= 0.10), "detail": {"pL": placebo[c]["p"]["L"], "holm": holm[c]}}
        net_ok = all(j["net"][x]["pass"] for x in ("c1", "c2", "c3", "c4"))
        jj["c6"] = {"pass": bool(net_ok), "detail": {"rule": "CLARIFY-2 第 7 条：判定 6 = 净值版 1–4 全过"}}
        share = crash["validate"]["singleSegShare"][c]
        cap = bool(share is not None and share > 0.5)
        jj["singleSegCap"] = cap
        if net_ok and jj["c5"]["pass"] and not cap:
            g = "通过"
        elif net_ok:
            g = "部分成立"
        else:
            g = "不通过"
        jj["grade"] = g
        jj["gradeRule"] = ("通过 = 净值 1–4 + 5 + 6 全过且无单段上限；净值 1–4（=6）全过但 5 不过或单段占比 >50% → 部分成立；"
                           "净值 1–4 任一不过 → 不通过（第二实现的读法）")
        judgments[c] = jj

    # ---------------- 分解
    def mon_of_day(dates):
        """交易日 → 所属持有月（信号月）：信号日次日 … 下一信号日。"""
        pos = [d.pos[m] for m in mes]
        lab = pd.Series(pd.NaT, index=d.dates)
        for i in range(len(pos) - 1):
            lab.iloc[pos[i] + 1: pos[i + 1] + 1] = mes[i]
        return lab.reindex(dates)

    def decomp(c, w="validate"):
        diff = (wslice(BT[c]["net"], w) - wslice(BT["B1"]["net"], w)).dropna()
        lab = mon_of_day(diff.index)
        empty = lab.map(lambda m: (not H[c][m][0]) if pd.notna(m) else False).astype(bool)
        nd = len(diff)
        parts = {}
        for nm, msk in (("emptyMonths", empty), ("heldMonths", ~empty)):
            x = diff[msk.to_numpy()]
            parts[nm] = {"days": int(len(x)), "sumDailyDiff": float(x.sum()),
                         "annContribution": float(x.sum() / nd * TRADING_DAYS)}
        parts["total"] = {"days": nd, "sumDailyDiff": float(diff.sum()), "annDiff": float(diff.mean() * TRADING_DAYS)}
        parts["note"] = "日度净收益差（候选 − B1）按持有月是否空缺拆分；空缺月候选 = B0，故该部分即 B0 − B1"
        return parts

    def delta(a, b):
        out = {}
        for w in ("validate", "explore"):
            ma, mb = metrics[w][a]["net"], metrics[w][b]["net"]
            out[w] = {k_: ma[k_] - mb[k_] for k_ in ("cagr", "vol", "sharpe", "maxdd")}
        return out

    decomposition = {"C1a_vs_B1": decomp("C1a"), "C1b_vs_B1": decomp("C1b"),
                     "persistence_C1a_minus_B4": delta("C1a", "B4"),
                     "peIncrement": {"C1a_minus_B2p": delta("C1a", "B2p"), "C1b_minus_B2b": delta("C1b", "B2b"),
                                     "C1b_minus_B2p": delta("C1b", "B2p")}}

    # ---------------- 跳过与持仓统计
    def wmes(w):
        a, b = WIN[w]
        return [m for m in mes if pd.Timestamp(a) <= m <= pd.Timestamp(b)]

    skips, holdings = {}, {}
    for nm, h in list(H.items()) + [(k_, v[0]) for k_, v in VAR.items()]:
        skips[nm], holdings[nm] = {}, {}
        for w in WIN:
            st = S.hold_stats(h, wmes(w))
            skips[nm][w] = st.pop("skips")
            holdings[nm][w] = st

    # ---------------- 计数核对（冻结 counts_theme_pe.json）
    cnt = json.loads((S.STUDY / "counts_theme_pe.json").read_text())
    diffs = []

    def chk(label, mine, ref):
        if ref is None:
            return
        if isinstance(ref, float) or isinstance(mine, float):
            if mine is None or abs(float(mine) - float(ref)) > 1e-9:
                diffs.append(f"{label}: mine={mine} frozen={ref}")
        elif mine != ref:
            diffs.append(f"{label}: mine={mine} frozen={ref}")

    full_stats = {nm: S.hold_stats(H[nm], mes) for nm in H}
    mapping = {"C1a": "C1a", "C1b": "C1b", "B2_persistent_no_pe90": "B2p", "B2b_monthly_no_pe90": "B2b",
               "B4_monthly_c1a_signal": "B4"}
    keymap = {"months": "months", "months_with_held": "monthsWithHeld", "months_empty": "monthsEmpty",
              "switches": "switches", "mean_held": "meanHeld", "median_run": "medianRun", "mean_run": "meanRun",
              "max_run": "maxRun"}
    for ck, mk in mapping.items():
        for a_, b_ in keymap.items():
            if a_ in cnt[ck]:
                chk(f"{ck}.{a_}", full_stats[mk][b_], cnt[ck][a_])
        for s_ in ("pe90", "hist", "neg_ni"):
            chk(f"{ck}.skips.{s_}", full_stats[mk]["skips"][s_], cnt[ck]["skips"][s_])
    for wk, (c, w) in {"explore_C1a": ("C1a", "explore"), "validate_C1a": ("C1a", "validate"),
                       "explore_C1b": ("C1b", "explore"), "validate_C1b": ("C1b", "validate")}.items():
        for a_, b_ in keymap.items():
            if a_ in cnt["windows"][wk]:
                chk(f"windows.{wk}.{a_}", holdings[c][w][b_], cnt["windows"][wk][a_])
    for kk, (h, k_) in {"K=1": (VAR["E1_K1_C1a"][0], 1), "K=2": (H["C1a"], 2), "K=3": (VAR["E1_K3_C1a"][0], 3)}.items():
        st = S.hold_stats(h, mes)
        for a_, b_ in keymap.items():
            if a_ in cnt["sensitivity_C1a_K"][kk]:
                chk(f"sensitivity_C1a_K.{kk}.{a_}", st[b_], cnt["sensitivity_C1a_K"][kk][a_])
        for s_ in ("pe90", "hist", "neg_ni"):
            chk(f"sensitivity_C1a_K.{kk}.skips.{s_}", st["skips"][s_], cnt["sensitivity_C1a_K"][kk]["skips"][s_])
    chk("c2_on_B2.n", len(c2_hits), cnt["c2_on_B2"]["n"])
    tie_diff = [str(m.date()) for m in wmes("validate") if set(H["C1b"][m][0]) != set(VAR["E0_C1b_tiePrereg"][0][m][0])]
    tie_diff_all = [str(m.date()) for m in mes if set(H["C1b"][m][0]) != set(VAR["E0_C1b_tiePrereg"][0][m][0])]
    countsCheck = {"match": not diffs, "diffs": diffs,
                   "tieCheck": {"validateMonthsDiff": len(tie_diff), "fullMonthsDiff": len(tie_diff_all)}}

    # ---------------- 幸存者偏差
    surv = {}
    for w in WIN:
        fm = wslice(pd.Series(ind.b0_full, index=d.dates), w).fillna(0.0)
        cv = wslice(b0_idx, w).fillna(0.0)
        pf, pc = perf(fm, rf), perf(cv, rf)
        surv[w] = {"fullMarketB0": pf, "coveredB0": pc, "diffCagr": pf["cagr"] - pc["cagr"],
                   "diffVol": pf["vol"] - pc["vol"]}

    # ---------------- C2
    c2_by_w = {w: sum(1 for m, _ in c2_hits if pd.Timestamp(WIN[w][0]) <= m <= pd.Timestamp(WIN[w][1])) for w in WIN}
    c2 = {"n": len(c2_hits), "nByWindow": c2_by_w, "hitsMonths": sorted({str(m.date())[:7] for m, _ in c2_hits}),
          "metrics": {w: {"B2C2": metrics[w]["B2C2"], "B2p": metrics[w]["B2p"],
                          "delta_net": {k_: metrics[w]["B2C2"]["net"][k_] - metrics[w]["B2p"]["net"][k_]
                                        for k_ in ("cagr", "vol", "sharpe", "maxdd")}} for w in WIN},
          "L_validate": crash["validate"]["L"].get("B2C2"),
          "note": "C2 作用在 B2′ 持仓：PE 分位 > 0.95 且 share60 < 60 个交易日前 → 该行业槽位改 B0；报告项，不判定"}

    # ---------------- 敏感性
    sens = {}
    for nm in VAR:
        base_c = "C1a" if "C1a" in nm else "C1b"
        b2 = "B2p" if base_c == "C1a" else "B2b"
        mv = {w: block(BT[nm], rf, w) for w in ("validate", "explore")}
        navs_v = {nm: {"net": BT[nm]["net"], "gross": BT[nm]["gross"]}, "B1": navs["B1"]}
        cr = crash_block(b0_idx, navs_v, "validate")
        mets = dict(metrics["validate"])
        mets[nm] = mv["validate"]
        # B1*：同 k 原理（夏普与 B1 相同）
        j = judge(nm, b2, crash_w={"L": {nm: cr["L"][nm]}}, mets=mets)
        sens[nm] = {"metrics": mv, "L": cr["L"][nm], "singleSegShare": cr["singleSegShare"][nm],
                    "judgment14": {typ: {x: j[typ][x]["pass"] for x in ("c1", "c2", "c3", "c4")} for typ in ("net", "gross")},
                    "holdings": holdings[nm]["validate"], "skipsValidate": skips[nm]["validate"],
                    "heldDiffMonthsVsBase": {w: sum(1 for m in wmes(w) if set(VAR[nm][0][m][0]) != set(H[base_c][m][0]))
                                             for w in ("explore", "validate")},
                    "c4Against": b2}

    # ---------------- E4 ETF
    etf = json.loads((S.STUDY / "inputs/etf_map.json").read_text())
    by = etf["by_industry"]
    e4 = {"source": "inputs/etf_map.json（主实现取数的公开基金列表；第二实现只读取并汇总）",
          "byIndustry": {k_: {"earliestDirectYear": v.get("earliest_direct_year"),
                              "earliestAnyYear": v.get("earliest_any_year"), "nEtf": v.get("n_etf")}
                         for k_, v in by.items()}}
    for c in ("C1a", "C1b"):
        tot = ok = 0
        for m in wmes("validate"):
            for nm in H[c][m][0]:
                tot += 1
                y = by.get(nm, {}).get("earliest_any_year")
                ok += int(y is not None and y <= m.year)
        e4[f"heldSlotMonthsWithEtf_{c}_validate"] = {"slotMonths": tot, "withEtf": ok,
                                                      "share": ok / tot if tot else None}

    # ---------------- E7 集中度
    e7 = {}
    for c in ("C1a", "C1b"):
        table = sig.rank_a if c == "C1a" else sig.rank_b
        ranks, per_ind = [], {}
        mo_c = monthly(wslice(BT[c]["net"], "validate"))
        mo_b1 = monthly(wslice(BT["B1"]["net"], "validate"))
        for m in wmes("validate"):
            names = [x for x, _, _ in table[m]]
            for nm in H[c][m][0]:
                ranks.append(names.index(nm) + 1)
                per_ind.setdefault(nm, 0)
                per_ind[nm] += 1
        ex = (mo_c - mo_b1).sort_values(ascending=False)
        # 行业贡献：无摩擦模拟里每月 槽位权重 ×（行业月收益 − B0 月收益）
        contrib = {}
        for i, m in enumerate(mes[:-1]):
            if not (pd.Timestamp("2014-12-01") <= m < pd.Timestamp("2023-10-01")):
                continue
            a_, b_ = d.pos[m] + 1, d.pos[mes[i + 1]] + 1
            rb0 = float(np.prod(1 + sim.col("B0", a_, b_)) - 1)
            for nm in H[c][m][0]:
                ri = float(np.prod(1 + sim.col(nm, a_, b_)) - 1)
                contrib[nm] = contrib.get(nm, 0.0) + (ri - rb0) / K
        e7[c] = {"rankDist": {str(r): ranks.count(r) for r in sorted(set(ranks))},
                 "slotMonthsByIndustry": dict(sorted(per_ind.items(), key=lambda x: -x[1])),
                 "contributionVsB0": dict(sorted(contrib.items(), key=lambda x: -x[1])),
                 "top5MonthsVsB1": {str(k_): float(v) for k_, v in ex.head(5).items()}}

    # ---------------- E8
    e8 = {"2015H1": {p: perf(BT[p]["net"].loc["2015-01-01":"2015-06-30"], rf) for p in PORTS}}
    seg15 = [s for s in crash["validate"]["segments"] if s["peak"].startswith("2015")]
    e8["crash2015"] = seg15[0] if seg15 else None

    # ---------------- 100 万元可执行性
    feas = {}
    for p in ("C1a", "C1b", "B0", "B1"):
        res = eng.run(stock_targets(sig, sched[p]), capital=1e6)
        inv = np.array(list(res.weights.values()), float)
        dd = pd.DatetimeIndex(list(res.weights.keys()))
        rr = {"net": res.returns, "gross": res.gross, "turnover": res.turnover, "costs": res.costs}
        feas[p] = {}
        for w in WIN:
            msk = (dd >= pd.Timestamp(WIN[w][0])) & (dd <= pd.Timestamp(WIN[w][1]))
            bl = block(rr, rf, w)
            feas[p][w] = {**bl, "investedAfterTradeMean": float(inv[msk].mean()) if msk.any() else None,
                          "cashShareMean": float(1 - inv[msk].mean()) if msk.any() else None,
                          "costDragVsProportional": bl["costAnn"] - metrics[w][p]["costAnn"]}
        print(f"[{time.time()-T0:.0f}s] feas {p}")
    feas["note"] = "本金 100 万元、100 股整手、5 元最低佣金（DEFAULT_COSTS），报告项不参与判定（CLARIFY-2 第 1 条）"

    # ---------------- 诊断：B0 执行 vs 无摩擦；复牌口径（ffill 权重）
    diag = {}
    yr = {}
    for y in range(2005, 2024):
        a_, b_ = f"{y}-01-01", f"{y}-12-31"
        ex_ = float((1 + BT["B0"]["gross"].loc[a_:b_]).prod() - 1)
        fr_ = float((1 + b0_idx.loc[a_:b_].fillna(0)).prod() - 1)
        yr[str(y)] = {"execGross": ex_, "frictionless": fr_, "diff": ex_ - fr_}
    diag["B0_exec_vs_frictionless"] = yr
    b0ff = pd.Series(ind.b0_ffill, index=d.dates)
    crf = crash_block(b0ff, {p: navs[p] for p in ("C1a", "C1b", "B1", "B0")}, "validate")
    diag["ffillWeightIndex"] = {"segments": [{k_: s[k_] for k_ in ("peak", "trough", "dropB0")} for s in crf["segments"]],
                                "L": crf["L"]}

    fl = Engine(d)
    diag["factorlabAllocate"] = {"note": "factorlab _backtest 的 allocate 把买不进（一字涨停）目标的权重按比例分给其他可买目标；"
                                         "PREREG 原文要求留现金。下列为该引擎口径的验证段净值度量，仅作诊断"}
    for p in ("C1a", "C1b", "B0", "B1"):
        res = fl.run(stock_targets(sig, sched[p]))
        rr = {"net": res.returns, "gross": res.gross, "turnover": res.turnover, "costs": res.costs}
        diag["factorlabAllocate"][p] = {"validate": block(rr, rf, "validate")}

    # ---------------- 试验日志（只写 replication/）
    rows = []
    for nm in ["C1a", "C1b", "B2p", "B2b", "B4", "B2C2"] + list(VAR):
        m = metrics["validate"].get(nm) or sens[nm]["metrics"]["validate"]
        rows.append({"family": "L-052", "impl": "replication-python", "trial": nm, "window": "validate",
                     "sharpe_net": m["net"]["sharpe"], "vol_net": m["net"]["vol"], "maxdd_net": m["net"]["maxdd"]})
    TRIALS.write_text("".join(json.dumps(clean(r), ensure_ascii=False) + "\n" for r in rows))

    # ---------------- 汇总
    headline = {"firstSentence": FIRST_SENTENCE}
    for c, b2 in (("C1a", "B2p"), ("C1b", "B2b")):
        m = metrics["validate"]
        headline[c] = {"vol": m[c]["net"]["vol"], "volB1": m["B1"]["net"]["vol"],
                       "maxdd": m[c]["net"]["maxdd"], "maxddB1": m["B1"]["net"]["maxdd"],
                       "L": crash["validate"]["L"][c]["net"], "sharpe": m[c]["net"]["sharpe"],
                       "sharpeB1": m["B1"]["net"]["sharpe"], "sharpeB1star": m[f"B1star_{c}"]["net"]["sharpe"],
                       "sharpeB2": m[b2]["net"]["sharpe"], "maxddB2": m[b2]["net"]["maxdd"],
                       "sharpeB4": m["B4"]["net"]["sharpe"], "maxddB4": m["B4"]["net"]["maxdd"],
                       "grade": judgments[c]["grade"]}

    inputs = {"sha256": {f: sha256(store.market_dir("cn") / f) for f in
                         ("prices.parquet", "fin_pit.parquet", "industry_pit.parquet")},
              "finPitNote": "本机 fin_pit 与 L-038 冻结版 MISMATCH（CLARIFY-1 第 1 条；本研究不依赖 L-038 冻结）",
              "rf": rf_info,
              "panel": {"firstDate": str(d.dates[0].date()), "lastDate": str(d.dates[-1].date()),
                        "days": int(len(d.dates)), "codes": int(len(d.codes)), "industries": d.ind_names}}
    params = {"K": 2, "exitRank": 4, "look6": S.LOOK6, "look3": S.LOOK3, "amtA": S.AMT_A, "amtB": S.AMT_B,
              "amtBase": S.AMT_BASE, "amtBaseMin": S.AMT_BASE_MIN, "peHist": S.PE_HIST, "peMin": S.PE_MIN,
              "pctThr": 0.90, "indMin": S.IND_MIN, "c1bPoolCap": 4, "b4PoolCap": 4, "windows": WIN,
              "warmStart": S.WARM_START, "execution": "次月首个交易日开盘（open_adj）",
              "costs": "factorlab DEFAULT_COSTS['cn'] 比例（佣金 0.025% + 过户 0.001% + 印花按日期）+ DEFAULT_SLIPPAGE['cn'] 分档；无整手无最低佣金",
              "nPlacebo": N_PLACEBO, "nBoot": N_BOOT, "seed": SEED,
              "simTiming": "行业层无摩擦模拟：信号日收盘定权，次日起收盘到收盘，月内槽位漂移；行业当日无收益 → 用 B0"}
    v = {c: judgments[c]["grade"] for c in ("C1a", "C1b")}
    verdict = {"C1a": v["C1a"], "C1b": v["C1b"],
               "summary": (f"第二实现：C1a {v['C1a']}、C1b {v['C1b']}（验证段 2015-01…2023-10，扣成本净值主口径）。"
                           f"C1a 波动 {headline['C1a']['vol']:.4f} vs B1 {headline['C1a']['volB1']:.4f}，"
                           f"回撤 {headline['C1a']['maxdd']:.4f} vs {headline['C1a']['maxddB1']:.4f}，L={headline['C1a']['L']}；"
                           f"C1b 波动 {headline['C1b']['vol']:.4f}，回撤 {headline['C1b']['maxdd']:.4f}，L={headline['C1b']['L']}。"),
               "lockboxNote": "是否晋级锁箱由 manager 决定；第二实现未读锁箱、未 unseal、未做锁箱确认"}
    results = {
        "meta": {"ledger": "L-052", "version": "v3", "preregCommit": "60ebdb8b",
                 "preregPath": "docs/research/theme-pe-cn-2026-11-28/PREREG.md",
                 "clarifications": ["docs/research/theme-pe-cn-2026-11-28/CLARIFY-1.md",
                                    "docs/research/theme-pe-cn-2026-11-28/CLARIFY-2.md"],
                 "impl": "replication-python" + SUFFIX, "seed": SEED,
                 "allocMode": ALLOC,
                 "generatedAt": pd.Timestamp.now(tz="UTC").isoformat(), "runtimeSec": time.time() - T0,
                 "deviations": [{"cash": "执行口径 = 买不进的权重严格留现金（先按预算缩放目标、再截断买不进；CLARIFY-2 第 11 条字面）",
                                 "cash_capfirst": "执行口径变体 = 先截断买不进、再在超预算时按比例缩（主实现口径）；超预算日买不进部分被缩放吸收",
                                 "redistribute": "执行口径变体 = factorlab allocate（买不进权重转给其他可买目标；CLARIFY-2 第 11 条的报告项）"}[ALLOC],"CLARIFY-2 第 1 条：主口径为 factorlab 比例成本，100 万元整手 + 最低佣金仅作可执行性报告项",
                                "CLARIFY-2 第 10 条：C1b 并列次序沿用冻结 count_theme_pe.py（score、rel6 升序、sha256）",
                                "试验日志写 replication/trials.jsonl（第二实现只写 replication/）"],
                 "notes": ["信号层独立向量化重写，复现冻结计数 counts_theme_pe.json（见 countsCheck）",
                           "执行回测为第二实现自写（Executor，按 PREREG 执行原文：一字涨停买不进的权重留现金）；成本参数取 factorlab DEFAULT_COSTS / DEFAULT_SLIPPAGE；factorlab 引擎口径见 diagnostics.factorlabAllocate",
                           "所有序列自首个持仓日 2005-02-01 起算（与主实现比较后对齐的约定，见 CROSSCHECK）",
                           "行业日收益 t−1 mcap_float 取 t−1 当日原值（停牌日无值 → 复牌日该股不进行业指数，与冻结计数脚本一致）；ffill 权重对照见 diagnostics",
                           "fin_ni_ttm 取 fundamentals_cn（PREREG 指定来源）；该模块在缺上年年报或上年同期时退回最近一份年报，与 PREREG 括注『缺任一项则无』不同，见 CROSSCHECK"],
                 "lockbox": "未读锁箱：store.load_panel raw=False（截到 2023-10-31）、财报可见上界 2023-11-01；未 unseal；未调用 evaluate_factor"},
        "inputs": inputs, "params": params, "headline": headline, "countsCheck": countsCheck,
        "metrics": metrics, "crash": crash, "judgments": judgments,
        "placebo": {"randomIndustry": placebo, "holm": holm, "circularShift": circ, "bootstrap": boot},
        "power": power, "decomposition": decomposition, "skips": skips, "holdings": holdings,
        "survivorship": surv, "c2": c2, "sensitivity": sens, "e4Etf": e4, "e7Concentration": e7, "e8": e8,
        "feasibility1e6": feas, "diagnostics": diag,
        "trials": {"logPath": str(TRIALS.relative_to(S.REPO)), "nRecorded": len(rows)},
        "verdict": verdict,
    }
    daily = pd.DataFrame({f"{p}_{t}": BT[p][t] for p in PORTS + ["B2C2"] + list(VAR) for t in ("net", "gross")})
    for p in PORTS:
        daily[f"{p}_turnover"] = BT[p]["turnover"].reindex(daily.index).fillna(0.0)
        daily[f"{p}_cost"] = BT[p]["costs"].reindex(daily.index).fillna(0.0)
    daily["B0_frictionless"] = b0_idx.reindex(daily.index)
    daily["rf"] = rf.reindex(daily.index)
    daily.loc[START["day"]:].to_csv(HERE / f"daily_series{SUFFIX}.csv.gz", float_format="%.12g")
    OUT.write_text(json.dumps(clean(results), ensure_ascii=False, indent=1) + "\n")
    print(json.dumps(clean(headline), ensure_ascii=False, indent=1))
    print(json.dumps(clean({c: {k_: judgments[c][k_] for k_ in ("grade", "singleSegCap")} for c in judgments}), ensure_ascii=False))
    print("countsCheck", countsCheck["match"], diffs[:5])
    print(f"wrote {OUT} in {time.time()-T0:.0f}s")


if __name__ == "__main__":
    main()
