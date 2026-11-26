"""L-035 更多过热/超配读数的独立第二实现（只按 PREREG.md 与 inputs/processed/ 实现，未读 run.py / results.json）。

运行：
    cd research-py && uv run python replications/heat_more_2026_11_26.py [out.json]

结构：所有月度序列放在以「月序号 = 年*12 + 月-1」为下标的 numpy 数组里（缺值 NaN），
统计量用显式循环与闭式公式算，尽量不与 pandas 风格的主实现共用写法。

PREREG 没写死、这里做出的选择：
  1. Yahoo 指数：删掉 2026-11 及以后的行，再算 200 日均线（含当日最近 200 个有效收盘，不足为空）。
     月末读数 = 当月最后一个有效收盘 / 当日 MA200 − 1；V_t = 当月最后一个收盘。
  2. KF：信号月 t 的读数 = 第 t+1 行的 share（最后信号月 2026-08）。主检验只用信号月 ≥ 1973-07；
     V 为 1973-07 起的 Π(1+ret/100)，到 2026-09。
  3. 百分位：最近 120 个月（含 t）中有读数的值，scipy percentileofscore(kind='mean')/100，≥60 个。
  4. 样本 = p、R、D 都有值的月份；β 为含截距 OLS 斜率；循环平移 k = 24..n−24，np.roll 信号。
  5. Holm（R1,H1,A1,E1,F1）下尾、上尾各一次。两半 = 前 n//2 与其余。高位 p ≥ 0.8。
  6. NW t：statsmodels OLS HAC maxlags=12（只报告）。
  7. 标普目标：spx-daily.json 月末收盘（截至 2026-10）；样本 = 指标 p 与标普 R、D 都有值的月份。
  8. E1 去 1979-01..1982-12、F1 去 2006-01..2008-12：在 p、R 有值的月份上剔除后算 β、ΔR。
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import statsmodels.api as sm
from scipy.stats import percentileofscore

ROOT = Path(__file__).resolve().parents[2]
PROC = ROOT / "docs/research/heat-more-2026-11-26/inputs/processed"
SPX = ROOT / "data-raw/macro-posture-daily/spx-daily.json"

M0 = 1926 * 12  # 下标原点：1926-01
M_END = 2027 * 12 + 12 - M0  # 数组长度，足够容纳到 2027
CUT_YAHOO = 2026 * 12 + 9 - M0  # 2026-10
CUT_KF_V = 2026 * 12 + 8 - M0  # 2026-09
KF_START = 1973 * 12 + 6 - M0  # 1973-07


def midx(s: str) -> int:
    y, m = int(s[0:4]), int(s[5:7])
    return y * 12 + m - 1 - M0


def mstr(i: int) -> str:
    a = i + M0
    return f"{a // 12:04d}-{a % 12 + 1:02d}"


def nan_arr() -> np.ndarray:
    return np.full(M_END, np.nan)


# ---------------------------------------------------------------- 读数据
def read_daily(name: str) -> tuple[np.ndarray, np.ndarray]:
    """返回每月 (信号 x, 月末收盘 V) 数组。"""
    dates: list[str] = []
    closes: list[float] = []
    with open(PROC / f"{name}_daily.csv") as fh:
        next(fh)
        for line in fh:
            d, c = line.strip().split(",")
            if midx(d) > CUT_YAHOO:
                continue
            dates.append(d)
            closes.append(float(c))
    c = np.array(closes)
    n = len(c)
    csum = np.concatenate([[0.0], np.cumsum(c)])
    x = nan_arr()
    v = nan_arr()
    for i in range(n):
        last_of_month = (i == n - 1) or (dates[i + 1][:7] != dates[i][:7])
        if not last_of_month:
            continue
        mi = midx(dates[i])
        v[mi] = c[i]
        if i >= 199:
            ma = (csum[i + 1] - csum[i - 199]) / 200.0
            x[mi] = c[i] / ma - 1.0
    return x, v


def read_spx() -> np.ndarray:
    rows = json.loads(SPX.read_text())["rows"]
    v = nan_arr()
    for d, c in rows:  # 按日期升序，后写覆盖前写 = 当月最后一行
        mi = midx(d)
        if mi <= CUT_YAHOO and c is not None:
            v[mi] = float(c)
    return v


def read_kf() -> dict[str, dict[str, np.ndarray]]:
    with open(PROC / "kf49_all.csv") as fh:
        header = fh.readline().strip().split(",")
        body = [ln.strip().split(",") for ln in fh if ln.strip()]
    cols = {h: j for j, h in enumerate(header)}
    names = [h[6:] for h in header if h.startswith("share_")]
    out: dict[str, dict[str, np.ndarray]] = {}
    for nm in names:
        sh = nan_arr()
        rt = nan_arr()
        for row in body:
            mi = midx(row[0])
            a, b = row[cols["share_" + nm]], row[cols["ret_" + nm]]
            sh[mi] = float(a) if a != "" else np.nan
            rt[mi] = float(b) if b != "" else np.nan
        # 信号月 t 取第 t+1 行
        x = nan_arr()
        x[:-1] = sh[1:]
        x[:KF_START] = np.nan
        # 净值：1973-07 起累积到 2026-09
        v = nan_arr()
        acc = 1.0
        for t in range(KF_START, CUT_KF_V + 1):
            r = rt[t]
            if np.isnan(r):
                acc = np.nan
            acc = acc * (1.0 + r / 100.0)
            v[t] = acc
        out[nm] = {"x": x, "v": v, "ret": rt}
    return out


# ---------------------------------------------------------------- 变换
def pctile(x: np.ndarray) -> np.ndarray:
    p = nan_arr()
    for t in range(M_END):
        if np.isnan(x[t]):
            continue
        lo = max(0, t - 119)
        w = x[lo : t + 1]
        w = w[~np.isnan(w)]
        if w.size >= 60:
            p[t] = percentileofscore(w, x[t], kind="mean") / 100.0
    return p


def fwd(v: np.ndarray, h: int) -> tuple[np.ndarray, np.ndarray]:
    r = nan_arr()
    d = nan_arr()
    for t in range(M_END - h):
        if np.isnan(v[t]):
            continue
        fut = v[t + 1 : t + h + 1]
        if np.isnan(fut).any():
            continue
        r[t] = fut[-1] / v[t] - 1.0
        d[t] = fut.min() / v[t] - 1.0
    return r, d


def slope(x: np.ndarray, y: np.ndarray) -> float:
    xm = x.sum() / x.size
    ym = y.sum() / y.size
    sxx = 0.0
    sxy = 0.0
    for a, b in zip(x, y):
        sxx += (a - xm) * (a - xm)
        sxy += (a - xm) * (b - ym)
    return sxy / sxx


def slope_fast(x: np.ndarray, y: np.ndarray) -> float:
    xc = x - x.mean()
    return float(np.dot(xc, y - y.mean()) / np.dot(xc, xc))


def shift_test(x: np.ndarray, y: np.ndarray, b: float) -> tuple[float, float, int]:
    n = x.size
    ks = range(24, n - 24 + 1)
    le = ge = 0
    for k in ks:
        bk = slope_fast(np.roll(x, k), y)
        le += bk <= b
        ge += bk >= b
    K = len(ks)
    return (le + 1) / (K + 1), (ge + 1) / (K + 1), K


def nw_t(x: np.ndarray, y: np.ndarray) -> float:
    res = sm.OLS(y, sm.add_constant(x)).fit(cov_type="HAC", cov_kwds={"maxlags": 12})
    return float(res.tvalues[1])


def delta(p: np.ndarray, y: np.ndarray, thr: float) -> float:
    hi = p >= thr
    return float(y[hi].mean() - y[~hi].mean())


def holm(ps: list[float]) -> list[float]:
    m = len(ps)
    order = sorted(range(m), key=lambda i: ps[i])
    adj = [0.0] * m
    run = 0.0
    for rank, i in enumerate(order):
        run = max(run, min(1.0, (m - rank) * ps[i]))
        adj[i] = run
    return adj


def segments(months: list[int], p: np.ndarray, thr: float) -> list[list[str]]:
    """样本内 p ≥ thr 的月份；与上一个高位月相隔超过 12 个月记新段。"""
    segs: list[list[int]] = []
    for t in months:
        if p[t] < thr:
            continue
        if segs and t - segs[-1][-1] <= 12:
            segs[-1].append(t)
        else:
            segs.append([t])
    return [[mstr(s[0]), mstr(s[-1])] for s in segs]


# ---------------------------------------------------------------- 一个「信号 × 目标 × 期限 × 阈值」块
def block(p: np.ndarray, v: np.ndarray, h: int, thr: float, placebo: bool) -> dict:
    r, d = fwd(v, h)
    months = [t for t in range(M_END) if not (np.isnan(p[t]) or np.isnan(r[t]) or np.isnan(d[t]))]
    idx = np.array(months)
    P, R, D = p[idx], r[idx], d[idx]
    n = P.size
    half = n // 2
    b = slope(P, R)
    out = {
        "n": n,
        "from": mstr(months[0]),
        "to": mstr(months[-1]),
        "beta": b,
        "tNW": nw_t(P, R),
        "dR": delta(P, R, thr),
        "dD": delta(P, D, thr),
        "nTop": int((P >= thr).sum()),
        "topSegments": segments(months, p, thr),
        "halves": [
            {"beta": slope(P[:half], R[:half]), "t": nw_t(P[:half], R[:half])},
            {"beta": slope(P[half:], R[half:]), "t": nw_t(P[half:], R[half:])},
        ],
        "betaD": slope(P, D),
    }
    if placebo:
        lo, hi, K = shift_test(P, R, b)
        lod, _, _ = shift_test(P, D, out["betaD"])
        out.update({"pLower": lo, "pUpper": hi, "shifts": K, "pLowerD": lod})
    return out


def excl_block(p: np.ndarray, v: np.ndarray, a: str, z: str) -> dict:
    r, _ = fwd(v, 12)
    ia, iz = midx(a), midx(z)
    ms = [t for t in range(M_END) if not (np.isnan(p[t]) or np.isnan(r[t])) and not (ia <= t <= iz)]
    j = np.array(ms)
    return {"n": len(ms), "beta": slope(p[j], r[j]), "dR": delta(p[j], r[j], 0.8)}


def verdict(o: dict) -> tuple[str, dict]:
    g1 = bool(o["beta"] < 0 and o["pHolm"] <= 0.05)
    g2 = bool(o["dD"] <= -0.05)
    g3 = bool(o["halves"][0]["beta"] < 0 and o["halves"][1]["beta"] < 0)
    g4 = bool(o["dR"] <= -0.05)
    if g1 and g2 and g3 and g4:
        v = "有预测力"
    elif g1:
        v = "斜率显著、幅度不足"
    elif g2 and g3 and g4:
        v = "方向一致、统计上不显著"
    elif o["beta"] > 0 and o["pHolmUpper"] <= 0.05:
        v = "没有预测力（高位之后反而更好）"
    else:
        v = "没有预测力"
    return v, {"G1": g1, "G2": g2, "G3": g3, "G4": g4}


# ---------------------------------------------------------------- P49
def panel(kf: dict, inds: list[str], placebo: bool) -> dict:
    cols_p, cols_r, cols_d, cols_ret = [], [], [], []
    valid = None
    for nm in inds:
        p = pctile(kf[nm]["x"])
        r, d = fwd(kf[nm]["v"], 12)
        ok = frozenset(np.nonzero(~(np.isnan(p) | np.isnan(r) | np.isnan(d)))[0].tolist())
        if valid is None:
            valid = ok
        elif ok != valid:
            raise SystemExit(f"P49：{nm} 有效月份与其他行业不同")
        cols_p.append(p)
        cols_r.append(r)
        cols_d.append(d)
        cols_ret.append(kf[nm]["ret"])
    months = sorted(valid)
    idx = np.array(months)
    n, m = idx.size, len(inds)
    Pm = np.empty((n, m))
    Rm = np.empty((n, m))
    Dm = np.empty((n, m))
    Sm = np.empty(m)
    for j in range(m):
        Pm[:, j] = cols_p[j][idx]
        Rm[:, j] = cols_r[j][idx]
        Dm[:, j] = cols_d[j][idx]
        Sm[j] = np.std(cols_ret[j][idx] / 100.0, ddof=1) * math.sqrt(12.0)
    betas = np.array([slope(Pm[:, j], Rm[:, j]) for j in range(m)])
    bbar = float(betas.mean())
    top = Pm >= 0.8
    crash = Dm <= -0.30
    out = {
        "since": mstr(KF_START),
        "from": mstr(months[0]),
        "to": mstr(months[-1]),
        "months": n,
        "industries": m,
        "betaBar": bbar,
        "nNeg": int((betas < 0).sum()),
        "betaMedian": float(np.median(betas)),
        "betaBarVolScaled": float(np.mean(betas / Sm)),
        "betas": {nm: float(b) for nm, b in zip(inds, betas)},
        "crash30": {
            "top": float(crash[top].mean()),
            "rest": float(crash[~top].mean()),
            "nTop": int(top.sum()),
            "nRest": int((~top).sum()),
        },
        "dRpooled": float(Rm[top].mean() - Rm[~top].mean()),
    }
    if placebo:
        ks = range(24, n - 24 + 1)
        le = 0
        for k in ks:
            Pk = np.roll(Pm, k, axis=0)
            bk = sum(slope_fast(Pk[:, j], Rm[:, j]) for j in range(m)) / m
            le += bk <= bbar
        out["pLower"] = (le + 1) / (len(ks) + 1)
        out["shifts"] = len(ks)
        if bbar < 0 and out["pLower"] <= 0.05 and out["nNeg"] >= 30:
            out["verdict"] = "行业层面有预测力" + ("（边缘）" if out["pLower"] > 0.02 else "")
        elif bbar < 0:
            out["verdict"] = "行业层面方向偏负、不显著"
        else:
            out["verdict"] = "行业层面没有预测力"
    return out


def main() -> None:
    spx = read_spx()
    kf = read_kf()
    sig: dict[str, tuple[np.ndarray, np.ndarray]] = {}
    for key, name in (("R1", "rut"), ("H1", "hsi"), ("A1", "ssec")):
        sig[key] = read_daily(name)
    sig["E1"] = (kf["energy"]["x"], kf["energy"]["v"])
    sig["F1"] = (kf["fin"]["x"], kf["fin"]["v"])
    fam = ["R1", "H1", "A1", "E1", "F1"]
    pct = {k: pctile(sig[k][0]) for k in fam}

    main_ = {k: block(pct[k], sig[k][1], 12, 0.8, True) for k in fam}
    lo = holm([main_[k]["pLower"] for k in fam])
    hi = holm([main_[k]["pUpper"] for k in fam])
    for k, a, b in zip(fam, lo, hi):
        main_[k]["pHolm"] = a
        main_[k]["pHolmUpper"] = b
        main_[k]["verdict"], main_[k]["gates"] = verdict(main_[k])

    inds = [nm for nm in kf if nm not in ("energy", "fin")]
    assert len(inds) == 49
    p49 = panel(kf, inds, True)
    ex = panel(kf, [nm for nm in inds if nm not in ("Hardw", "Softw", "Chips")], False)

    current = {}
    for k in fam:
        x = sig[k][0]
        last = max(t for t in range(M_END) if not np.isnan(x[t]))
        current[k] = {"month": mstr(last), "value": float(x[last]), "pct": float(pct[k][last])}

    res = {
        "main": main_,
        "P49": p49,
        "report": {
            "spxTarget": {k: block(pct[k], spx, 12, 0.8, False) for k in ("R1", "E1", "F1")},
            "top90": {k: block(pct[k], sig[k][1], 12, 0.9, False) for k in fam},
            "h6": {k: block(pct[k], sig[k][1], 6, 0.8, False) for k in fam},
            "p49exTech": ex,
            "E1ex1979_82": excl_block(pct["E1"], sig["E1"][1], "1979-01", "1982-12"),
            "F1ex2006_08": excl_block(pct["F1"], sig["F1"][1], "2006-01", "2008-12"),
            "current": current,
        },
    }
    js = json.dumps(res, ensure_ascii=False, indent=1)
    if len(sys.argv) > 1:
        Path(sys.argv[1]).write_text(js)
    for k in fam:
        o = main_[k]
        print(
            f"{k} n={o['n']} {o['from']}..{o['to']} β={o['beta']:+.4f} pLo={o['pLower']:.4f} "
            f"Holm={o['pHolm']:.4f} HolmUp={o['pHolmUpper']:.4f} ΔR={o['dR']:+.4f} ΔD={o['dD']:+.4f} "
            f"halves={o['halves'][0]['beta']:+.4f}/{o['halves'][1]['beta']:+.4f} → {o['verdict']}"
        )
    print(
        f"P49 n={p49['months']} β̄={p49['betaBar']:+.4f} pLo={p49['pLower']:.4f} nNeg={p49['nNeg']} "
        f"→ {p49['verdict']}"
    )


if __name__ == "__main__":
    main()
