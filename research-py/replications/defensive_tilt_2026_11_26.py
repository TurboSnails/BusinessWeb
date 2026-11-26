"""L-026 防守 / 低波倾斜的独立复现（只按 PREREG.md 文字实现，不读 run.mjs）。

运行（仓库根目录）：
    cd research-py && uv run python -m replications.defensive_tilt_2026_11_26

PREREG 没写死、这里做出的解释：
  1. 成本：t 月末再平衡的换手成本从 t+1 月收益中扣除（首月 1934-01 建仓不计）；
     持有费按 t 月初 D 的目标权重（0.3）× 0.0125% 每月扣。
  2. 漂移权重用扣费前的毛收益计算；换手两边（M 腿 + D 内各行业）都计，按 PREREG 公式。
  3. P1/P2 成员在持有月 t 无收益则剔除，其余等权（P2 选出的 10 个在 t 月总有收益）。
  4. P2 的 36 个月窗口为 t-35..t（信号月末），持有 t+1；样本标准差 ddof=1。
  5. 净值从窗口起点前一个月末 = 1 开始；最大回撤、尾部事件都包含这个起点。
  6. 尾部事件：M 净值上的「前高 → 回到前高」各段（天然不重叠），深度 ≥10% 的取最深 6 段；
     各段区间 = 前高所在点到低点所在点。L = Σ S 跌幅 / Σ M* 跌幅（M* 的 k 用该窗口的 k）。
  7. 否决项：持有月 t 股票仓位 = 档位权重(信号月 t-1) × 0.8，其余现金，档位变化不计成本
     （另报计 0.1% × |Δ仓位| 的敏感性）；8 次回调区间 = 高点所在月前一个月末 → 低点所在月末。
  8. 年换手 = 窗口内各持有月所扣换手的月均值 × 12（含首月 0）；另报 1934-01..2026-09 全程口径。
  9. 滚动 36 个月落后 = ∏(1+S)/∏(1+M) − 1 的最小值（另报累计收益之差）。
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
IND = ROOT / "docs/research/defensive-tilt-2026-11-26/inputs/industry.json"
MAC = ROOT / "docs/research/macro-significance-2026-11-25/inputs.json"
LATE = ROOT / "docs/research/late-cycle-2026-11-25/results.json"

TIER_W = {"offense": 1.0, "lean-offense": 0.85, "neutral": 0.7, "lean-defense": 0.5, "defense": 0.3}
DEF_NAMES = ["Food", "Soda", "Beer", "Smoke", "Hshld", "Hlth", "MedEq", "Drugs", "Util"]
COST = 0.001
FEE_M = 0.0015 / 12
SIM_START, SIM_END = "1934-01", "2026-09"
VETO_PEAKS = ["1997-10-07", "1998-07-17", "1999-07-16", "2000-03-24",
              "2018-01-26", "2018-09-20", "2020-02-19", "2025-02-19"]


def load():
    d = json.loads(IND.read_text())
    names = d["industries"]
    months = [m for m, _ in d["returns"]]
    R = np.array([[np.nan if x is None else x / 100 for x in v] for _, v in d["returns"]])
    F = np.array([[0 if x is None else x for x in v] for _, v in d["firms"]], dtype=float)
    S = np.array([[np.nan if x is None else x for x in v] for _, v in d["size"]])
    mac = json.loads(MAC.read_text())
    cash = {m: c for m, _, c in mac["returns"]}
    tiers = dict(mac["tiers"])
    late = json.loads(LATE.read_text())
    return names, months, R, F, S, cash, tiers, late


def prev_month(m):
    y, mo = int(m[:4]), int(m[5:])
    return f"{y - 1}-12" if mo == 1 else f"{y}-{mo - 1:02d}"


def simulate(names, months, R, F, S, basket, tilt=0.3):
    """返回从 SIM_START 到 SIM_END 的 dict: months, rM, rS(净), turnover(当月扣的)。"""
    idx = {m: i for i, m in enumerate(months)}
    i0, i1 = idx[SIM_START], idx[SIM_END]
    def_idx = [names.index(n) for n in DEF_NAMES]
    wm_t = 1 - tilt

    def d_weights(t):  # 持有月 t 的 D 内部权重（和为 1）
        if basket == "P1":
            mem = [j for j in def_idx if not np.isnan(R[t, j])]
        else:
            win = R[t - 36:t]  # 信号月 t-1 及之前 36 个月
            ok = [j for j in range(49) if not np.isnan(win[:, j]).any()]
            sd = [(np.std(win[:, j], ddof=1), j) for j in ok]
            sd.sort(key=lambda x: (x[0], x[1]))
            mem = [j for _, j in sd[:10] if not np.isnan(R[t, j])]
        w = np.zeros(49)
        w[mem] = 1 / len(mem)
        return w

    out_m, rM_l, rS_l, to_l, gross_l = [], [], [], [], []
    pending_to = 0.0
    for t in range(i0, i1 + 1):
        ok = ~np.isnan(R[t]) & ~np.isnan(R[t - 1]) & (F[t - 1] > 0) & ~np.isnan(S[t - 1])
        cap = np.where(ok, F[t - 1] * np.nan_to_num(S[t - 1]), 0.0)
        rM = float(np.sum(cap * np.nan_to_num(R[t])) / cap.sum())
        wd = d_weights(t)
        rD_vec = np.nan_to_num(R[t])
        rD = float(np.sum(wd * rD_vec))
        gross = wm_t * rM + tilt * rD
        net = gross - COST * pending_to - tilt * FEE_M
        out_m.append(months[t]); rM_l.append(rM); rS_l.append(net); to_l.append(pending_to); gross_l.append(gross)
        # 月末漂移与下月目标
        driftM = wm_t * (1 + rM) / (1 + gross)
        driftD = tilt * wd * (1 + rD_vec) / (1 + gross)
        if t < i1:
            wn = d_weights(t + 1)
            pending_to = abs(wm_t - driftM) + float(np.sum(np.abs(tilt * wn - driftD)))
    return dict(months=out_m, rM=np.array(rM_l), rS=np.array(rS_l), to=np.array(to_l))


def nav(r):
    return np.concatenate([[1.0], np.cumprod(1 + r)])


def sharpe(r, c):
    x = r - c
    return float(x.mean() / x.std(ddof=1) * math.sqrt(12))


def ann(r):
    return float(np.prod(1 + r) ** (12 / len(r)) - 1)


def mdd(r):
    v = nav(r)
    return float(np.min(v / np.maximum.accumulate(v) - 1))


def episodes(r):
    v = nav(r)
    eps, peak, in_dd = [], 0, False
    for j in range(1, len(v)):
        if v[j] >= v[peak]:
            if in_dd:
                tr = peak + int(np.argmin(v[peak:j]))
                eps.append((peak, tr, v[tr] / v[peak] - 1))
            peak, in_dd = j, False
        else:
            in_dd = True
    if in_dd:
        tr = peak + int(np.argmin(v[peak:]))
        eps.append((peak, tr, v[tr] / v[peak] - 1))
    eps = [e for e in eps if e[2] <= -0.10]
    eps.sort(key=lambda e: e[2])
    return eps[:6]


def window(sim, cash, a, b):
    ms = sim["months"]
    i, j = ms.index(a), ms.index(b) + 1
    c = np.array([cash[m] for m in ms[i:j]])
    return ms[i:j], sim["rM"][i:j], sim["rS"][i:j], sim["to"][i:j], c


def evaluate(sim, cash, a, b):
    ms, rM, rS, to, c = window(sim, cash, a, b)
    k = float(rS.std(ddof=1) / rM.std(ddof=1))
    rMs = k * rM + (1 - k) * c
    vS, vM, vMs = nav(rS), nav(rM), nav(rMs)
    lab = [prev_month(ms[0])] + ms
    tails = []
    for p, tr, dM in episodes(rM):
        tails.append(dict(peak=lab[p], trough=lab[tr], M=dM, S=vS[tr] / vS[p] - 1, Mstar=vMs[tr] / vMs[p] - 1))
    L = sum(e["S"] for e in tails) / sum(e["Mstar"] for e in tails) if tails else float("nan")
    roll = []
    for s in range(len(rS) - 35):
        gs, gm = np.prod(1 + rS[s:s + 36]), np.prod(1 + rM[s:s + 36])
        roll.append((gs / gm - 1, gs - gm, ms[s], ms[s + 35]))
    worst = min(roll) if roll else None
    worst_diff = min(roll, key=lambda x: x[1]) if roll else None
    return dict(
        n=len(ms), k=k,
        sharpeS=sharpe(rS, c), sharpeM=sharpe(rM, c), sharpeMstar=sharpe(rMs, c),
        annS=ann(rS), annM=ann(rM), annMstar=ann(rMs),
        mddS=mdd(rS), mddM=mdd(rM), mddMstar=mdd(rMs),
        tails=tails, L=L,
        annualTurnover=float(to.mean() * 12),
        trackingError=float((rS - rM).std(ddof=1) * math.sqrt(12)),
        worstRolling36=dict(rel=worst[0], start=worst[2], end=worst[3]) if worst else None,
        worstRolling36Diff=dict(diff=worst_diff[1], start=worst_diff[2], end=worst_diff[3]) if worst_diff else None,
    )


def veto(sim, cash, tiers, late, tc=0.0):
    ms, rM, rS, _, c = window(sim, cash, "1973-02", "2026-09")
    e = np.array([TIER_W[tiers[prev_month(m)]] * 0.8 for m in ms])
    de = np.abs(np.diff(np.concatenate([[e[0]], e])))  # 首月建仓不计
    trough_of = {ev["peak"]: ev["trough"] for ev in late["A"]["events"]}
    lab = [prev_month(ms[0])] + ms
    res = {}
    for name, leg in (("M", rM), ("S", rS)):
        r = e * leg + (1 - e) * c - tc * de
        v = nav(r)
        losses = []
        for pk in VETO_PEAKS:
            p = lab.index(prev_month(pk[:7]))
            tr = lab.index(trough_of[pk][:7])
            losses.append(v[tr] / v[p] - 1)
        res[name] = dict(sharpe=sharpe(r, c), ann=ann(r), mdd=mdd(r), combinedLoss=float(sum(losses)), losses=losses)
    res["dSharpe"] = res["S"]["sharpe"] - res["M"]["sharpe"]
    res["partial"] = bool(res["dSharpe"] < -0.03 or res["S"]["combinedLoss"] < res["M"]["combinedLoss"])
    return res


def judge(main, h1, h2):
    c1 = (main["sharpeS"] >= main["sharpeM"] - 0.02 and h1["sharpeS"] >= h1["sharpeM"] - 0.05
          and h2["sharpeS"] >= h2["sharpeM"] - 0.05)
    c2 = main["mddS"] >= main["mddMstar"] - 0.01
    c3 = main["sharpeS"] >= main["sharpeM"] + 0.03 or main["L"] <= 0.90
    return dict(c1=c1, c2=c2, c3=c3)


def main():
    names, months, R, F, S, cash, tiers, late = load()
    out = {}
    for basket in ("P1", "P2"):
        sim = simulate(names, months, R, F, S, basket)
        m = evaluate(sim, cash, "1934-01", "1972-12")
        h1 = evaluate(sim, cash, "1934-01", "1952-12")
        h2 = evaluate(sim, cash, "1953-01", "1972-12")
        j = judge(m, h1, h2)
        v = veto(sim, cash, tiers, late)
        v_tc = veto(sim, cash, tiers, late, tc=COST)
        verdict = "通过" if all(j.values()) and not v["partial"] else ("部分成立" if all(j.values()) else "不通过")
        sim50 = simulate(names, months, R, F, S, basket, tilt=0.5)
        out[basket] = dict(
            main=m, firstHalf=h1, secondHalf=h2, criteria=j, veto=v, vetoWithTierCost=v_tc, verdict=verdict,
            desc1973=evaluate(sim, cash, "1973-01", "2026-09"),
            desc2012=evaluate(sim, cash, "2012-01", "2026-09"),
            tilt50main=evaluate(sim50, cash, "1934-01", "1972-12"),
            annualTurnoverFullSim=float(sim["to"].mean() * 12),
        )
        p = lambda x: f"{x * 100:.3f}%"
        print(f"== {basket}  判定 {verdict}  {j}")
        print(f"  1934-72 夏普 S {m['sharpeS']:.4f} M {m['sharpeM']:.4f}  年化 S {p(m['annS'])} M {p(m['annM'])} M* {p(m['annMstar'])}")
        print(f"  最大回撤 S {p(m['mddS'])} M {p(m['mddM'])} M* {p(m['mddMstar'])}  k {m['k']:.4f}  L {m['L']:.4f}")
        print(f"  前半夏普 S {h1['sharpeS']:.4f} M {h1['sharpeM']:.4f}  后半 S {h2['sharpeS']:.4f} M {h2['sharpeM']:.4f}")
        print(f"  年换手(1934-72) {p(m['annualTurnover'])} 年换手(1934-2026 全程) {p(out[basket]['annualTurnoverFullSim'])}  跟踪误差 {p(m['trackingError'])}  最差36月 {m['worstRolling36']}  差值口径 {m['worstRolling36Diff']}")
        for e in m["tails"]:
            print(f"    尾部 {e['peak']}→{e['trough']}  S {p(e['S'])} M {p(e['M'])} M* {p(e['Mstar'])}")
        print(f"  否决项 夏普 M {v['M']['sharpe']:.4f} S {v['S']['sharpe']:.4f}  合并跌幅 M {p(v['M']['combinedLoss'])} S {p(v['S']['combinedLoss'])}  部分成立={v['partial']}")
        print(f"  否决项(计档位成本) 夏普 M {v_tc['M']['sharpe']:.4f} S {v_tc['S']['sharpe']:.4f}")
    return out


if __name__ == "__main__":
    main()
