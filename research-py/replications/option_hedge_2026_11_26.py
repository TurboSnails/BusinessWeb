"""L-029 期权保护防急跌的独立第二实现（只按 PREREG.md 文字实现，不读 run.py / results.json）。

运行（仓库根目录）：
    cd research-py && uv run python -m replications.option_hedge_2026_11_26 [out.json]

PREREG 没写死、这里做出的选择：
  1. 日历：processed/cboe_daily.csv 的行（仓库标普交易日）。主区间净值以 1986-06-30 收盘 = 1 起算，
     日收益取 1986-07-01..2026-10-30。指数缺失日按前值填充（当天收益 0）。
  2. 股票日收益 = close_t/close_{t-1} − 1 + 月股息/当月交易日数；月股息 = 月含息收益 − (月均价/上月均价 − 1)；
     现金日收益 = 当月国库券月收益/当月交易日数。当月交易日数按仓库日线（e1 load_inputs 的 closes）计。
  3. 事件：每个 j 的回看窗口为 [j−60, j−1]，区间开头不足 60 天时截断（含起点净值）；同值取最早的 i。
     候选 = 每个 j 一个 (i(j), j)；「有重叠」按闭区间相交（共享端点也算重叠）。
  4. 日波动标准差 ddof=1（比值与 ddof 无关）；w 用 brentq 在 [0,2] 求解。
  5. 夏普：自然月内日收益连乘得月收益，减当月国库券月收益（原值，不连乘），√12 × 均值 / 样本标准差。
     另报 *_compCash：现金月收益取日分摊值连乘（主实现 run.py 的口径，两者相差约 1e-5–1e-4）。
  6. 年化 = 期末净值^(252/日数) − 1；年化波动 = 日标准差 × √252；最大回撤含起点 1。
  7. G5 成本：指数日收益减 0.005/252（算术），组合即每日减 0.8×0.005/252；w 不变（常数平移不改变标准差）。
  8. 子期 L：用全期检测出的事件，按低点 j 所在日期归入子期（另打印「子期内重新检测」的对照）。
  9. 1990 敏感性：区间改为净值从 1989-12-29 收盘起算、日收益从 1990-01-02 起，w 重新匹配、事件重新检测。
     去掉 1987：全期 w 与事件，只去掉高点在 1987 年的事件。
 10. M_ex：去掉全部事件窗口内的日收益（第 i+1..j 日）后按日波动匹配；M_mon：自然月收益标准差匹配。
     两者报告 w、L、胜出、ΔA。M_mon 的 M 月收益取「日再平衡 M」的日收益连乘（与 PREREG 对 M 的定义一致）；
     另报 M_mon_linAlt：M 月收益 = w×股票月收益 + (1−w)×现金月收益（主实现 run.py 的口径）。
 11. w_L：Σ ln(1+R_M(w),e) = Σ ln(1+R_cand,e)，brentq 在 [0,2]；报告 w_L 与 ΔA = A_cand − A_M(w_L)。
 12. 谷底后 60 日：(NAV_c[j+60]/NAV_c[j]) − (NAV_M[j+60]/NAV_M[j])，不足 60 天截到区间末；报告逐事件、均值、中位数。
 13. 探索项：区间起点为该指数首个有值日（PUT 为 2007-01-03）的收盘，终点 2026-10-30，w 重新匹配、事件重新检测。
     CLL 拼接：2020-07-10 及以前取 CLL_legacy 水平，之后取 CLL 水平（两者 2020-07-10 相等）。
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import brentq

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from engines.e1 import load_inputs, month_after  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CSV = ROOT / "docs/research/option-hedge-2026-11-26/inputs/processed/cboe_daily.csv"
END = "2026-10-30"
SPLIT = "2006-01-01"
COST = 0.005
LOOK = 60
THRESH = -0.15


# ---------------------------------------------------------------- inputs
def build_daily() -> pd.DataFrame:
    inp = load_inputs()
    df = pd.read_csv(CSV, index_col=0)
    df.index = df.index.astype(str)
    closes = inp.closes
    month_n = pd.Series([d[:7] for d in closes.index]).value_counts()
    months = np.array([d[:7] for d in df.index])

    def div(m: str) -> float:
        return float(inp.spx_ret[m] - (inp.price[m] / inp.price[month_after(m, -1)] - 1))

    uniq = sorted(set(months))
    div_d = {m: div(m) / month_n[m] for m in uniq if m in inp.spx_ret.index and month_after(m, -1) in inp.price.index}
    cash_d = {m: float(inp.cash[m]) / month_n[m] for m in uniq if m in inp.cash.index}
    px = df["spx_repo"].to_numpy()
    # sanity: csv spx equals repo closes
    assert np.allclose(px, closes.reindex(df.index).to_numpy())
    stock = np.full(len(df), np.nan)
    stock[1:] = px[1:] / px[:-1] - 1 + np.array([div_d.get(m, np.nan) for m in months[1:]])
    cash = np.array([cash_d.get(m, np.nan) for m in months])
    out = pd.DataFrame({"stock": stock, "cash": cash, "month": months}, index=df.index)
    out["cash_month"] = [float(inp.cash[m]) if m in inp.cash.index else np.nan for m in months]
    levels = df.drop(columns=["spx_repo"]).copy()
    # CLL 拼接
    cll = levels["CLL_legacy"].where(levels.index <= "2020-07-10", levels["CLL"])
    levels["CLL_splice"] = cll
    return out, levels


def index_returns(level: pd.Series, start: str) -> tuple[pd.Series, list[str]]:
    """start 为基期（净值 1）日期；返回 start 之后到 END 的日收益（前值填充）及填充日列表。"""
    s = level.loc[start:END]
    assert not math.isnan(s.iloc[0]), start
    filled = s.index[s.isna()].tolist()
    s = s.ffill()
    return (s / s.shift(1) - 1).iloc[1:], filled


# ---------------------------------------------------------------- helpers
def nav_of(r: np.ndarray) -> np.ndarray:
    return np.concatenate([[1.0], np.cumprod(1 + r)])


def detect_events(nav: np.ndarray) -> list[tuple[int, int, float]]:
    n = len(nav)
    cand = []
    for j in range(1, n):
        lo = max(0, j - LOOK)
        seg = nav[lo:j]
        i = lo + int(np.argmax(seg))
        cand.append((nav[j] / nav[i] - 1, i, j))
    cand.sort(key=lambda t: (t[0], t[2]))
    events = []
    alive = [c for c in cand if c[0] <= THRESH]
    while alive:
        d, i, j = alive[0]
        events.append((i, j, d))
        alive = [c for c in alive if not (c[1] <= j and i <= c[2])]
    events.sort(key=lambda t: t[0])
    return events


def win_ret(nav: np.ndarray, ev) -> np.ndarray:
    return np.array([nav[j] / nav[i] - 1 for i, j, _ in ev])


def L_of(nav_c, nav_m, ev) -> float:
    if not ev:
        return float("nan")
    return float(np.sum(np.log1p(win_ret(nav_c, ev))) / np.sum(np.log1p(win_ret(nav_m, ev))))


def ann(r: np.ndarray) -> float:
    return float(np.prod(1 + r) ** (252 / len(r)) - 1)


def monthly(r: np.ndarray, months: np.ndarray) -> pd.Series:
    return pd.Series(1 + r).groupby(months).prod() - 1


def sharpe(r: np.ndarray, months: np.ndarray, cash_m: pd.Series) -> float:
    """cash_m: 月 -> 当月现金收益（原始月值，或日分摊后连乘的月值）。"""
    m = monthly(r, months)
    ex = m.to_numpy() - cash_m.loc[m.index].to_numpy()
    return float(math.sqrt(12) * ex.mean() / ex.std(ddof=1))


def max_dd(r: np.ndarray) -> float:
    nav = nav_of(r)
    return float((nav / np.maximum.accumulate(nav) - 1).min())


def solve_w(target: float, f) -> float:
    return float(brentq(lambda w: f(w) - target, 0.0, 2.0, xtol=1e-15, rtol=1e-15, maxiter=500))


# ---------------------------------------------------------------- analysis of one candidate
def analyse(name: str, idx_level: pd.Series, start: str, base: pd.DataFrame, full=True) -> dict:
    ri, filled = index_returns(idx_level, start)
    b = base.loc[ri.index]
    s, c = b["stock"].to_numpy(), b["cash"].to_numpy()
    months = b["month"].to_numpy()
    cash_m = base.groupby("month")["cash_month"].first()
    cash_mc = monthly(c, months)  # 备选：日分摊现金连乘
    dates = [start] + ri.index.tolist()
    rc = 0.8 * ri.to_numpy() + 0.2 * c
    rc_cost = 0.8 * (ri.to_numpy() - COST / 252) + 0.2 * c
    rm = lambda w: w * s + (1 - w) * c  # noqa: E731
    nav_c, nav_cc, nav_s = nav_of(rc), nav_of(rc_cost), nav_of(s)

    w = solve_w(np.std(rc, ddof=1), lambda w: np.std(rm(w), ddof=1))
    nav_m = nav_of(rm(w))
    ev = detect_events(nav_s)
    Rc, Rm = win_ret(nav_c, ev), win_ret(nav_m, ev)
    wins = int(np.sum(Rc > Rm))
    L = L_of(nav_c, nav_m, ev)
    dA = ann(rc) - ann(rm(w))
    dS = sharpe(rc, months, cash_m) - sharpe(rm(w), months, cash_m)
    dS_c = sharpe(rc, months, cash_mc) - sharpe(rm(w), months, cash_mc)
    rb = 0.8 * s + 0.2 * c
    nav_b = nav_of(rb)
    Rb = win_ret(nav_b, ev)
    res = {
        "name": name, "start": start, "end": END, "days": len(rc), "filled": filled,
        "w": w, "L": L, "nEvents": len(ev), "wins": wins, "dA": dA, "dSharpe": dS, "dSharpe_compCash": dS_c,
        "A_cand": ann(rc), "A_M": ann(rm(w)),
        "events": [
            {"i": i, "j": j, "peak": dates[i], "trough": dates[j], "spxDraw": d, "cand": float(a), "M": float(m),
             "b80": float(bb), "ratio": float(np.log1p(a) / np.log1p(m)),
             "after60": float(nav_c[min(j + 60, len(nav_c) - 1)] / nav_c[j] - nav_m[min(j + 60, len(nav_m) - 1)] / nav_m[j]),
             "filledEnd": (dates[i] in filled) or (dates[j] in filled)}
            for (i, j, d), a, m, bb in zip(ev, Rc, Rm, Rb)
        ],
    }
    if not full:
        return res

    # 加成本
    res["L_cost"] = L_of(nav_cc, nav_m, ev)
    res["dA_cost"] = ann(rc_cost) - ann(rm(w))
    res["dSharpe_cost"] = sharpe(rc_cost, months, cash_m) - sharpe(rm(w), months, cash_m)
    res["dSharpe_cost_compCash"] = sharpe(rc_cost, months, cash_mc) - sharpe(rm(w), months, cash_mc)
    # 子期（全期 w，全期事件按低点归属）
    sub = {}
    for tag, lo, hi in (("p1", "0000", SPLIT), ("p2", SPLIT, "9999")):
        e2 = [e for e in ev if lo <= dates[e[1]] < hi]
        if not e2:
            sub[tag] = {"L": float("nan"), "n": 0, "wins": 0, "L_redetect": float("nan"), "n_redetect": 0}
            continue
        sub[tag] = {"L": L_of(nav_c, nav_m, e2), "n": len(e2), "wins": int(sum(win_ret(nav_c, e2) > win_ret(nav_m, e2)))}
        # 对照：子期内重新检测
        k = np.array([lo <= d < hi for d in dates[1:]])
        rs_, rc_, rmm = s[k], rc[k], rm(w)[k]
        e3 = detect_events(nav_of(rs_))
        sub[tag]["L_redetect"] = L_of(nav_of(rc_), nav_of(rmm), e3)
        sub[tag]["n_redetect"] = len(e3)
    res["sub"] = sub
    # 去掉 1987
    e_no87 = [e for e in ev if not dates[e[0]].startswith("1987")]
    res["L_no1987"] = L_of(nav_c, nav_m, e_no87)
    res["wins_no1987"] = int(sum(win_ret(nav_c, e_no87) > win_ret(nav_m, e_no87)))
    res["n_no1987"] = len(e_no87)

    # 对现行 B80（以及 M）
    def stats(r, nav):
        return {"A": ann(r), "vol": float(np.std(r, ddof=1) * math.sqrt(252)), "maxDD": max_dd(r),
                "sharpe": sharpe(r, months, cash_m), "sharpe_compCash": sharpe(r, months, cash_mc),
                "eventLog": float(np.sum(np.log1p(win_ret(nav, ev))))}
    res["B80"] = {"cand": stats(rc, nav_c), "M": stats(rm(w), nav_m), "B80": stats(rb, nav_b)}
    # M_mon
    mc = monthly(rc, months).to_numpy()
    w_mon = solve_w(np.std(mc, ddof=1), lambda w: np.std(monthly(rm(w), months).to_numpy(), ddof=1))
    # M_ex
    mask = np.ones(len(rc), bool)
    for i, j, _ in ev:
        mask[i:j] = False  # 日收益下标 i..j-1 对应第 i+1..j 日
    w_ex = solve_w(np.std(rc[mask], ddof=1), lambda w: np.std(rm(w)[mask], ddof=1))
    # 备选：M 的月收益取 w×股票月收益 + (1−w)×现金月收益（按月再平衡的近似）
    Sm, Cm = monthly(s, months).to_numpy(), monthly(c, months).to_numpy()
    w_mon_lin = solve_w(np.std(mc, ddof=1), lambda w: np.std(w * Sm + (1 - w) * Cm, ddof=1))
    for tag, ww in (("M_mon", w_mon), ("M_ex", w_ex), ("M_mon_linAlt", w_mon_lin)):
        nm = nav_of(rm(ww))
        res[tag] = {"w": ww, "L": L_of(nav_c, nm, ev), "wins": int(np.sum(Rc > win_ret(nm, ev))),
                    "dA": ann(rc) - ann(rm(ww))}
    # w_L
    tgt = float(np.sum(np.log1p(Rc)))
    w_L = solve_w(tgt, lambda w: float(np.sum(np.log1p(win_ret(nav_of(rm(w)), ev)))))
    nwl = nav_of(rm(w_L))
    res["wL"] = {"w": w_L, "dA": ann(rc) - ann(rm(w_L)), "L": L_of(nav_c, nwl, ev), "wins": int(np.sum(Rc > win_ret(nwl, ev)))}
    # 谷底后 60 日
    post = []
    for i, j, _ in ev:
        k = min(j + 60, len(nav_c) - 1)
        post.append(float(nav_c[k] / nav_c[j] - nav_m[k] / nav_m[j]))
    res["post60"] = {"each": post, "mean": float(np.mean(post)), "median": float(np.median(post))}
    # 逐个去掉
    loo = [L_of(nav_c, nav_m, ev[:q] + ev[q + 1:]) for q in range(len(ev))]
    ratio = np.log1p(Rc) / np.log1p(Rm)
    res["loo"] = {"min": float(np.min(loo)), "max": float(np.max(loo)), "each": loo}
    res["ratioMedian"] = float(np.median(ratio))
    # 门槛
    n = len(ev)
    G = {
        "G1": bool(L <= 0.85),
        "G2": bool(n > 0 and wins >= 0.7 * n),
        "G3": bool(dA >= -0.005),
        "G4": bool(all(sub[t]["n"] > 0 and sub[t]["L"] <= 0.95 for t in sub)),
        "G5": bool(res["L_cost"] <= 0.85 and res["dA_cost"] >= -0.005),
    }
    if not G["G1"]:
        verdict = "不起作用"
    elif all(G.values()):
        verdict = "通过"
    elif G["G1"] and G["G2"] and G["G4"]:
        verdict = "有保护作用，但比直接调低上限贵"
    else:
        verdict = "部分成立"
    if n < 5 and verdict in ("通过", "有保护作用，但比直接调低上限贵"):
        verdict = "部分成立"
    res["gates"], res["verdict"] = G, verdict
    return res


def main() -> None:
    base, lv = build_daily()
    out = {}
    out["PPUT"] = analyse("PPUT", lv["PPUT"], "1986-06-30", base)
    out["CLLZ"] = analyse("CLLZ", lv["CLLZ"], "1986-06-30", base)
    for k in ("PPUT", "CLLZ"):
        out[k]["since1990"] = analyse(k + "_1990", lv[k], "1989-12-29", base, full=False)
    # 两个候选的事件列表应相同（都在标普含息净值上检测）
    assert [(e["i"], e["j"]) for e in out["PPUT"]["events"]] == [(e["i"], e["j"]) for e in out["CLLZ"]["events"]]
    explore = {"VXTH": ("VXTH", None), "PPUT3M": ("PPUT3M", None), "CLL": ("CLL_splice", None),
               "PUT": ("PUT", "2007-01-03"), "BXM": ("BXM", None)}
    out["explore"] = {}
    for k, (col, st) in explore.items():
        st = st or lv[col].first_valid_index()
        out["explore"][k] = analyse(k, lv[col], st, base)

    for k in ("PPUT", "CLLZ"):
        r = out[k]
        print(f"\n===== {k}  w={r['w']:.12f}  days={r['days']}  filled={r['filled']}")
        for e in r["events"]:
            print(f"  {e['peak']} -> {e['trough']}  SPX {e['spxDraw']:+.6f}  cand {e['cand']:+.6f}  M {e['M']:+.6f}"
                  + ("  [填充日]" if e["filledEnd"] else ""))
        print(f"  L={r['L']:.12f} wins={r['wins']}/{r['nEvents']} dA={r['dA']:.12f} dSharpe={r['dSharpe']:.12f}"
              f" (compCash {r['dSharpe_compCash']:.12f})")
        print(f"  A_cand={r['A_cand']:.12f} A_M={r['A_M']:.12f}")
        print(f"  cost: L={r['L_cost']:.12f} dA={r['dA_cost']:.12f}")
        for t, v in r["sub"].items():
            print(f"  sub {t}: L={v['L']:.12f} n={v['n']} wins={v['wins']} | redetect L={v['L_redetect']:.12f} n={v['n_redetect']}")
        s9 = r["since1990"]
        print(f"  since1990: w={s9['w']:.12f} L={s9['L']:.12f} wins={s9['wins']}/{s9['nEvents']} dA={s9['dA']:.12f}")
        print(f"  no1987 L={r['L_no1987']:.12f}")
        print(f"  B80: {json.dumps(r['B80'])}")
        print(f"  M_mon: {r['M_mon']}  M_ex: {r['M_ex']}")
        print(f"  M_mon_linAlt: {r['M_mon_linAlt']}")
        print(f"  wL: {r['wL']}  post60: mean={r['post60']['mean']:.12f} median={r['post60']['median']:.12f}")
        print(f"  post60 each: {[round(x, 6) for x in r['post60']['each']]}")
        print(f"  loo: [{r['loo']['min']:.12f}, {r['loo']['max']:.12f}]  ratioMedian={r['ratioMedian']:.12f}")
        print(f"  gates: {r['gates']}  verdict: {r['verdict']}")
    print("\n===== explore")
    for k, r in out["explore"].items():
        print(f"  {k:7s} start={r['start']} w={r['w']:.12f} L={r['L']:.12f} wins={r['wins']}/{r['nEvents']} "
              f"dA={r['dA']:.12f} dSharpe={r['dSharpe']:.12f} filled={r['filled']}")
        for e in r["events"]:
            print(f"      {e['peak']} -> {e['trough']}  cand {e['cand']:+.6f}  M {e['M']:+.6f}")
    if len(sys.argv) > 1:
        Path(sys.argv[1]).write_text(json.dumps(out, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
