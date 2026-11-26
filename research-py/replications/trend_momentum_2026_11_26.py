"""L-036 多资产「趋势 + 动量」轮动的独立第二实现（只按 PREREG.md 文字与输入文件实现，未参考 run.py）。

运行：
    cd research-py && uv run python replications/trend_momentum_2026_11_26.py
    cd research-py && uv run python replications/trend_momentum_2026_11_26.py --json out.json

结构：不用 pandas。月份编码为整数 y*12+(m-1)，网格 1974-12..2025-12；收益与总收益指数放进
(月份 × 资产) 的 numpy 矩阵，缺失为 NaN。列顺序 US, EXUS, BOND, GOLD, CASH。

PREREG 没写死、这里做出的选择：
  1. 成本 = Σ_i c_i |w_{t+1,i} − w̃_{t,i}|（5 列逐列，现金 c=0）；首个持有月不计交易成本，持有费照收。
  2. 成本倍数（0、2）只乘交易成本 c，持有费不变；基准同倍数。
  3. 同波动 B：波动 = 月净收益 std(ddof=1)；scale = vol_候选/vol_B；scale ≤ 1 时
     月收益 = scale × r_B净 + (1 − scale) × RF（线性混合，不额外计成本）。
  4. 美股大跌段：用美股原始月收益（不扣费）的月末净值，1977-12 = 1，持有月 1978-01..2025-12；
     回撤 ≥ 20% 的段：高点 = 之前的最高月末，低点 = 恢复到新高前（或样本末）的最低月末；
     区间收益 = 高点后一个月至低点各月净收益连乘 − 1。表中「US」= 只持有美股参照（扣 0.03% 费）。
  5. 每年换手 = 第 2..N 个持有月的 Σ_i|w − w̃|（含现金列）均值 × 12。
  6. 安慰剂：np.roll(W, k, axis=0)，k = 24..552；k 集合关于 N=576 对称，方向不影响 p。
  7. DEVX：基点 1990-06 = 1，第一个信号月 1991-06，持有 1991-07..2025-12；持有费与成本沿用 EXUS。
"""
from __future__ import annotations

import argparse
import csv
import json
from functools import cmp_to_key
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
RESEARCH = ROOT / "docs" / "research"
FF = RESEARCH / "trend-1871-2026-11-26" / "inputs" / "ff-factors.json"
PROC = RESEARCH / "defensive-trend-2026-11-26" / "inputs" / "processed"
DEVX_CSV = RESEARCH / "country-momentum-2026-11-26" / "inputs" / "Developed_ex_US_3_Factors.csv"
BOND_CSV = ROOT / "research-py" / "data" / "processed" / "bond5_daily.csv"
GOLD_CSV = ROOT / "research-py" / "data" / "processed" / "gold_daily.csv"

FOREIGN13 = ["Australia", "Belgium", "Canada", "France", "Germany", "Italy", "Japan",
             "Netherlands", "Norway", "Spain", "Sweden", "Switzerland", "UK"]

NAMES = ["US", "EXUS", "BOND", "GOLD"]          # 风险资产列 0..3，第 4 列 CASH
ALPHA = {"BOND": 0, "EXUS": 1, "GOLD": 2, "US": 3}
COST = np.array([0.0010, 0.0010, 0.0005, 0.0015, 0.0])
FEE = np.array([0.0003, 0.0007, 0.0015, 0.0040, 0.0])
TIE = 1e-12


def mcode(y: int, m: int) -> int:
    return y * 12 + (m - 1)


def parse_month(s: str) -> int:
    s = s.strip()
    if "-" in s:
        return mcode(int(s[:4]), int(s[5:7]))
    return mcode(int(s[:4]), int(s[4:6]))


def mstr(c: int) -> str:
    return f"{c // 12:04d}-{c % 12 + 1:02d}"


G0 = mcode(1974, 12)
G1 = mcode(2025, 12)
NG = G1 - G0 + 1


def pos(y: int, m: int) -> int:
    return mcode(y, m) - G0


# ---------------------------------------------------------------- 数据
def load_returns():
    """返回 (NG × 5) 收益矩阵（US, EXUS, BOND, GOLD, CASH）与 DEVX 收益列。"""
    R = np.full((NG, 5), np.nan)
    ff = json.loads(FF.read_text())
    for month, mkt, rf in ff["rows"]:
        p = parse_month(month) - G0
        if 1 <= p < NG:  # 只用 1975-01 起
            R[p, 0] = (mkt + rf) / 100.0
            R[p, 4] = rf / 100.0

    # 13 国等权
    eq = np.full((NG, 13), np.nan)
    for j, c in enumerate(FOREIGN13):
        with open(PROC / f"{c}.csv", newline="") as fh:
            for row in csv.DictReader(fh):
                p = parse_month(row["month"]) - G0
                if 0 <= p < NG and row["equity_usd"].strip() != "":
                    eq[p, j] = float(row["equity_usd"])
    full = ~np.isnan(eq).any(axis=1)
    R[full, 1] = eq[full].sum(axis=1) / 13.0

    # 国债：月内有 ret 的交易日复利
    acc: dict[int, float] = {}
    with open(BOND_CSV, newline="") as fh:
        for row in csv.DictReader(fh):
            if row["ret"].strip() == "":
                continue
            p = parse_month(row["date"][:7]) - G0
            if 1 <= p < NG:
                acc[p] = acc.get(p, 1.0) * (1.0 + float(row["ret"]))
    for p, v in acc.items():
        R[p, 2] = v - 1.0

    # 黄金：月末价 / 上月末价 − 1
    last: dict[int, float] = {}
    with open(GOLD_CSV, newline="") as fh:
        for row in csv.DictReader(fh):
            if row["price"].strip() == "":
                continue
            p = parse_month(row["date"][:7]) - G0
            if 0 <= p < NG:
                last[p] = float(row["price"])  # 文件按日期升序，最后写入即月末
    for p in range(NG):
        if p in last and (p - 1) in last:
            R[p, 3] = last[p] / last[p - 1] - 1.0

    # DEVX（Developed ex US，自带 RF）
    devx = np.full(NG, np.nan)
    with open(DEVX_CSV, newline="") as fh:
        lines = fh.read().splitlines()
    started = False
    for ln in lines:
        cells = [x.strip() for x in ln.split(",")]
        if not started:
            if len(cells) >= 5 and cells[1] == "Mkt-RF":
                started = True
            continue
        if len(cells) < 5 or not cells[0].isdigit() or len(cells[0]) != 6:
            break  # 月表结束（空行或年表）
        mk, rf = float(cells[1]), float(cells[4])
        if mk <= -99.99 or rf <= -99.99:
            continue
        p = parse_month(cells[0]) - G0
        if 0 <= p < NG:
            devx[p] = (mk + rf) / 100.0
    return R, devx


def build_index(r: np.ndarray, base: int) -> np.ndarray:
    I = np.full(len(r), np.nan)
    I[base] = 1.0
    for p in range(base + 1, len(r)):
        I[p] = I[p - 1] * (1.0 + r[p])
    return I


# ---------------------------------------------------------------- 信号
def mom_at(I: np.ndarray, t: int, kind: str) -> np.ndarray:
    if kind == "avg":
        return ((I[t] / I[t - 3] - 1) + (I[t] / I[t - 6] - 1) + (I[t] / I[t - 12] - 1)) / 3.0
    return I[t] / I[t - 12] - 1


def broken_at(I: np.ndarray, t: int) -> np.ndarray:
    return I[t] < I[t - 9:t + 1].mean(axis=0)


def order_at(mom: np.ndarray) -> list[int]:
    def cmp(a, b):
        d = mom[a] - mom[b]
        if abs(d) < TIE:
            return ALPHA[NAMES[a]] - ALPHA[NAMES[b]]
        return -1 if d > 0 else 1
    return sorted(range(4), key=cmp_to_key(cmp))


def w_rotation(I, t, n, kind="avg", filt=True):
    w = np.zeros(5)
    m = mom_at(I, t, kind)
    assert not np.isnan(m).any()
    brk = broken_at(I, t)
    for a in order_at(m)[:n]:
        w[4 if (filt and brk[a]) else a] += 1.0 / n
    return w


def w_trend(I, t, filtered=(0, 1, 2, 3)):
    w = np.zeros(5)
    brk = broken_at(I, t)
    assert not np.isnan(I[t - 9:t + 1]).any()
    for a in range(4):
        w[4 if (a in filtered and brk[a]) else a] += 0.25
    return w


def weights(fn, sigs):
    return np.array([fn(t) for t in sigs])


# ---------------------------------------------------------------- 回测
def simulate(W: np.ndarray, R: np.ndarray, cmult: float = 1.0):
    gross = np.einsum("ij,ij->i", W, R)
    drift = W * (1.0 + R) / (1.0 + gross)[:, None]
    turn = np.zeros(len(W))
    turn[1:] = np.abs(W[1:] - drift[:-1]) @ (COST * cmult)
    net = gross - turn - W @ FEE / 12.0
    return net


def turnover_per_year(W, R):
    gross = np.einsum("ij,ij->i", W, R)
    drift = W * (1.0 + R) / (1.0 + gross)[:, None]
    return float(np.abs(W[1:] - drift[:-1]).sum(axis=1).mean() * 12)


def sharpe(net, rf):
    ex = net - rf
    return float(ex.mean() / ex.std(ddof=1) * np.sqrt(12))


def stats(net, rf):
    nav = np.concatenate([[1.0], np.cumprod(1.0 + net)])
    peak = np.maximum.accumulate(nav)
    return {
        "sharpe": sharpe(net, rf),
        "cagr": float(nav[-1] ** (12.0 / len(net)) - 1),
        "maxDd": float((nav / peak - 1).min()),
        "vol": float(net.std(ddof=1) * np.sqrt(12)),
        "months": int(len(net)),
    }


def holm(ps: list[float]) -> list[float]:
    order = sorted(range(len(ps)), key=lambda i: ps[i])
    out = [0.0] * len(ps)
    run = 0.0
    for rank, i in enumerate(order):
        run = max(run, min(1.0, (len(ps) - rank) * ps[i]))
        out[i] = run
    return out


def verdict(g):
    if all(g[k] for k in ("G1", "G2", "G3", "G4", "G5")):
        return "通过"
    if g["G1"] and g["G2"] and g["G3"] and g["G5"] and not g["G4"]:
        return "风险调整更好，但收益或回撤不达标"
    if g["G2"] and g["G3"] and g["G4"] and g["G5"] and not g["G1"]:
        return "方向一致，统计上不显著"
    if g["dSfull"] > 0:
        return "不稳定"
    return "不通过"


# ---------------------------------------------------------------- 主流程
def run():
    R, devx = load_returns()
    I = np.full((NG, 4), np.nan)
    I[:, 0] = build_index(R[:, 0], pos(1974, 12))
    I[:, 1] = build_index(R[:, 1], pos(1976, 12))
    I[:, 2] = build_index(R[:, 2], pos(1974, 12))
    I[:, 3] = build_index(R[:, 3], pos(1975, 1))

    s0, s1 = pos(1977, 12), pos(2025, 11)
    sigs = np.arange(s0, s1 + 1)
    hold = sigs + 1
    N = len(hold)
    assert N == 576
    RH = R[hold]
    assert not np.isnan(RH).any()
    rf = RH[:, 4]

    windows = {"full": (0, N), "half1": (0, 288), "half2": (288, N),
               "post2010": (pos(2010, 1) - hold[0], N), "post2008": (pos(2008, 1) - hold[0], N)}

    def wstats(net, rfx=rf):
        return {k: stats(net[a:b], rfx[a:b]) for k, (a, b) in windows.items()}

    WB = np.tile([0.25, 0.25, 0.25, 0.25, 0.0], (N, 1))
    netB = simulate(WB, RH)
    SB = wstats(netB)

    def compare(Wc, cmult=1.0, netb=None):
        netc = simulate(Wc, RH, cmult)
        nb = netB if netb is None else netb
        sc, sb = wstats(netc), wstats(nb)
        return netc, {k: {"cand": sc[k], "bench": sb[k], "dS": sc[k]["sharpe"] - sb[k]["sharpe"]} for k in windows}

    cands = {
        "T1": weights(lambda t: w_rotation(I, t, 2), sigs),
        "T2": weights(lambda t: w_trend(I, t), sigs),
    }
    shifts = list(range(24, 553))
    main = {}
    nets = {}
    for name, W in cands.items():
        netc, cmp_ = compare(W)
        nets[name] = netc
        dS = cmp_["full"]["dS"]
        dk = np.array([sharpe(simulate(np.roll(W, k, axis=0), RH), rf) - SB["full"]["sharpe"] for k in shifts])
        p = float(((dk >= dS).sum() + 1) / (len(shifts) + 1))
        # G5：t 月末信号 t+2 月持有，从 1978-02 起
        Wd = W[:-1]
        netd = simulate(Wd, RH[1:])
        dS5 = sharpe(netd, rf[1:]) - sharpe(netB[1:], rf[1:])
        main[name] = {**cmp_, "placebo": {"p": p, "shifts": len(shifts), "dSk_min": float(dk.min()),
                                          "dSk_max": float(dk.max()), "dSk_mean": float(dk.mean())},
                      "delay": {"cand": stats(netd, rf[1:]), "bench": stats(netB[1:], rf[1:]), "dS": dS5}}
    ph = holm([main["T1"]["placebo"]["p"], main["T2"]["placebo"]["p"]])
    for name, adj in zip(("T1", "T2"), ph):
        m = main[name]
        m["placebo"]["pHolm"] = adj
        f = m["full"]
        g = {
            "dSfull": f["dS"],
            "G1": f["dS"] > 0 and adj <= 0.05,
            "G2": m["half1"]["dS"] > 0 and m["half2"]["dS"] > 0,
            "G3": m["post2010"]["dS"] > 0,
            "G4": (f["cand"]["maxDd"] - f["bench"]["maxDd"] >= 0.05) and (f["cand"]["cagr"] >= f["bench"]["cagr"] - 0.01),
            "G5": m["delay"]["dS"] > 0,
        }
        m["gates"] = {k: bool(v) for k, v in g.items() if k != "dSfull"}
        m["verdict"] = verdict(g)

    rep = {}
    # 1、2：变体
    variants = {
        "T1_top1": lambda t: w_rotation(I, t, 1),
        "T1_top3": lambda t: w_rotation(I, t, 3),
        "T1_mom12": lambda t: w_rotation(I, t, 2, kind="12"),
        "T1_noFilter": lambda t: w_rotation(I, t, 2, filt=False),
        "T2prime": lambda t: w_trend(I, t, filtered=(2, 3)),
    }
    rep["variants"] = {k: compare(weights(fn, sigs))[1] for k, fn in variants.items()}
    # 3：成本倍数
    rep["costMult"] = {}
    for cm in (0.0, 2.0):
        nb = simulate(WB, RH, cm)
        rep["costMult"][str(cm)] = {n: compare(W, cm, nb)[1] for n, W in cands.items()}
    # 4：静态参照
    statics = {"US": [1, 0, 0, 0, 0], "US60_BOND40": [0.6, 0, 0.4, 0, 0],
               "US70_CASH30": [0.7, 0, 0, 0, 0.3], "US80_CASH20": [0.8, 0, 0, 0, 0.2]}
    static_net = {}
    rep["static"] = {}
    for k, w in statics.items():
        static_net[k] = simulate(np.tile(np.array(w, float), (N, 1)), RH)
        rep["static"][k] = {wk: stats(static_net[k][a:b], rf[a:b]) for wk, (a, b) in windows.items()
                            if wk != "post2008"}
    # 固定平均权重
    rep["fixedAvgWeights"] = {}
    for n, W in cands.items():
        wbar = W.mean(axis=0)
        rep["fixedAvgWeights"][n] = {"weights": dict(zip(NAMES + ["CASH"], map(float, wbar))),
                                     **compare(np.tile(wbar, (N, 1)))[1]}
    # 同波动 B
    rep["volMatchedB"] = {}
    for n in cands:
        vc, vb = nets[n].std(ddof=1), netB.std(ddof=1)
        scale = float(vc / vb)
        d = {"scale": scale}
        if scale <= 1:
            nm = scale * netB + (1 - scale) * rf
            d["stats"] = stats(nm, rf)
            d["cand"] = stats(nets[n], rf)
        rep["volMatchedB"][n] = d
    # post2008
    rep["post2008dS"] = {n: main[n]["post2008"]["dS"] for n in cands}

    # DEVX 版本
    Rd = R.copy()
    Rd[:, 1] = devx
    Id = I.copy()
    Id[:, 1] = build_index(devx, pos(1990, 6))
    sd = np.arange(pos(1991, 6), pos(2025, 11) + 1)
    hd = sd + 1
    RHd = Rd[hd]
    assert not np.isnan(RHd).any() and len(hd) == 414
    rfd = RHd[:, 4]
    WBd = np.tile([0.25, 0.25, 0.25, 0.25, 0.0], (len(hd), 1))
    nBd = simulate(WBd, RHd)
    p2010 = pos(2010, 1) - hd[0]
    rep["devx"] = {"firstHold": mstr(hd[0] + G0), "months": int(len(hd))}
    for n, fn in (("T1", lambda t: w_rotation(Id, t, 2)), ("T2", lambda t: w_trend(Id, t))):
        nc = simulate(weights(fn, sd), RHd)
        rep["devx"][n] = {
            "full": {"cand": stats(nc, rfd), "bench": stats(nBd, rfd), "dS": sharpe(nc, rfd) - sharpe(nBd, rfd)},
            "post2010": {"cand": stats(nc[p2010:], rfd[p2010:]), "bench": stats(nBd[p2010:], rfd[p2010:]),
                         "dS": sharpe(nc[p2010:], rfd[p2010:]) - sharpe(nBd[p2010:], rfd[p2010:])},
        }

    # 5：美股大跌段
    navU = np.concatenate([[1.0], np.cumprod(1.0 + RH[:, 0])])  # navU[i] = 第 i 个持有月末，0 = 1977-12
    segs = []
    i, peak_i = 1, 0
    while i < len(navU):
        if navU[i] >= navU[peak_i]:
            peak_i = i
            i += 1
            continue
        if navU[i] / navU[peak_i] - 1 <= -0.20:
            j = i
            while j < len(navU) and navU[j] < navU[peak_i]:
                j += 1
            trough = peak_i + 1 + int(np.argmin(navU[peak_i + 1:j]))
            segs.append((peak_i, trough))
            peak_i = j if j < len(navU) else peak_i
            i = j + 1 if j < len(navU) else j
            continue
        i += 1
    series = {"US": static_net["US"], "B": netB, "T1": nets["T1"], "T2": nets["T2"],
              "US60_BOND40": static_net["US60_BOND40"]}
    rep["usBear"] = []
    for pk, tr in segs:
        # nav 下标 i 对应持有月 hold[i-1]；区间收益 = 高点后一个月（nav 下标 pk+1）至低点（tr）
        d = {"peak": mstr(G0 + hold[0] - 1 + pk), "trough": mstr(G0 + hold[0] - 1 + tr),
             "usDd": float(navU[tr] / navU[pk] - 1)}
        for k, s in series.items():
            d[k] = float(np.prod(1.0 + s[pk:tr]) - 1)
        rep["usBear"].append(d)

    # 6：平均权重、现金、换手
    rep["avgWeights"] = {}
    for n, W in list(cands.items()) + [("B", WB)]:
        rep["avgWeights"][n] = {**dict(zip(NAMES + ["CASH"], map(float, W.mean(axis=0)))),
                                "turnoverPerYear": turnover_per_year(W, RH)}

    # 7：当前信号（2025-12 月末）
    t = pos(2025, 12)
    m = mom_at(I, t, "avg")
    rep["current"] = {
        "signalMonth": "2025-12",
        "mom": dict(zip(NAMES, map(float, m))),
        "index": dict(zip(NAMES, map(float, I[t]))),
        "ma10": dict(zip(NAMES, map(float, I[t - 9:t + 1].mean(axis=0)))),
        "broken": dict(zip(NAMES, map(bool, broken_at(I, t)))),
        "rank": [NAMES[a] for a in order_at(m)],
        "T1": dict(zip(NAMES + ["CASH"], map(float, w_rotation(I, t, 2)))),
        "T2": dict(zip(NAMES + ["CASH"], map(float, w_trend(I, t)))),
    }
    series = {"T1": nets["T1"].tolist(), "T2": nets["T2"].tolist(), "B": netB.tolist()}
    return {"main": main, "report": rep, "series": series}


def show(res):
    def line(tag, x):
        c, b = x["cand"], x["bench"]
        print(f"  {tag:9s} ΔS {x['dS']:+.6f} | S {c['sharpe']:.6f}/{b['sharpe']:.6f} | CAGR {c['cagr']:.4%}/{b['cagr']:.4%}"
              f" | MDD {c['maxDd']:.4%}/{b['maxDd']:.4%}")

    for n, m in res["main"].items():
        pl = m["placebo"]
        print(f"== {n}  p={pl['p']:.6f} Holm={pl['pHolm']:.6f}  {m['gates']} → {m['verdict']}")
        for w in ("full", "half1", "half2", "post2010", "post2008"):
            line(w, m[w])
        line("delay", m["delay"])
    r = res["report"]
    print("== 变体")
    for k, v in r["variants"].items():
        print(f" {k}")
        for w in ("full", "half1", "half2", "post2010"):
            line(w, v[w])
    print("== 成本倍数")
    for cm, d in r["costMult"].items():
        for n, v in d.items():
            line(f"{n}x{cm}", v["full"])
    print("== 静态参照")
    for k, d in r["static"].items():
        print(f"  {k:12s} " + " | ".join(f"{w} S {s['sharpe']:.4f} CAGR {s['cagr']:.4%} MDD {s['maxDd']:.4%}" for w, s in d.items()))
    print("== 固定平均权重")
    for n, d in r["fixedAvgWeights"].items():
        print(f"  {n} w={ {k: round(v, 4) for k, v in d['weights'].items()} }")
        line("full", d["full"])
    print("== 同波动 B", json.dumps(r["volMatchedB"], ensure_ascii=False))
    print("== DEVX")
    for n in ("T1", "T2"):
        line(f"{n} full", r["devx"][n]["full"])
        line(f"{n} p2010", r["devx"][n]["post2010"])
    print("== 美股大跌段")
    for d in r["usBear"]:
        print("  " + " ".join(f"{k}={v:.4f}" if isinstance(v, float) else f"{k}={v}" for k, v in d.items()))
    print("== 平均权重", json.dumps(r["avgWeights"], ensure_ascii=False))
    print("== 当前信号", json.dumps(r["current"], ensure_ascii=False))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--json")
    a = ap.parse_args()
    res = run()
    show(res)
    if a.json:
        Path(a.json).write_text(json.dumps(res, ensure_ascii=False, indent=1))
