"""L-052 第二实现 · 数据与信号层（独立编写，不读主实现）。

口径来源：PREREG.md v3（冻结 60ebdb8b）、CLARIFY-1/2、冻结计数脚本 count_theme_pe.py 的语义
（CLARIFY-2 第 10 条：信号层以冻结计数脚本为准）。这里全部用 numpy 向量化重写，不复制计数脚本代码。

数据只经 store.load_panel(raw=False)（默认截掉锁箱起点 2023-11-01 及以后）；财报 TTM 用
fundamentals_cn.panel_fields（可见上界 = 锁箱起点）。
"""
from __future__ import annotations

import hashlib
import sys
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
STUDY = HERE.parent
REPO = STUDY.parents[2]
sys.path.insert(0, str(STUDY))
sys.path.insert(0, str(REPO / "research-py"))

from sw_canon import canon  # noqa: E402  冻结映射

WARM_START, COUNT_START, END = "2000-01-01", "2005-01-01", "2023-10-31"
LOOK6, LOOK3 = 126, 63
AMT_A, AMT_B, AMT_BASE, AMT_BASE_MIN = 60, 20, 250, 120
PE_HIST, PE_MIN = 60, 36
IND_MIN = 5

FIELDS = ["open", "high", "low", "close", "close_adj", "open_adj", "volume", "amount",
          "mcap_float", "mcap_total", "limit_up", "limit_down", "is_suspended", "industry"]


def tie_hash(name: str) -> str:
    return hashlib.sha256(f"tie:{name}".encode()).hexdigest()


@dataclass
class Data:
    panel: dict                      # 字段 → 宽表（行 = 交易日，列 = 代码），供执行回测
    dates: pd.DatetimeIndex
    codes: pd.Index
    P: np.ndarray                    # close_adj
    R: np.ndarray                    # 复牌口径个股收益
    MF: np.ndarray                   # mcap_float（>0 否则 NaN）
    MT: np.ndarray                   # mcap_total（>0 否则 NaN）
    AMT: np.ndarray
    IND: np.ndarray                  # 规范行业整数码，-1 = 无
    ind_names: list
    COV: np.ndarray                  # 覆盖池
    HASPX: np.ndarray
    NI: pd.DataFrame                 # fin_ni_ttm（月末 × 代码）
    month_ends: pd.DatetimeIndex
    pos: dict = field(default_factory=dict)


def resume_returns(P: np.ndarray) -> np.ndarray:
    """个股日收益：以前一有效收盘为基准（停牌无行 → 复牌日计入整段涨跌）。"""
    out = np.full(P.shape, np.nan)
    last = np.full(P.shape[1], np.nan)
    for t in range(P.shape[0]):
        cur = P[t]
        ok = np.isfinite(cur) & (cur > 0)
        both = ok & np.isfinite(last)
        out[t, both] = cur[both] / last[both] - 1.0
        last = np.where(ok, cur, last)
    return out


def load() -> Data:
    from factorlab import fundamentals_cn as fc
    from factorlab import store

    cut = store.lockbox_start("cn")
    panel = store.load_panel("cn", FIELDS, start=WARM_START, end=END)  # raw=False（默认）
    for k in panel:
        assert panel[k].index.max() < cut
    close = panel["close_adj"]
    dates, codes = close.index, close.columns
    panel = {k: v.reindex(index=dates, columns=codes) for k, v in panel.items()}
    P = close.to_numpy(float)
    P = np.where(np.isfinite(P) & (P > 0), P, np.nan)
    ind_raw = panel["industry"].to_numpy(object)
    canon_v = np.vectorize(lambda x: canon(x) if isinstance(x, str) else None, otypes=[object])(ind_raw)
    names = sorted({x for x in canon_v.ravel() if isinstance(x, str)})
    idx = {n: i for i, n in enumerate(names)}
    IND = np.vectorize(lambda x: idx.get(x, -1) if isinstance(x, str) else -1, otypes=[np.int16])(canon_v).astype(np.int16)
    HASPX = np.isfinite(P)
    COV = HASPX & (IND >= 0)
    MF = panel["mcap_float"].to_numpy(float)
    MF = np.where(MF > 0, MF, np.nan)
    MT = panel["mcap_total"].to_numpy(float)
    MT = np.where(MT > 0, MT, np.nan)
    AMT = panel["amount"].to_numpy(float)
    R = resume_returns(P)
    fin = fc.panel_fields(["fin_ni_ttm"], {"close": panel["close"], "close_adj": panel["close_adj"],
                                            "mcap_total": panel["mcap_total"], "industry": panel["industry"]},
                          cut, None)["fin_ni_ttm"]
    me = fc.month_rows(dates)
    d = Data(panel, dates, codes, P, R, MF, MT, AMT, IND, names, COV, HASPX, fin.reindex(index=me, columns=codes), me)
    d.pos = {x: i for i, x in enumerate(dates)}
    return d


# ---------------------------------------------------------------- 行业日序列
@dataclass
class IndSeries:
    ret: np.ndarray        # 天 × 行业：t−1 mcap_float 加权（有效成员 ≥5，否则 NaN）
    n: np.ndarray          # 有效成员数
    amt: np.ndarray        # 覆盖池成交额合计（无正成交额 → NaN）
    mkt_amt: np.ndarray
    mkt_ew: np.ndarray     # 覆盖池等权
    b0: np.ndarray         # 覆盖池 t−1 mcap_float 加权（无摩擦 B0 指数日收益）
    b0_full: np.ndarray    # 全市场（有价即入）t−1 mcap_float 加权
    b0_ffill: np.ndarray   # 诊断：t−1 权重缺失时用最近有效 mcap_float（复牌日计入）
    ret_ffill: np.ndarray


def industry_series(d: Data) -> IndSeries:
    nD, nC = d.P.shape
    nI = len(d.ind_names)
    ret = np.full((nD, nI), np.nan)
    ret_ff = np.full((nD, nI), np.nan)
    n = np.zeros((nD, nI))
    amt = np.full((nD, nI), np.nan)
    mkt_amt = np.zeros(nD)
    mkt_ew = np.full(nD, np.nan)
    b0 = np.full(nD, np.nan)
    b0_full = np.full(nD, np.nan)
    b0_ff = np.full(nD, np.nan)
    MF_ff = pd.DataFrame(d.MF).ffill().to_numpy()
    for t in range(nD):
        w = d.MF[t - 1] if t > 0 else np.full(nC, np.nan)
        wf = MF_ff[t - 1] if t > 0 else np.full(nC, np.nan)
        r, cov, g, a = d.R[t], d.COV[t], d.IND[t], d.AMT[t]
        ok = cov & np.isfinite(w) & np.isfinite(r)
        gi = g[ok].astype(np.int64)
        cnt = np.bincount(gi, minlength=nI)
        num = np.bincount(gi, weights=w[ok] * r[ok], minlength=nI)
        den = np.bincount(gi, weights=w[ok], minlength=nI)
        n[t] = cnt
        with np.errstate(invalid="ignore", divide="ignore"):
            ret[t] = np.where(cnt >= IND_MIN, num / den, np.nan)
        okf = cov & np.isfinite(wf) & np.isfinite(r)
        gf = g[okf].astype(np.int64)
        cf = np.bincount(gf, minlength=nI)
        with np.errstate(invalid="ignore", divide="ignore"):
            ret_ff[t] = np.where(cf >= IND_MIN, np.bincount(gf, weights=wf[okf] * r[okf], minlength=nI)
                                 / np.bincount(gf, weights=wf[okf], minlength=nI), np.nan)
        aok = cov & np.isfinite(a) & (a > 0)
        ga = g[aok].astype(np.int64)
        ca = np.bincount(ga, minlength=nI)
        sa = np.bincount(ga, weights=a[aok], minlength=nI)
        amt[t] = np.where(ca > 0, sa, np.nan)
        mkt_amt[t] = a[aok].sum()
        rc = r[cov]
        rc = rc[np.isfinite(rc)]
        if len(rc):
            mkt_ew[t] = rc.mean()
        if ok.any():
            b0[t] = float(np.dot(w[ok], r[ok]) / w[ok].sum())
        if okf.any():
            b0_ff[t] = float(np.dot(wf[okf], r[okf]) / wf[okf].sum())
        okm = d.HASPX[t] & np.isfinite(w) & np.isfinite(r)
        if okm.any():
            b0_full[t] = float(np.dot(w[okm], r[okm]) / w[okm].sum())
    return IndSeries(ret, n, amt, mkt_amt, mkt_ew, b0, b0_full, b0_ff, ret_ff)


def cum_ret(x: np.ndarray, L: int) -> np.ndarray:
    """过去 L 日累计（含当日），有效日 ≥ int(0.8L)；单日收益截在 [−0.95, 10]。x 可为 1 维或 天×列。"""
    x2 = x if x.ndim == 2 else x[:, None]
    lg = np.where(np.isfinite(x2), np.log1p(np.clip(x2, -0.95, 10)), np.nan)
    v = np.where(np.isfinite(lg), lg, 0.0)
    c = np.vstack([np.zeros((1, x2.shape[1])), np.cumsum(v, axis=0)])
    k = np.vstack([np.zeros((1, x2.shape[1])), np.cumsum(np.isfinite(lg), axis=0)])
    out = np.full(x2.shape, np.nan)
    T = x2.shape[0]
    if T >= L:
        s = c[L:] - c[:-L]
        cnt = k[L:] - k[:-L]
        out[L - 1:] = np.where(cnt >= int(L * 0.8), np.expm1(s), np.nan)
    return out if x.ndim == 2 else out[:, 0]


def elevated(ind: IndSeries, win: int) -> tuple[np.ndarray, np.ndarray]:
    m = pd.Series(ind.mkt_amt).rolling(win, min_periods=win).sum().to_numpy()
    sh = np.full(ind.amt.shape, np.nan)
    el = np.zeros(ind.amt.shape, dtype=bool)
    for j in range(ind.amt.shape[1]):
        a = pd.Series(ind.amt[:, j]).rolling(win, min_periods=win).sum().to_numpy()
        s = np.where((m > 0) & np.isfinite(a), a / np.where(m > 0, m, np.nan), np.nan)
        base = pd.Series(s).rolling(AMT_BASE, min_periods=AMT_BASE_MIN).mean().to_numpy()
        sh[:, j] = s
        el[:, j] = (s > base) & np.isfinite(s) & np.isfinite(base)
    return sh, el


# ---------------------------------------------------------------- 月度排名表
def rank_table(names, t, ind: IndSeries, el, c6, m6, c3=None, m3=None, tie_mode="frozen"):
    """返回按名次排序的 [(行业, rel6, rel3)]。
    tie_mode='frozen'：冻结计数脚本次序 (score, rel6 升序, sha256)；
    tie_mode='prereg'：PREREG 文字（average 秩 + sha256）。"""
    rows = []
    for j, nm in enumerate(names):
        if not (ind.n[t, j] >= IND_MIN):
            continue
        if not el[t, j]:
            continue
        if not (np.isfinite(c6[t, j]) and np.isfinite(m6[t])):
            continue
        r3 = None
        if c3 is not None:
            if not (np.isfinite(c3[t, j]) and np.isfinite(m3[t])):
                continue
            r3 = float(c3[t, j] - m3[t])
        rows.append((nm, float(c6[t, j] - m6[t]), r3))
    if not rows:
        return []
    df = pd.DataFrame(rows, columns=["ind", "rel6", "rel3"])
    s = df["rel6"].rank(ascending=False, method="average")
    if c3 is not None:
        s = s + df["rel3"].rank(ascending=False, method="average")
    df["score"] = s
    df["tie"] = df["ind"].map(tie_hash)
    keys = ["score", "rel6", "tie"] if tie_mode == "frozen" else ["score", "tie"]
    df = df.sort_values(keys, kind="mergesort").reset_index(drop=True)
    return list(zip(df["ind"], df["rel6"], df["rel3"]))


# ---------------------------------------------------------------- PE（t 时成分回溯）
class PE:
    def __init__(self, d: Data):
        self.d = d
        self.mes = [m for m in d.month_ends]
        self.mpos = {m: i for i, m in enumerate(self.mes)}
        nM = len(self.mes)
        nC = len(d.codes)
        self.MTm = np.zeros((nM, nC))
        self.NIm = np.zeros((nM, nC))
        self.OKm = np.zeros((nM, nC), dtype=bool)
        NI = d.NI.to_numpy(float)
        for i, m in enumerate(self.mes):
            t = d.pos[m]
            mt, ni = d.MT[t], NI[i]
            ok = np.isfinite(mt) & np.isfinite(ni) & d.COV[t]
            self.OKm[i] = ok
            self.MTm[i] = np.where(ok, mt, 0.0)
            self.NIm[i] = np.where(ok, ni, 0.0)
        self.cache = {}

    def members(self, me, name):
        t = self.d.pos[me]
        j = self.d.ind_names.index(name)
        return (self.d.IND[t] == j) & self.d.COV[t]

    def series(self, me, name):
        """t 时成分在 [me−59 月, me] 各月末的（合计 mcap_total，合计 NI，有效数）。"""
        key = (me, name)
        if key in self.cache:
            return self.cache[key]
        i = self.mpos[me]
        lo = max(0, i - PE_HIST + 1)
        mem = self.members(me, name)
        cols = np.flatnonzero(mem)
        mc = self.MTm[lo:i + 1][:, cols].sum(1)
        ni = self.NIm[lo:i + 1][:, cols].sum(1)
        k = self.OKm[lo:i + 1][:, cols].sum(1)
        self.cache[key] = (mc, ni, k)
        return self.cache[key]

    def pe_info(self, me, name):
        """(pct, cls)：cls ∈ {None, 'pe90'(由调用方按阈判), 'hist', 'neg_ni'}；返回 PE 分位。"""
        mc, ni, k = self.series(me, name)
        now_ok = k[-1] >= IND_MIN and mc[-1] > 0
        if not now_ok:
            return None, "hist"
        if ni[-1] <= 0:
            return None, "neg_ni"
        pe_now = mc[-1] / ni[-1]
        valid = (k >= IND_MIN) & (mc > 0) & (ni > 0)
        hist = mc[valid] / ni[valid]
        if len(hist) < PE_MIN:
            return None, "hist"
        return float(np.mean(hist <= pe_now)), None

    def ep_info(self, me, name):
        """E5：E/P 分位（亏损不单独跳过；仅历史不足跳过）。"""
        mc, ni, k = self.series(me, name)
        if not (k[-1] >= IND_MIN and mc[-1] > 0):
            return None, "hist"
        valid = (k >= IND_MIN) & (mc > 0)
        hist = ni[valid] / mc[valid]
        if len(hist) < PE_MIN:
            return None, "hist"
        return float(np.mean(hist <= ni[-1] / mc[-1])), None


@dataclass
class Signals:
    d: Data
    ind: IndSeries
    pe: PE
    mes: list                 # 2005-01…2023-10 月末
    rank_a: dict              # me → 排名表（C1a 信号：rel6，60/250）
    rank_b: dict              # me → 排名表（C1b 信号：rel3+rel6，20/250，冻结并列次序）
    rank_b_prereg: dict
    share_a: np.ndarray


def build_signals(d: Data, ind: IndSeries) -> Signals:
    c6 = cum_ret(ind.ret, LOOK6)
    c3 = cum_ret(ind.ret, LOOK3)
    m6 = cum_ret(ind.mkt_ew, LOOK6)
    m3 = cum_ret(ind.mkt_ew, LOOK3)
    sh_a, el_a = elevated(ind, AMT_A)
    _, el_b = elevated(ind, AMT_B)
    mes = [m for m in d.month_ends if pd.Timestamp(COUNT_START) <= m <= pd.Timestamp(END)]
    ra, rb, rbp = {}, {}, {}
    for me in mes:
        t = d.pos[me]
        ra[me] = rank_table(d.ind_names, t, ind, el_a, c6, m6)
        rb[me] = rank_table(d.ind_names, t, ind, el_b, c6, m6, c3, m3, "frozen")
        rbp[me] = rank_table(d.ind_names, t, ind, el_b, c6, m6, c3, m3, "prereg")
    return Signals(d, ind, PE(d), mes, ra, rb, rbp, sh_a)


# ---------------------------------------------------------------- 持仓规则
@dataclass
class Rule:
    pe_mode: str = "pe"        # 'pe' 分位阈；'none' = B2′/B2b（只跳 hist/neg）；'ep' = E5
    thr: float = 0.90


def pe_filter(sig: Signals, me, pool, k, rule: Rule):
    held, st = [], {"pe90": 0, "hist": 0, "neg_ni": 0}
    for nm in pool:
        if len(held) >= k:
            break
        if rule.pe_mode == "ep":
            pct, cls = sig.pe.ep_info(me, nm)
            if cls == "hist":
                st["hist"] += 1
                continue
            if pct < 0.10:
                st["pe90"] += 1
                continue
            held.append(nm)
            continue
        pct, cls = sig.pe.pe_info(me, nm)
        if cls == "neg_ni":
            st["neg_ni"] += 1
            continue
        if cls == "hist":
            st["hist"] += 1
            continue
        if rule.pe_mode == "pe" and pct > rule.thr:
            st["pe90"] += 1
            continue
        held.append(nm)
    return held, st


def run_persistent(sig: Signals, k=2, exit_rank=4, rule=Rule()):
    """C1a 状态机：主线集合 active ≠ 持仓 held。返回 {me: (held, skips, active)}。"""
    out = {}
    active, prev_topk = set(), set()
    for me in sig.mes:
        tab = sig.rank_a[me]
        rank = {nm: i + 1 for i, (nm, _, _) in enumerate(tab)}
        topk = {nm for nm, r in rank.items() if r <= k}
        enter = topk & prev_topk
        still = {nm for nm in active if nm in rank and rank[nm] <= exit_rank}
        active = still | enter
        pool = sorted(active, key=lambda nm: (rank[nm], tie_hash(nm)))
        held, st = pe_filter(sig, me, pool, k, rule)
        out[me] = (held, st, sorted(active))
        prev_topk = topk
    return out


def run_monthly(sig: Signals, table: dict, k=2, rule=Rule()):
    """C1b / B2b / B4：每月排名前 2K 内按名次顺延 PE 过滤。"""
    out = {}
    for me in sig.mes:
        pool = [nm for nm, _, _ in table[me]][: 2 * k]
        held, st = pe_filter(sig, me, pool, k, rule)
        out[me] = (held, st, pool)
    return out


def hold_stats(h: dict, mes) -> dict:
    hs = [h[m][0] for m in mes]
    runs, cur = [], {}
    for x in hs:
        for nm in list(cur):
            if nm not in x:
                runs.append(cur.pop(nm))
        for nm in x:
            cur[nm] = cur.get(nm, 0) + 1
    runs += list(cur.values())
    sk = {"pe90": 0, "hist": 0, "neg_ni": 0}
    for m in mes:
        for kk in sk:
            sk[kk] += h[m][1][kk]
    return {
        "months": len(hs),
        "monthsWithHeld": sum(1 for x in hs if x),
        "monthsEmpty": sum(1 for x in hs if not x),
        "switches": sum(1 for i in range(1, len(hs)) if set(hs[i]) != set(hs[i - 1])),
        "meanHeld": float(np.mean([len(x) for x in hs])) if hs else 0.0,
        "medianRun": float(np.median(runs)) if runs else None,
        "meanRun": float(np.mean(runs)) if runs else None,
        "maxRun": int(max(runs)) if runs else None,
        "skips": sk,
    }
