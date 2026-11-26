"""L-034 跨国动量轮动的独立第二实现（只按 PREREG.md 文字与输入文件实现，未参考 run.py）。

运行：
    cd research-py && uv run python replications/country_momentum_2026_11_26.py
    cd research-py && uv run python replications/country_momentum_2026_11_26.py --json out.json

结构：不用 pandas，月份编码为整数 y*12+(m-1)，收益放进 (月份 × 市场) 的 numpy 矩阵，缺失为 NaN。

PREREG 没写死、这里做出的选择：
  1. 第一个持有月不计成本；之后成本 = c × ½Σ|w_t − w̃_{t−1}|，w̃ = w(1+r)/(1+g)，g 为扣成本前组合收益。
  2. 最大回撤：净值从 1 起，起点 1 计入峰值；子区间（两半、发表后）从全样本净收益截取，
     子区间 MDD 在截取段上重新以 1 起算。
  3. 年化波动 = 月净收益 std(ddof=1) × √12。
  4. C2 并列按英文名字母序（美国记为 "US"）；C2 形成期 = t−11..t−1 复利；C1 形成期 = t−11..t；
     C1 在 美国 ≥ 海外 时持有美国。
  5. 报告项 1 的 L 个月形成期：C1 = t−L+1..t；C2 = t−L+1..t−1（保留跳过最近一个月）。
  6. 延迟一个月：t 月末信号、t+2 月持有；持有月从 1978-02 起，基准同区间，首月同样不计成本。
  7. C1 绝对动量：赢家 L=12 月复利收益 < 同期 RF 复利（t−11..t）→ 100% 现金（收益 = 当月 RF），
     现金作为第 15 列参与漂移与换手。
  8. 安慰剂：np.roll(W, k, axis=0)，k = 24..552；k 集合关于 N=576 对称，方向不影响 p。
"""
from __future__ import annotations

import argparse
import csv
import json
import math
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
RESEARCH = ROOT / "docs" / "research"
PROC = RESEARCH / "defensive-trend-2026-11-26" / "inputs" / "processed"
FF = RESEARCH / "trend-1871-2026-11-26" / "inputs" / "ff-factors.json"
DEVX = RESEARCH / "country-momentum-2026-11-26" / "inputs" / "Developed_ex_US_3_Factors.csv"

FOREIGN13 = ["Australia", "Belgium", "Canada", "France", "Germany", "Italy", "Japan",
             "Netherlands", "Norway", "Spain", "Sweden", "Switzerland", "UK"]

M0 = 1900 * 12  # 矩阵起点
NM = (2027 - 1900) * 12


def mcode(s: str) -> int:
    y, m = s.split("-")
    return int(y) * 12 + int(m) - 1


def mstr(c: int) -> str:
    return f"{c // 12:04d}-{c % 12 + 1:02d}"


# ---------------------------------------------------------------- 读数据
def load_all():
    series: dict[str, np.ndarray] = {}

    def blank():
        return np.full(NM, np.nan)

    for name in FOREIGN13 + ["Denmark"]:
        a = blank()
        with open(PROC / f"{name}.csv", newline="") as fh:
            for row in csv.DictReader(fh):
                v = row["equity_usd"].strip()
                if v != "":
                    a[mcode(row["month"]) - M0] = float(v)
        series[name] = a

    ff = json.loads(FF.read_text())
    us, rf = blank(), blank()
    for mo, mkt, r in ff["rows"]:
        i = mcode(mo) - M0
        us[i] = (mkt + r) / 100.0
        rf[i] = r / 100.0
    series["US"] = us

    dv = blank()
    with open(DEVX, newline="") as fh:
        rows = list(csv.reader(fh))
    started = False
    for row in rows:
        if not row:
            if started:
                break
            continue
        head = row[0].strip()
        if "Annual" in head:
            break
        if head.isdigit() and len(head) == 6:
            started = True
            mkt, r = float(row[1]), float(row[4])
            code = int(head[:4]) * 12 + int(head[4:]) - 1
            dv[code - M0] = (mkt + r) / 100.0
    series["DEVX"] = dv
    return series, rf


# ---------------------------------------------------------------- 引擎
def simulate(W: np.ndarray, R: np.ndarray, cost: float):
    """W、R：(N, K)。返回 (扣成本后的月净收益, 月换手 ½Σ|Δw|)，首月换手记 0。"""
    g = np.einsum("ij,ij->i", W, R)
    drift = W[:-1] * (1.0 + R[:-1]) / (1.0 + g[:-1])[:, None]
    turn = np.zeros(len(g))
    turn[1:] = 0.5 * np.abs(W[1:] - drift).sum(axis=1)
    return g - cost * turn, turn


def stats(net: np.ndarray, rf: np.ndarray, turn: np.ndarray) -> dict:
    ex = net - rf
    n = len(net)
    nav = np.cumprod(1.0 + net)
    peak = np.maximum.accumulate(np.concatenate([[1.0], nav]))[1:]
    return {
        "n": n,
        "sharpe": float(ex.mean() / ex.std(ddof=1) * math.sqrt(12.0)),
        "cagr": float(nav[-1] ** (12.0 / n) - 1.0),
        "vol": float(net.std(ddof=1) * math.sqrt(12.0)),
        "maxDd": float(min((nav / peak - 1.0).min(), 0.0)),
        "turnoverPerYear": float(turn.sum() / (n / 12.0)),
    }


class Leg:
    """一条持有序列的全样本运行结果。"""

    def __init__(self, hold, net, turn, rfh):
        self.hold, self.net, self.turn, self.rfh = hold, net, turn, rfh

    @classmethod
    def run(cls, W, R, hold, rf, cost):
        net, turn = simulate(W, R, cost)
        return cls(hold, net, turn, rf[hold - M0])

    def window(self, a: str, b: str):
        m = (self.hold >= mcode(a)) & (self.hold <= mcode(b))
        return stats(self.net[m], self.rfh[m], self.turn[m])


def block(c: Leg, b: Leg, a: str, z: str) -> dict:
    assert np.array_equal(c.hold, b.hold)
    sc, sb = c.window(a, z), b.window(a, z)
    return {"cand": sc, "bench": sb, "dS": sc["sharpe"] - sb["sharpe"],
            "dCagr": sc["cagr"] - sb["cagr"], "dDd": sc["maxDd"] - sb["maxDd"]}


PERIODS = {
    "full": ("1978-01", "2025-12"),
    "half1": ("1978-01", "2001-12"),
    "half2": ("2002-01", "2025-12"),
    "post2014": ("2014-01", "2025-12"),
}


def periods(c: Leg, b: Leg, which=("full", "half1", "half2", "post2014")) -> dict:
    out = {}
    for p in which:
        a, z = PERIODS[p]
        if p == "full":
            a, z = mstr(int(c.hold[0])), mstr(int(c.hold[-1]))
        out[p] = block(c, b, a, z)
    return out


def full(c: Leg, b: Leg) -> dict:
    return periods(c, b, ("full",))["full"]


def compound(R: np.ndarray, rows_end: np.ndarray, a: int, b: int) -> np.ndarray:
    """对每个信号行 e（矩阵行号），复利 R[e-a .. e-b]（含两端）。R 为 (NM, K)。"""
    out = np.ones((len(rows_end),) + R.shape[1:])
    for lag in range(b, a + 1):
        out = out * (1.0 + R[rows_end - lag])
    return out - 1.0


# ---------------------------------------------------------------- 策略权重
def universe(series, names):
    return np.column_stack([series[n] for n in names])


def c1_weights(series, rf, foreign, hold, lookback=12, delay=1, absolute=False):
    """返回 (W, R, rf_hold, extra)。列 = [US] + foreign (+ cash)。"""
    names = ["US"] + foreign
    R_all = universe(series, names)
    basket = R_all[:, 1:].mean(axis=1)  # 任一海外缺值则 NaN
    idx = hold - M0
    sig = idx - delay
    us_f = compound(series["US"], sig, lookback - 1, 0)
    ex_f = compound(basket, sig, lookback - 1, 0)
    assert np.all(np.isfinite(us_f)) and np.all(np.isfinite(ex_f)), "形成期缺数据"
    pick_us = us_f >= ex_f
    k = len(foreign)
    ncol = 1 + k + (1 if absolute else 0)
    W = np.zeros((len(hold), ncol))
    W[pick_us, 0] = 1.0
    W[~pick_us, 1:1 + k] = 1.0 / k
    extra = {"us_months": int(pick_us.sum())}
    R = R_all[idx]
    if absolute:
        rf_f = compound(rf, sig, lookback - 1, 0)
        win = np.where(pick_us, us_f, ex_f)
        cash = win < rf_f
        W[cash] = 0.0
        W[cash, -1] = 1.0
        R = np.column_stack([R, rf[idx]])
        extra["cash_months"] = int(cash.sum())
        extra["us_months"] = int((pick_us & ~cash).sum())
    assert np.all(np.isfinite(R[:, :1 + k]))
    return W, R, rf[idx], extra, pick_us


def c1_bench(series, rf, foreign, hold):
    names = ["US"] + foreign
    R = universe(series, names)[hold - M0]
    k = len(foreign)
    W = np.zeros((len(hold), 1 + k))
    W[:, 0] = 0.5
    W[:, 1:] = 0.5 / k
    return W, R


def c2_weights(series, names, hold, top=5, a=11, b=1, delay=1):
    R_all = universe(series, names)
    idx = hold - M0
    sig = idx - delay
    F = compound(R_all, sig, a, b)
    assert np.all(np.isfinite(F)), "形成期缺数据"
    order_name = np.argsort(np.array(names), kind="stable")  # 字母序位置
    rank_alpha = np.empty(len(names), dtype=int)
    rank_alpha[order_name] = np.arange(len(names))
    W = np.zeros((len(hold), len(names)))
    counts = np.zeros(len(names), dtype=int)
    for i in range(len(hold)):
        keys = sorted(range(len(names)), key=lambda j: (-F[i, j], rank_alpha[j]))
        sel = keys[:top]
        W[i, sel] = 1.0 / top
        counts[sel] += 1
    R = R_all[idx]
    assert np.all(np.isfinite(R))
    return W, R, dict(zip(names, counts.tolist()))


def ew_bench(series, names, hold):
    R = universe(series, names)[hold - M0]
    return np.full(R.shape, 1.0 / len(names)), R


def hold_range(a: str, b: str) -> np.ndarray:
    return np.arange(mcode(a), mcode(b) + 1)


# ---------------------------------------------------------------- 主体
def sharpe(net, rfh):
    ex = net - rfh
    return ex.mean() / ex.std(ddof=1) * math.sqrt(12.0)


def placebo(W, R, rfh, cost, s_bench, ds_obs):
    N = W.shape[0]
    dss = np.array([sharpe(simulate(np.roll(W, k, axis=0), R, cost)[0], rfh) - s_bench
                    for k in range(24, N - 24 + 1)])
    p = (int((dss >= ds_obs).sum()) + 1) / (len(dss) + 1)
    return {"pUpper": p, "shifts": len(dss), "median": float(np.median(dss)),
            "p95": float(np.percentile(dss, 95))}


def holm(ps: dict) -> dict:
    items = sorted(ps.items(), key=lambda kv: kv[1])
    m = len(items)
    out, run = {}, 0.0
    for i, (k, p) in enumerate(items):
        run = max(run, min(1.0, (m - i) * p))
        out[k] = run
    return out


def verdict(tab, p_holm):
    f = tab["full"]
    g1 = f["dS"] > 0 and p_holm <= 0.05
    g2 = tab["half1"]["dS"] > 0 and tab["half2"]["dS"] > 0
    g3 = tab["post2014"]["dS"] > 0
    g4 = f["dCagr"] > 0 and f["cand"]["maxDd"] >= 1.15 * f["bench"]["maxDd"]
    if g1 and g2 and g3 and g4:
        v = "通过"
    elif g1 and g2 and g3:
        v = "风险调整更好，但收益或回撤不达标"
    elif f["dS"] > 0 and p_holm > 0.05 and g2 and g3 and g4:
        v = "方向一致，统计上不显著"
    elif f["dS"] > 0:
        v = "不稳定"
    else:
        v = "不通过"
    return {"G1": g1, "G2": g2, "G3": g3, "G4": g4}, v


def us_only(series, hold, rf):
    r = series["US"][hold - M0]
    return Leg(hold, r.copy(), np.zeros(len(hold)), rf[hold - M0])


def current_signal(series, rf, sig_month="2025-12"):
    e = np.array([mcode(sig_month) - M0])
    basket = np.column_stack([series[n] for n in FOREIGN13]).mean(axis=1)
    c1 = int(compound(series["US"], e, 11, 0)[0] >= compound(basket, e, 11, 0)[0])
    c1x = int(compound(series["US"], e, 11, 0)[0] >= compound(series["DEVX"], e, 11, 0)[0])
    names = FOREIGN13 + ["US"]
    F = compound(universe(series, names), e, 11, 1)[0]
    pick = sorted(range(len(names)), key=lambda j: (-F[j], names[j]))[:5]
    return {"c1": c1, "c1devx": c1x, "c2": sorted(names[j] for j in pick), "signalMonth": sig_month}


def run(cost=0.002):
    series, rf = load_all()
    hold = hold_range("1978-01", "2025-12")
    assert len(hold) == 576
    rfh = rf[hold - M0]
    names14 = FOREIGN13 + ["US"]
    res: dict = {"main": {}, "report": {}}

    W1, R1, _, ex1, pick_us = c1_weights(series, rf, FOREIGN13, hold)
    Wb1, Rb1 = c1_bench(series, rf, FOREIGN13, hold)
    W2, R2, cnt2 = c2_weights(series, names14, hold)
    Wb2, Rb2 = ew_bench(series, names14, hold)
    C1, B1 = Leg.run(W1, R1, hold, rf, cost), Leg.run(Wb1, Rb1, hold, rf, cost)
    C2, B2 = Leg.run(W2, R2, hold, rf, cost), Leg.run(Wb2, Rb2, hold, rf, cost)
    t1, t2 = periods(C1, B1), periods(C2, B2)

    pl1 = placebo(W1, R1, rfh, cost, t1["full"]["bench"]["sharpe"], t1["full"]["dS"])
    pl2 = placebo(W2, R2, rfh, cost, t2["full"]["bench"]["sharpe"], t2["full"]["dS"])
    ph = holm({"C1": pl1["pUpper"], "C2": pl2["pUpper"]})
    for c, t, pl in (("C1", t1, pl1), ("C2", t2, pl2)):
        pl["pHolm"] = ph[c]
        g, v = verdict(t, ph[c])
        res["main"][c] = {**t, "placebo": pl, "gates": g, "verdict": v}

    rep = res["report"]
    # 1. 形成期 6、3
    for L in (6, 3):
        W, R, *_ = c1_weights(series, rf, FOREIGN13, hold, lookback=L)
        Wc, Rc, _ = c2_weights(series, names14, hold, a=L - 1, b=1)
        rep[f"lookback{L}"] = {"C1": full(Leg.run(W, R, hold, rf, cost), B1),
                               "C2": full(Leg.run(Wc, Rc, hold, rf, cost), B2)}
    # 2. C2 前 3 / 前 7 / 不跳月
    for tag, kw in (("C2top3", {"top": 3}), ("C2top7", {"top": 7}), ("C2noSkip", {"a": 11, "b": 0})):
        W, R, _ = c2_weights(series, names14, hold, **kw)
        rep[tag] = periods(Leg.run(W, R, hold, rf, cost), B2)
    # 3. 延迟一个月
    hd = hold_range("1978-02", "2025-12")
    W, R, *_ = c1_weights(series, rf, FOREIGN13, hd, delay=2)
    Wb, Rb = c1_bench(series, rf, FOREIGN13, hd)
    Wc, Rc, _ = c2_weights(series, names14, hd, delay=2)
    Wcb, Rcb = ew_bench(series, names14, hd)
    rep["delay1"] = {
        "C1": periods(Leg.run(W, R, hd, rf, cost), Leg.run(Wb, Rb, hd, rf, cost), ("full", "post2014")),
        "C2": periods(Leg.run(Wc, Rc, hd, rf, cost), Leg.run(Wcb, Rcb, hd, rf, cost), ("full", "post2014")),
    }
    # 4. C1 绝对动量
    W, R, _, exa, _ = c1_weights(series, rf, FOREIGN13, hold, absolute=True)
    rep["C1absolute"] = {**periods(Leg.run(W, R, hold, rf, cost), B1), "cashMonths": exa["cash_months"]}
    # 5. 成本 0、0.5%
    for cc in (0.0, 0.005):
        rep[f"cost{cc}"] = {
            "C1": full(Leg.run(W1, R1, hold, rf, cc), Leg.run(Wb1, Rb1, hold, rf, cc)),
            "C2": full(Leg.run(W2, R2, hold, rf, cc), Leg.run(Wb2, Rb2, hold, rf, cc)),
        }
    # 6. 对只持有美国；C1 每年美国比例；C2 入选次数
    US = us_only(series, hold, rf)
    rep["vsUS"] = {k: periods(leg, US) for k, leg in (("C1", C1), ("B1", B1), ("C2", C2), ("B2", B2))}
    years = hold // 12
    rep["c1UsShareByYear"] = {str(y): float(pick_us[years == y].mean()) for y in np.unique(years)}
    rep["c2Picks"] = cnt2
    # 7. 15 市场
    h15 = hold_range("1990-01", "2025-12")
    f14 = sorted(FOREIGN13 + ["Denmark"])
    W, R, *_ = c1_weights(series, rf, f14, h15)
    Wb, Rb = c1_bench(series, rf, f14, h15)
    Wc, Rc, _ = c2_weights(series, f14 + ["US"], h15)
    Wcb, Rcb = ew_bench(series, f14 + ["US"], h15)
    rep["m15from1990"] = {
        "C1": periods(Leg.run(W, R, h15, rf, cost), Leg.run(Wb, Rb, h15, rf, cost), ("full", "post2014")),
        "C2": periods(Leg.run(Wc, Rc, h15, rf, cost), Leg.run(Wcb, Rcb, h15, rf, cost), ("full", "post2014")),
    }
    # 8. C1 + KF Developed ex US
    hx = hold_range("1991-07", "2025-12")
    W, R, _, exx, pux = c1_weights(series, rf, ["DEVX"], hx)
    Wb, Rb = c1_bench(series, rf, ["DEVX"], hx)
    CX = Leg.run(W, R, hx, rf, cost)
    rep["C1devx"] = {**periods(CX, Leg.run(Wb, Rb, hx, rf, cost), ("full", "post2014")),
                     "usShare": float(pux.mean()), "vsUS": full(CX, us_only(series, hx, rf))}
    # 9. C2 费率拖累
    C2f = Leg(hold, C2.net - 0.0045 / 12.0, C2.turn, rfh)
    rep["C2feeDrag"] = full(C2f, B2)
    rep["current"] = current_signal(series, rf)
    return res


def show(res):
    def line(tag, d):
        c, b = d["cand"], d["bench"]
        print(f"  {tag:<22} S {c['sharpe']:.4f}/{b['sharpe']:.4f} dS {d['dS']:+.4f} | CAGR {c['cagr']:.4%}/{b['cagr']:.4%}"
              f" | vol {c['vol']:.4%}/{b['vol']:.4%} | MDD {c['maxDd']:.4%}/{b['maxDd']:.4%} | 换手 {c['turnoverPerYear']:.3f}")

    def walk(x, path):
        if isinstance(x, dict) and "cand" in x:
            line(path, x)
        elif isinstance(x, dict) and path.endswith(("c1UsShareByYear", "c2Picks")):
            print(f"  {path}: " + " ".join(f"{k}:{v:.2f}" if isinstance(v, float) else f"{k}:{v}" for k, v in x.items()))
        elif isinstance(x, dict):
            for k, v in x.items():
                walk(v, f"{path}/{k}" if path else k)
        else:
            print(f"  {path}: {x}")

    for c, m in res["main"].items():
        pl = m["placebo"]
        print(f"== {c}  p={pl['pUpper']:.6f} Holm={pl['pHolm']:.6f} (k 个数 {pl['shifts']})  {m['gates']} → {m['verdict']}")
        for p in ("full", "half1", "half2", "post2014"):
            line(p, m[p])
    print("== 报告项")
    walk(res["report"], "")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--json")
    a = ap.parse_args()
    r = run()
    show(r)
    if a.json:
        Path(a.json).write_text(json.dumps(r, ensure_ascii=False, indent=1))
