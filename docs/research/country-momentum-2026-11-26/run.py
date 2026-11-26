"""L-034 跨国动量轮动：按 PREREG.md 计算 C1（美国 / 海外二选一）、C2（15 个市场挑最强 5 个）。

用法：cd research-py && uv run python ../docs/research/country-momentum-2026-11-26/run.py
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
B2 = REPO / "docs/research/defensive-trend-2026-11-26/inputs/processed"
FF = REPO / "docs/research/trend-1871-2026-11-26/inputs/ff-factors.json"
ALL_COUNTRIES = ["Australia", "Belgium", "Canada", "Denmark", "France", "Germany", "Italy", "Japan",
                 "Netherlands", "Norway", "Spain", "Sweden", "Switzerland", "UK"]
COUNTRIES = [c for c in ALL_COUNTRIES if c != "Denmark"]  # 主检验：丹麦 1989 年才有数据
MARKETS = ["US"] + COUNTRIES
DEVX = HERE / "inputs/Developed_ex_US_3_Factors.csv"
FEE_DRAG = 0.0045  # 国家 ETF 比宽基每年多约 0.45 个百分点（只报告）
START, END = "1978-01", "2025-12"  # 持有月
HALF2 = "2002-01"
POST = "2014-01"
COST = 0.002
TOP = 5
MIN_SHIFT = 24


def load() -> tuple[pd.DataFrame, pd.Series, dict]:
    sha = {}
    cols = {}
    for c in ALL_COUNTRIES:
        p = B2 / f"{c}.csv"
        sha[f"defensive-trend-2026-11-26/inputs/processed/{c}.csv"] = hashlib.sha256(p.read_bytes()).hexdigest()
        df = pd.read_csv(p, dtype={"month": str}).set_index("month")
        cols[c] = pd.to_numeric(df["equity_usd"], errors="coerce")
    sha["trend-1871-2026-11-26/inputs/ff-factors.json"] = hashlib.sha256(FF.read_bytes()).hexdigest()
    ff = json.loads(FF.read_text())
    assert ff["columns"] == ["month", "Mkt-RF", "RF"]
    us = pd.Series({m: (a + b) / 100 for m, a, b in ff["rows"]})
    rf = pd.Series({m: b / 100 for m, a, b in ff["rows"]})
    cols["US"] = us
    sha["country-momentum-2026-11-26/inputs/Developed_ex_US_3_Factors.csv"] = hashlib.sha256(DEVX.read_bytes()).hexdigest()
    lines = DEVX.read_text().splitlines()
    i0 = next(k for k, ln in enumerate(lines) if ln.replace(" ", "").startswith(",Mkt-RF"))
    devx = {}
    for ln in lines[i0 + 1:]:
        c = [x.strip() for x in ln.split(",")]
        if not (c[0].isdigit() and len(c[0]) == 6):
            break
        devx[c[0][:4] + "-" + c[0][4:]] = (float(c[1]) + float(c[4])) / 100
    cols["DEVX"] = pd.Series(devx)
    r = pd.DataFrame(cols)[["US"] + ALL_COUNTRIES + ["DEVX"]].sort_index()
    return r, rf, sha


def trailing(r: pd.DataFrame | pd.Series, months: int, skip: int) -> pd.DataFrame | pd.Series:
    """月末 t 的累计收益：t−months+1 … t−skip 月（skip=0 含 t 月）。全部有值才有结果。"""
    lr = np.log1p(r)
    s = lr.rolling(months - skip, min_periods=months - skip).sum().shift(skip)
    return np.expm1(s)


def stats(res: dict, lo: str | None = None, hi: str | None = None, fee: float = 0.0) -> dict:
    net = res["net"].loc[lo:hi] - fee / 12
    ex = net - res["rf"].loc[lo:hi]
    n = len(net)
    nav = (1 + net).cumprod()
    dd = float((nav / np.maximum.accumulate(np.maximum(nav, 1.0)) - 1).min())
    return {
        "n": n,
        "sharpe": float(ex.mean() / ex.std(ddof=1) * np.sqrt(12)),
        "cagr": float(nav.iloc[-1] ** (12 / n) - 1),
        "vol": float(net.std(ddof=1) * np.sqrt(12)),
        "maxDd": dd,
        "turnoverPerYear": float(res["turn"].loc[lo:hi].mean() * 12),
    }


def c1_select(r: pd.DataFrame, months: int = 12, lag: int = 1, absolute: bool = False, rf: pd.Series | None = None,
              countries: list[str] = COUNTRIES, ex_col: str | None = None) -> pd.Series:
    """持有月 → 1 持美国，0 持海外篮子，-1 持现金（仅 absolute）。lag=1：t 月末信号持有 t+1 月。"""
    ex = r[ex_col] if ex_col else r[countries].mean(axis=1, skipna=False)
    us12 = trailing(r["US"], months, 0)
    ex12 = trailing(ex, months, 0)
    sig = pd.Series(np.where(us12 >= ex12, 1, 0), index=r.index).where(us12.notna() & ex12.notna())
    if absolute:
        rf12 = trailing(rf.reindex(r.index), months, 0)
        best = np.maximum(us12, ex12)
        sig = sig.where(~(best < rf12), -1)
    return sig.shift(lag)


def c1_weights(sel: pd.Series, countries: list[str] = COUNTRIES) -> pd.DataFrame:
    w = pd.DataFrame(0.0, index=sel.index, columns=["US"] + countries + ["CASH"])
    w.loc[sel == 1, "US"] = 1.0
    w.loc[sel == 0, countries] = 1.0 / len(countries)
    w.loc[sel == -1, "CASH"] = 1.0
    return w


def c2_select(r: pd.DataFrame, months: int = 12, skip: int = 1, top: int = TOP, lag: int = 1, markets: list[str] = MARKETS) -> pd.DataFrame:
    mom = trailing(r[markets], months, skip)
    names = ["US" if m == "US" else m for m in markets]
    sel = pd.DataFrame(np.nan, index=r.index, columns=markets)
    for m in r.index:
        row = mom.loc[m]
        if row.isna().any():
            continue
        # 收益从高到低；并列按英文名字母序（美国记为 US）
        order = sorted(range(len(markets)), key=lambda i: (-row.iloc[i], names[i]))
        sel.loc[m] = 0
        sel.loc[m, [markets[i] for i in order[:top]]] = 1
    return sel.shift(lag)


def evaluate(w: pd.DataFrame, r: pd.DataFrame, rf: pd.Series, cost: float = COST) -> dict:
    """带 CASH 列时现金收益为 rf。"""
    rr = r.assign(CASH=rf)
    cols = list(w.columns)
    idx = w.index
    R = rr.loc[idx, cols].to_numpy()
    W = w[cols].to_numpy()
    gross = (W * R).sum(axis=1)
    turn = np.zeros(len(idx))
    for t in range(1, len(idx)):
        drift = W[t - 1] * (1 + R[t - 1])
        drift = drift / drift.sum()
        turn[t] = np.abs(W[t] - drift).sum() / 2
    net = gross - cost * turn
    return {"net": pd.Series(net, index=idx), "gross": pd.Series(gross, index=idx),
            "turn": pd.Series(turn, index=idx), "rf": rf.loc[idx]}


def bench_c1(idx: pd.Index, countries: list[str] = COUNTRIES) -> pd.DataFrame:
    w = pd.DataFrame(0.0, index=idx, columns=["US"] + countries)
    w["US"] = 0.5
    w[countries] = 0.5 / len(countries)
    return w


def bench_c2(idx: pd.Index, markets: list[str] = MARKETS) -> pd.DataFrame:
    return pd.DataFrame(1.0 / len(markets), index=idx, columns=markets)


def compare(cand: dict, bench: dict, fee: float = 0.0) -> dict:
    out = {}
    s0 = cand["net"].index[0]
    periods = (("full", s0, END), ("half1", START, "2001-12"), ("half2", HALF2, END), ("post2014", POST, END)) if s0 == START else (("full", s0, END), ("post2014", POST, END))
    for name, lo, hi in periods:
        c, b = stats(cand, lo, hi, fee), stats(bench, lo, hi)
        out[name] = {"cand": c, "bench": b, "dS": c["sharpe"] - b["sharpe"], "dCagr": c["cagr"] - b["cagr"], "dDd": c["maxDd"] - b["maxDd"]}
    return out


def sharpe_net(res: dict) -> float:
    ex = res["net"] - res["rf"]
    return float(ex.mean() / ex.std(ddof=1) * np.sqrt(12))


def placebo(sel: pd.DataFrame | pd.Series, to_weights, r: pd.DataFrame, rf: pd.Series, bench_s: float, dS: float) -> dict:
    n = len(sel)
    vals = []
    for k in range(MIN_SHIFT, n - MIN_SHIFT + 1):
        if isinstance(sel, pd.Series):
            s = pd.Series(np.roll(sel.to_numpy(), k), index=sel.index)
        else:
            s = pd.DataFrame(np.roll(sel.to_numpy(), k, axis=0), index=sel.index, columns=sel.columns)
        vals.append(sharpe_net(evaluate(to_weights(s), r, rf)) - bench_s)
    vals = np.array(vals)
    return {"pUpper": float(((vals >= dS).sum() + 1) / (len(vals) + 1)), "shifts": len(vals),
            "median": float(np.median(vals)), "p95": float(np.quantile(vals, 0.95))}


def holm(ps: dict[str, float]) -> dict[str, float]:
    order = sorted(ps, key=ps.get)
    out, run = {}, 0.0
    for i, k in enumerate(order):
        run = max(run, min(1.0, ps[k] * (len(order) - i)))
        out[k] = run
    return out


def c2_weights(sel: pd.DataFrame) -> pd.DataFrame:
    return sel.astype(float) / sel.sum(axis=1).to_numpy()[:, None]


def main() -> None:
    r, rf, sha = load()
    r = r.loc[:END]
    hold = r.loc[START:END].index
    assert len(hold) == 576 and not r.loc["1977-01":END, MARKETS].isna().any().any(), "主面板 1977-01 至 2025-12 应完整"

    sel1 = c1_select(r).loc[hold].astype(int)
    sel2 = c2_select(r).loc[hold].astype(int)
    res = {
        "C1": evaluate(c1_weights(sel1), r, rf), "B1": evaluate(bench_c1(hold), r, rf),
        "C2": evaluate(c2_weights(sel2), r, rf), "B2": evaluate(bench_c2(hold), r, rf),
        "US": evaluate(pd.DataFrame({"US": 1.0}, index=hold), r, rf),
    }
    main_res = {"C1": compare(res["C1"], res["B1"]), "C2": compare(res["C2"], res["B2"])}
    pl = {
        "C1": placebo(sel1, c1_weights, r, rf, sharpe_net(res["B1"]), main_res["C1"]["full"]["dS"]),
        "C2": placebo(sel2, c2_weights, r, rf, sharpe_net(res["B2"]), main_res["C2"]["full"]["dS"]),
    }
    adj = holm({k: pl[k]["pUpper"] for k in pl})
    for k in ("C1", "C2"):
        m = main_res[k]
        m["placebo"] = pl[k] | {"pHolm": adj[k]}
        g = {
            "G1": m["full"]["dS"] > 0 and adj[k] <= 0.05,
            "G2": m["half1"]["dS"] > 0 and m["half2"]["dS"] > 0,
            "G3": m["post2014"]["dS"] > 0,
            "G4": m["full"]["dCagr"] > 0 and m["full"]["cand"]["maxDd"] >= 1.15 * m["full"]["bench"]["maxDd"],
        }
        m["gates"] = g
        if all(g.values()):
            v = "通过"
        elif g["G1"] and g["G2"] and g["G3"]:
            v = "风险调整更好，但收益或回撤不达标"
        elif m["full"]["dS"] > 0 and adj[k] > 0.05 and g["G2"] and g["G3"] and g["G4"]:
            v = "方向一致，统计上不显著"
        elif m["full"]["dS"] > 0:
            v = "不稳定"
        else:
            v = "不通过"
        m["verdict"] = v

    # 只报告
    rep: dict = {}
    for mo in (6, 3):
        s1 = c1_select(r, months=mo).loc[hold].astype(int)
        s2 = c2_select(r, months=mo).loc[hold].astype(int)
        rep[f"lookback{mo}"] = {"C1": compare(evaluate(c1_weights(s1), r, rf), res["B1"])["full"],
                                "C2": compare(evaluate(c2_weights(s2), r, rf), res["B2"])["full"]}
    for top in (3, 7):
        s2 = c2_select(r, top=top).loc[hold].astype(int)
        rep[f"C2top{top}"] = compare(evaluate(c2_weights(s2), r, rf), res["B2"])
    s2 = c2_select(r, skip=0).loc[hold].astype(int)
    rep["C2noSkip"] = compare(evaluate(c2_weights(s2), r, rf), res["B2"])
    hd = hold[1:]  # 延迟一个月：1978-01 的信号需要 1976-12 的加拿大数据，所以从 1978-02 起
    s1 = c1_select(r, lag=2).loc[hd].astype(int)
    s2 = c2_select(r, lag=2).loc[hd].astype(int)
    rep["delay1"] = {"C1": compare(evaluate(c1_weights(s1), r, rf), evaluate(bench_c1(hd), r, rf)),
                     "C2": compare(evaluate(c2_weights(s2), r, rf), evaluate(bench_c2(hd), r, rf))}
    sA = c1_select(r, absolute=True, rf=rf).loc[hold].astype(int)
    rep["C1absolute"] = compare(evaluate(c1_weights(sA), r, rf), res["B1"]) | {"cashMonths": int((sA == -1).sum())}
    for cst in (0.0, 0.005):
        rep[f"cost{cst}"] = {
            "C1": compare(evaluate(c1_weights(sel1), r, rf, cst), evaluate(bench_c1(hold), r, rf, cst))["full"],
            "C2": compare(evaluate(c2_weights(sel2), r, rf, cst), evaluate(bench_c2(hold), r, rf, cst))["full"],
        }
    rep["vsUS"] = {k: compare(res[k], res["US"]) for k in ("C1", "B1", "C2", "B2")}
    # 7. 含丹麦的 15 市场（持有月 1990-01 起）
    all_m = ["US"] + ALL_COUNTRIES
    h15 = r.loc["1990-01":END].index
    s1 = c1_select(r, countries=ALL_COUNTRIES).loc[h15].astype(int)
    s2 = c2_select(r, markets=all_m).loc[h15].astype(int)
    rep["m15from1990"] = {
        "C1": compare(evaluate(c1_weights(s1, ALL_COUNTRIES), r, rf), evaluate(bench_c1(h15, ALL_COUNTRIES), r, rf)),
        "C2": compare(evaluate(c2_weights(s2), r, rf), evaluate(bench_c2(h15, all_m), r, rf)),
    }
    # 8. 市值加权海外（KF Developed ex US，持有月 1991-07 起）
    hdx = r.loc["1991-07":END].index
    sdx = c1_select(r, ex_col="DEVX").loc[hdx].astype(int)
    wdx = pd.DataFrame({"US": (sdx == 1).astype(float), "DEVX": (sdx == 0).astype(float)})
    bdx = pd.DataFrame({"US": 0.5, "DEVX": 0.5}, index=hdx)
    rep["C1devx"] = compare(evaluate(wdx, r, rf), evaluate(bdx, r, rf)) | {"usShare": float(sdx.mean())}
    rep["C1devx"]["vsUS"] = compare(evaluate(wdx, r, rf), evaluate(pd.DataFrame({"US": 1.0}, index=hdx), r, rf))["full"]
    # 9. 费率拖累（C2 每年多扣 0.45 个百分点）
    rep["C2feeDrag"] = compare(res["C2"], res["B2"], fee=FEE_DRAG)["full"]
    rep["c1UsShareByYear"] = {y: float(v) for y, v in sel1.groupby(sel1.index.str[:4]).mean().items()}
    rep["c2Picks"] = {m: int(sel2[m].sum()) for m in MARKETS}
    rep["current"] = {
        "c1": int(c1_select(r, lag=0).loc[END]),
        "c1devx": int(c1_select(r, lag=0, ex_col="DEVX").loc[END]),
        "c2": [m for m in MARKETS if c2_select(r, lag=0).loc[END, m] == 1],
        "signalMonth": END,
    }

    out = {"study": "L-034", "inputSha256": sha, "holdRange": [START, END], "main": main_res, "report": rep,
           "series": {k: {"net": [round(x, 10) for x in v["net"].tolist()]} for k, v in res.items()}, "months": list(hold)}
    (HERE / "results.json").write_text(json.dumps(out, ensure_ascii=False, indent=2, default=float) + "\n", encoding="utf-8")
    for k in ("C1", "C2"):
        m = main_res[k]
        print(k, m["verdict"], m["gates"], {p: {x: round(m[p][x], 4) for x in ("dS", "dCagr", "dDd")} for p in ("full", "half1", "half2", "post2014")})
        print("  ", {x: round(y, 4) for x, y in m["full"]["cand"].items()}, "vs", {x: round(y, 4) for x, y in m["full"]["bench"].items()})
        print("   placebo", m["placebo"])
    print("lookback", json.dumps({k: {c: round(v[c]["dS"], 3) for c in v} for k, v in rep.items() if k.startswith("lookback")}))
    print("top", {k: round(rep[k]["full"]["dS"], 3) for k in ("C2top3", "C2top7", "C2noSkip")})
    print("delay", {c: round(rep["delay1"][c]["full"]["dS"], 3) for c in ("C1", "C2")}, "abs", round(rep["C1absolute"]["full"]["dS"], 3), rep["C1absolute"]["cashMonths"])
    print("cost", {k: {c: round(rep[k][c]["dS"], 3) for c in ("C1", "C2")} for k in ("cost0.0", "cost0.005")})
    print("vsUS", {k: round(v["full"]["dS"], 3) for k, v in rep["vsUS"].items()})
    print("current", rep["current"], "picks", rep["c2Picks"])
    print("m15", {c: round(rep["m15from1990"][c]["full"]["dS"], 3) for c in ("C1", "C2")}, "devx", {x: round(rep["C1devx"][x]["dS"], 3) for x in ("full", "post2014")}, round(rep["C1devx"]["usShare"], 3), "vsUS", round(rep["C1devx"]["vsUS"]["dS"], 3))
    print("feeDrag C2", round(rep["C2feeDrag"]["dS"], 3), round(rep["C2feeDrag"]["dCagr"], 4))


if __name__ == "__main__":
    main()
