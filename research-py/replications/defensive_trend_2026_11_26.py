"""L-030 防守部分放趋势过滤债券的独立第二实现（只按 PREREG.md 文字实现，不读 run.py / results.json）。

运行：
    cd research-py && uv run python -m replications.defensive_trend_2026_11_26 [out.json]

PREREG 没写死、这里做出的选择：
  1. 每国只用 main_ok 行（14 国都连续）。行号 i = 0..N-1。债券总收益指数 I_i = Π_{j≤i}(1+bond_ret_j)
     （比值与起点无关）。信号 s_i = [I_i ≥ mean(I_{i-9..i})]，i ≥ 9。收益月 i ≥ 11（PREREG：前 11 个月预热），
     持债 h_i = s_{i-2}。所有报告项都用同一组收益月（i ≥ 11）。
  2. 切换成本：收益月内 h_i ≠ h_{i-1} 时当月组合扣 0.001 × 防守比例（60/40 即 0.0004）；第一个收益月不扣
     （另报「首月若持债也算一次切换」的影响）。股票比例 70/50 时成本按 0.001 × 0.3 / 0.5。
  3. 夏普 = √12 × mean(R − cash) / std(R − cash, ddof=1)。M 的 w 用 brentq 在 [0,2] 求解（xtol 1e-15）。
     ΔS = 夏普(候选) − 夏普(M)。
  4. 利率上行月：收益月 i 需 i−12 ≥ 0 且 i+12 ≤ N−1（main_ok 内），y_{i+12} − y_{i−12} ≥ 1.0（原始浮点比较，
     另报接近边界的个数）。月差 = mean(候选 − D0) × 12 × 100（百分点/年）；上行月 < 12 的国家不计入；14 国等权
     （非单元）。原定义：y_i − y_{i−24} ≥ 1.0，i−24 ≥ 0。
  5. 去漂移：b̃ = b − mean_R(b − c)（收益月均值）。C1 去漂移版沿用原始信号与切换成本；对照 0.6e + 0.4[p̄b̃ + (1−p̄)c]
     不扣成本。另报 C1 去漂移版不扣成本的结果。
  6. 两段：按收益月切分，切换成本按全期序列计算后切片；M 与 D0 夏普相同，w 不影响 ΔS。
  7. 安慰剂：k ~ 均匀整数 [12, n_min − 12]，n_min = 最短国家的收益月数（意大利 406）；h 在收益月序列内
     np.roll(h, k)，切换成本按平移后的序列重算（首月不扣）。numpy default_rng(20261126)，2000 次。
  8. 熊市：在收益月股票本币总收益指数上（起点前一月 = 1，起点可作高点），从历史高点跌到 ≤ −20% 的回撤段，
     高点 = 回撤前最后一个最高点，谷底 = 恢复到 ≥ 高点之前（或样本结束）的最低点；窗口收益取高点后一月到谷底月。
     L = Σ ln(1+R_cand,e) / Σ ln(1+R_M,e)。合并 L = 14 国全部事件合并求和（另报各国 L 的均值）。
  9. ma12：前 2 个收益月均线窗口不足 12 个月，用已有的 10–11 个月（保持收益月相同）；另报 ma12 从 i ≥ 13 起评估。
 10. 长样本 7 国：收益月 ≥ 7 国共同的首个收益月（加拿大 1977-12）；信号不变。瑞士 1999-08 起：瑞士收益月 ≥ 1999-08。
     德日月末版本：两国信号与收益都用 bond_ret_me。
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import brentq

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "docs/research/defensive-trend-2026-11-26/inputs/processed"
COUNTRIES = ["Australia", "Belgium", "Canada", "Denmark", "France", "Germany", "Italy", "Japan",
             "Netherlands", "Norway", "Spain", "Sweden", "Switzerland", "UK"]
EURO = ["Germany", "France", "Belgium", "Netherlands", "Spain", "Italy"]
LONG7 = ["Germany", "UK", "France", "Belgium", "Australia", "Canada", "Switzerland"]
SPLIT = "2000-12"
SEED = 20261126
NPLACEBO = 2000
SW_COST = 0.001


def load() -> dict[str, pd.DataFrame]:
    out = {}
    for c in COUNTRIES:
        d = pd.read_csv(DATA / f"{c}.csv")
        d = d[d["main_ok"] == True].reset_index(drop=True)  # noqa: E712
        out[c] = d
    return out


def sharpe(r: np.ndarray, cash: np.ndarray) -> float:
    x = r - cash
    return math.sqrt(12) * x.mean() / x.std(ddof=1)


def signal(bond: np.ndarray, ma: int, minp: int = 10) -> np.ndarray:
    idx = np.cumprod(1 + bond)
    s = np.full(len(idx), np.nan)
    for i in range(len(idx)):
        lo = max(0, i - ma + 1)
        if i - lo + 1 < min(ma, minp):
            continue
        s[i] = 1.0 if idx[i] >= idx[lo:i + 1].mean() else 0.0
    return s


def switches(h: np.ndarray) -> np.ndarray:
    sw = np.zeros(len(h))
    sw[1:] = (h[1:] != h[:-1]).astype(float)
    return sw


def solve_w(target_sd: float, e: np.ndarray, c: np.ndarray) -> float:
    f = lambda w: (w * e + (1 - w) * c).std(ddof=1) - target_sd  # noqa: E731
    return brentq(f, 0.0, 2.0, xtol=1e-15, rtol=4 * np.finfo(float).eps, maxiter=500)


def bear_events(e: np.ndarray) -> list[tuple[int, int]]:
    """返回 (高点位置, 谷底位置)，位置在 V 上（V[0] = 起点 1，V[k] = 第 k 个收益月末）。窗口收益 = 月 peak+1..trough。"""
    V = np.concatenate([[1.0], np.cumprod(1 + e)])
    ev = []
    n = len(V)
    i = 0
    while i < n:
        peak = i
        j = i + 1
        while j < n and V[j] < V[peak]:
            j += 1
        # 段 (peak, j)：j 是恢复到 ≥ 高点的位置或 n
        if j > peak + 1:
            seg = V[peak + 1:j]
            t = peak + 1 + int(np.argmin(seg))
            if V[t] / V[peak] - 1 <= -0.20:
                ev.append((peak, t))
        i = j if j > i + 1 else i + 1
        # 若 j == i+1，说明 V[i+1] >= V[i]，新高点候选前移
    return ev


def cum(r: np.ndarray, a: int, b: int) -> float:
    """V 位置 a→b 的累计收益（收益月下标 a..b-1）。"""
    return float(np.prod(1 + r[a:b]) - 1)


def build(data, eq_w=0.6, lag=2, ma=10, bond_override=None, eq_col="equity_local",
          ret_start=None, first_cost=False, eval_from_idx=11):
    """每国返回 dict：收益月序列与各组合。ret_start: {国家: 'YYYY-MM'} 收益月下限。"""
    out = {}
    dw = 1 - eq_w
    for c, d in data.items():
        bcol = (bond_override or {}).get(c, "bond_ret")
        bond = d[bcol].to_numpy(float)
        e_all = d[eq_col].to_numpy(float)
        cash_all = d["cash_ret"].to_numpy(float)
        y_all = d["bond_yield"].to_numpy(float)
        months_all = d["month"].to_numpy(str)
        N = len(d)
        s = signal(bond, ma)
        R = np.arange(11, N)
        h_full = np.array([s[i - lag] for i in R])
        assert not np.isnan(h_full[eval_from_idx - 11:]).any()
        h_full = np.nan_to_num(h_full)  # 仅 ma12 且 eval_from_idx=13 时前两个月无信号，随后被切掉
        sw_full = switches(h_full)
        if first_cost and h_full[0] == 1:
            sw_full[0] = 1
        e, b, cash = e_all[R], bond[R], cash_all[R]
        c1 = eq_w * e + dw * (h_full * b + (1 - h_full) * cash) - SW_COST * dw * sw_full
        c2 = eq_w * e + dw * b
        d0 = eq_w * e + dw * cash
        # 上行月
        rise = np.zeros(len(R), bool)
        rise_orig = np.zeros(len(R), bool)
        near = 0
        for k, i in enumerate(R):
            if i - 12 >= 0 and i + 12 <= N - 1:
                dy = y_all[i + 12] - y_all[i - 12]
                rise[k] = dy >= 1.0
                near += abs(dy - 1.0) < 1e-9
            if i - 24 >= 0:
                rise_orig[k] = y_all[i] - y_all[i - 24] >= 1.0
        keep = np.ones(len(R), bool)
        keep[: eval_from_idx - 11] = False
        if ret_start and c in ret_start:
            keep &= months_all[R] >= ret_start[c]
        out[c] = dict(months=months_all[R][keep], e=e[keep], b=b[keep], cash=cash[keep], h=h_full[keep],
                      sw=sw_full[keep], c1=c1[keep], c2=c2[keep], d0=d0[keep], rise=rise[keep],
                      rise_orig=rise_orig[keep], near=near, eq_w=eq_w)
    return out


def ds(r, s):
    return sharpe(r, s["cash"]) - sharpe(s["d0"], s["cash"])


def merge(vals: dict[str, float]):
    m = float(np.mean([vals[c] for c in vals]))
    eu = [vals[c] for c in vals if c in EURO]
    units = [vals[c] for c in vals if c not in EURO] + ([float(np.mean(eu))] if eu else [])
    return m, float(np.mean(units)), units


def rise_diff(S, key, rkey="rise"):
    per = {}
    for c, s in S.items():
        m = s[rkey]
        n = int(m.sum())
        per[c] = dict(n=n, diff=(float((s[key][m] - s["d0"][m]).mean() * 12 * 100) if n else None))
    used = [per[c]["diff"] for c in per if per[c]["n"] >= 12]
    return (float(np.mean(used)) if used else None), per


def bear_L(S, key):
    per = {}
    num_all = den_all = 0.0
    nev = 0
    for c, s in S.items():
        cand = s[key]
        w = solve_w(cand.std(ddof=1), s["e"], s["cash"])
        M = w * s["e"] + (1 - w) * s["cash"]
        evs = bear_events(s["e"])
        num = sum(math.log1p(cum(cand, a, b)) for a, b in evs)
        den = sum(math.log1p(cum(M, a, b)) for a, b in evs)
        per[c] = dict(w=w, n_events=len(evs), L=(num / den if evs else None),
                      events=[(s["months"][a - 1] if a > 0 else "start", s["months"][b - 1]) for a, b in evs])
        num_all += num
        den_all += den
        nev += len(evs)
    Ls = [p["L"] for p in per.values() if p["L"] is not None]
    return dict(L_pooled=num_all / den_all, L_mean_country=float(np.mean(Ls)), n_events=nev, per=per)


def dedrift(S, with_cost=True):
    per = {}
    for c, s in S.items():
        dw = 1 - s["eq_w"]
        ex = s["b"] - s["cash"]
        bt = s["b"] - ex.mean()
        h = s["h"]
        c1 = s["eq_w"] * s["e"] + dw * (h * bt + (1 - h) * s["cash"])
        if with_cost:
            c1 = c1 - SW_COST * dw * s["sw"]
        p = h.mean()
        fx = s["eq_w"] * s["e"] + dw * (p * bt + (1 - p) * s["cash"])
        per[c] = sharpe(c1, s["cash"]) - sharpe(fx, s["cash"])
    return float(np.mean(list(per.values()))), per


def segment(S, key, lo=None, hi=None):
    vals = {}
    for c, s in S.items():
        m = np.ones(len(s["months"]), bool)
        if lo:
            m &= s["months"] >= lo
        if hi:
            m &= s["months"] <= hi
        if m.sum() < 3:
            continue
        sub = {k: (v[m] if isinstance(v, np.ndarray) else v) for k, v in s.items()}
        vals[c] = ds(sub[key], sub)
    return merge(vals), vals


def placebo(S, actual):
    rng = np.random.default_rng(SEED)
    nmin = min(len(s["h"]) for s in S.values())
    ks = rng.integers(12, nmin - 12 + 1, size=NPLACEBO)
    base = {}
    for c, s in S.items():
        dw = 1 - s["eq_w"]
        base[c] = (s["eq_w"] * s["e"] + dw * s["cash"], dw, s["b"] - s["cash"], sharpe(s["d0"], s["cash"]))
    vals = np.empty(NPLACEBO)
    for t, k in enumerate(ks):
        acc = []
        for c, s in S.items():
            d0, dw, ex, sd0 = base[c]
            h = np.roll(s["h"], int(k))
            r = d0 + dw * h * ex - SW_COST * dw * switches(h)
            acc.append(sharpe(r, s["cash"]) - sd0)
        vals[t] = np.mean(acc)
    hits = int((vals >= actual - 1e-15).sum())
    return dict(p=(hits + 1) / (NPLACEBO + 1), hits=hits, nmin=nmin, k_range=[12, nmin - 12],
                mean=float(vals.mean()), q95=float(np.quantile(vals, 0.95)))


def summary(S, key):
    per = {c: ds(s[key], s) for c, s in S.items()}
    m, u, units = merge(per)
    return dict(merged=m, unit=u, n_pos=sum(v > 0 for v in per.values()), n=len(per),
                units_pos=sum(v > 0 for v in units), n_units=len(units), per=per)


def evaluate(S, key, full=True):
    r = summary(S, key)
    r["rise"], r["rise_per"] = rise_diff(S, key)
    r["rise_orig"], r["rise_orig_per"] = rise_diff(S, key, "rise_orig")
    (m1, u1, _), _ = segment(S, key, hi=SPLIT)
    (m2, u2, _), _ = segment(S, key, lo="2001-01")
    r["seg1"] = dict(merged=m1, unit=u1)
    r["seg2"] = dict(merged=m2, unit=u2)
    if full:
        r["bear"] = bear_L(S, key)
    return r


def gates(r, dd=None, pl=None):
    g = {}
    g["G1"] = r["merged"] >= 0.03 and r["unit"] >= 0.03
    g["G2"] = r["n_pos"] >= 0.7 * r["n"] and r["units_pos"] >= 7
    g["G3"] = r["rise"] is not None and r["rise"] >= -0.50
    g["G5"] = min(r["seg1"]["merged"], r["seg1"]["unit"], r["seg2"]["merged"], r["seg2"]["unit"]) > 0
    if dd is not None:
        g["G4"] = dd >= 0
    if pl is not None:
        g["G6"] = pl <= 0.05
    return g


def verdict_c1(g, ncountry):
    if not g["G1"]:
        v = "不通过"
    elif all(g[k] for k in ["G1", "G2", "G3", "G4", "G5", "G6"]):
        v = "通过"
    elif all(g[k] for k in ["G1", "G2", "G3", "G4", "G5"]):
        v = "部分成立"
    else:
        v = "不通过"
    if ncountry < 6 and v == "通过":
        v = "部分成立"
    return v


def verdict_c2(g):
    if all(g[k] for k in ["G1", "G2", "G3", "G5"]):
        return "通过"
    if (not g["G3"]) and all(g[k] for k in ["G1", "G2", "G5"]):
        return "长期更好，但利率上行期吃亏"
    return "不通过"


def short(S, key):
    r = summary(S, key)
    rr, _ = rise_diff(S, key)
    return dict(merged=r["merged"], unit=r["unit"], n_pos=r["n_pos"], n=r["n"], units_pos=r["units_pos"],
                n_units=r["n_units"], rise=rr, per=r["per"])


def main():
    data = load()
    S = build(data)
    res = {"choices": __doc__}
    c1 = evaluate(S, "c1")
    c2 = evaluate(S, "c2")
    dd, dd_per = dedrift(S)
    dd_nc, dd_nc_per = dedrift(S, with_cost=False)
    pl = placebo(S, c1["merged"])
    g1 = gates(c1, dd, pl["p"])
    g2 = gates(c2)
    res["C1"] = c1
    res["C2"] = c2
    res["C1"]["dedrift"] = dict(merged=dd, per=dd_per, merged_nocost=dd_nc, per_nocost=dd_nc_per)
    res["C1"]["placebo"] = pl
    res["C1"]["gates"] = g1
    res["C2"]["gates"] = g2
    res["C1"]["verdict"] = verdict_c1(g1, len(S))
    res["C2"]["verdict"] = verdict_c2(g2)
    # 持债比例与切换
    hold = {c: float(s["h"].mean()) for c, s in S.items()}
    swy = {c: float(s["sw"].sum() / (len(s["h"]) / 12)) for c, s in S.items()}
    res["C1"]["hold"] = dict(merged=float(np.mean(list(hold.values()))), per=hold)
    res["C1"]["switch_per_year"] = dict(merged=float(np.mean(list(swy.values()))), per=swy)
    res["C1_minus_C2"] = float(np.mean([sharpe(s["c1"], s["cash"]) - sharpe(s["c2"], s["cash"])
                                        for s in S.values()]))
    res["near_boundary_rise"] = {c: int(s["near"]) for c, s in S.items()}
    # 报告项
    rep = {}
    for w in (0.7, 0.5):
        Sw = build(data, eq_w=w)
        rep[f"eq{int(w*100)}"] = dict(C1=short(Sw, "c1"), C2=short(Sw, "c2"))
    rep["lag1"] = dict(C1=short(build(data, lag=1), "c1"))
    rep["ma12"] = dict(C1=short(build(data, ma=12), "c1"))
    rep["ma12_from13"] = dict(C1=short(build(data, ma=12, eval_from_idx=13), "c1"))
    first = {c: S[c]["months"][0] for c in LONG7}
    start7 = max(first.values())
    S7 = build({c: data[c] for c in LONG7}, ret_start={c: start7 for c in LONG7})
    rep["long7"] = dict(start=start7, C1=short(S7, "c1"), C2=short(S7, "c2"))
    Sx = build({c: data[c] for c in COUNTRIES if c != "Switzerland"})
    rep["no_swiss"] = dict(C1=short(Sx, "c1"), C2=short(Sx, "c2"))
    Ss = build(data, ret_start={"Switzerland": "1999-08"})
    rep["swiss_1999"] = dict(C1=short(Ss, "c1"), C2=short(Ss, "c2"))
    Sk = build(data, eq_col="equity_local_kf")
    rep["equity_kf"] = dict(C1=short(Sk, "c1"), C2=short(Sk, "c2"))
    Sm = build(data, bond_override={"Germany": "bond_ret_me", "Japan": "bond_ret_me"})
    rep["bond_me"] = dict(C1=short(Sm, "c1"), C2=short(Sm, "c2"))
    Sf = build(data, first_cost=True)
    rep["first_month_cost"] = dict(C1=short(Sf, "c1"))
    res["report"] = rep

    out = Path(sys.argv[1]) if len(sys.argv) > 1 else None
    pr(res)
    if out:
        out.write_text(json.dumps(res, ensure_ascii=False, indent=1, default=lambda o: o.tolist()
                                  if hasattr(o, "tolist") else str(o)))


def pr(res):
    f = lambda x: "None" if x is None else f"{x:+.6f}"  # noqa: E731
    for k in ("C1", "C2"):
        r = res[k]
        print(f"== {k}: merged ΔS {f(r['merged'])} unit {f(r['unit'])} pos {r['n_pos']}/{r['n']} "
              f"units {r['units_pos']}/{r['n_units']} rise {f(r['rise'])} riseOrig {f(r['rise_orig'])}")
        print(f"   seg1 {f(r['seg1']['merged'])}/{f(r['seg1']['unit'])}  seg2 {f(r['seg2']['merged'])}/"
              f"{f(r['seg2']['unit'])}  bear L pooled {r['bear']['L_pooled']:.6f} mean {r['bear']['L_mean_country']:.6f}"
              f" nev {r['bear']['n_events']}")
        if k == "C1":
            print(f"   dedrift {f(r['dedrift']['merged'])} (nocost {f(r['dedrift']['merged_nocost'])})  placebo {r['placebo']}")
            print(f"   hold {r['hold']['merged']:.6f} sw/yr {r['switch_per_year']['merged']:.6f}")
        print(f"   gates {r['gates']}  -> {r['verdict']}")
        for c in COUNTRIES:
            rp = r["rise_per"][c]
            print(f"   {c:12s} ΔS {f(r['per'][c])} rise n={rp['n']:3d} {f(rp['diff'])} "
                  f"L {r['bear']['per'][c]['L'] if r['bear']['per'][c]['L'] is None else round(r['bear']['per'][c]['L'], 6)}"
                  + (f" dd {f(r['dedrift']['per'][c])} hold {r['hold']['per'][c]:.4f}" if k == "C1" else ""))
    print("C1-C2", f(res["C1_minus_C2"]), "near boundary", res["near_boundary_rise"])
    for k, v in res["report"].items():
        for kk, r in v.items():
            if kk == "start":
                print(k, "start", r)
                continue
            print(f"{k:16s} {kk}: merged {f(r['merged'])} unit {f(r['unit'])} pos {r['n_pos']}/{r['n']} "
                  f"units {r['units_pos']}/{r['n_units']} rise {f(r['rise'])}")


if __name__ == "__main__":
    main()
