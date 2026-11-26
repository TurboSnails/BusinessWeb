"""L-031 十个月均线 14 国确认检验的独立第二实现（只按 PREREG.md 文字实现，未参考 run.py）。

运行（仓库根目录）：
    cd research-py && uv run python -m replications.trend_14_2026_11_26          # 全部
    cd research-py && uv run python -m replications.trend_14_2026_11_26 --json out.json

PREREG 没写死、这里做出的选择：
  1. 每国取 equity_local、cash_ret 都非空的月份（均连续）。I_t = ∏(1+r)，从第一个数据月起累乘；
     第 10 个数据月起有 MA10 信号。t+1：收益月从第 11 个数据月起；t+2（G9）：从第 12 个数据月起，
     且 G9 的事件、w_M 都在它自己的收益月上重算。
  2. 评估区间 = 收益月。买入持有净值 V_0 = 1 记在第一个收益月之前的月末；高点可以是这个起点
     （此时高点月记为起点那个月，用于 G4 分段）。
  3. 20/20：从牛市状态开始；牛市里追踪最高点，V/最高 − 1 ≤ −20% 进入熊市（高点 p = 该最高点）；
     熊市里追踪最低点，V/最低 − 1 ≥ +20% 结束（谷底 q = 该最低点），随后牛市最高点从当月重算。
     新高/新低用严格不等号。样本末仍在熊市：q = 当前最低点。
  4. 原算法（报告项）：从历史最高点开始的回撤段，直到 V ≥ 该最高点结束；段内最低点为谷底；
     最低点相对高点 ≤ −20% 才计入；样本末未收复的段截断。
  5. 成本 κ×|w_t − w_{t−1}| 从收益月 t 扣，第一个收益月不计。M、B0 恒定权重无成本。
  6. w_M：var(c + w(r−c)) = var(g_候选) 的二次方程闭式解，取 [0, 1.5] 内的较大根（ddof 无关）。
  7. 逐段胜出、逐段为正用严格不等号（> 0 / 候选跌幅更小）。
  8. ΔCER 的方差 ddof = 1；非目标期、ΔCER、年切换、平均仓位、年换手均各国先算再等权平均。
     年切换 = 收益月中 w_t ≠ w_{t−1} 的月数（从第二个收益月起）÷（收益月数 / 12）。
  9. 安慰剂：破位序列（已对齐到收益月）用 np.roll(s, k) 循环平移（向后推 k 个月），成本 0.10%，
     每个 k 每国重解 w_M，事件不变。k = 12 … min_国家(收益月数) − 12。另报 np.roll(s, −k)。
     Holm：两 p 排序，p_(1)×2，p_(2)×1，取单调最大并截至 1。
 10. 单元：欧元区 6 国合并 1 个单元、其余 8 国各 1 个。去掉单元后的 L 取 9 个里的最大值判定。
 11. 各国等权 L = 各国 L 的简单平均。
 12. 新增样本：意、日、挪、西、瑞五国 main_ok 首月之前的月份单独成一个样本（自带 10 个月预热，
     事件、w_M 都只在这段里算），汇总 L、ΔE；也列各国。
 13. KF 本币：用 equity_local_kf 替换 equity_local，重做主检验的全部度量（不做安慰剂）。
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "docs/research/defensive-trend-2026-11-26/inputs/processed"
COUNTRIES = ["Australia", "Belgium", "Canada", "Denmark", "France", "Germany", "Italy",
             "Japan", "Netherlands", "Norway", "Spain", "Sweden", "Switzerland", "UK"]
EURO = {"Belgium", "France", "Germany", "Italy", "Netherlands", "Spain"}
NEW_SAMPLE = ["Italy", "Japan", "Norway", "Spain", "Sweden"]
EARLY8 = ["Australia", "Belgium", "France", "Germany", "Spain", "Sweden", "Switzerland", "UK"]
W0 = 0.85
RULES = {"C1": 0.70, "C2": 0.50}
DROP = {"C1": 0.15, "C2": 0.35}
K_LO = 0.001
K_HI = 0.003


def unit_of(cty: str) -> str:
    return "Euro6" if cty in EURO else cty


# ---------------------------------------------------------------- data
def load(col: str = "equity_local") -> dict:
    out = {}
    for c in COUNTRIES:
        d = pd.read_csv(DATA / f"{c}.csv")
        ok = d[col].notna() & d["cash_ret"].notna()
        d = d[ok].reset_index(drop=True)
        out[c] = {"month": d["month"].tolist(), "r": d[col].to_numpy(float),
                  "c": d["cash_ret"].to_numpy(float), "main_ok": d["main_ok"].to_numpy(bool)}
    return out


def breach_series(r: np.ndarray) -> np.ndarray:
    """breach[s] for every data month s (False / nan before s=9)."""
    I = np.cumprod(1 + r)
    b = np.zeros(len(r), dtype=bool)
    for s in range(9, len(r)):
        b[s] = I[s] < I[s - 9:s + 1].mean()
    return b


# ---------------------------------------------------------------- events
def events_2020(V: np.ndarray) -> list[tuple[int, int]]:
    """V: levels 0..n. returns (p, q) level indices."""
    ev = []
    bull = True
    pk = 0
    tr = 0
    peak = 0
    for i in range(1, len(V)):
        if bull:
            if V[i] > V[pk]:
                pk = i
            elif V[i] / V[pk] - 1 <= -0.20:
                bull = False
                peak = pk
                tr = i
        else:
            if V[i] < V[tr]:
                tr = i
            elif V[i] / V[tr] - 1 >= 0.20:
                ev.append((peak, tr))
                bull = True
                pk = i
    if not bull:
        ev.append((peak, tr))
    return ev


def events_orig(V: np.ndarray) -> list[tuple[int, int]]:
    ev = []
    pk = 0
    in_dd = False
    tr = 0
    for i in range(1, len(V)):
        if not in_dd:
            if V[i] > V[pk]:
                pk = i
            elif V[i] < V[pk]:
                in_dd = True
                tr = i
        else:
            if V[i] >= V[pk]:
                if V[tr] / V[pk] - 1 <= -0.20:
                    ev.append((pk, tr))
                in_dd = False
                pk = i
            elif V[i] < V[tr]:
                tr = i
    if in_dd and V[tr] / V[pk] - 1 <= -0.20:
        ev.append((pk, tr))
    return ev


# ---------------------------------------------------------------- country context
class Ctx:
    """One country's evaluation window (return months)."""

    def __init__(self, name, months, r, c, breach_aligned, algo="2020", pre_month=None):
        self.pre_month = pre_month
        self.name = name
        self.months = months  # return-month labels (len n)
        self.r = r
        self.c = c
        self.sig = breach_aligned  # breach of the signal month that sets w for this return month
        self.n = len(r)
        V = np.concatenate([[1.0], np.cumprod(1 + r)])
        self.V = V
        evs = events_2020(V) if algo == "2020" else events_orig(V)
        self.events = []
        for p, q in evs:
            fc_end = min(q + 12, self.n)
            self.events.append({
                "p": p, "q": q,
                "dd": slice(p, q),          # return-month indices p..q-1 (levels p+1..q)
                "fc": slice(p, fc_end),
                "peak_month": self.pre_month if p == 0 else months[p - 1],
                "trough_month": self.pre_month if q == 0 else months[q - 1],
            })
        mask = np.ones(self.n, dtype=bool)
        for e in self.events:
            mask[e["fc"]] = False
        self.nontarget = mask


def make_ctx(name, d, lag=1, lo=0, hi=None, algo="2020", r_override=None):
    r_all = d["r"] if r_override is None else r_override
    c_all = d["c"]
    months = d["month"]
    hi = len(r_all) if hi is None else hi
    r_w = r_all[lo:hi]
    c_w = c_all[lo:hi]
    m_w = months[lo:hi]
    b = breach_series(r_w)
    start = 9 + lag
    ret_idx = np.arange(start, len(r_w))
    sig = b[ret_idx - lag]
    ctx = Ctx(name, m_w[start:], r_w[start:], c_w[start:], sig, algo, pre_month=m_w[start - 1])
    return ctx


def weights(sig: np.ndarray, rule: str) -> np.ndarray:
    return np.where(sig, RULES[rule], W0)


def net(ctx: Ctx, w: np.ndarray, kappa: float) -> tuple[np.ndarray, np.ndarray]:
    g = w * ctx.r + (1 - w) * ctx.c
    cost = np.zeros(ctx.n)
    cost[1:] = kappa * np.abs(np.diff(w))
    return g, g - cost


def solve_wM(r, c, target_var):
    d = r - c
    vc = np.var(c)
    cv = np.mean((c - c.mean()) * (d - d.mean()))
    vd = np.var(d)
    # vd w^2 + 2 cv w + vc - target = 0
    A, B, C = vd, 2 * cv, vc - target_var
    disc = B * B - 4 * A * C
    disc = max(disc, 0.0)
    roots = [(-B + np.sqrt(disc)) / (2 * A), (-B - np.sqrt(disc)) / (2 * A)]
    ok = [x for x in roots if -1e-12 <= x <= 1.5 + 1e-12]
    assert ok, roots
    return float(min(max(max(ok), 0.0), 1.5))


def ret(x: np.ndarray) -> float:
    return float(np.prod(1 + x) - 1)


def country_eval(ctx: Ctx, w: np.ndarray, kappa: float, wM: float | None = None):
    g, nC = net(ctx, w, kappa)
    if wM is None:
        wM = solve_wM(ctx.r, ctx.c, np.var(g))
    nM = wM * ctx.r + (1 - wM) * ctx.c
    nB = W0 * ctx.r + (1 - W0) * ctx.c
    evs = []
    for e in ctx.events:
        evs.append({
            "country": ctx.name, "unit": unit_of(ctx.name),
            "peak_month": e["peak_month"], "trough_month": e["trough_month"],
            "ddC": ret(nC[e["dd"]]), "ddM": ret(nM[e["dd"]]),
            "fcC": ret(nC[e["fc"]]), "fcM": ret(nM[e["fc"]]),
            "wM": wM,
        })
    nt = ctx.nontarget
    nontgt = 12 * (nC[nt].mean() - nM[nt].mean()) if nt.any() else np.nan
    nontgt_B0 = 12 * (nC[nt].mean() - nB[nt].mean()) if nt.any() else np.nan
    cer = lambda x: 12 * (x.mean() - 1.5 * np.var(x, ddof=1))
    dcer = cer(nC - ctx.c) - cer(nM - ctx.c)
    yrs = ctx.n / 12
    sw = np.count_nonzero(np.diff(w) != 0) / yrs
    to = np.abs(np.diff(w)).sum() / yrs
    return {"wM": wM, "events": evs, "nontgt": nontgt, "nontgt_B0": nontgt_B0, "dcer": dcer,
            "switch": sw, "turnover": to, "avg_w": float(w.mean())}


def agg_events(evs: list[dict], rule: str | None = None, wM_by=None) -> dict:
    if not evs:
        return {"n": 0, "L": np.nan, "win": np.nan, "dE": 0.0, "pos": np.nan}
    ddC = np.array([e["ddC"] for e in evs])
    ddM = np.array([e["ddM"] for e in evs])
    fcC = np.array([e["fcC"] for e in evs])
    fcM = np.array([e["fcM"] for e in evs])
    out = {"n": len(evs), "L": float(ddC.sum() / ddM.sum()),
           "win": float(np.mean(ddC > ddM)),
           "dE": float((fcC - fcM).sum()), "pos": float(np.mean(fcC - fcM > 0))}
    if rule is not None:
        wts = np.array([(W0 - 0.65 * DROP[rule]) / e["wM"] for e in evs])
        out["Lstar"] = float((wts * ddM).sum() / ddM.sum())
    return out


def run_rule(ctxs: dict, rule: str, kappa: float = K_LO, sig_override: dict | None = None):
    per = {}
    for name, ctx in ctxs.items():
        s = ctx.sig if sig_override is None else sig_override[name]
        per[name] = country_eval(ctx, weights(s, rule), kappa)
    return per


def L_only(ctxs: dict, rule: str, sigs: dict, kappa=K_LO) -> float:
    num = den = 0.0
    for name, ctx in ctxs.items():
        w = weights(sigs[name], rule)
        g, nC = net(ctx, w, kappa)
        wM = solve_wM(ctx.r, ctx.c, np.var(g))
        nM = wM * ctx.r + (1 - wM) * ctx.c
        for e in ctx.events:
            num += ret(nC[e["dd"]])
            den += ret(nM[e["dd"]])
    return num / den


def summarize(per: dict, rule: str) -> dict:
    evs = [e for p in per.values() for e in p["events"]]
    out = agg_events(evs, rule)
    avg = lambda k: float(np.nanmean([p[k] for p in per.values()]))
    out.update({"nontgt": avg("nontgt"), "nontgt_B0": avg("nontgt_B0"), "dcer": avg("dcer"),
                "switch": avg("switch"), "turnover": avg("turnover"), "avg_w": avg("avg_w")})
    units = sorted({e["unit"] for e in evs})
    out["unit_L"] = {u: agg_events([e for e in evs if e["unit"] == u])["L"] for u in units}
    out["drop_unit_L"] = {u: agg_events([e for e in evs if e["unit"] != u])["L"] for u in units}
    out["n_units_L_lt1"] = int(sum(v < 1 for v in out["unit_L"].values()))
    early = [e for e in evs if e["peak_month"] <= "2000-12"]
    late = [e for e in evs if e["peak_month"] >= "2001-01"]
    out["half1"] = agg_events(early)
    out["half2"] = agg_events(late)
    out["country"] = {c: {**agg_events(p["events"]), "wM": p["wM"], "nontgt": p["nontgt"], "dcer": p["dcer"],
                          "avg_w": p["avg_w"]} for c, p in per.items()}
    out["wbarM"] = float(np.mean([p["wM"] for p in per.values()]))
    out["events"] = evs
    out["eqw_L"] = float(np.nanmean([v["L"] for v in out["country"].values()]))
    out["ex_Japan"] = agg_events([e for e in evs if e["country"] != "Japan"])
    out["early8"] = agg_events([e for e in evs if e["country"] in EARLY8])
    return out


def holm(ps: dict) -> dict:
    keys = sorted(ps, key=lambda k: ps[k])
    m = len(keys)
    adj = {}
    run = 0.0
    for i, k in enumerate(keys):
        run = max(run, min(1.0, (m - i) * ps[k]))
        adj[k] = run
    return adj


def placebo(ctxs: dict, rule: str, L_real: float, direction: int = 1):
    nmin = min(ctx.n for ctx in ctxs.values())
    ks = list(range(12, nmin - 12 + 1))
    Ls = []
    for k in ks:
        sigs = {n: np.roll(ctx.sig, direction * k) for n, ctx in ctxs.items()}
        Ls.append(L_only(ctxs, rule, sigs))
    Ls = np.array(Ls)
    cnt = int(np.sum(Ls <= L_real))
    return {"K": len(ks), "k_min": ks[0], "k_max": ks[-1], "count_le": cnt,
            "p": (cnt + 1) / (len(ks) + 1), "L_median": float(np.median(Ls))}


def gates(s: dict, s30: dict, s_t2: dict, p_holm: float, rule: str) -> dict:
    G = {}
    G["G1"] = bool(s["L"] <= s["Lstar"] and s["win"] >= 0.625 and max(s["drop_unit_L"].values()) < 1.0)
    G["G2"] = bool(s["dE"] >= 0 and s["pos"] >= 0.625)
    G["G3"] = bool(s["nontgt"] >= 0)
    G["G4"] = bool(s["half1"]["L"] < 1 and s["half1"]["dE"] >= 0 and s["half2"]["L"] < 1 and s["half2"]["dE"] >= 0)
    G["G5"] = bool(p_holm <= 0.05)
    G["G6"] = bool(s["dcer"] >= -0.0025)
    g1_30 = s30["L"] <= s30["Lstar"] and s30["win"] >= 0.625
    g2_30 = s30["dE"] >= 0 and s30["pos"] >= 0.625
    g3_30 = s30["nontgt"] >= 0
    G["G7"] = bool(s["switch"] <= 1.5 and g1_30 and g2_30 and g3_30)
    G["G8"] = bool(s["n_units_L_lt1"] >= 7)
    G["G9"] = bool(s_t2["L"] < 1 and s_t2["dE"] >= 0)
    return G


def verdict(G: dict, extra_ok: bool = True) -> str:
    others = [G[k] for k in ["G1", "G2", "G3", "G4", "G6", "G7", "G8", "G9"]]
    if not all(others) or not extra_ok:
        return "不通过"
    return "通过" if G["G5"] else "部分成立"


def main(json_out: str | None = None, quick: bool = False):
    data = load()
    ctx1 = {n: make_ctx(n, d, lag=1) for n, d in data.items()}
    ctx2 = {n: make_ctx(n, d, lag=2) for n, d in data.items()}
    ctxO = {n: make_ctx(n, d, lag=1, algo="orig") for n, d in data.items()}
    res = {"meta": {n: {"start": c.months[0], "end": c.months[-1], "n_ret": c.n, "n_events": len(c.events)}
                    for n, c in ctx1.items()}}
    S = {}
    for rule in RULES:
        s = summarize(run_rule(ctx1, rule, K_LO), rule)
        s30 = summarize(run_rule(ctx1, rule, K_HI), rule)
        st2 = summarize(run_rule(ctx2, rule, K_LO), rule)
        sO = summarize(run_rule(ctxO, rule, K_LO), rule)
        S[rule] = {"main": s, "cost30": s30, "t2": st2, "orig": sO}
    ps = {}
    for rule in RULES:
        if quick:
            ps[rule] = {"p": np.nan}
            continue
        ps[rule] = placebo(ctx1, rule, S[rule]["main"]["L"], 1)
        ps[rule]["reverse"] = placebo(ctx1, rule, S[rule]["main"]["L"], -1)
    ph = holm({r: ps[r]["p"] for r in RULES})
    ph_rev = holm({r: ps[r]["reverse"]["p"] for r in RULES}) if not quick else {}
    for rule in RULES:
        S[rule]["placebo"] = ps[rule]
        S[rule]["p_holm"] = ph[rule]
        S[rule]["p_holm_reverse"] = ph_rev.get(rule)
        G = gates(S[rule]["main"], S[rule]["cost30"], S[rule]["t2"], ph[rule], rule)
        S[rule]["gates"] = G
    m1, m2 = S["C1"]["main"], S["C2"]["main"]
    extra = bool(m2["L"] <= m1["L"] and m2["dE"] >= m1["dE"])
    S["C2"]["extra"] = extra
    S["C1"]["verdict"] = verdict(S["C1"]["gates"])
    S["C2"]["verdict"] = verdict(S["C2"]["gates"], extra)
    res["rules"] = S

    # 新增样本
    ns = {}
    for rule in RULES:
        evs = []
        per = {}
        for n in NEW_SAMPLE:
            d = data[n]
            hi = int(np.argmax(d["main_ok"]))
            ctx = make_ctx(n, d, lag=1, lo=0, hi=hi)
            ce = country_eval(ctx, weights(ctx.sig, rule), K_LO)
            evs += ce["events"]
            per[n] = {**agg_events(ce["events"]), "window": f"{ctx.months[0]}..{ctx.months[-1]}"}
        ns[rule] = {"pooled": agg_events(evs), "country": per}
    res["new_sample"] = ns

    # KF 本币
    dkf = load("equity_local_kf")
    ctxK = {n: make_ctx(n, d, lag=1) for n, d in dkf.items()}
    res["kf_local"] = {rule: summarize(run_rule(ctxK, rule, K_LO), rule) for rule in RULES}

    report(res)
    if json_out:
        Path(json_out).write_text(json.dumps(res, ensure_ascii=False, indent=1, default=float))
    return res


def f(x, d=4):
    return "nan" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:.{d}f}"


def report(res):
    print("== 样本")
    for n, m in res["meta"].items():
        print(f"  {n:12s} {m['start']}..{m['end']} 收益月 {m['n_ret']}  事件 {m['n_events']}")
    for rule, S in res["rules"].items():
        s = S["main"]
        print(f"\n===== {rule}")
        print(f"  n={s['n']} L={f(s['L'],6)} L*={f(s['Lstar'],6)} 胜出={f(s['win'])} "
              f"ΔE={f(s['dE'],6)} 逐段为正={f(s['pos'])}")
        print(f"  去掉单元 L: " + ", ".join(f"{u}:{f(v)}" for u, v in s["drop_unit_L"].items())
              + f"  max={f(max(s['drop_unit_L'].values()),6)}")
        print(f"  单元 L: " + ", ".join(f"{u}:{f(v)}" for u, v in s["unit_L"].items())
              + f"  <1 个数={s['n_units_L_lt1']}")
        print(f"  非目标期={f(s['nontgt'],6)} 对B0={f(s['nontgt_B0'],6)} ΔCER={f(s['dcer'],6)} "
              f"切换/年={f(s['switch'])} 换手/年={f(s['turnover'])} 平均仓位={f(s['avg_w'])}")
        for h in ["half1", "half2"]:
            print(f"  {h}: n={s[h]['n']} L={f(s[h]['L'],6)} ΔE={f(s[h]['dE'],6)}")
        c = S["cost30"]
        print(f"  0.30%: L={f(c['L'],6)} L*={f(c['Lstar'],6)} 胜出={f(c['win'])} ΔE={f(c['dE'],6)} "
              f"为正={f(c['pos'])} 非目标期={f(c['nontgt'],6)}")
        t = S["t2"]
        print(f"  t+2: n={t['n']} L={f(t['L'],6)} ΔE={f(t['dE'],6)}")
        o = S["orig"]
        print(f"  原算法: n={o['n']} L={f(o['L'],6)} ΔE={f(o['dE'],6)}")
        print(f"  各国等权 L={f(s['eqw_L'],6)}  去掉日本 L={f(s['ex_Japan']['L'],6)} ΔE={f(s['ex_Japan']['dE'],6)}"
              f"  早8国 L={f(s['early8']['L'],6)} ΔE={f(s['early8']['dE'],6)}")
        pl = S["placebo"]
        if "K" in pl:
            print(f"  安慰剂: K={pl['K']} k={pl['k_min']}..{pl['k_max']} ≤个数={pl['count_le']} p={f(pl['p'],6)} "
                  f"Holm={f(S['p_holm'],6)}  | 反向 p={f(pl['reverse']['p'],6)} Holm={f(S['p_holm_reverse'],6)}")
        print(f"  判定: {S['gates']}" + (f"  附加={S['extra']}" if 'extra' in S else "") + f"  → {S['verdict']}")
        print("  各国:")
        for cn, v in s["country"].items():
            print(f"    {cn:12s} n={v['n']} L={f(v['L'],6)} 胜出={f(v['win'],3)} ΔE={f(v['dE'],6)} wM={f(v['wM'],6)}")
    print("\n== 新增样本")
    for rule, v in res["new_sample"].items():
        p = v["pooled"]
        print(f"  {rule}: n={p['n']} L={f(p['L'],6)} ΔE={f(p['dE'],6)} 胜出={f(p['win'])}")
        for cn, x in v["country"].items():
            print(f"    {cn:8s} {x['window']} n={x['n']} L={f(x['L'],4)} ΔE={f(x['dE'],4)}")
    print("\n== KF 本币")
    for rule, s in res["kf_local"].items():
        print(f"  {rule}: n={s['n']} L={f(s['L'],6)} L*={f(s['Lstar'],6)} ΔE={f(s['dE'],6)} 胜出={f(s['win'])}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--json")
    ap.add_argument("--quick", action="store_true")
    a = ap.parse_args()
    main(a.json, a.quick)
