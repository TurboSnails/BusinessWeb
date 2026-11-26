"""L-028 过拟合审计的独立第二实现（只按 PREREG.md 文字实现，不读 run.py / results.json）。

运行（仓库根目录）：
    cd research-py && uv run python -m replications.overfit_audit_2026_11_26

只用 numpy / pandas / scipy 自写平稳自助法、Hansen SPA、Romano–Wolf StepM、HLN MCS、DSR、MinTRL、CSCV PBO；
唯一的 arch 调用是 arch.bootstrap.optimal_block_length，只用来求 Politis–White 块长。

PREREG 没写死、这里做出的解释：
  1. 收益：每期毛收益按 E1 逐日连乘（仓位 w 下的 prod(1 + w·股票 + (1−w)·现金/n) − 1），
     净收益 = (1 + 毛) × (1 − 0.001·|Δw|) − 1，首期不扣；基准 = 恒定 100% 的毛收益（不扣费）。
  2. ω̂（学生化用的长期方差）= Politis–Romano 平稳自助核：γ0 + 2Σ_{i=1}^{T−1} κ(T,i)γ_i，
     κ = (1 − i/T)(1 − p)^i + (i/T)(1 − p)^{T−i}，p = 1/b，γ_i = Σ demeaned_t·demeaned_{t+i} / T。
  3. SPA：模型「优于基准」的序列 z_k = d_k / ω̂_k；统计量 max(max_k √T·z̄_k/ω_k, 0)，ω_k 为 z_k 的同一核
     方差（= 1）；自助 Z̄* = z̄* − z̄ + μ̂，μ̂ 取 lower = min(z̄, 0)、consistent = z̄·1{z̄ < −√(ω²/T·2lnlnT)}、
     upper = 0；p = P(T* > T)。
  4. StepM：Romano–Wolf 逐步，统计量 z̄_k，临界值 = 当前未拒绝集合上 max_k (z̄*_k − z̄_k) 的 95% 分位
     （np.percentile 线性插值），z̄_k > 临界值即拒绝，循环到无新拒绝。另报用 consistent 重新中心化的变体。
  5. MCS（method R）：t_ij = d̄_ij / √var*(d̄_ij)，var* 为自助均值差的方差（以样本均值为中心，一次算好）；
     T_R = max|t_ij|，T*_R = max|d̄*_ij − d̄_ij|/√var*；消去 argmax_i max_j t_ij；MCS p 值取累计最大，
     最后一个 = 1。
  6. 截面方差版 DSR：P 族（去重 1,054）各成员 d_k 的每期 IR 的样本方差（ddof = 1）代替 1/(T−1)。
  7. MinTRL 用 1.645（PREREG 字面）；另报 Φ⁻¹(0.95) 版。前推年数：IR' = max(IR − IR*_86, 0.5·IR)
     同时代入公式里的矩项和分母（N = 1，IR* = 0），月数 / 12 为年。
  8. PBO：夏普 = 均值 / 标准差(ddof=1)（不年化；差值另报 √12 年化）；名次 1 最差，并列取平均；
     「现行参数名次」= P0000 在全部 12,870 个半样本（样本内半边，等价于全部样本外半边）中的名次的中位数。

与主实现（run.py / results.json）对照后的已知差异：截面方差版 DSR 主实现用全族去重后剩下的 1,053 个 P 成员
（P0000 因与 S0 相同被去掉，run.py 第 200 行），这里按 PREREG「P 族（去重）」= 1,054 个（含 P0000）。
改用 1,053 个时本实现得到 DSR 0.9403866463，与主实现一致。
"""
from __future__ import annotations

import itertools
import json
import math
from pathlib import Path

import numpy as np
from scipy import stats

from engines.e1 import COST, build_periods, load_inputs

ROOT = Path(__file__).resolve().parents[2]
TIERS_JSON = ROOT / "docs/research/overfit-audit-2026-11-26/tiers.json"
T_PERIODS = 644
REPS = 10_000
SEED = 7  # 与主实现不同，用来检验蒙特卡洛误差
EULER = 0.5772156649015329
GATE_GROSS, GATE_NET = 0.592877, 0.585767


# ---------------------------------------------------------------- 收益
def build_returns():
    raw = json.loads(TIERS_JSON.read_text(encoding="utf-8"))
    shares = [t["equityShare"] for t in raw["tiers"]]
    months = raw["months"][:T_PERIODS]
    inp = load_inputs()
    periods = build_periods(inp)
    assert list(periods["signal"]) == months, "信号月不一致"
    closes = inp.closes.to_numpy()
    levels = sorted(set(shares) | {1.0, 0.5})
    gross = {w: np.empty(T_PERIODS) for w in levels}
    for j, p in enumerate(periods.itertuples(index=False)):
        idx = np.arange(p.i0 + 1, p.i1 + 1)
        stock = closes[idx] / closes[idx - 1] - 1 + p.div / p.n
        for w in levels:
            gross[w][j] = float(np.prod(1 + w * stock + (1 - w) * p.cash / p.n)) - 1
    cash = periods["cash"].to_numpy(dtype=float)

    def weights(cfg):
        s = cfg["tiers"][:T_PERIODS]
        if cfg["id"] == "S4":
            return np.array([{"1": 1.0, "5": 0.5}[c] for c in s])
        return np.array([shares[int(c)] for c in s])

    def series(w):
        g = np.array([gross[x][j] for j, x in enumerate(w)])
        trade = np.concatenate([[0.0], np.abs(np.diff(w))])
        net = (1 + g) * (1 - COST * trade) - 1
        return g, net

    configs = raw["configs"]
    out = []
    for cfg in configs:
        w = weights(cfg)
        g, net = series(w)
        out.append({"id": cfg["id"], "family": cfg["family"], "key": cfg["tiers"][:T_PERIODS], "gross": g, "net": net})
    xB = gross[1.0] - cash
    return out, cash, xB


def sharpe_ann(x):
    return math.sqrt(12) * x.mean() / x.std(ddof=1)


# ---------------------------------------------------------------- 平稳自助法
def stationary_counts(T, b, reps, rng):
    """Politis–Romano 平稳自助：几何块长（期望 b）、循环取数。返回每次重抽中各期出现次数 (reps, T)。"""
    p = 1.0 / b
    idx = np.empty((reps, T), dtype=np.int64)
    idx[:, 0] = rng.integers(0, T, reps)
    for t in range(1, T):
        new = rng.random(reps) < p
        idx[:, t] = np.where(new, rng.integers(0, T, reps), (idx[:, t - 1] + 1) % T)
    flat = (idx + T * np.arange(reps)[:, None]).ravel()
    return np.bincount(flat, minlength=reps * T).reshape(reps, T).astype(float)


def sb_kernel_variance(X, b):
    """Politis–Romano 平稳自助核的长期方差（逐列）。"""
    X = np.atleast_2d(X.T).T
    T = X.shape[0]
    p = 1.0 / b
    dm = X - X.mean(0)
    i = np.arange(1, T)
    kw = (1 - i / T) * (1 - p) ** i + (i / T) * (1 - p) ** (T - i)
    v = (dm ** 2).sum(0) / T
    # 自协方差：用 FFT 一次算出所有滞后
    n = 1 << (2 * T - 1).bit_length()
    F = np.fft.rfft(dm, n=n, axis=0)
    ac = np.fft.irfft(F * np.conj(F), n=n, axis=0)[1:T] / T
    v = v + 2 * (kw[:, None] * ac).sum(0)
    return v


# ---------------------------------------------------------------- SPA / StepM
def spa_stepm(D, b, counts, alpha=0.05):
    T, K = D.shape
    omega = np.sqrt(sb_kernel_variance(D, b))
    Z = D / omega
    zbar = Z.mean(0)
    wz = np.sqrt(sb_kernel_variance(Z, b))  # = 1
    boot = counts @ Z / T  # (reps, K)
    cen = boot - zbar
    A = np.sqrt(wz ** 2 / T * 2 * np.log(np.log(T)))
    mu = {"lower": np.minimum(zbar, 0), "consistent": np.where(zbar < -A, zbar, 0.0), "upper": np.zeros(K)}
    stat = max((math.sqrt(T) * zbar / wz).max(), 0.0)
    pv = {}
    for k, m in mu.items():
        tstar = np.maximum((math.sqrt(T) * (cen + m) / wz).max(1), 0.0)
        pv[k] = float((tstar > stat).mean())

    def stepm(recentre):
        rejected = np.zeros(K, bool)
        while True:
            act = ~rejected
            if not act.any():
                break
            c = np.percentile((cen[:, act] + recentre[act]).max(1), 100 * (1 - alpha))
            new = act & (zbar > c)
            if not new.any():
                break
            rejected |= new
        return rejected

    return pv, stepm(np.zeros(K)), stepm(mu["consistent"]), zbar


# ---------------------------------------------------------------- MCS
def mcs_r(L, counts, size=0.10):
    T, m = L.shape
    lbar = L.mean(0)
    boot = counts @ L / T
    dbar = lbar[:, None] - lbar[None, :]
    dstar = boot[:, :, None] - boot[:, None, :] - dbar  # (reps, m, m)
    var = (dstar ** 2).mean(0)
    np.fill_diagonal(var, 1.0)
    t = dbar / np.sqrt(var)
    tb = np.abs(dstar) / np.sqrt(var)
    alive = list(range(m))
    pvals = np.zeros(m)
    running = 0.0
    order = []
    while len(alive) > 1:
        a = np.array(alive)
        sub = t[np.ix_(a, a)]
        TR = np.abs(sub).max()
        TRb = tb[:, a][:, :, a].max(axis=(1, 2))
        p = float((TRb > TR).mean())
        e = a[np.argmax(sub.max(1))]
        running = max(running, p)
        pvals[e] = running
        order.append(e)
        alive.remove(e)
    pvals[alive[0]] = 1.0
    return pvals, pvals > size


# ---------------------------------------------------------------- DSR / MinTRL
def ir_star(N, T, var=None):
    if N == 1:
        return 0.0
    v = 1 / (T - 1) if var is None else var
    return math.sqrt(v) * ((1 - EULER) * stats.norm.ppf(1 - 1 / N) + EULER * stats.norm.ppf(1 - 1 / (N * math.e)))


def dsr(ir, irs, T, g3, g4):
    return float(stats.norm.cdf((ir - irs) * math.sqrt(T - 1) / math.sqrt(1 - g3 * ir + (g4 - 1) / 4 * ir ** 2)))


def mintrl(ir, irs, g3, g4, z=1.645):
    if ir <= irs:
        return math.inf
    return 1 + (1 - g3 * ir + (g4 - 1) / 4 * ir ** 2) * (z / (ir - irs)) ** 2


# ---------------------------------------------------------------- PBO (CSCV)
def avg_rank(v):
    return stats.rankdata(v, method="average")


def pbo(X, cur=None, S=16):
    T, N = X.shape
    sizes = [41] * 4 + [40] * 12
    assert sum(sizes) == T
    edges = np.cumsum([0] + sizes)
    blocks = [np.arange(edges[i], edges[i + 1]) for i in range(S)]
    lam, gap, cur_rank = [], [], []
    for comb in itertools.combinations(range(S), S // 2):
        ins = np.concatenate([blocks[i] for i in comb])
        oos = np.concatenate([blocks[i] for i in range(S) if i not in comb])
        sr_in = X[ins].mean(0) / X[ins].std(0, ddof=1)
        sr_out = X[oos].mean(0) / X[oos].std(0, ddof=1)
        best = int(np.argmax(sr_in))  # 并列取编号最小
        r = avg_rank(sr_out)[best]
        w = r / (N + 1)
        lam.append(math.log(w / (1 - w)))
        gap.append(sr_out[best] - np.median(sr_out))
        if cur is not None:
            cur_rank.append(avg_rank(sr_in)[cur])
    lam = np.array(lam)
    res = {"pbo": float((lam <= 0).mean()), "lambdaMedian": float(np.median(lam)),
           "oosGapMedian": float(np.median(gap)), "oosGapMedianAnn": float(np.median(gap) * math.sqrt(12)),
           "combos": len(lam)}
    if cur is not None:
        res["currentRankMedian"] = float(np.median(cur_rank))
    return res


# ---------------------------------------------------------------- 主流程
def main():
    from arch.bootstrap import optimal_block_length  # 唯一允许的 arch 调用：只求块长

    rows, cash, xB = build_returns()
    s0 = next(r for r in rows if r["id"] == "S0")
    g_sh, n_sh = sharpe_ann(s0["gross"] - cash), sharpe_ann(s0["net"] - cash)
    print(f"复现门槛 S0 E1 夏普：毛 {g_sh:.7f}（目标 {GATE_GROSS}，差 {g_sh - GATE_GROSS:+.1e}）"
          f"  净 {n_sh:.7f}（目标 {GATE_NET}，差 {n_sh - GATE_NET:+.1e}）")
    assert abs(g_sh - GATE_GROSS) < 1e-6 and abs(n_sh - GATE_NET) < 1e-6, "复现门槛未过"

    # 去重
    seen, allm = set(), []
    for r in rows:
        if r["key"] not in seen:
            seen.add(r["key"])
            allm.append(r)
    seenp, pfam = set(), []
    for r in rows:
        if r["family"] == "P" and r["key"] not in seenp:
            seenp.add(r["key"])
            pfam.append(r)
    print(f"去重：全族 {len(allm)}，P 族 {len(pfam)}")

    sB = xB.std(ddof=1)

    def dser(r):
        x = r["net"] - cash
        return x * sB / x.std(ddof=1) - xB

    T = T_PERIODS
    out = {}
    # ---------------- T1
    d0 = dser(s0)
    ir = d0.mean() / d0.std(ddof=1)
    g3 = float(stats.skew(d0, bias=True))
    g4 = float(stats.kurtosis(d0, bias=True, fisher=False))
    print(f"\nT1  IR = {ir:.10f}（年化 {ir * math.sqrt(12):.6f}）  偏度 {g3:.8f}  峰度 {g4:.8f}")
    t1 = {"IR": ir, "skew": g3, "kurt": g4, "byN": {}}
    for N in (1, 10, 30, 86, 150):
        irs = ir_star(N, T)
        v = {"IRstar": irs, "DSR": dsr(ir, irs, T, g3, g4), "MinTRL": mintrl(ir, irs, g3, g4),
             "MinTRL_phi": mintrl(ir, irs, g3, g4, stats.norm.ppf(0.95))}
        t1["byN"][N] = v
        print(f"  N={N:4d}  IR*={irs:.10f}  DSR={v['DSR']:.10f}  MinTRL={v['MinTRL']:.6f} 月"
              f"（Φ⁻¹版 {v['MinTRL_phi']:.6f}）")
    irs_p = np.array([(lambda d: d.mean() / d.std(ddof=1))(dser(r)) for r in pfam])
    vcs = irs_p.var(ddof=1)
    irs_cs = ir_star(86, T, vcs)
    dsr_cs = dsr(ir, irs_cs, T, g3, g4)
    print(f"  截面方差版（N=86）：V[IR]={vcs:.10e}（对照 1/(T−1)={1 / (T - 1):.6e}） IR*={irs_cs:.10f}  DSR={dsr_cs:.10f}"
          f"（ddof=0 版 DSR={dsr(ir, ir_star(86, T, irs_p.var(ddof=0)), T, g3, g4):.10f}）")
    irs86 = t1["byN"][86]["IRstar"]
    ir_fwd = max(ir - irs86, 0.5 * ir)
    fwd = mintrl(ir_fwd, 0.0, g3, g4) / 12
    opt = mintrl(ir, 0.0, g3, g4) / 12
    print(f"  前推记录年数：IR'={ir_fwd:.10f} → {fwd:.6f} 年；乐观（样本 IR）{opt:.6f} 年"
          f"（Φ⁻¹版 {mintrl(ir_fwd, 0, g3, g4, stats.norm.ppf(0.95)) / 12:.6f} / {mintrl(ir, 0, g3, g4, stats.norm.ppf(0.95)) / 12:.6f}）")
    d86 = t1["byN"][86]["DSR"]
    word1 = ("算上挑选次数后仍显著" if d86 >= 0.95 else "方向可信，但算上挑选次数后不显著" if d86 >= 0.80
             else "算上挑选次数后，不能排除优势来自挑选")
    print(f"  措辞（N=86）：「{word1}」")
    t1.update({"csVar": vcs, "csIRstar": irs_cs, "csDSR": dsr_cs, "forwardYears": fwd, "optimisticYears": opt, "wording": word1})
    out["T1"] = t1

    # ---------------- 块长
    pw = optimal_block_length(np.column_stack([xB, d0]))["stationary"].to_numpy()
    b_main = max(math.ceil(pw.max()), 12)
    print(f"\n块长：Politis–White stationary  基准 {pw[0]:.4f}，S0 差分 {pw[1]:.4f} → b = {b_main}")
    out["blockPW"] = pw.tolist()
    out["b"] = b_main

    D = np.column_stack([dser(r) for r in allm])
    ids = [r["id"] for r in allm]
    s_ids = [i for i in ids if i.startswith("S")]
    Smem = [next(r for r in rows if r["id"] == i) for i in ("S0", "S1", "S2", "S3", "S4")]
    Lmcs = np.column_stack([-(r["net"] - cash) * sB / (r["net"] - cash).std(ddof=1) for r in Smem] + [-xB])
    mnames = ["S0", "S1", "S2", "S3", "S4", "基准"]

    out["T2"], out["T3"] = {}, {}
    rng = np.random.default_rng(SEED)
    for b in sorted({b_main, 24}):
        counts = stationary_counts(T, b, REPS, rng)
        pv, rej, rej_c, zbar = spa_stepm(D, b, counts)
        sig = [ids[k] for k in np.flatnonzero(rej)]
        sig_c = [ids[k] for k in np.flatnonzero(rej_c)]
        s_in = [i for i in sig if i in s_ids]
        if pv["consistent"] < 0.05:
            w2 = ("只有单纯十个月均线显著，不支持宏观打分" if sig == ["S4"] else
                  "在整个参数邻域与结构备选里，至少有一种写法在校正挑选后显著优于同波动的恒定仓位")
        else:
            w2 = "校正挑选后，没有一种写法显著优于同波动的恒定仓位"
        print(f"\nT2  b={b}  SPA p：lower {pv['lower']:.4f}  consistent {pv['consistent']:.4f}  upper {pv['upper']:.4f}")
        print(f"     StepM(α=0.05) 显著 {len(sig)} 个；S0 在内：{'S0' in sig}；S 族：{s_in}"
              f"（consistent 中心化变体 {len(sig_c)} 个，S 族 {[i for i in sig_c if i in s_ids]}）")
        print(f"     最大 z̄ 成员 {ids[int(np.argmax(zbar))]}；措辞：「{w2}」")
        out["T2"][b] = {"pvalues": pv, "stepmCount": len(sig), "S0in": "S0" in sig, "Sfamily": s_in,
                        "stepmConsistentCount": len(sig_c), "wording": w2}

        pm, inset = mcs_r(Lmcs, counts)
        members = [mnames[i] for i in range(6) if inset[i]]
        if not inset[0]:
            w3 = "现行写法劣于集中成员（" + "、".join(members) + "）"
        elif inset[5] or inset[4]:
            w3 = "与恒定仓位 / 单纯十个月均线同在 90% 最优集，不能排除一样好"
        else:
            w3 = "宏观写法有统计增量" + (
                "；附加层（熔断、均线修正、修复确认）与更简的写法不可区分" if any(inset[1:4]) else "")
        print(f"T3  b={b}  MCS p：" + "  ".join(f"{mnames[i]} {pm[i]:.4f}" for i in range(6)))
        print(f"     置信集：{members}；措辞：「{w3}」")
        out["T3"][b] = {"pvalues": dict(zip(mnames, pm.tolist())), "members": members, "wording": w3}

    # ---------------- T4
    Xp = np.column_stack([r["net"] - cash for r in pfam])
    cur = [r["id"] for r in pfam].index("P0000")
    t4p = pbo(Xp, cur)
    Xs = np.column_stack([r["net"] - cash for r in Smem])
    t4s = pbo(Xs, 0)
    for name, t4 in (("P 族", t4p), ("S 族", t4s)):
        w4 = ("参数调整的过拟合风险低" if t4["pbo"] <= 0.20 else "中等" if t4["pbo"] <= 0.50
              else "高：在这片参数里挑最好的，样本外多半不如中位数")
        t4["wording"] = w4
        print(f"\nT4  {name}（{Xp.shape[1] if name == 'P 族' else 5} 列，{t4['combos']} 组）PBO={t4['pbo']:.10f}  "
              f"λ 中位数={t4['lambdaMedian']:.10f}  样本外夏普差中位数={t4['oosGapMedian']:.10f}（年化 {t4['oosGapMedianAnn']:.10f}）"
              f"  现行名次中位数={t4['currentRankMedian']}；措辞：「{w4}」")
    out["T4"] = {"P": t4p, "S": t4s}

    return out


if __name__ == "__main__":
    main()
