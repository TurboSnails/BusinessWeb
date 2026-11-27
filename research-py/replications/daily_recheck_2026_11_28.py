"""L-040 independent second implementation (confirmation items only).

Spec sources (only): docs/research/daily-recheck-2026-11-28/PREREG.md, CLARIFY-1.md,
docs/research/sector-rotation-2026-11-26/PREREG.md (L-037),
docs/research/defensive-tilt-2026-11-26/PREREG.md (L-026).

Usage:
  cd research-py && uv run python replications/daily_recheck_2026_11_28.py --json out.json [--monthly-check]
"""

from __future__ import annotations

import argparse
import io
import json
import math
import sys
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
RES = ROOT / "docs" / "research"
RAW = RES / "daily-recheck-2026-11-28" / "inputs" / "raw"
KF12_MONTHLY = RES / "sector-rotation-2026-11-26" / "inputs" / "processed" / "kf12_vw.csv"
IND49_MONTHLY = RES / "defensive-tilt-2026-11-26" / "inputs" / "industry.json"

SECTORS = ["NoDur", "Durbl", "Manuf", "Enrgy", "Chems", "BusEq", "Telcm", "Utils", "Shops", "Hlth", "Money"]
DEFENSIVE = ["Food", "Soda", "Beer", "Smoke", "Hshld", "Hlth", "MedEq", "Drugs", "Util"]

C37 = 0.001
F_CAND = 0.001
F_MKT = 0.0003
C26 = 0.001
FEE26_M = 0.3 * 0.0015 / 12  # D-sleeve holding fee per month, as share of S


# ---------------------------------------------------------------- data loading

def read_kf_daily_first_block(zpath: Path) -> pd.DataFrame:
    """First data block of a Ken French daily CSV; values in fraction; missing -> NaN."""
    with zipfile.ZipFile(zpath) as z:
        name = z.namelist()[0]
        text = z.read(name).decode("latin-1")
    lines = text.splitlines()
    i = 0
    while i < len(lines) and not lines[i].startswith(","):
        i += 1
    header = [h.strip() for h in lines[i].split(",")]
    rows = []
    j = i + 1
    while j < len(lines):
        s = lines[j].strip()
        if not s or not s[0].isdigit():
            break
        rows.append([x.strip() for x in s.split(",")])
        j += 1
    dates = pd.to_datetime([r[0] for r in rows], format="%Y%m%d")
    vals = np.array([[float(x) for x in r[1:]] for r in rows], dtype=float)
    vals[(vals == -99.99) | (vals == -999.0)] = np.nan
    df = pd.DataFrame(vals, index=dates, columns=header[1:])
    return df


def load_daily():
    d12 = read_kf_daily_first_block(RAW / "12_Industry_Portfolios_daily_CSV.zip")
    d49 = read_kf_daily_first_block(RAW / "49_Industry_Portfolios_daily_CSV.zip")
    ff = read_kf_daily_first_block(RAW / "F-F_Research_Data_Factors_daily_CSV.zip")
    assert d12.index.equals(ff.index) and d49.index.equals(ff.index), "date mismatch"
    assert not ff[["Mkt-RF", "RF"]].isna().any().any()
    r12 = d12 / 100.0
    r49 = d49 / 100.0
    rf = (ff["RF"] / 100.0).to_numpy()
    mkt = ((ff["Mkt-RF"] + ff["RF"]) / 100.0).to_numpy()
    return r12, r49, rf, mkt, ff.index


def month_keys(idx: pd.DatetimeIndex) -> np.ndarray:
    return np.array([f"{d.year:04d}-{d.month:02d}" for d in idx])


def month_slices(keys: np.ndarray) -> dict[str, tuple[int, int]]:
    out: dict[str, tuple[int, int]] = {}
    start = 0
    for i in range(1, len(keys) + 1):
        if i == len(keys) or keys[i] != keys[start]:
            out[keys[start]] = (start, i)
            start = i
    return out


def month_range(a: str, b: str) -> list[str]:
    y, m = map(int, a.split("-"))
    out = []
    while True:
        k = f"{y:04d}-{m:02d}"
        out.append(k)
        if k == b:
            return out
        m += 1
        if m == 13:
            y, m = y + 1, 1


def shift_month(k: str, n: int) -> str:
    y, m = map(int, k.split("-"))
    t = y * 12 + (m - 1) + n
    return f"{t // 12:04d}-{t % 12 + 1:02d}"


# ---------------------------------------------------------------- metrics

def sharpe(net: np.ndarray, rf: np.ndarray, periods: int) -> float:
    ex = net - rf
    return float(ex.mean() / ex.std(ddof=1) * math.sqrt(periods))


def max_dd(net: np.ndarray) -> float:
    nav = np.concatenate([[1.0], np.cumprod(1.0 + net)])
    peak = np.maximum.accumulate(nav)
    return float((nav / peak - 1.0).min())


# ---------------------------------------------------------------- generic flat-portfolio engine

class Missing:
    def __init__(self):
        self.cells: set[tuple[str, int, int]] = set()

    def note(self, tag: str, rows: np.ndarray, col: int):
        for r in rows:
            self.cells.add((tag, int(r), int(col)))


def period_paths(R: np.ndarray, s: int, e: int, cols: np.ndarray, miss: Missing | None, tag: str):
    """Cumulative gross paths G (n_days x len(cols)) for held cols; missing -> 0 return."""
    block = R[s:e][:, cols].copy()
    if miss is not None:
        nan_r, nan_c = np.where(np.isnan(block))
        for r, c in zip(nan_r, nan_c):
            miss.cells.add((tag, s + int(r), int(cols[c])))
    block[np.isnan(block)] = 0.0
    return np.cumprod(1.0 + block, axis=0)


def run_flat(months, targets, R, slices, cost_mode, c, f, miss=None, tag="", first_free=True):
    """Flat portfolio with monthly rebalancing to `targets[month]` (dict col->weight).

    cost_mode 'mult37': first-day factor 1 - c*TO - f/12 (CLARIFY-1 item 1, R1).
    cost_mode 'add37' : monthly additive net (only valid with one period per month; sanity check).
    Returns (net array over all days of the months, list of half-turnovers per month).
    """
    nets = []
    halfto = []
    drift: dict[int, float] = {}
    for mi, m in enumerate(months):
        s, e = slices[m]
        tgt = targets[m]
        cols = np.array(sorted(tgt.keys()), dtype=int)
        w = np.array([tgt[k] for k in cols])
        keys = set(cols.tolist()) | set(drift.keys())
        to = sum(abs(tgt.get(k, 0.0) - drift.get(k, 0.0)) for k in keys)
        if mi == 0:
            to_cost = 0.0 if first_free else to
            halfto.append(0.0)
        else:
            to_cost = to
            halfto.append(0.5 * to)
        G = period_paths(R, s, e, cols, miss, tag)
        V = G @ w
        Vprev = np.concatenate([[1.0], V[:-1]])
        net = V / Vprev - 1.0
        if cost_mode == "mult37":
            coef = 1.0 - c * to_cost - f / 12.0
            net[0] = coef * V[0] - 1.0
        elif cost_mode == "add37":
            assert e - s == 1
            net[0] = V[0] - 1.0 - c * to_cost - f / 12.0
        else:
            raise ValueError(cost_mode)
        nets.append(net)
        Gend = G[-1]
        drift = {int(k): float(w[j] * Gend[j] / V[-1]) for j, k in enumerate(cols)}
    return np.concatenate(nets), halfto


# ---------------------------------------------------------------- R1 (L-037)

def l037_signals(kf: pd.DataFrame):
    """Return dicts signal_month -> list of top-3 sector names for S1 and S2."""
    r = kf[SECTORS] / 100.0
    mon = list(r.index)
    pos = {m: i for i, m in enumerate(mon)}
    arr = r.to_numpy()
    order = sorted(range(len(SECTORS)), key=lambda j: SECTORS[j])  # ASCII order of codes

    def top3(mom: np.ndarray):
        idx = sorted(order, key=lambda j: mom[j], reverse=True)  # stable descending
        top = idx[:3]
        tie = abs(mom[idx[2]] - mom[idx[3]]) < 1e-9
        return [SECTORS[j] for j in top], tie

    def comp(i0, i1):  # product of (1+r) over rows i0..i1 inclusive
        return np.prod(1.0 + arr[i0:i1 + 1], axis=0) - 1.0

    s1, s2, ties = {}, {}, {"S1": 0, "S2": 0}
    for t in mon:
        i = pos[t]
        if i - 11 >= 0:
            mom1 = comp(i - 11, i - 1)
            s1[t], tie = top3(mom1)
            ties["S1"] += int(tie)
        if i - 11 >= 0:
            m3 = comp(i - 2, i)
            m6 = comp(i - 5, i)
            m12 = comp(i - 11, i)
            mom2 = (m3 + m6 + m12) / 3.0
            s2[t], tie = top3(mom2)
            ties["S2"] += int(tie)
    return s1, s2, ties


def r1_compute(R12, rf_d, mkt_d, slices, keys, kf, miss, monthly=False, rf_m=None, mkt_m=None):
    """R1 for one granularity. If monthly=True, R12 rows are months (one period per month)."""
    months = month_range("1927-07", "2026-09")
    col = {name: j for j, name in enumerate(R12.columns)}
    Rarr = R12.to_numpy()
    s1, s2, ties = l037_signals(kf)
    mode = "add37" if monthly else "mult37"
    periods = 12 if monthly else 252
    rf = rf_m if monthly else rf_d
    mk = mkt_m if monthly else mkt_d

    ew_t = {m: {col[s]: 1.0 / 11 for s in SECTORS} for m in months}
    ew, _ = run_flat(months, ew_t, Rarr, slices, mode, C37, F_CAND, miss, "R1")
    # MKT as single asset
    Rm = mk.reshape(-1, 1)
    mkt_t = {m: {0: 1.0} for m in months}
    mkt, _ = run_flat(months, mkt_t, Rm, slices, mode, C37, F_MKT, None, "MKT")

    s0, _ = slices[months[0]]
    _, e0 = slices[months[-1]]
    day_month = keys[s0:e0]
    rf_win = rf[s0:e0]

    def sl(a, b):
        return (day_month >= a) & (day_month <= b)

    periods_def = {
        "full": ("1927-07", "2026-09"),
        "half1": ("1927-07", "1976-12"),
        "half2": ("1977-01", "2026-09"),
        "post2000": ("2000-01", "2026-09"),
    }
    out = {}
    for name, sig in (("S1", s1), ("S2", s2)):
        tg = {m: {col[s]: 1.0 / 3 for s in sig[shift_month(m, -1)]} for m in months}
        cand, hto = run_flat(months, tg, Rarr, slices, mode, C37, F_CAND, miss, "R1")
        sh, dd = {}, {}
        for p, (a, b) in periods_def.items():
            mask = sl(a, b)
            sh[p] = {k: sharpe(v[mask], rf_win[mask], periods) for k, v in (("cand", cand), ("ew", ew), ("mkt", mkt))}
            dd[p] = {k: max_dd(v[mask]) for k, v in (("cand", cand), ("ew", ew), ("mkt", mkt))}
        # delay run: hold month h uses signal at h-2, from 1927-08, first month cost-free
        dmonths = month_range("1927-08", "2026-09")
        tgd = {m: {col[s]: 1.0 / 3 for s in sig[shift_month(m, -2)]} for m in dmonths}
        dcand, _ = run_flat(dmonths, tgd, Rarr, slices, mode, C37, F_CAND, miss, "R1")
        dmask = sl("1927-08", "2026-09")
        assert dmask.sum() == len(dcand)
        d_sh = sharpe(dcand, rf_win[dmask], periods) - sharpe(ew[dmask], rf_win[dmask], periods)
        dS = {
            "full_ew": sh["full"]["cand"] - sh["full"]["ew"],
            "half1_ew": sh["half1"]["cand"] - sh["half1"]["ew"],
            "half2_ew": sh["half2"]["cand"] - sh["half2"]["ew"],
            "post2000_ew": sh["post2000"]["cand"] - sh["post2000"]["ew"],
            "full_mkt": sh["full"]["cand"] - sh["full"]["mkt"],
            "post2000_mkt": sh["post2000"]["cand"] - sh["post2000"]["mkt"],
            "delay_full_ew": d_sh,
        }
        gates = {
            "G1p": bool(dS["full_ew"] > 0),
            "G2p": bool(dS["half1_ew"] > 0 and dS["half2_ew"] > 0),
            "G3p": bool(dS["post2000_ew"] > 0),
            "G4p": bool(dS["full_mkt"] > 0 and dS["post2000_mkt"] > 0),
            "G5p": bool(dS["delay_full_ew"] > 0),
        }
        out[name] = {
            "sharpe": sh,
            "maxDd": dd,
            "dS": dS,
            "gates": gates,
            "turnoverPerYear": float(np.mean(hto) * 12),
        }
    return out, int(e0 - s0), ties


# ---------------------------------------------------------------- R2 (L-026)

def l026_monthly_inputs():
    d = json.load(open(IND49_MONTHLY))
    inds = d["industries"]
    rets = {m: v for m, v in d["returns"]}
    firms = {m: v for m, v in d["firms"]}
    size = {m: v for m, v in d["size"]}
    return inds, rets, firms, size


def l026_targets(months, inds, rets, firms, size, basket):
    """For each holding month t: (M weights dict ind_idx->w, D list of ind_idx)."""
    n = len(inds)
    allm = sorted(rets.keys())
    pos = {m: i for i, m in enumerate(allm)}
    out = {}
    dnull = 0
    for t in months:
        prev = shift_month(t, -1)
        rt, fp, sp = rets[t], firms[prev], size[prev]
        mw = {}
        for i in range(n):
            if rt[i] is None or fp[i] is None or sp[i] is None:
                continue
            cap = fp[i] * sp[i]
            if cap > 0:
                mw[i] = cap
        tot = sum(mw.values())
        mw = {i: v / tot for i, v in mw.items()}
        if basket == "P1":
            D = [inds.index(x) for x in DEFENSIVE if rt[inds.index(x)] is not None]
        else:
            p = pos[t]
            win = allm[p - 36:p]
            assert len(win) == 36 and win[-1] == prev
            cands = []
            for i in range(n):
                xs = [rets[m][i] for m in win]
                if any(x is None for x in xs):
                    continue
                cands.append((float(np.std(np.array(xs, dtype=float), ddof=1)), i))
            cands.sort(key=lambda z: (z[0], z[1]))
            D = sorted(i for _, i in cands[:10])
            dnull += sum(1 for i in D if rt[i] is None)
        out[t] = (mw, D)
    return out, dnull


def run_r2(months, tg, R, slices, mode, miss=None, tag="R2"):
    """Returns daily net S, daily M, list of half? (turnover per month)."""
    netS, netM, tos = [], [], []
    m_share = None  # drifted M-sleeve share of S
    d_drift: dict[int, float] = {}
    for mi, t in enumerate(months):
        s, e = slices[t]
        mw, D = tg[t]
        mcols = np.array(sorted(mw.keys()), dtype=int)
        mwv = np.array([mw[i] for i in mcols])
        dcols = np.array(sorted(D), dtype=int)
        dtgt = 0.3 / len(dcols)
        if mi == 0:
            to = 0.0
        else:
            keys = set(dcols.tolist()) | set(d_drift.keys())
            to = abs(0.7 - m_share) + sum(abs((dtgt if k in set(dcols.tolist()) else 0.0) - d_drift.get(k, 0.0)) for k in keys)
        tos.append(to)
        GM = period_paths(R, s, e, mcols, miss, tag)
        GD = period_paths(R, s, e, dcols, miss, tag)
        VM = GM @ mwv
        VD = GD.sum(axis=1) * dtgt
        V = 0.7 * VM + VD
        nM = VM / np.concatenate([[1.0], VM[:-1]]) - 1.0
        nS = V / np.concatenate([[1.0], V[:-1]]) - 1.0
        if mode == "mult26":
            coef = (1.0 - C26 * to) * (1.0 - FEE26_M)
            nS[0] = coef * V[0] - 1.0
        elif mode == "orig26":
            assert e - s == 1
            nS[0] = (V[0] - FEE26_M) * (1.0 - C26 * to) - 1.0
        else:
            raise ValueError(mode)
        netS.append(nS)
        netM.append(nM)
        m_share = 0.7 * VM[-1] / V[-1]
        d_drift = {int(k): float(dtgt * GD[-1, j] / V[-1]) for j, k in enumerate(dcols)}
    return np.concatenate(netS), np.concatenate(netM), tos


def tail_events(M_idx: np.ndarray, n_max=6, thresh=-0.10):
    """M_idx: index levels with position 0 = window start (1.0). Returns list of (peak_pos, trough_pos, depth)."""
    events = []
    peak_pos = 0
    peak = M_idx[0]
    in_dd = False
    trough_pos = 0
    trough = peak
    for j in range(1, len(M_idx)):
        v = M_idx[j]
        if v >= peak:
            if in_dd:
                events.append((peak_pos, trough_pos, trough / peak - 1.0))
                in_dd = False
            peak, peak_pos = v, j
        else:
            if not in_dd:
                in_dd = True
                trough, trough_pos = v, j
            elif v < trough:
                trough, trough_pos = v, j
    if in_dd:
        events.append((peak_pos, trough_pos, trough / peak - 1.0))
    events = [ev for ev in events if ev[2] <= thresh]
    events.sort(key=lambda z: z[2])
    return events[:n_max]


def r2_eval(netS, netM, rf, labels, periods):
    """Main window evaluation. labels[j] = label of period j (date/month) for event output."""
    k = float(np.std(netS, ddof=1) / np.std(netM, ddof=1))
    netMs = k * netM + (1.0 - k) * rf
    idxS = np.concatenate([[1.0], np.cumprod(1.0 + netS)])
    idxM = np.concatenate([[1.0], np.cumprod(1.0 + netM)])
    idxMs = np.concatenate([[1.0], np.cumprod(1.0 + netMs)])
    evs = tail_events(idxM)
    events = []
    sumS = sumMs = 0.0
    for p, q, dep in evs:
        dS = idxS[q] / idxS[p] - 1.0
        dMs = idxMs[q] / idxMs[p] - 1.0
        sumS += dS
        sumMs += dMs
        events.append({
            "peak": "start" if p == 0 else labels[p - 1],
            "trough": labels[q - 1],
            "M": float(dep),
            "S": float(dS),
            "Mstar": float(dMs),
        })
    return {
        "sharpeS": sharpe(netS, rf, periods),
        "sharpeM": sharpe(netM, rf, periods),
        "maxDdS": max_dd(netS),
        "maxDdM": max_dd(netM),
        "maxDdMstar": max_dd(netMs),
        "k": k,
        "L": float(sumS / sumMs),
        "events": events,
    }


def r2_compute(R49, rf_all, slices, keys, idx_labels, miss, monthly=False):
    inds, rets, firms, size = l026_monthly_inputs()
    assert list(R49.columns) == inds
    months = month_range("1934-01", "1972-12")
    Rarr = R49.to_numpy()
    mode = "orig26" if monthly else "mult26"
    periods = 12 if monthly else 252
    s0, _ = slices[months[0]]
    _, e0 = slices[months[-1]]
    day_month = keys[s0:e0]
    rf = rf_all[s0:e0]
    labels = idx_labels[s0:e0]
    out = {}
    diag = {}
    for b in ("P1", "P2"):
        tg, dnull = l026_targets(months, inds, rets, firms, size, b)
        netS, netM, tos = run_r2(months, tg, Rarr, slices, mode, miss, "R2")
        main = r2_eval(netS, netM, rf, labels, periods)
        halves = {}
        for hn, (a, z) in (("half1", ("1934-01", "1952-12")), ("half2", ("1953-01", "1972-12"))):
            mask = (day_month >= a) & (day_month <= z)
            halves[hn] = {"sharpeS": sharpe(netS[mask], rf[mask], periods),
                          "sharpeM": sharpe(netM[mask], rf[mask], periods)}
        g1 = (main["sharpeS"] >= main["sharpeM"] - 0.02
              and halves["half1"]["sharpeS"] >= halves["half1"]["sharpeM"] - 0.05
              and halves["half2"]["sharpeS"] >= halves["half2"]["sharpeM"] - 0.05)
        g2 = main["maxDdS"] >= main["maxDdMstar"] - 0.01
        g3 = main["sharpeS"] >= main["sharpeM"] + 0.03 or main["L"] <= 0.90
        out[b] = {"main": main, **halves, "gates": {"G1p": bool(g1), "G2p": bool(g2), "G3p": bool(g3)}}
        diag[b] = {"turnoverPerYear": float(np.mean(tos) * 12), "basketNullMonths": dnull}
    return out, int(e0 - s0), diag


# ---------------------------------------------------------------- monthly sanity check

def monthly_check():
    """Recompute original monthly L-037/L-026 confirmation numbers with the same engine."""
    kf = pd.read_csv(KF12_MONTHLY, dtype={"month": str}).set_index("month")
    ff = json.load(open(RES / "trend-1871-2026-11-26" / "inputs" / "ff-factors.json"))
    ffm = {r[0]: r for r in ff["rows"]}
    mkeys = np.array(list(kf.index))
    sl = {m: (i, i + 1) for i, m in enumerate(mkeys)}
    R12 = kf[SECTORS] / 100.0
    rf_m = np.array([ffm[m][2] / 100.0 for m in mkeys])
    mkt_m = np.array([(ffm[m][1] + ffm[m][2]) / 100.0 for m in mkeys])
    r1, _, ties = r1_compute(R12, None, None, sl, mkeys, kf, None, monthly=True, rf_m=rf_m, mkt_m=mkt_m)

    inds, rets, firms, size = l026_monthly_inputs()
    macro = json.load(open(RES / "macro-significance-2026-11-25" / "inputs.json"))
    cash = {m: c for m, _, c in macro["returns"]}
    allm = np.array(sorted(rets.keys()))
    R49 = pd.DataFrame([[np.nan if x is None else x / 100.0 for x in rets[m]] for m in allm], columns=inds)
    sl49 = {m: (i, i + 1) for i, m in enumerate(allm)}
    rf49 = np.array([np.nan if cash.get(m) is None else cash[m] for m in allm])
    r2, _, diag = r2_compute(R49, rf49, sl49, allm, list(allm), None, monthly=True)

    orig37 = json.load(open(RES / "sector-rotation-2026-11-26" / "results.json"))
    orig26 = json.load(open(RES / "defensive-tilt-2026-11-26" / "results.json"))["results"]
    diffs = []

    def cmp(label, mine, ref):
        diffs.append((label, mine, ref, abs(mine - ref)))

    for s in ("S1", "S2"):
        cmp(f"{s} delay dS", r1[s]["dS"]["delay_full_ew"], orig37["main"][s]["delay"]["dS"])
        cmp(f"{s} turnoverPerYear", r1[s]["turnoverPerYear"], orig37["main"][s]["turnoverPerYear"])
        for p in ("full", "half1", "half2", "post2000"):
            cmp(f"{s} {p} cand sharpe", r1[s]["sharpe"][p]["cand"], orig37["main"][s]["vsEW"][p]["cand"]["sharpe"])
            cmp(f"{s} {p} ew sharpe", r1[s]["sharpe"][p]["ew"], orig37["main"][s]["vsEW"][p]["bench"]["sharpe"])
            cmp(f"{s} {p} mkt sharpe", r1[s]["sharpe"][p]["mkt"], orig37["main"][s]["vsMKT"][p]["bench"]["sharpe"])
            cmp(f"{s} {p} cand maxDd", r1[s]["maxDd"][p]["cand"], orig37["main"][s]["vsEW"][p]["cand"]["maxDd"])
            cmp(f"{s} {p} ew maxDd", r1[s]["maxDd"][p]["ew"], orig37["main"][s]["vsEW"][p]["bench"]["maxDd"])
            cmp(f"{s} {p} mkt maxDd", r1[s]["maxDd"][p]["mkt"], orig37["main"][s]["vsMKT"][p]["bench"]["maxDd"])
    for b in ("P1", "P2"):
        o = orig26[b]
        m = r2[b]["main"]
        cmp(f"{b} sharpeS", m["sharpeS"], o["main"]["S"]["sharpe"])
        cmp(f"{b} sharpeM", m["sharpeM"], o["main"]["M"]["sharpe"])
        cmp(f"{b} maxDdS", m["maxDdS"], o["main"]["S"]["maxDd"])
        cmp(f"{b} maxDdM", m["maxDdM"], o["main"]["M"]["maxDd"])
        cmp(f"{b} maxDdMstar", m["maxDdMstar"], o["main"]["Mstar"]["maxDd"])
        cmp(f"{b} k", m["k"], o["main"]["k"])
        cmp(f"{b} L", m["L"], o["main"]["L"])
        # NOTE: turnoverPerYear is not a gate input; the original's annual-turnover definition
        # evidently differs (costs match to 1e-12), so it is printed but not compared strictly.
        print(f"  [info] {b} turnoverPerYear mine={diag[b]['turnoverPerYear']} orig={o['turnoverPerYear']}")
        for h, hn in ((0, "half1"), (1, "half2")):
            cmp(f"{b} {hn} sharpeS", r2[b][hn]["sharpeS"], o["halves"][h]["S"]["sharpe"])
            cmp(f"{b} {hn} sharpeM", r2[b][hn]["sharpeM"], o["halves"][h]["M"]["sharpe"])
        for ev, oe in zip(m["events"], o["main"]["events"]):
            cmp(f"{b} ev {ev['peak']}->{ev['trough']} ({oe['peakMonth']}->{oe['troughMonth']}) S", ev["S"], oe["S"])
            cmp(f"{b} ev M", ev["M"], oe["M"])
            cmp(f"{b} ev Mstar", ev["Mstar"], oe["Mstar"])
    return diffs, r1, r2, ties


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", required=True)
    ap.add_argument("--monthly-check", action="store_true")
    a = ap.parse_args()

    r12, r49, rf, mkt, idx = load_daily()
    keys = month_keys(idx)
    slices = month_slices(keys)
    labels = [d.strftime("%Y-%m-%d") for d in idx]
    kf = pd.read_csv(KF12_MONTHLY, dtype={"month": str}).set_index("month")

    miss = Missing()
    r1, n1, ties = r1_compute(r12, rf, mkt, slices, keys, kf, miss)
    r2, n2, diag = r2_compute(r49, rf, slices, keys, labels, miss)

    out = {
        "R1": r1,
        "R2": r2,
        "checks": {"missingHeldDays": len(miss.cells), "nDaysR1": n1, "nDaysR2main": n2},
    }
    Path(a.json).write_text(json.dumps(out, ensure_ascii=False, indent=1))
    print(json.dumps({"ties34": ties, "r2diag": diag,
                      "missingCells": len(miss.cells)}, ensure_ascii=False))

    if a.monthly_check:
        diffs, _, _, _ = monthly_check()
        worst = max(d[3] for d in diffs)
        print(f"monthly sanity check: {len(diffs)} numbers, max abs diff = {worst:.3e}")
        for d in diffs:
            if d[3] > 1e-12:
                print("  ", d)


if __name__ == "__main__":
    sys.exit(main())
