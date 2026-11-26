"""L-037 美股板块轮动的独立第二实现（只按 PREREG.md 文字与输入文件实现，写完并出数之前未参考 run.py / results.json）。

运行：
    cd research-py && uv run python replications/sector_rotation_2026_11_26.py
    cd research-py && uv run python replications/sector_rotation_2026_11_26.py --json out.json

结构：不用 pandas。月份编码为整数 y*12+(m-1)；每个数据源读成「起始月 + (月 × 资产) numpy 矩阵」，
用整数下标对齐。组合引擎完全向量化：因为每月都再平衡回目标权重，漂移权重 w̃_t 只取决于 W_t 与 R_t，
所以无路径依赖，cost_t = c·Σ|W_t − w̃_{t−1}| 可一次算出；安慰剂把 1,144 个平移版本叠成 (K × T × N) 一次算。

只覆盖确认项（G1–G6 用到的全部数字）+ 当前入选 + 每年换手；其余探索项不实现。

PREREG 文字里的解读：
  1. S1(t) = Π_{s=t−11}^{t−1}(1+r_s) − 1；S2(t) = mean(Π_{t−2..t}, Π_{t−5..t}, Π_{t−11..t}) − 1 各自减 1 后平均。
  2. 并列：列先按代码 ASCII 排序，再对 −mom 做 stable argsort，取前 3（并列时 ASCII 靠前者优先）。
  3. 首个持有月不计交易成本，照扣 f/12；买卖各计一次：cost = c·Σ|Δw|（不是 ½）。
  4. 每年换手 = mean_t(½Σ|Δw_t|)（首月记 0，计入均值分母）× 12。
  5. 子区间从全样本净收益截取；MDD 在截取段上净值从 1 起、1 计入峰值。
  6. 安慰剂：np.roll(sel, k, axis=0)，k = 24..1167；ΔS_k ≥ ΔS − 1e-12 计为「≥」；p = (n≥ + 1)/(K + 1)。
  7. Holm（2 个）：p(1)·2、max(p(1)·2, p(2)·1)，截到 ≤ 1，按原顺序返回。
  8. 晚一个月：t 月末信号 → t+2 月持有，持有 1927-08..2026-09（1,190 月），候选首月免成本；
     EW 从主运行截取 1927-08..2026-09（EW 该月计了成本）。
  9. ETF：月收益 = p_t/p_{t−1} − 1（1999-01 起），持有 2000-01..2026-09（321 月）统计；
     c = 0.0005、f = 0；SPY 无成本；RF 取 ff-factors.json 同月。
"""
from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
STUDY = ROOT / "docs" / "research" / "sector-rotation-2026-11-26"
KF_CSV = STUDY / "inputs" / "processed" / "kf12_vw.csv"
ETF_CSV = STUDY / "inputs" / "processed" / "etf_month_end_adjclose.csv"
FF_JSON = ROOT / "docs" / "research" / "trend-1871-2026-11-26" / "inputs" / "ff-factors.json"

KF11 = ["NoDur", "Durbl", "Manuf", "Enrgy", "Chems", "BusEq", "Telcm", "Utils", "Shops", "Hlth", "Money"]
ETF9 = ["XLB", "XLE", "XLF", "XLI", "XLK", "XLP", "XLU", "XLV", "XLY"]
TOP = 3
K_LO, K_HI = 24, 1167


def mi(s: str) -> int:
    y, m = s.split("-")
    return int(y) * 12 + int(m) - 1


def ms(i: int) -> str:
    return f"{i // 12:04d}-{i % 12 + 1:02d}"


class Panel:
    """起始月 m0 + 矩阵 X（行 = 连续月份）。"""

    def __init__(self, m0: int, X: np.ndarray, cols: list[str]):
        self.m0, self.X, self.cols = m0, X, cols

    def row(self, m: int) -> int:
        r = m - self.m0
        assert 0 <= r < len(self.X), ms(m)
        return r

    def rows(self, a: int, b: int) -> np.ndarray:  # 含两端
        return self.X[self.row(a): self.row(b) + 1]


def read_csv_panel(path: Path, cols: list[str]) -> tuple[int, list[str], np.ndarray]:
    with path.open() as fh:
        rd = csv.reader(fh)
        head = next(rd)
        idx = [head.index(c) for c in cols]
        months, vals = [], []
        for r in rd:
            months.append(mi(r[0]))
            vals.append([float(r[j]) if r[j] != "" else math.nan for j in idx])
    assert months == list(range(months[0], months[0] + len(months))), "月份不连续"
    return months[0], months, np.array(vals)


def load():
    # ASCII 序排列列
    kf_cols = sorted(KF11)
    m0, _, X = read_csv_panel(KF_CSV, kf_cols)
    assert not np.isnan(X).any()
    kf = Panel(m0, X / 100.0, kf_cols)

    etf_cols = sorted(ETF9) + ["SPY"]
    p0, _, P = read_csv_panel(ETF_CSV, etf_cols)
    start = mi("1998-12")
    P = P[start - p0:]
    assert not np.isnan(P).any()
    etf = Panel(start + 1, P[1:] / P[:-1] - 1.0, etf_cols)

    ff = json.loads(FF_JSON.read_text())
    rows = ff["rows"]
    f0 = mi(rows[0][0])
    assert [mi(r[0]) for r in rows] == list(range(f0, f0 + len(rows)))
    A = np.array([[r[1], r[2]] for r in rows], dtype=float)
    mkt = Panel(f0, ((A[:, 0] + A[:, 1]) / 100.0)[:, None], ["MKT"])
    rf = Panel(f0, (A[:, 1] / 100.0)[:, None], ["RF"])
    return kf, etf, mkt, rf


# ---------- 信号 ----------

def mom_s1(R: Panel, t: int) -> np.ndarray:
    return np.prod(1.0 + R.rows(t - 11, t - 1), axis=0) - 1.0


def mom_s2(R: Panel, t: int) -> np.ndarray:
    tot = [np.prod(1.0 + R.rows(t - L + 1, t), axis=0) - 1.0 for L in (3, 6, 12)]
    return (tot[0] + tot[1] + tot[2]) / 3.0


MOM = {"S1": mom_s1, "S2": mom_s2}


def pick(mom: np.ndarray) -> tuple[np.ndarray, float]:
    order = np.argsort(-mom, kind="stable")
    sel = np.zeros(len(mom))
    sel[order[:TOP]] = 1.0
    return sel, float(mom[order[TOP - 1]] - mom[order[TOP]])


def selection(R: Panel, cand: str, sig_a: int, sig_b: int) -> tuple[np.ndarray, int]:
    """信号月 sig_a..sig_b 的 0/1 入选矩阵；返回并列（第 3、4 名差 < 1e-9）月数。"""
    out, ties = [], 0
    for t in range(sig_a, sig_b + 1):
        s, gap = pick(MOM[cand](R, t))
        out.append(s)
        ties += gap < 1e-9
    return np.array(out), ties


# ---------- 组合引擎 ----------

def engine(W: np.ndarray, R: np.ndarray, c: float, f: float):
    """W, R: (..., T, N)。返回净收益 (..., T) 与每月 ½Σ|Δw|。首月不计成本。"""
    g = np.sum(W * R, axis=-1)
    drift = W * (1.0 + R) / (1.0 + g)[..., None]
    trade = np.zeros(g.shape)
    trade[..., 1:] = np.sum(np.abs(W[..., 1:, :] - drift[..., :-1, :]), axis=-1)
    net = g - c * trade - f / 12.0
    return net, 0.5 * trade


def sharpe(net: np.ndarray, rf: np.ndarray) -> np.ndarray:
    x = net - rf
    return x.mean(axis=-1) / x.std(axis=-1, ddof=1) * math.sqrt(12.0)


def cagr(net: np.ndarray) -> float:
    return float(np.prod(1.0 + net) ** (12.0 / len(net)) - 1.0)


def mdd(net: np.ndarray) -> float:
    nav = np.concatenate([[1.0], np.cumprod(1.0 + net)])
    return float(np.min(nav / np.maximum.accumulate(nav) - 1.0))


def stats(net: np.ndarray, rf: np.ndarray) -> dict:
    return {"sharpe": float(sharpe(net, rf)), "cagr": cagr(net), "mdd": mdd(net), "n": int(len(net))}


def holm(ps: list[float]) -> list[float]:
    m = len(ps)
    order = sorted(range(m), key=lambda i: ps[i])
    adj, run = [0.0] * m, 0.0
    for rank, i in enumerate(order):
        run = max(run, min(1.0, (m - rank) * ps[i]))
        adj[i] = run
    return adj


# ---------- 主程序 ----------

def main() -> dict:
    kf, etf, mkt, rf = load()
    H_A, H_B = mi("1927-07"), mi("2026-09")
    T = H_B - H_A + 1
    assert T == 1191
    hold = np.arange(H_A, H_B + 1)
    R = kf.rows(H_A, H_B)
    RF = rf.rows(H_A, H_B)[:, 0]
    MKTR = mkt.rows(H_A, H_B)

    periods = {
        "full": (H_A, H_B),
        "half1": (mi("1927-07"), mi("1976-12")),
        "half2": (mi("1977-01"), H_B),
        "post2000": (mi("2000-01"), H_B),
    }

    def cut(x, a, b, base=H_A):
        return x[a - base: b - base + 1]

    N = len(kf.cols)
    ew_net, ew_to = engine(np.full((T, N), 1.0 / N), R, 0.001, 0.001)
    mkt_net, _ = engine(np.ones((T, 1)), MKTR, 0.0, 0.0003)

    res: dict = {"kf": {}, "etf": {}, "placebo": {}, "delay": {}, "gates": {}, "picks": {}}
    res["kf"]["EW"] = {p: stats(cut(ew_net, a, b), cut(RF, a, b)) for p, (a, b) in periods.items()}
    res["kf"]["MKT"] = {p: stats(cut(mkt_net, a, b), cut(RF, a, b)) for p, (a, b) in periods.items()}
    res["kf"]["EW"]["turnover"] = float(ew_to.mean() * 12)

    sels = {}
    pvals = {}
    for cand in ("S1", "S2"):
        sel, ties = selection(kf, cand, H_A - 1, H_B - 1)  # 信号 t → 持有 t+1
        sels[cand] = sel
        W = sel / TOP
        net, to = engine(W, R, 0.001, 0.001)
        d = {p: stats(cut(net, a, b), cut(RF, a, b)) for p, (a, b) in periods.items()}
        for p in periods:
            d[p]["dS_ew"] = d[p]["sharpe"] - res["kf"]["EW"][p]["sharpe"]
            d[p]["dS_mkt"] = d[p]["sharpe"] - res["kf"]["MKT"][p]["sharpe"]
        d["turnover"] = float(to.mean() * 12)
        d["ties"] = ties
        d["sel_months"] = {kf.cols[j]: int(sel[:, j].sum()) for j in range(N)}
        res["kf"][cand] = d

        # 安慰剂
        ks = np.arange(K_LO, K_HI + 1)
        Wk = np.stack([np.roll(W, k, axis=0) for k in ks])
        net_k, _ = engine(Wk, R[None], 0.001, 0.001)
        dSk = sharpe(net_k, RF[None]) - res["kf"]["EW"]["full"]["sharpe"]
        dS = d["full"]["dS_ew"]
        n_ge = int(np.sum(dSk >= dS - 1e-12))
        p = (n_ge + 1) / (len(ks) + 1)
        pvals[cand] = p
        res["placebo"][cand] = {"dS": dS, "n_ge": n_ge, "K": int(len(ks)), "p": p,
                                "dSk_mean": float(dSk.mean()), "dSk_max": float(dSk.max())}

        # 晚一个月
        D_A = mi("1927-08")
        sel_d, _ = selection(kf, cand, D_A - 2, H_B - 2)  # 信号 t → 持有 t+2
        net_d, _ = engine(sel_d / TOP, kf.rows(D_A, H_B), 0.001, 0.001)
        rf_d = cut(RF, D_A, H_B)
        s_d = float(sharpe(net_d, rf_d))
        s_ew_d = float(sharpe(cut(ew_net, D_A, H_B), rf_d))
        res["delay"][cand] = {"n": int(len(net_d)), "sharpe": s_d, "ew_sharpe": s_ew_d, "dS": s_d - s_ew_d}

    adj = holm([pvals["S1"], pvals["S2"]])
    res["placebo"]["S1"]["p_holm"], res["placebo"]["S2"]["p_holm"] = adj

    # ---------- ETF 确认 ----------
    E_A, E_B = mi("2000-01"), mi("2026-09")
    nE = len(ETF9)
    RE = etf.rows(E_A, E_B)[:, :nE]
    RF_E = rf.rows(E_A, E_B)[:, 0]
    assert len(RE) == 321
    ew9, _ = engine(np.full((len(RE), nE), 1.0 / nE), RE, 0.0005, 0.0)
    spy, _ = engine(np.ones((len(RE), 1)), etf.rows(E_A, E_B)[:, nE:], 0.0, 0.0)
    etf9 = Panel(etf.m0, etf.X[:, :nE], etf.cols[:nE])
    res["etf"]["EW9"] = stats(ew9, RF_E)
    res["etf"]["SPY"] = stats(spy, RF_E)
    for cand in ("S1", "S2"):
        sel, ties = selection(etf9, cand, E_A - 1, E_B - 1)
        net, to = engine(sel / TOP, RE, 0.0005, 0.0)
        d = stats(net, RF_E)
        d["dS_ew9"] = d["sharpe"] - res["etf"]["EW9"]["sharpe"]
        d["dS_spy"] = d["sharpe"] - res["etf"]["SPY"]["sharpe"]
        d["turnover"] = float(to.mean() * 12)
        d["ties"] = ties
        res["etf"][cand] = d

    # ---------- 门槛与判定 ----------
    for cand in ("S1", "S2"):
        k = res["kf"][cand]
        G = {
            "G1": k["full"]["dS_ew"] > 0 and res["placebo"][cand]["p_holm"] <= 0.05,
            "G2": k["half1"]["dS_ew"] > 0 and k["half2"]["dS_ew"] > 0,
            "G3": k["post2000"]["dS_ew"] > 0,
            "G4": k["full"]["dS_mkt"] > 0 and k["post2000"]["dS_mkt"] > 0,
            "G5": res["delay"][cand]["dS"] > 0,
            "G6": res["etf"][cand]["dS_ew9"] > 0 and res["etf"][cand]["dS_spy"] > 0,
        }
        if all(G.values()):
            v = "通过"
        elif G["G1"] and G["G2"] and G["G3"] and G["G5"]:
            v = "相对等权有效，但不能替代宽基或可交易 ETF 未确认"
        elif all(G[g] for g in ("G2", "G3", "G4", "G5", "G6")):
            v = "方向一致，统计上不显著"
        elif k["full"]["dS_ew"] > 0:
            v = "不稳定"
        else:
            v = "不通过"
        res["gates"][cand] = {**G, "verdict": v}

    # ---------- 当前入选 ----------
    for cand in ("S1", "S2"):
        s_kf, _ = pick(MOM[cand](kf, mi("2026-09")))
        s_etf, _ = pick(MOM[cand](etf9, mi("2026-10")))
        res["picks"][cand] = {
            "kf_2026-09": [kf.cols[j] for j in np.flatnonzero(s_kf)],
            "etf_2026-10": [etf9.cols[j] for j in np.flatnonzero(s_etf)],
        }
    return res


def show(res: dict) -> None:
    for cand in ("S1", "S2"):
        k = res["kf"][cand]
        print(f"== {cand} ==")
        for p in ("full", "half1", "half2", "post2000"):
            q = k[p]
            print(f"  {p:9s} n={q['n']:4d} S={q['sharpe']:.4f} EW={res['kf']['EW'][p]['sharpe']:.4f} "
                  f"MKT={res['kf']['MKT'][p]['sharpe']:.4f} dS_ew={q['dS_ew']:+.4f} dS_mkt={q['dS_mkt']:+.4f} "
                  f"CAGR={q['cagr']:.4f} MDD={q['mdd']:.4f}")
        pl = res["placebo"][cand]
        print(f"  placebo n_ge={pl['n_ge']}/{pl['K']} p={pl['p']:.4f} holm={pl['p_holm']:.4f}")
        dl = res["delay"][cand]
        print(f"  delay n={dl['n']} S={dl['sharpe']:.4f} EW={dl['ew_sharpe']:.4f} dS={dl['dS']:+.4f}")
        e = res["etf"][cand]
        print(f"  ETF S={e['sharpe']:.4f} EW9={res['etf']['EW9']['sharpe']:.4f} SPY={res['etf']['SPY']['sharpe']:.4f} "
              f"dS_ew9={e['dS_ew9']:+.4f} dS_spy={e['dS_spy']:+.4f}")
        print(f"  turnover KF={k['turnover']:.3f} ETF={e['turnover']:.3f} ties KF={k['ties']} ETF={e['ties']}")
        print(f"  gates {res['gates'][cand]}")
        print(f"  picks {res['picks'][cand]}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--json")
    a = ap.parse_args()
    out = main()
    show(out)
    if a.json:
        Path(a.json).write_text(json.dumps(out, ensure_ascii=False, indent=2))
