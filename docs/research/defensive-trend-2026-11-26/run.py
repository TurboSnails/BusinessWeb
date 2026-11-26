"""L-030 防守部分放趋势过滤的债券：按 PREREG.md 计算 C1（趋势债券）、C2（一直债券）对 D0（现金）。

只读 inputs/processed/ 与 PREREG.md 末尾的主检验国家表。
用法：cd research-py && uv run python ../docs/research/defensive-trend-2026-11-26/run.py
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.optimize import brentq

HERE = Path(__file__).resolve().parent
PROC = HERE / "inputs/processed"
SEED = 20261126
DRAWS = 2000
COST = 0.001
W_EQ = 0.6
LAG = 2
MA = 10
SPLIT = "2001-01"
EURO = ["Belgium", "France", "Germany", "Italy", "Netherlands", "Spain"]
LONG7 = ["Germany", "UK", "France", "Belgium", "Australia", "Canada", "Switzerland"]


def main_countries() -> dict[str, str]:
    """PREREG.md 末尾「主检验国家」表：| 代码 | 数据起点 | …"""
    sect = (HERE / "PREREG.md").read_text(encoding="utf-8").split("## 主检验国家", 1)[1]
    return {m[0]: m[1] for m in re.findall(r"^\| ([A-Za-z_]+) \| (\d{4}-\d{2}) \|", sect, flags=re.M)}


def load(name: str, equity_col: str = "equity_local") -> pd.DataFrame:
    df = pd.read_csv(PROC / f"{name}.csv", dtype={"month": str}).set_index("month").sort_index()
    df = df[df["main_ok"] == True].copy()  # noqa: E712  只用 OECD 收益率的共同可用区间
    if equity_col != "equity_local":
        df["equity_local"] = df[equity_col]
    return df


def sharpe(r: np.ndarray, cash: np.ndarray) -> float:
    ex = r - cash
    return float(math.sqrt(12) * ex.mean() / ex.std(ddof=1))


def c1_returns(eq, bond, cash, pos, w_eq: float = W_EQ) -> np.ndarray:
    switch = np.concatenate([[0.0], np.abs(np.diff(pos))])
    return w_eq * eq + (1 - w_eq) * np.where(pos > 0, bond, cash) - COST * (1 - w_eq) * switch


def build(df: pd.DataFrame, w_eq: float = W_EQ, lag: int = LAG, ma: int = MA, months: pd.Index | None = None) -> pd.DataFrame:
    """信号月 t：债券总收益指数 ≥ 含当月的 ma 个月均值 → 收益月 t+lag 持债。months：限定收益月（报告项对齐主检验）。"""
    d = df[["equity_local", "bond_ret", "cash_ret", "bond_yield"]].copy()
    if d.isna().any().any():
        raise SystemExit("main_ok 区间内有缺失")
    per = pd.PeriodIndex(d.index, freq="M")
    if not (np.diff(per.asi8) == 1).all():
        raise SystemExit("月份不连续")
    idx = (1 + d["bond_ret"]).cumprod()
    m = idx.rolling(ma, min_periods=ma).mean()
    sig = (idx >= m).astype(float).where(m.notna())
    d["pos"] = sig.shift(lag)
    d = d.dropna(subset=["pos"])
    if months is not None:
        d = d.loc[d.index.intersection(months)]
    eq, bond, cash, pos = (d[c].to_numpy() for c in ("equity_local", "bond_ret", "cash_ret", "pos"))
    d["D0"] = w_eq * eq + (1 - w_eq) * cash
    d["C1"] = c1_returns(eq, bond, cash, pos, w_eq)
    d["C2"] = w_eq * eq + (1 - w_eq) * bond
    return d


def dS(d: pd.DataFrame, r: np.ndarray, mask=None) -> float:
    """同波动对照 M 与 D0 都是「股票 + 现金」，夏普相同，所以 ΔS = 夏普(候选) − 夏普(D0)。"""
    cash, d0 = d["cash_ret"].to_numpy(), d["D0"].to_numpy()
    if mask is not None:
        r, cash, d0 = r[mask], cash[mask], d0[mask]
    return sharpe(r, cash) - sharpe(d0, cash)


def same_vol_w(target: float, eq: np.ndarray, cash: np.ndarray) -> float:
    return float(brentq(lambda w: np.std(w * eq + (1 - w) * cash, ddof=1) - target, 0.0, 2.0))


def bear_windows(eq: np.ndarray) -> list[tuple[int, int]]:
    """股票指数从高点跌 ≥ 20% 的回撤段：(高点行, 谷底行)；高点行 −1 表示起点之前的净值 1。"""
    v = np.concatenate([[1.0], np.cumprod(1 + eq)])
    out, peak, trough, in_dd = [], 0, 0, False
    for k in range(1, len(v)):
        if v[k] >= v[peak]:
            if in_dd and v[trough] / v[peak] - 1 <= -0.20:
                out.append((peak - 1, trough - 1))
            peak, trough, in_dd = k, k, False
        else:
            in_dd = True
            if v[k] < v[trough] or trough == peak:
                trough = k
    if in_dd and v[trough] / v[peak] - 1 <= -0.20:
        out.append((peak - 1, trough - 1))
    return out


def rising_mask(df: pd.DataFrame, d: pd.DataFrame, centered: bool) -> pd.Series:
    """利率上行月（只作评估分类，只用 main_ok 期内收益率；首尾无法分类的月份为否）。
    centered：y[t+12] − y[t−12] ≥ 1.0（主）；否则 y[t] − y[t−24] ≥ 1.0（只报告）。"""
    y = df["bond_yield"]
    chg = (y.shift(-12) - y.shift(12)) if centered else (y - y.shift(24))
    return (chg.reindex(d.index) >= 1.0).fillna(False).astype(bool)


def country_stats(df: pd.DataFrame) -> tuple[dict, pd.DataFrame]:
    d = build(df)
    eq, bond, cash, pos = (d[c].to_numpy() for c in ("equity_local", "bond_ret", "cash_ret", "pos"))
    out = {"from": d.index[0], "to": d.index[-1], "months": len(d)}
    for c in ("C1", "C2"):
        r = d[c].to_numpy()
        out[c] = {"dS": dS(d, r), "sharpe": sharpe(r, cash), "w": same_vol_w(np.std(r, ddof=1), eq, cash)}
        for half, m in (("first", d.index < SPLIT), ("second", d.index >= SPLIT)):
            out[c][half] = dS(d, r, m) if m.sum() >= 24 else None
    out["D0"] = {"sharpe": sharpe(d["D0"].to_numpy(), cash)}
    out["C1minusC2"] = sharpe(d["C1"].to_numpy(), cash) - sharpe(d["C2"].to_numpy(), cash)
    for key, centered in (("rising", True), ("risingTrailing", False)):
        mask = rising_mask(df, d, centered).to_numpy()
        out[key + "Months"] = int(mask.sum())
        for c in ("C1", "C2"):
            diff = d[c].to_numpy() - d["D0"].to_numpy()
            out[c][key] = float(diff[mask].mean() * 12) if mask.sum() >= 12 else None
    wins = bear_windows(eq)
    out["bears"] = [(d.index[max(i, 0)], d.index[j]) for i, j in wins]
    for c in ("C1", "C2"):
        w = out[c]["w"]
        m = w * eq + (1 - w) * cash
        r = d[c].to_numpy()
        out[c]["bearLog"] = [(float(np.log1p(r[i + 1 : j + 1]).sum()), float(np.log1p(m[i + 1 : j + 1]).sum())) for i, j in wins]
        bc, bm = sum(a for a, _ in out[c]["bearLog"]), sum(b for _, b in out[c]["bearLog"])
        out[c]["bearL"] = bc / bm if bm else None
    # G4：信号用原始指数；收益用去漂移债券（评估区间内超额均值为 0）；对照为固定持债比例 p̄
    ex = bond - cash
    b_dd = cash + ex - ex.mean()
    pbar = float(pos.mean())
    c1_dd = c1_returns(eq, b_dd, cash, pos)
    fixed = W_EQ * eq + (1 - W_EQ) * (pbar * b_dd + (1 - pbar) * cash)
    out["dedrift"] = {"C1minusFixed": sharpe(c1_dd, cash) - sharpe(fixed, cash), "pbar": pbar}
    out["C1"]["inBond"] = pbar
    out["C1"]["switchesPerYear"] = float(np.abs(np.diff(pos)).sum() / (len(pos) / 12))
    rep = {}
    for key, kw in (("w70", {"w_eq": 0.7}), ("w50", {"w_eq": 0.5}), ("lag1", {"lag": 1}), ("ma12", {"ma": 12})):
        dv = build(df, months=d.index, **kw)
        rep[key] = {c: dS(dv, dv[c].to_numpy()) for c in ("C1", "C2")}
    out["report"] = rep
    return out, d


def pooled(xs) -> float | None:
    v = [x for x in xs if x is not None]
    return float(np.mean(v)) if v else None


def units(values: dict) -> dict:
    """欧元区 6 国先平均为 1 个单元（共 9 个单元）。"""
    out = {c: v for c, v in values.items() if c not in EURO}
    out["Euro"] = pooled([values[c] for c in EURO if c in values])
    return out


def placebo_p(countries: list[str], frames: dict[str, pd.DataFrame], actual: float) -> float:
    """共同循环平移：每次抽一个 k，各国持债序列在本国样本内循环平移 k 个月（保留跨国同步）。"""
    rng = np.random.default_rng(SEED)
    kmax = min(len(frames[c]) for c in countries) - 12
    hits = 0
    for _ in range(DRAWS):
        k = int(rng.integers(12, kmax))
        vals = []
        for c in countries:
            d = frames[c]
            eq, bond, cash, pos = (d[x].to_numpy() for x in ("equity_local", "bond_ret", "cash_ret", "pos"))
            vals.append(dS(d, c1_returns(eq, bond, cash, np.roll(pos, k))))
        hits += float(np.mean(vals)) >= actual
    return (hits + 1) / (DRAWS + 1)


def summarize(countries, per, cand) -> dict:
    vals = {c: per[c][cand]["dS"] for c in countries}
    u = units(vals)
    rising = [per[c][cand]["rising"] for c in countries]
    bc = sum(a for c in countries for a, _ in per[c][cand]["bearLog"])
    bm = sum(b for c in countries for _, b in per[c][cand]["bearLog"])
    return {
        "dS": pooled(vals.values()), "positiveShare": float(np.mean([x > 0 for x in vals.values()])),
        "dSUnits": pooled(u.values()), "positiveUnits": int(sum(x > 0 for x in u.values())), "units": len(u),
        "rising": pooled(rising), "risingCountries": sum(x is not None for x in rising),
        "risingTrailing": pooled([per[c][cand]["risingTrailing"] for c in countries]),
        "first": pooled([per[c][cand]["first"] for c in countries]),
        "second": pooled([per[c][cand]["second"] for c in countries]),
        "firstUnits": pooled(units({c: per[c][cand]["first"] for c in countries}).values()),
        "secondUnits": pooled(units({c: per[c][cand]["second"] for c in countries}).values()),
        "bearL": bc / bm if bm else None,
        "report": {k: pooled([per[c]["report"][k][cand] for c in countries]) for k in ("w70", "w50", "lag1", "ma12")},
    }


def main() -> None:
    starts = main_countries()
    countries = list(starts)
    if len(countries) != 14:
        raise SystemExit(f"主检验国家表解析异常：{countries}")
    sha = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(PROC.glob("*.csv"))}
    per, frames = {}, {}
    for c in countries:
        df = load(c)
        if df.index[0] != starts[c]:
            raise SystemExit(f"{c} 数据起点 {df.index[0]} 与预注册 {starts[c]} 不符")
        per[c], frames[c] = country_stats(df)

    s1, s2 = summarize(countries, per, "C1"), summarize(countries, per, "C2")
    s1["dedrift"] = pooled([per[c]["dedrift"]["C1minusFixed"] for c in countries])
    s1["inBond"] = pooled([per[c]["C1"]["inBond"] for c in countries])
    s1["switchesPerYear"] = pooled([per[c]["C1"]["switchesPerYear"] for c in countries])
    s1["C1minusC2"] = pooled([per[c]["C1minusC2"] for c in countries])
    s1["placeboP"] = placebo_p(countries, frames, s1["dS"])

    g1 = {
        "G1": s1["dS"] >= 0.03 and s1["dSUnits"] >= 0.03,
        "G2": s1["positiveShare"] >= 0.70 and s1["positiveUnits"] >= 7,
        "G3": s1["rising"] is not None and s1["rising"] >= -0.005,
        "G4": s1["dedrift"] >= 0,
        "G5": all((x or 0) > 0 for x in (s1["first"], s1["second"], s1["firstUnits"], s1["secondUnits"])),
        "G6": s1["placeboP"] <= 0.05,
    }
    if not g1["G1"]:
        v1 = "不通过"
    elif all(g1.values()):
        v1 = "通过"
    elif all(g1[k] for k in ("G1", "G2", "G3", "G4", "G5")):
        v1 = "部分成立"
    else:
        v1 = "不通过"
    g2 = {
        "G1": s2["dS"] >= 0.03 and s2["dSUnits"] >= 0.03,
        "G2": s2["positiveShare"] >= 0.70 and s2["positiveUnits"] >= 7,
        "G3": s2["rising"] is not None and s2["rising"] >= -0.005,
        "G5": all((x or 0) > 0 for x in (s2["first"], s2["second"], s2["firstUnits"], s2["secondUnits"])),
    }
    if all(g2.values()):
        v2 = "通过"
    elif not g2["G3"] and all(g2[k] for k in ("G1", "G2", "G5")):
        v2 = "长期更好，但利率上行期吃亏"
    else:
        v2 = "不通过"
    s1.update({"gates": g1, "verdict": v1})
    s2.update({"gates": g2, "verdict": v2})

    rep: dict = {"long7": {}}
    common = max(per[c]["from"] for c in LONG7)
    for cand in ("C1", "C2"):
        rep["long7"][cand] = pooled([dS(frames[c].loc[frames[c].index >= common], frames[c].loc[frames[c].index >= common, cand].to_numpy()) for c in LONG7])
        rep["long7"][cand + "rising"] = pooled([per[c][cand]["rising"] for c in LONG7])
    rep["long7"]["from"] = common
    rep["noSwitzerland"] = {cand: pooled([per[c][cand]["dS"] for c in countries if c != "Switzerland"]) for cand in ("C1", "C2")}
    sw = frames["Switzerland"].loc[frames["Switzerland"].index >= "1999-08"]
    rep["switzerlandFrom1999_08"] = {cand: dS(sw, sw[cand].to_numpy()) for cand in ("C1", "C2")}
    kf = {}
    for c in countries:
        dk = build(load(c, "equity_local_kf"), months=frames[c].index)
        kf[c] = {cand: dS(dk, dk[cand].to_numpy()) for cand in ("C1", "C2")}
    rep["equityKF"] = {cand: pooled([kf[c][cand] for c in countries]) for cand in ("C1", "C2")}
    me = {}
    for c in ("Germany", "Japan"):
        df = load(c)
        alt = df.assign(bond_ret=df["bond_ret_me"], bond_yield=df["bond_yield_me"]).dropna(subset=["bond_ret", "bond_yield"])
        per_ix = pd.PeriodIndex(alt.index, freq="M")
        if len(alt) > 60 and (np.diff(per_ix.asi8) == 1).all():
            d = build(alt)
            me[c] = {"from": d.index[0], "C1": dS(d, d["C1"].to_numpy()), "C2": dS(d, d["C2"].to_numpy()),
                     "baseline": {k: per[c][k]["dS"] for k in ("C1", "C2")}}
    rep["monthEndYield"] = me

    res = {"study": "L-030", "countries": countries, "inputSha256": sha, "summary": {"C1": s1, "C2": s2}, "report": rep, "perCountry": per}
    (HERE / "results.json").write_text(json.dumps(res, ensure_ascii=False, indent=2, default=float) + "\n", encoding="utf-8")
    for cand, s in (("C1", s1), ("C2", s2)):
        print(cand, s["verdict"], s["gates"])
        print("  ", {k: (round(v, 4) if isinstance(v, float) else v) for k, v in s.items() if k not in ("gates", "verdict", "report")})
        print("   报告", s["report"])
    print("报告", json.dumps(rep, ensure_ascii=False, default=float))
    for c in countries:
        p = per[c]
        print(f"  {c:12s} {p['from']}–{p['to']} C1 ΔS {p['C1']['dS']:+.3f} 上行 {p['C1']['rising']} 持债 {p['C1']['inBond']:.2f} 去漂移 {p['dedrift']['C1minusFixed']:+.3f} | C2 ΔS {p['C2']['dS']:+.3f} 上行 {p['C2']['rising']}")


if __name__ == "__main__":
    main()
