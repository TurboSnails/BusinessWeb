"""L-027 趋势防下跌 1871–1934 主检验的独立第二实现（只按 PREREG.md 文字实现）。

运行（仓库根目录）：
    cd research-py && uv run python -m replications.trend_1871_2026_11_26          # 主检验 + 安慰剂
    cd research-py && uv run python -m replications.trend_1871_2026_11_26 --calib  # 已用数据自检

PREREG 没写死、这里做出的解释：
  1. 净值 V_0 = 1 记在第一个收益月之前（1871-12 月末）；事件 V_p 取高点月 p 的月末净值。
  2. 成本 κ×|w_t − w_{t−1}| 从 t 月收益扣；第一个收益月不计。年切换、年换手分子从第二个月起。
  3. 1914 停市：收益月 1914-09..12 用 1914-08 的权重；1915-01 用信号月 1914-07；其余 w_t 用信号月 t−2。
  4. 安慰剂：放置后的权重在防守段内 = 候选降档仓位，其余 = w₀；「停市月照常处理」解释为
     不再套用停市冻结（按放置结果直接取权重），成本同口径；另报套用冻结的敏感性。
  5. G5 判定 pHolm ≤ 0.05；G1 用 L ≤ L*，L* 用全期 w_M；0.30% 成本下 w_M 不变（毛收益配波动）。
  6. w_M 二分：sd(M) < 目标 则 lo = mid，否则 hi = mid；60 次后取 (lo+hi)/2。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
DIR = ROOT / "docs/research/trend-1871-2026-11-26"
W0 = 0.85
RULES = {"C1": 0.70, "C2": 0.50}
EVENTS = [("E1", "1876-03", "1877-06", "early"), ("E2", "1882-09", "1885-01", "early"),
          ("E3", "1893-01", "1893-08", "early"), ("E4", "1902-09", "1903-10", "late"),
          ("E5", "1906-09", "1907-11", "late"), ("E6", "1916-11", "1917-12", "late"),
          ("E7", "1919-10", "1921-08", "late"), ("E8", "1929-09", "1932-06", "late")]
SEED = 20261127
N_PLACEBO = 10_000


def madd(m: str, k: int) -> str:
    y, mo = int(m[:4]), int(m[5:7])
    i = y * 12 + mo - 1 + k
    return f"{i // 12:04d}-{i % 12 + 1:02d}"


def mrange(a: str, b: str) -> list[str]:
    out = [a]
    while out[-1] != b:
        out.append(madd(out[-1], 1))
    return out


def below_ma(P: dict, s: str) -> bool:
    xs = [P[madd(s, -i)] for i in range(10)]
    return P[s] < sum(xs) / 10


def mulberry32(seed: int):
    a = seed & 0xFFFFFFFF

    def imul(x, y):
        return (x * y) & 0xFFFFFFFF

    def nxt() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & 0xFFFFFFFF
        t = a
        t = imul(t ^ (t >> 15), t | 1)
        t ^= (t + imul(t ^ (t >> 7), t | 61)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return nxt


def sd1(x: np.ndarray) -> float:
    return float(np.std(x, ddof=1))


def same_vol_w(r: np.ndarray, c: np.ndarray, target_sd: float) -> float:
    lo, hi = 0.0, 1.5
    for _ in range(60):
        mid = (lo + hi) / 2
        if sd1(mid * r + (1 - mid) * c) < target_sd:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def nav(x: np.ndarray) -> np.ndarray:
    return np.concatenate([[1.0], np.cumprod(1 + x)])


class Ctx:
    def __init__(self, months, r, c, events):
        self.months, self.r, self.c = months, np.asarray(r, float), np.asarray(c, float)
        pos = {m: j + 1 for j, m in enumerate(months)}  # V 下标
        pos[madd(months[0], -1)] = 0
        self.ev = [(eid, pos[p], pos[q], pos[madd(q, 12)], sub) for eid, p, q, sub in events]
        mask = np.ones(len(months), bool)
        for _, ip, _, iq12, _ in self.ev:
            mask[ip:iq12] = False  # 收益月 p+1..q+12 → 下标 ip..iq12-1
        self.calm = mask


def metrics(ctx: Ctx, w: np.ndarray, kappa: float, wM: float | None = None) -> dict:
    r, c = ctx.r, ctx.c
    g = w * r + (1 - w) * c
    dw = np.abs(np.diff(w))
    n = g.copy()
    n[1:] -= kappa * dw
    if wM is None:
        wM = same_vol_w(r, c, sd1(g))
    gM = wM * r + (1 - wM) * c
    gB = W0 * r + (1 - W0) * c
    V, VM = nav(n), nav(gM)
    rows = []
    for eid, ip, iq, iq12, sub in ctx.ev:
        dd, ddM = V[iq] / V[ip] - 1, VM[iq] / VM[ip] - 1
        fc, fcM = V[iq12] / V[ip] - 1, VM[iq12] / VM[ip] - 1
        rows.append((eid, sub, dd, ddM, fc - fcM))

    def agg(sel):
        s = [x for x in rows if sel(x)]
        return (sum(x[2] for x in s) / sum(x[3] for x in s), sum(x[4] for x in s))

    L, dE = agg(lambda x: True)
    out = dict(wM=wM, L=L, dE=dE, wins=sum(x[2] > x[3] for x in rows),
               posE=sum(x[4] > 0 for x in rows), nEvents=len(rows))
    if any(x[0] == "E8" for x in rows):
        out["Lex29"] = agg(lambda x: x[0] != "E8")[0]
        for sub in ("early", "late"):
            out[f"L_{sub}"], out[f"dE_{sub}"] = agg(lambda x, s=sub: x[1] == s)
    m = ctx.calm
    out["calmVsM"] = 12 * (n[m].mean() - gM[m].mean())
    out["calmVsB0"] = 12 * (n[m].mean() - gB[m].mean())
    x, xM = n - c, gM - c
    cer = lambda z: 12 * (z.mean() - 1.5 * np.var(z, ddof=1))
    out["dCER"] = cer(x) - cer(xM)
    out["sharpe"] = x.mean() / sd1(x) * np.sqrt(12)
    out["sharpeM"] = xM.mean() / sd1(xM) * np.sqrt(12)
    yrs = len(w) / 12
    out["switchesPerYear"] = int((dw > 0).sum()) / yrs
    out["turnoverPerYear"] = dw.sum() / yrs
    out["avgW"] = w.mean()
    out["events"] = [(e, round(a, 6), round(b, 6), round(d, 6)) for e, _, a, b, d in rows]
    return out


def gates(m, m30, drop):
    Ls = (W0 - 0.65 * drop) / m["wM"]
    g1 = lambda z: z["L"] <= Ls and z.get("Lex29", 0) <= 1.0 and z["wins"] >= 5
    g2 = lambda z: z["dE"] >= 0 and z["posE"] >= 5
    g3 = lambda z: z["calmVsM"] >= 0
    G = dict(Lstar=Ls, G1=g1(m), G2=g2(m), G3=g3(m))
    if "L_early" in m:
        G["G4"] = all(m[f"L_{s}"] < 1 and m[f"dE_{s}"] >= 0 for s in ("early", "late"))
    G["G6"] = m["dCER"] >= -0.0025
    G["G7"] = m["switchesPerYear"] <= 1.5 and g1(m30) and g2(m30) and g3(m30)
    return G


# ---------------- 数据 ----------------
def load_shiller():
    lines = (ROOT / "data-raw/sp500-backtest/shiller.csv").read_text().strip().split("\n")[1:]
    P, D = {}, {}
    for l in lines:
        f = l.split(",")
        P[f[0]] = float(f[1])
        D[f[0]] = float(f[2]) if f[2] != "" else None
    return P, D


def calib():
    P, D = load_shiller()
    daily = json.loads((ROOT / "data-raw/macro-posture-daily/spx-daily.json").read_text())["rows"]
    C = {}
    for d, cl in daily:
        C[d[:7]] = cl
    ret = json.loads((ROOT / "docs/research/macro-significance-2026-11-25/inputs.json").read_text())["returns"]
    cash = {d: cc for d, _, cc in ret if cc is not None}
    months = mrange("1951-01", "2026-06")
    rA = [(P[t] + D[t] / 12) / P[madd(t, -1)] - 1 for t in months]
    rE = [(C[t] + D[t] / 12) / C[madd(t, -1)] - 1 for t in months]
    c = [cash[t] for t in months]
    # 事件：月末含息总收益指数回撤 ≥ 20%
    idx = nav(np.array(rE))
    raw, pk, cur = [], 0, None
    for j in range(1, len(idx)):
        if idx[j] >= idx[pk]:
            if cur:
                raw.append(cur)
                cur = None
            pk = j
            continue
        if cur is None:
            cur = [pk, j]
        if idx[j] < idx[cur[1]]:
            cur[1] = j
    if cur:
        raw.append(cur)
    ev = []
    for p, t in raw:
        if idx[t] / idx[p] - 1 <= -0.20:
            pm = madd(months[0], -1) if p == 0 else months[p - 1]
            ev.append((f"U{len(ev)+1}", pm, months[t - 1], "all"))
    print("events", [(e[1], e[2]) for e in ev])
    ref = json.loads((DIR / "calibration.json").read_text())
    for cid, low in RULES.items():
        w = np.array([low if below_ma(P, madd(t, -2)) else W0 for t in months])
        ctx = Ctx(months, rA, c, ev)
        m, m30 = metrics(ctx, w, 0.001), metrics(ctx, w, 0.003)
        wE = np.array([low if below_ma(C, madd(t, -1)) else W0 for t in months])
        mE = metrics(Ctx(months, rE, c, ev), wE, 0.001)
        for tag, mm in (("A2", m), ("A2cost30", m30), ("monthEnd", mE)):
            bad = {k: (round(mm[k], 6), v) for k, v in ref[cid][tag].items()
                   if abs(mm[k] - v) > 0.6 * 10 ** -(len(str(v).split(".")[-1]) if "." in str(v) else 0)}
            print(cid, tag, "OK" if not bad else bad)
        print(cid, "deltaL", round(mE["L"] - m["L"], 4), ref[cid]["deltaL"], gates(m, m30, W0 - low))


def main_test(freeze_placebo=False):
    P, D = load_shiller()
    cp = dict(json.loads((DIR / "inputs/cp.json").read_text())["rows"])
    months = mrange("1872-01", "1934-12")
    assert len(months) == 756
    r = np.array([(P[t] + D[t] / 12) / P[madd(t, -1)] - 1 for t in months])
    c = np.array([(0.886 * cp[t] - 0.4) / 1200 for t in months])
    ctx = Ctx(months, r, c, [(e, p, q, s) for e, p, q, s in EVENTS])

    def sig_month(t):
        if t in ("1914-09", "1914-10", "1914-11", "1914-12"):
            return "1914-06"
        if t == "1915-01":
            return "1914-07"
        return madd(t, -2)

    defensive = np.array([below_ma(P, sig_month(t)) for t in months])
    res = {}
    for cid, low in RULES.items():
        w = np.where(defensive, low, W0)
        m = metrics(ctx, w, 0.001)
        m30 = metrics(ctx, w, 0.003, wM=m["wM"])
        res[cid] = dict(m=m, m30=m30, G=gates(m, m30, W0 - low))

    # ---- 安慰剂（附录 A）----
    N = len(months)
    segs, j = [], 0
    while j < N:
        if defensive[j]:
            k = j
            while k < N and defensive[k]:
                k += 1
            segs.append(k - j)
            j = k
        else:
            j += 1
    k = len(segs)
    F = N - sum(segs) - (k - 1)
    halt = [months.index(t) for t in ("1914-09", "1914-10", "1914-11", "1914-12")]
    i08 = months.index("1914-08")
    rng = mulberry32(SEED)
    cnt = {cid: 0 for cid in RULES}
    for _ in range(N_PLACEBO):
        arr = list(range(F + k))
        for i in range(len(arr) - 1, 0, -1):
            jj = int(rng() * (i + 1))
            arr[i], arr[jj] = arr[jj], arr[i]
        bars = sorted(arr[:k])
        gaps = [bars[0]] + [bars[i] - bars[i - 1] - 1 for i in range(1, k)] + [F + k - 1 - bars[-1]]
        for i in range(1, k):
            gaps[i] += 1
        lens = segs[:]
        for i in range(k - 1, 0, -1):
            jj = int(rng() * (i + 1))
            lens[i], lens[jj] = lens[jj], lens[i]
        dmask = np.zeros(N, bool)
        pos = gaps[0]
        for i in range(k):
            dmask[pos:pos + lens[i]] = True
            pos += lens[i] + gaps[i + 1]
        assert pos == N
        if freeze_placebo:
            dmask[halt] = dmask[i08]
        for cid, low in RULES.items():
            wp = np.where(dmask, low, W0)
            Lp = metrics_L(ctx, wp, 0.001)
            if Lp <= res[cid]["m"]["L"]:
                cnt[cid] += 1
    praw = {cid: (1 + cnt[cid]) / (1 + N_PLACEBO) for cid in RULES}
    order = sorted(RULES, key=lambda x: praw[x])
    ph = {}
    ph[order[0]] = min(1.0, 2 * praw[order[0]])
    ph[order[1]] = min(1.0, max(ph[order[0]], praw[order[1]]))
    for cid in RULES:
        res[cid]["pRaw"], res[cid]["pHolm"] = praw[cid], ph[cid]
        res[cid]["G"]["G5"] = ph[cid] <= 0.05
    res["placebo"] = dict(k=k, segs=segs, F=F, freeze=freeze_placebo)
    # ---- 结论 ----
    for cid in RULES:
        G = res[cid]["G"]
        base = all(G[x] for x in ("G1", "G2", "G3", "G4", "G6", "G7"))
        extra_ok = True
        if cid == "C2":
            extra_ok = res["C2"]["m"]["L"] <= res["C1"]["m"]["L"] and res["C2"]["m"]["dE"] >= res["C1"]["m"]["dE"]
            G["C2extra"] = extra_ok
        if not base or not extra_ok:
            v = "不通过"
        elif G["G5"]:
            v = "通过（C2 另需 G9 不触发，本实现未算）" if cid == "C2" else "通过"
        else:
            v = "部分成立"
        res[cid]["verdict"] = v
    return res


def metrics_L(ctx: Ctx, w: np.ndarray, kappa: float) -> float:
    r, c = ctx.r, ctx.c
    g = w * r + (1 - w) * c
    n = g.copy()
    n[1:] -= kappa * np.abs(np.diff(w))
    wM = same_vol_w(r, c, sd1(g))
    V, VM = nav(n), nav(wM * r + (1 - wM) * c)
    a = sum(V[iq] / V[ip] - 1 for _, ip, iq, _, _ in ctx.ev)
    b = sum(VM[iq] / VM[ip] - 1 for _, ip, iq, _, _ in ctx.ev)
    return a / b


def fmt(x):
    if isinstance(x, (float, np.floating)):
        return round(float(x), 8)
    if isinstance(x, (np.bool_,)):
        return bool(x)
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, dict):
        return {k: fmt(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [fmt(v) for v in x]
    return x


if __name__ == "__main__":
    if "--calib" in sys.argv:
        calib()
    else:
        res = main_test(freeze_placebo="--freeze" in sys.argv)
        print(json.dumps(fmt(res), ensure_ascii=False, indent=1))
