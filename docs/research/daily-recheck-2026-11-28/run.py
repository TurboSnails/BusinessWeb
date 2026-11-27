"""L-040：「通过检验」两项（L-037 板块轮动、L-026 防守倾斜）的按日复核，附按周调仓报告项。

按 PREREG.md 与 CLARIFY-1.md 执行；只读冻结输入，结果写到 results.json。
    cd research-py && uv run python ../docs/research/daily-recheck-2026-11-28/run.py
"""
from __future__ import annotations

import hashlib
import io
import json
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
RAW = HERE / "inputs" / "raw"
RES = HERE.parent
KF12_M = RES / "sector-rotation-2026-11-26" / "inputs" / "processed" / "kf12_vw.csv"
IND49_M = RES / "defensive-tilt-2026-11-26" / "inputs" / "industry.json"
FF_M = RES / "trend-1871-2026-11-26" / "inputs" / "ff-factors.json"
MACRO_M = RES / "macro-significance-2026-11-25" / "inputs.json"
ORIG_R1 = RES / "sector-rotation-2026-11-26" / "results.json"
ORIG_R2 = RES / "defensive-tilt-2026-11-26" / "results.json"

SECTORS = ["NoDur", "Durbl", "Manuf", "Enrgy", "Chems", "BusEq", "Telcm", "Utils", "Shops", "Hlth", "Money"]
TOP = 3
ANN = np.sqrt(252)

# R1 区间（持有月）
R1_START, R1_END = "1927-07", "2026-09"
R1_P = [("full", "1927-07", "2026-09"), ("half1", "1927-07", "1976-12"), ("half2", "1977-01", "2026-09"),
        ("post2000", "2000-01", "2026-09"), ("post2011", "2011-01", "2026-09")]
# R2 区间
R2_MAIN = ("1934-01", "1972-12")
R2_HALVES = [("1934-01", "1952-12"), ("1953-01", "1972-12")]
R2_TILT, R2_COST, R2_FEE = 0.3, 0.001, 0.0015 / 12
DEF_NAMES = ["Food", "Soda", "Beer", "Smoke", "Hshld", "Hlth", "MedEq", "Drugs", "Util"]

CRASHES = [("1929–32", "1929-09-01", "1932-07-31"), ("1937–38", "1937-03-01", "1938-04-30"),
           ("1987", "1987-08-01", "1987-12-31"), ("2008–09", "2007-10-01", "2009-03-31"), ("2020", "2020-02-01", "2020-03-31")]


# ---------------- 输入 ----------------
def read_kf_daily(name: str) -> pd.DataFrame:
    with zipfile.ZipFile(RAW / name) as z:
        text = z.read(z.namelist()[0]).decode("latin-1")
    lines = text.splitlines()
    i = next(k for k, l in enumerate(lines) if l.strip().startswith(","))  # 第一段表头
    rows, header = [], [c.strip() for c in lines[i].split(",")][1:]
    for l in lines[i + 1:]:
        parts = [p.strip() for p in l.split(",")]
        if len(parts) < 2 or not parts[0].isdigit() or len(parts[0]) != 8:
            break
        rows.append([parts[0]] + [float(x) for x in parts[1:]])
    df = pd.DataFrame(rows, columns=["date"] + header)
    df["date"] = pd.to_datetime(df["date"], format="%Y%m%d")
    df = df.set_index("date")
    df = df.mask((df <= -99.99 + 1e-9) & (df >= -99.99 - 1e-9)).mask(df <= -999 + 1e-9)
    return df / 100


def sha_all() -> dict:
    files = sorted(RAW.glob("*.zip")) + [KF12_M, IND49_M, FF_M, MACRO_M]
    return {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in files}


def month_key(idx: pd.DatetimeIndex) -> np.ndarray:
    return idx.strftime("%Y-%m").to_numpy()


# ---------------- 通用：按调仓段逐日跟踪 ----------------
def run_segments(R: np.ndarray, seg_id: np.ndarray, targets: list[dict], mult_fn, first_free=True):
    """R：天 × 资产 日毛收益（缺值已置 0）；seg_id：每天所属持有段编号 0..S-1（升序连续）；
    targets[s]：{资产列号: 权重}；mult_fn(s, turnover) → 段首系数。返回日净收益、每段换手（½Σ|Δw|）。"""
    n = len(seg_id)
    out = np.empty(n)
    starts = np.flatnonzero(np.r_[True, seg_id[1:] != seg_id[:-1]])
    ends = np.r_[starts[1:], n]
    drift = None
    tos = []
    for s, (a, b) in enumerate(zip(starts, ends)):
        tgt = targets[s]
        cols = np.array(sorted(tgt))
        w = np.array([tgt[c] for c in cols])
        if drift is None:
            to = 0.0
        else:
            keys = set(tgt) | set(drift)
            to = sum(abs(tgt.get(k, 0.0) - drift.get(k, 0.0)) for k in keys)
        mult = mult_fn(s, 0.0 if (first_free and drift is None) else to)
        G = np.cumprod(1 + R[a:b][:, cols], axis=0)
        V = G @ w
        prev = np.r_[1.0, V[:-1]]
        r = V / prev - 1
        r[0] = mult * (1 + r[0]) - 1
        out[a:b] = r
        drift = {int(c): float(w[j] * G[-1, j] / V[-1]) for j, c in enumerate(cols)}
        tos.append(to / 2)
    return out, np.array(tos)


def sharpe(x: np.ndarray, rf: np.ndarray) -> float:
    ex = x - rf
    return float(ex.mean() / ex.std(ddof=1) * ANN)


def maxdd(x: np.ndarray) -> float:
    nav = np.cumprod(1 + x)
    peak = np.maximum.accumulate(np.maximum(nav, 1.0))
    return float((nav / peak - 1).min())


def dstats(x: np.ndarray, rf: np.ndarray) -> dict:
    nav = np.cumprod(1 + x)
    return {"days": int(len(x)), "sharpe": sharpe(x, rf), "maxDd": maxdd(x), "vol": float(x.std(ddof=1) * ANN),
            "cagr": float(nav[-1] ** (252 / len(x)) - 1)}


def mstats(m: np.ndarray, rf: np.ndarray) -> dict:
    """月度口径（与原研究同法）"""
    ex = m - rf
    nav = np.cumprod(1 + m)
    return {"sharpe": float(ex.mean() / ex.std(ddof=1) * np.sqrt(12)), "maxDd": float((nav / np.maximum.accumulate(np.maximum(nav, 1.0)) - 1).min()),
            "vol": float(m.std(ddof=1) * np.sqrt(12))}


def crash_depth(x: np.ndarray, dates: pd.DatetimeIndex, lo: str, hi: str, month_end=False) -> float | None:
    """窗口内最深跌幅（窗口起点净值 1 计入峰值）；month_end=True 时只看每月最后一个交易日的净值。"""
    m = (dates >= lo) & (dates <= hi)
    if not m.any():
        return None
    nav = np.cumprod(1 + x[m])
    if month_end:
        mk = month_key(dates[m])
        nav = nav[np.r_[mk[1:] != mk[:-1], True]]
    nav = np.r_[1.0, nav]
    return float((nav / np.maximum.accumulate(nav) - 1).min())


# ---------------- R1：L-037 板块轮动 ----------------
def r1_monthly_picks(kf: pd.DataFrame) -> dict:
    idx = pd.concat([pd.DataFrame([[1.0] * len(SECTORS)], columns=SECTORS, index=["base"]), (1 + kf[SECTORS]).cumprod()])
    mom = {"S1": idx.shift(1) / idx.shift(12) - 1, "S2": sum(idx / idx.shift(L) - 1 for L in (3, 6, 12)) / 3}
    picks = {}
    for k, m in mom.items():
        m = m.drop(index="base")
        sel = {}
        for t in m.index:
            row = m.loc[t]
            if row.isna().any():
                continue
            base = sorted(range(len(SECTORS)), key=lambda i: SECTORS[i])
            order = sorted(base, key=lambda i: -row.iloc[i])
            sel[t] = sorted(order[:TOP])
        picks[k] = sel
    return picks


def month_after(m: str, k: int) -> str:
    y, mm = map(int, m.split("-"))
    t = y * 12 + mm - 1 + k
    return f"{t // 12}-{t % 12 + 1:02d}"


def r1(d12: pd.DataFrame, ff: pd.DataFrame, cost=0.001) -> dict:
    kf = pd.read_csv(KF12_M, dtype={"month": str}).set_index("month") / 100
    picks = r1_monthly_picks(kf)
    days = d12.loc["1927-07-01":"2026-09-30"]
    dates = days.index
    mk = month_key(dates)
    months = list(dict.fromkeys(mk))
    assert months[0] == R1_START and months[-1] == R1_END and len(months) == 1191
    seg = np.searchsorted(np.array(months), mk)
    R = days[SECTORS].to_numpy()
    missing = int(np.isnan(R).sum())
    R = np.nan_to_num(R)
    rf = ff.loc[dates, "RF"].to_numpy()
    mkt = (ff.loc[dates, "Mkt-RF"] + ff.loc[dates, "RF"]).to_numpy()

    def add_fee(f):
        return lambda s, to: 1 - cost * to - f / 12

    ew, ew_to = run_segments(R, seg, [{i: 1 / 11 for i in range(11)}] * len(months), add_fee(0.001))
    mkr, _ = run_segments(mkt[:, None], seg, [{0: 1.0}] * len(months), lambda s, to: 1 - 0.0003 / 12)
    out = {"series": {"dates": dates, "rf": rf, "EW": ew, "MKT": mkr}, "missingHeldDays": missing, "nDays": len(dates)}
    res = {}
    for k in ("S1", "S2"):
        tg = [{i: 1 / TOP for i in picks[k][month_after(m, -1)]} for m in months]
        net, to = run_segments(R, seg, tg, add_fee(0.001))
        # 晚一个月：t 月末信号、t+2 月持有，1927-08 起
        dm = dates >= "1927-08-01"
        seg_d = seg[dm] - seg[dm][0]
        tg_d = [{i: 1 / TOP for i in picks[k][month_after(m, -2)]} for m in months[1:]]
        net_d, _ = run_segments(R[dm], seg_d, tg_d, add_fee(0.001))
        out["series"][k] = net
        per = {}
        for name, lo, hi in R1_P:
            msk = (mk >= lo) & (mk <= hi)
            c, e, m_ = dstats(net[msk], rf[msk]), dstats(ew[msk], rf[msk]), dstats(mkr[msk], rf[msk])
            per[name] = {"cand": c, "ew": e, "mkt": m_, "dS_ew": c["sharpe"] - e["sharpe"], "dS_mkt": c["sharpe"] - m_["sharpe"]}
        dl = {"cand": dstats(net_d, rf[dm]), "ew": dstats(ew[dm], rf[dm])}
        dl["dS_ew"] = dl["cand"]["sharpe"] - dl["ew"]["sharpe"]
        gates = {"G1p": per["full"]["dS_ew"] > 0, "G2p": per["half1"]["dS_ew"] > 0 and per["half2"]["dS_ew"] > 0,
                 "G3p": per["post2000"]["dS_ew"] > 0, "G4p": per["full"]["dS_mkt"] > 0 and per["post2000"]["dS_mkt"] > 0,
                 "G5p": dl["dS_ew"] > 0}
        res[k] = {"periods": per, "delay": dl, "gates": gates, "turnoverPerYear": float(to.mean() * 12),
                  "verdict": "按日复核维持" if all(gates.values()) else "按日复核不成立"}
    out["res"] = res
    out["picks"] = picks
    return out


def r1_weekly(d12: pd.DataFrame, ff: pd.DataFrame, monthly: dict, cost: float) -> dict:
    """按周调仓（报告项）：自然周最后一个交易日收盘调仓。"""
    allx = d12[SECTORS]
    assert not allx.loc["1926-07-01":"2026-09-30"].isna().any().any()
    full = allx.loc[:"2026-09-30"]
    idx = np.cumprod(1 + full.to_numpy(), axis=0)
    fdates = full.index
    wk = (fdates - pd.to_timedelta(fdates.weekday, unit="D")).normalize()  # 周一日期
    last_of_week = np.r_[wk[1:] != wk[:-1], True]
    # 持有周：周一 ≥ 1927-07-01 的第一个完整周起
    first_mon = wk[(wk >= pd.Timestamp("1927-07-01"))][0]
    hold_mask = wk >= first_mon
    hd = fdates[hold_mask]
    hwk = wk[hold_mask]
    weeks = list(dict.fromkeys(hwk))
    seg = np.searchsorted(np.array(weeks, dtype="datetime64[ns]"), hwk.to_numpy())
    R = full.to_numpy()[hold_mask]
    rf = ff.loc[hd, "RF"].to_numpy()
    off = int(np.flatnonzero(hold_mask)[0])
    first_pos = {}
    for j, w in enumerate(hwk):
        first_pos.setdefault(w, off + j)
    res = {}

    def fee(s, to):
        return 1 - cost * to - 0.001 / 52

    ew, ew_to = run_segments(R, seg, [{i: 1 / 11 for i in range(11)}] * len(weeks), fee)
    for k in ("S1", "S2"):
        tg = []
        for w in weeks:
            p = first_pos[w] - 1  # 本持有周第一天之前的最后一个交易日 = 上一个有交易的周的最后一天
            assert last_of_week[p] and p >= 252
            if k == "S1":
                m = idx[p - 21] / idx[p - 252] - 1
            else:
                m = sum(idx[p] / idx[p - L] - 1 for L in (63, 126, 252)) / 3
            base = sorted(range(11), key=lambda i: SECTORS[i])
            order = sorted(base, key=lambda i: -m[i])
            tg.append({i: 1 / TOP for i in order[:TOP]})
        net, to = run_segments(R, seg, tg, fee)
        mon = monthly[k]  # 同成本的按月版（日线），截取同期
        md = monthly["dates"]
        sel = (md >= hd[0]) & (md <= hd[-1])
        assert (md[sel] == hd).all()
        mon_c = mon[sel]
        per = {}
        mk = month_key(hd)
        for name, lo, hi in R1_P[:4]:
            msk = (mk >= lo) & (mk <= hi)
            a, b, e = dstats(net[msk], rf[msk]), dstats(mon_c[msk], rf[msk]), dstats(ew[msk], rf[msk])
            per[name] = {"weekly": a, "monthly": b, "ewWeekly": e, "dS_weekly_vs_monthly": a["sharpe"] - b["sharpe"], "dS_weekly_vs_ewWeekly": a["sharpe"] - e["sharpe"]}
        res[k] = {"periods": per, "turnoverPerYear": float(to.mean() * 52)}
    res["first"] = str(hd[0].date())
    return res


# ---------------- R2：L-026 防守倾斜 ----------------
def r2_setup():
    ind = json.loads(IND49_M.read_text())
    names = ind["industries"]
    R = {d: [None if v is None else v / 100 for v in r] for d, r in ind["returns"]}
    F = dict((d, v) for d, v in ind["firms"])
    Z = dict((d, v) for d, v in ind["size"])
    return names, R, F, Z


def r2_targets(month: str, names, R, F, Z, kind: str):
    p = month_after(month, -1)
    r, f, z = R[month], F[p], Z[p]
    caps = {i: f[i] * z[i] for i in range(len(names)) if r[i] is not None and f[i] and z[i] and f[i] > 0 and z[i] > 0}
    tot = sum(caps.values())
    mw = {i: c / tot for i, c in caps.items()}
    if kind == "P1":
        mem = [names.index(n) for n in DEF_NAMES if r[names.index(n)] is not None]
    else:
        hist = [R.get(month_after(month, -1 - k)) for k in range(36)]
        assert all(h is not None for h in hist)
        cand = [i for i in range(len(names)) if all(h[i] is not None for h in hist)]
        vol = {i: float(np.std([h[i] for h in hist], ddof=1)) for i in cand}
        mem = [i for i in sorted(cand, key=lambda i: (vol[i], i))[:10] if r[i] is not None]
    return mw, mem


def r2_run(d49: pd.DataFrame, ff: pd.DataFrame, kind: str, seg_dates_fn=None, fee_mode="month"):
    """返回 S、M 的日净收益（主窗口）。seg 边界：默认每月；按周版传入自定义分段。"""
    names, R, F, Z = r2_setup()
    days = d49.loc["1934-01-01":"1972-12-31"]
    dates = days.index
    cols = list(days.columns)
    assert cols == names, "49 行业列名与月度文件不一致"
    X = days.to_numpy()
    mk = month_key(dates)
    months = list(dict.fromkeys(mk))
    assert months[0] == "1934-01" and months[-1] == "1972-12"
    if seg_dates_fn is None:
        seg = np.searchsorted(np.array(months), mk)
    else:
        seg = seg_dates_fn(dates)
    starts = np.flatnonzero(np.r_[True, seg[1:] != seg[:-1]])
    ends = np.r_[starts[1:], len(seg)]
    nI = len(names)
    S_out = np.empty(len(dates))
    M_out = np.empty(len(dates))
    missing = 0
    drift = None
    tos = []
    cur_month = None
    mw = mem = None
    m_inside = None  # 月内 M 的行业漂移权重（按周版跨段延续）
    for s, (a, b) in enumerate(zip(starts, ends)):
        mon = mk[a]
        if mon != cur_month:
            mw, mem = r2_targets(mon, names, R, F, Z, kind)
            cur_month = mon
            m_inside = dict(mw)
        mcols = np.array(sorted(m_inside))
        mwv = np.array([m_inside[c] for c in mcols])
        Xm = X[a:b][:, mcols]
        missing += int(np.isnan(Xm).sum())
        Gm = np.cumprod(1 + np.nan_to_num(Xm), axis=0)
        VM = Gm @ mwv
        dcols = np.array(mem)
        Xd = X[a:b][:, dcols]
        missing += int(np.isnan(Xd).sum())
        Gd = np.cumprod(1 + np.nan_to_num(Xd), axis=0)
        wd = R2_TILT / len(mem)
        V = (1 - R2_TILT) * VM + Gd.sum(axis=1) * wd
        if drift is None:
            to = 0.0
        else:
            to = abs((1 - R2_TILT) - drift["m"])
            tgt = {i: wd for i in mem}
            for i in set(tgt) | set(drift["d"]):
                to += abs(tgt.get(i, 0.0) - drift["d"].get(i, 0.0))
        nd = b - a
        fee = R2_TILT * R2_FEE if fee_mode == "month" else R2_TILT * 0.0015 * nd / 252
        mult = (1 - R2_COST * to) * (1 - fee)
        r = V / np.r_[1.0, V[:-1]] - 1
        r[0] = mult * (1 + r[0]) - 1
        S_out[a:b] = r
        M_out[a:b] = VM / np.r_[1.0, VM[:-1]] - 1
        drift = {"m": (1 - R2_TILT) * VM[-1] / V[-1], "d": {int(c): float(wd * Gd[-1, j] / V[-1]) for j, c in enumerate(dcols)}}
        m_inside = {int(c): float(mwv[j] * Gm[-1, j] / VM[-1]) for j, c in enumerate(mcols)}
        tos.append(to)
    rf = ff.loc[dates, "RF"].to_numpy()
    return {"dates": dates, "mk": mk, "S": S_out, "M": M_out, "rf": rf, "missing": missing, "turnoverPerYear": float(np.sum(tos) / len(months) * 12)}


def tail_events(v: np.ndarray, k=6):
    eps, pk, cur = [], 0, None
    for j in range(1, len(v)):
        if v[j] >= v[pk]:
            if cur:
                eps.append(cur)
                cur = None
            pk = j
            continue
        if cur is None:
            cur = [pk, j]
        if v[j] < v[cur[1]]:
            cur[1] = j
    if cur:
        eps.append(cur)
    eps = [(p, t, v[t] / v[p] - 1) for p, t in eps]
    eps = sorted([e for e in eps if e[2] <= -0.10], key=lambda e: e[2])[:k]
    return eps


def r2_eval(run: dict, lo: str, hi: str) -> dict:
    msk = (run["mk"] >= lo) & (run["mk"] <= hi)
    S, M, rf, dates = run["S"][msk], run["M"][msk], run["rf"][msk], run["dates"][msk]
    k = float(S.std(ddof=1) / M.std(ddof=1))
    X = k * M + (1 - k) * rf
    vS, vM, vX = (np.r_[1.0, np.cumprod(1 + z)] for z in (S, M, X))
    ev = []
    for p, t, _ in tail_events(vM):
        ev.append({"peak": "start" if p == 0 else str(dates[p - 1].date()), "trough": str(dates[t - 1].date()),
                   "M": float(vM[t] / vM[p] - 1), "S": float(vS[t] / vS[p] - 1), "Mstar": float(vX[t] / vX[p] - 1)})
    L = sum(e["S"] for e in ev) / sum(e["Mstar"] for e in ev)
    return {"S": dstats(S, rf), "M": dstats(M, rf), "Mstar": dstats(X, rf), "k": k, "L": float(L), "events": ev}


def r2(d49, ff) -> dict:
    out = {}
    runs = {}
    for kind in ("P1", "P2"):
        run = r2_run(d49, ff, kind)
        runs[kind] = run
        main = r2_eval(run, *R2_MAIN)
        h = [r2_eval(run, lo, hi) for lo, hi in R2_HALVES]
        g1 = main["S"]["sharpe"] >= main["M"]["sharpe"] - 0.02 and all(x["S"]["sharpe"] >= x["M"]["sharpe"] - 0.05 for x in h)
        g2 = main["S"]["maxDd"] >= main["Mstar"]["maxDd"] - 0.01
        g3 = main["S"]["sharpe"] >= main["M"]["sharpe"] + 0.03 or main["L"] <= 0.90
        gates = {"G1p": bool(g1), "G2p": bool(g2), "G3p": bool(g3)}
        out[kind] = {"main": main, "half1": {"S": h[0]["S"], "M": h[0]["M"]}, "half2": {"S": h[1]["S"], "M": h[1]["M"]},
                     "gates": gates, "turnoverPerYear": run["turnoverPerYear"], "missingHeldDays": run["missing"],
                     "verdict": "按日复核维持" if all(gates.values()) else "按日复核不成立"}
    return out, runs


def r2_weekly(d49, ff, runs_monthly) -> dict:
    def seg_fn(dates):
        wk = (dates - pd.to_timedelta(dates.weekday, unit="D")).normalize()
        mk = month_key(dates)
        new = np.r_[True, (wk[1:] != wk[:-1]) | (mk[1:] != mk[:-1])]
        return np.cumsum(new) - 1
    out = {}
    for kind in ("P1", "P2"):
        run = r2_run(d49, ff, kind, seg_dates_fn=seg_fn, fee_mode="days")
        a = r2_eval(run, *R2_MAIN)
        b = r2_eval(runs_monthly[kind], *R2_MAIN)
        out[kind] = {"weekly": {"sharpe": a["S"]["sharpe"], "maxDd": a["S"]["maxDd"], "vol": a["S"]["vol"], "turnoverPerYear": run["turnoverPerYear"]},
                     "monthly": {"sharpe": b["S"]["sharpe"], "maxDd": b["S"]["maxDd"], "vol": b["S"]["vol"], "turnoverPerYear": runs_monthly[kind]["turnoverPerYear"]},
                     "dS": a["S"]["sharpe"] - b["S"]["sharpe"]}
    return out


# ---------------- 报告项：数据一致性、月度口径对照、大跌 ----------------
def consistency(d12, d49) -> dict:
    out = {}
    kf = pd.read_csv(KF12_M, dtype={"month": str}).set_index("month")[SECTORS] / 100
    comp = (1 + d12[SECTORS]).groupby(month_key(d12.index)).prod() - 1
    common = kf.index.intersection(comp.index)
    diff = (comp.loc[common] - kf.loc[common]).abs()
    out["kf12"] = {"months": len(common), "maxAbs": float(diff.max().max()), "monthsOver0.1pp": int((diff > 0.001).any(axis=1).sum())}
    ind = json.loads(IND49_M.read_text())
    m49 = pd.DataFrame([r for _, r in ind["returns"]], index=[d for d, _ in ind["returns"]], columns=ind["industries"], dtype=float) / 100
    c49 = (1 + d49.fillna(0)).groupby(month_key(d49.index)).prod() - 1
    cnt = d49.notna().groupby(month_key(d49.index)).sum()
    c49 = c49.where(cnt > 0)
    common = m49.loc["1934-01":"1972-12"].index
    dd = (c49.loc[common] - m49.loc[common]).abs()
    out["ind49_1934_1972"] = {"months": len(common), "maxAbs": float(np.nanmax(dd.to_numpy())), "monthsOver0.1pp": int((dd > 0.001).any(axis=1).sum())}
    return out


def to_monthly(x: np.ndarray, mk: np.ndarray) -> pd.Series:
    return pd.Series(1 + x).groupby(mk).prod() - 1


def main() -> None:
    d12 = read_kf_daily("12_Industry_Portfolios_daily_CSV.zip")
    d49 = read_kf_daily("49_Industry_Portfolios_daily_CSV.zip")
    ff = read_kf_daily("F-F_Research_Data_Factors_daily_CSV.zip")
    assert ff["RF"].notna().all()

    R1 = r1(d12, ff)
    R2, runs2 = r2(d49, ff)

    # 报告：按月口径对照（日线复利成月 vs 原 results.json）
    o1 = json.loads(ORIG_R1.read_text())["main"]
    o2 = json.loads(ORIG_R2.read_text())["results"]
    ffm = json.loads(FF_M.read_text())
    rfm = pd.Series({m: b / 100 for m, a, b in ffm["rows"]})
    s1 = R1["series"]
    mk1 = month_key(s1["dates"])
    vs_orig = {"R1": {}, "R2": {}}
    for k in ("S1", "S2"):
        m = to_monthly(s1[k], mk1)
        e = to_monthly(s1["EW"], mk1)
        st, se = mstats(m.to_numpy(), rfm.reindex(m.index).to_numpy()), mstats(e.to_numpy(), rfm.reindex(e.index).to_numpy())
        vs_orig["R1"][k] = {"dS_ew_monthlyFromDaily": st["sharpe"] - se["sharpe"], "dS_ew_original": o1[k]["vsEW"]["full"]["dS"],
                            "maxDd_monthlyFromDaily": st["maxDd"], "maxDd_original": o1[k]["vsEW"]["full"]["cand"]["maxDd"]}
    macro = json.loads(MACRO_M.read_text())
    cash = {d: c for d, _, c in [(r[0], r[1], r[2]) for r in macro["returns"]] if c is not None}
    for k in ("P1", "P2"):
        run = runs2[k]
        mS, mM = to_monthly(run["S"], run["mk"]), to_monthly(run["M"], run["mk"])
        c = np.array([cash[d] for d in mS.index])
        a, b = mstats(mS.to_numpy(), c), mstats(mM.to_numpy(), c)
        vs_orig["R2"][k] = {"sharpeS_monthlyFromDaily": a["sharpe"], "sharpeS_original": o2[k]["main"]["S"]["sharpe"],
                            "sharpeM_monthlyFromDaily": b["sharpe"], "sharpeM_original": o2[k]["main"]["M"]["sharpe"],
                            "maxDdS_monthlyFromDaily": a["maxDd"], "maxDdS_original": o2[k]["main"]["S"]["maxDd"]}

    # 报告：月末口径 vs 日线口径的回撤与波动（全样本 / 主窗口）
    compare = {"R1": {}, "R2": {}}
    for name in ("S1", "S2", "EW", "MKT"):
        x = s1[name]
        m = to_monthly(x, mk1)
        compare["R1"][name] = {"maxDdDaily": maxdd(x), "maxDdMonthEnd": float(mstats(m.to_numpy(), np.zeros(len(m)))["maxDd"]),
                               "volDaily": float(x.std(ddof=1) * ANN), "volMonthly": float(m.std(ddof=1) * np.sqrt(12))}
    for k in ("P1", "P2"):
        run = runs2[k]
        for leg in ("S", "M"):
            x = run[leg]
            m = to_monthly(x, run["mk"])
            compare["R2"][f"{k}.{leg}"] = {"maxDdDaily": maxdd(x), "maxDdMonthEnd": float(mstats(m.to_numpy(), np.zeros(len(m)))["maxDd"]),
                                           "volDaily": float(x.std(ddof=1) * ANN), "volMonthly": float(m.std(ddof=1) * np.sqrt(12))}

    crashes = {}
    for label, lo, hi in CRASHES:
        crashes[label] = {n: crash_depth(s1[n], s1["dates"], lo, hi) for n in ("S1", "S2", "EW", "MKT")}
        crashes[label]["monthEnd"] = {n: crash_depth(s1[n], s1["dates"], lo, hi, month_end=True) for n in ("S1", "S2", "EW", "MKT")}
        if label == "1937–38":
            for k in ("P2", "P1"):
                crashes[label][f"{k}.S"] = crash_depth(runs2[k]["S"], runs2[k]["dates"], lo, hi)
            crashes[label]["M"] = crash_depth(runs2["P2"]["M"], runs2["P2"]["dates"], lo, hi)

    # 报告：按周调仓
    weekly = {}
    for c in (0.001, 0.003):
        mon = r1(d12, ff, cost=c)["series"] if c != 0.001 else s1
        weekly[f"R1_cost{c}"] = r1_weekly(d12, ff, {"S1": mon["S1"], "S2": mon["S2"], "dates": mon["dates"]}, c)
    weekly["R2"] = r2_weekly(d49, ff, runs2)

    def clean(o):
        if isinstance(o, dict):
            return {k: clean(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)):
            return [clean(v) for v in o]
        if isinstance(o, (np.bool_,)):
            return bool(o)
        if isinstance(o, (np.floating, float)):
            return float(o)
        if isinstance(o, (np.integer,)):
            return int(o)
        return o

    result = {
        "study": "L-040", "inputSha256": sha_all(),
        "R1": {"S1": R1["res"]["S1"], "S2": R1["res"]["S2"], "missingHeldDays": R1["missingHeldDays"], "nDays": R1["nDays"]},
        "R2": R2,
        "report": {"consistency": consistency(d12, d49), "vsOriginal": vs_orig, "dailyVsMonthEnd": compare, "crashes": crashes, "weekly": weekly},
    }
    (HERE / "results.json").write_text(json.dumps(clean(result), ensure_ascii=False, indent=1) + "\n")

    for k in ("S1", "S2"):
        r = R1["res"][k]
        p = r["periods"]
        print(k, r["verdict"], r["gates"], {n: round(p[n]["dS_ew"], 4) for n in p}, "mkt", round(p["full"]["dS_mkt"], 4), round(p["post2000"]["dS_mkt"], 4), "delay", round(r["delay"]["dS_ew"], 4))
        print("   ddDaily cand/ew/mkt", round(p["full"]["cand"]["maxDd"], 4), round(p["full"]["ew"]["maxDd"], 4), round(p["full"]["mkt"]["maxDd"], 4))
    for k in ("P1", "P2"):
        r = R2[k]
        m = r["main"]
        print(k, r["verdict"], r["gates"], "sharpe S/M", round(m["S"]["sharpe"], 4), round(m["M"]["sharpe"], 4), "dd S/M*", round(m["S"]["maxDd"], 4), round(m["Mstar"]["maxDd"], 4), "k", round(m["k"], 4), "L", round(m["L"], 4))
        print("   halves", [(round(r[h]["S"]["sharpe"], 4), round(r[h]["M"]["sharpe"], 4)) for h in ("half1", "half2")], "missing", r["missingHeldDays"])
    print("consistency", result["report"]["consistency"])
    print("vsOriginal", json.dumps(clean(vs_orig), ensure_ascii=False))
    print("weekly", json.dumps(clean({k: {s: ({p: round(v["periods"][p]["dS_weekly_vs_monthly"], 4) for p in v["periods"]}, round(v["turnoverPerYear"], 2)) for s, v in w.items() if s in ("S1", "S2")} for k, w in weekly.items() if k.startswith("R1")}), ensure_ascii=False))
    print("weekly R2", json.dumps(clean(weekly["R2"]), ensure_ascii=False))


if __name__ == "__main__":
    main()
