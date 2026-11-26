"""L-035 更多「过热 / 超配」读数：按 PREREG.md 计算 R1、H1、A1、E1、F1 与 P49 面板。

方法函数与 L-032（docs/research/nasdaq-semis-heat-2026-11-26/run.py）相同，复制在此以便单独复现。
用法：cd research-py && uv run python ../docs/research/heat-more-2026-11-26/run.py
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import stats

HERE = Path(__file__).resolve().parent
PROC = HERE / "inputs/processed"
REPO = HERE.parents[2]
WINDOW, MIN_OBS, HORIZON, MIN_SHIFT = 120, 60, 12, 24
END = "2026-10"
KF_FROM = "1973-07"
INDUSTRIES = ["Agric", "Food", "Soda", "Beer", "Smoke", "Toys", "Fun", "Books", "Hshld", "Clths", "Hlth", "MedEq", "Drugs",
              "Chems", "Rubbr", "Txtls", "BldMt", "Cnstr", "Steel", "FabPr", "Mach", "ElcEq", "Autos", "Aero", "Ships", "Guns",
              "Gold", "Mines", "Coal", "Oil", "Util", "Telcm", "PerSv", "BusSv", "Hardw", "Softw", "Chips", "LabEq", "Paper",
              "Boxes", "Trans", "Whlsl", "Rtail", "Meals", "Banks", "Insur", "RlEst", "Fin", "Other"]


def daily(name: str) -> pd.Series:
    df = pd.read_csv(PROC / name, dtype={"date": str})
    s = pd.Series(df["close"].to_numpy(float), index=df["date"]).sort_index()
    return s[s.index.str[:7] <= END]


def month_end(s: pd.Series) -> pd.Series:
    return s.groupby(s.index.str[:7]).last()


def ma_gap(d: pd.Series) -> pd.Series:
    ma = d.rolling(200, min_periods=200).mean()
    return month_end((d / ma - 1).dropna())


def rolling_pct(x: pd.Series, window: int = WINDOW, min_obs: int = MIN_OBS) -> pd.Series:
    vals = x.to_numpy()
    out = np.full(len(vals), np.nan)
    for i in range(len(vals)):
        w = vals[max(0, i - window + 1): i + 1]
        if len(w) >= min_obs:
            out[i] = stats.percentileofscore(w, vals[i], kind="mean") / 100
    return pd.Series(out, index=x.index)


def forward(levels: pd.Series, h: int = HORIZON) -> tuple[pd.Series, pd.Series]:
    v = levels.to_numpy()
    n = len(v)
    r, d = np.full(n, np.nan), np.full(n, np.nan)
    for i in range(n - h):
        r[i] = v[i + h] / v[i] - 1
        d[i] = np.min(v[i + 1: i + h + 1] / v[i]) - 1
    return pd.Series(r, index=levels.index), pd.Series(d, index=levels.index)


def slope(x: np.ndarray, y: np.ndarray) -> float:
    xc = x - x.mean()
    return float((xc * (y - y.mean())).sum() / (xc ** 2).sum())


def shift_p(x: np.ndarray, y: np.ndarray, beta: float) -> tuple[float, float, int]:
    n = len(x)
    bs = np.array([slope(np.roll(x, k), y) for k in range(MIN_SHIFT, n - MIN_SHIFT + 1)])
    return float(((bs <= beta).sum() + 1) / (len(bs) + 1)), float(((bs >= beta).sum() + 1) / (len(bs) + 1)), len(bs)


def segments(mask: pd.Series) -> list[list[str]]:
    out: list[list[str]] = []
    for m in list(mask[mask].index):
        if out and (pd.Period(m, "M") - pd.Period(out[-1][-1], "M")).n <= 12:
            out[-1].append(m)
        else:
            out.append([m])
    return [[s[0], s[-1]] for s in out]


def assess(p: pd.Series, levels: pd.Series, h: int = HORIZON, top: float = 0.8, placebo: bool = True) -> dict:
    r, d = forward(levels, h)
    df = pd.concat({"p": p, "r": r, "d": d}, axis=1).dropna()
    if len(df) < 60:
        return {"n": len(df)}
    x, y, yd = df["p"].to_numpy(), df["r"].to_numpy(), df["d"].to_numpy()
    fit = sm.OLS(y, sm.add_constant(x)).fit(cov_type="HAC", cov_kwds={"maxlags": 12})
    beta = float(fit.params[1])
    hi = df["p"] >= top
    half = len(df) // 2
    halves = []
    for part in (df.iloc[:half], df.iloc[half:]):
        f = sm.OLS(part["r"].to_numpy(), sm.add_constant(part["p"].to_numpy())).fit(cov_type="HAC", cov_kwds={"maxlags": 12})
        halves.append({"beta": float(f.params[1]), "t": float(f.tvalues[1])})
    out = {"n": len(df), "from": df.index[0], "to": df.index[-1], "beta": beta, "tNW": float(fit.tvalues[1]),
           "dR": float(df.loc[hi, "r"].mean() - df.loc[~hi, "r"].mean()) if hi.any() else None,
           "dD": float(df.loc[hi, "d"].mean() - df.loc[~hi, "d"].mean()) if hi.any() else None,
           "nTop": int(hi.sum()), "topSegments": segments(hi), "halves": halves, "betaD": slope(x, yd)}
    if placebo:
        lo, up, k = shift_p(x, y, beta)
        out.update({"pLower": lo, "pUpper": up, "shifts": k, "pLowerD": shift_p(x, yd, out["betaD"])[0]})
    return out


def holm(ps: dict[str, float]) -> dict[str, float]:
    order = sorted(ps, key=ps.get)
    out, run = {}, 0.0
    for i, k in enumerate(order):
        run = max(run, min(1.0, ps[k] * (len(order) - i)))
        out[k] = run
    return out


def verdict(r: dict, adj: float, adj_up: float) -> tuple[str, dict]:
    g = {"G1": r["beta"] < 0 and adj <= 0.05, "G2": r["dD"] is not None and r["dD"] <= -0.05,
         "G3": all(h["beta"] < 0 for h in r["halves"]), "G4": r["dR"] is not None and r["dR"] <= -0.05}
    if all(g.values()):
        return "有预测力", g
    if g["G1"]:
        return "斜率显著、幅度不足", g
    if g["G2"] and g["G3"] and g["G4"]:
        return "方向一致、统计上不显著", g
    if r["beta"] > 0 and adj_up <= 0.05:
        return "没有预测力（高位之后反而更好）", g
    return "没有预测力", g


def panel(kf: pd.DataFrame, share_end: pd.DataFrame, inds: list[str], since: str, placebo: bool = True, h: int = HORIZON) -> dict:
    """P49：共同样本 = 所有行业 p、R、D 都有值的月份；β̄ 为各行业斜率的简单平均；安慰剂所有行业同一 k 一起平移。"""
    k_ = kf[kf.index >= since]
    s_ = share_end[share_end.index >= since]
    P, R, D = {}, {}, {}
    for ind in inds:
        ret = k_[f"ret_{ind}"] / 100  # 目标用到 KF 最后一个月（2026-09），信号到 2026-08
        assert ret.notna().all(), f"{ind} 在 {since} 后有缺失收益"
        lv = (1 + ret).cumprod()
        P[ind] = rolling_pct(s_[f"share_{ind}"])
        R[ind], D[ind] = forward(lv, h)
    P, R, D = pd.DataFrame(P), pd.DataFrame(R), pd.DataFrame(D)
    P = P.reindex(R.index)
    valid = P.notna() & R.notna() & D.notna()
    rows = valid.all(axis=1)
    assert (valid.any(axis=1) == rows).all(), "各行业有效月份不同"
    P, R, D = P[rows], R[rows], D[rows]
    Pm, Rm = P.to_numpy(), R.to_numpy()
    n = len(P)
    b = np.array([slope(Pm[:, j], Rm[:, j]) for j in range(Pm.shape[1])])
    vol = np.array([kf.loc[P.index, f"ret_{i}"].std(ddof=1) / 100 * np.sqrt(12) for i in inds])
    bbar = float(b.mean())
    res = {"since": since, "from": P.index[0], "to": P.index[-1], "months": n, "industries": len(inds), "betaBar": bbar,
           "nNeg": int((b < 0).sum()), "betaMedian": float(np.median(b)), "betaBarVolScaled": float((b / vol).mean()),
           "betas": dict(zip(inds, [float(x) for x in b]))}
    hi, lo = P >= 0.8, P < 0.8
    res["crash30"] = {"top": float((D[hi] <= -0.30).sum().sum() / hi.sum().sum()), "rest": float((D[lo] <= -0.30).sum().sum() / lo.sum().sum()),
                      "nTop": int(hi.sum().sum()), "nRest": int(lo.sum().sum())}
    res["dRpooled"] = float(R[hi].stack().mean() - R[lo].stack().mean())
    if placebo:
        vals = np.array([np.mean([slope(np.roll(Pm[:, j], k), Rm[:, j]) for j in range(Pm.shape[1])]) for k in range(MIN_SHIFT, n - MIN_SHIFT + 1)])
        res.update({"pLower": float(((vals <= bbar).sum() + 1) / (len(vals) + 1)), "shifts": len(vals)})
    return res


def excl(p: pd.Series, levels: pd.Series, lo: str, hi: str) -> dict:
    """去掉某段信号月后的 β 与 ΔR（只报告）。"""
    r, _ = forward(levels)
    df = pd.concat({"p": p, "r": r}, axis=1).dropna()
    df = df[(df.index < lo) | (df.index > hi)]
    top = df["p"] >= 0.8
    return {"n": len(df), "beta": slope(df["p"].to_numpy(), df["r"].to_numpy()), "dR": float(df.loc[top, "r"].mean() - df.loc[~top, "r"].mean())}


def main() -> None:
    sha = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(PROC.glob("*.csv"))}
    rut, hsi, ssec = daily("rut_daily.csv"), daily("hsi_daily.csv"), daily("ssec_daily.csv")
    kf = pd.read_csv(PROC / "kf49_all.csv", dtype={"month": str}).set_index("month").sort_index()
    share_end = kf.filter(like="share_").shift(-1).iloc[:-1]  # 月末 t 的占比 = 第 t+1 行
    spx_rows = json.loads((REPO / "data-raw/macro-posture-daily/spx-daily.json").read_text())["rows"]
    spx = month_end(pd.Series({d: c for d, c in spx_rows}, dtype=float).sort_index())
    spx = spx[spx.index <= END]

    kf_main = kf[kf.index >= KF_FROM]
    sh_main = share_end[share_end.index >= KF_FROM]
    levels = {"R1": month_end(rut), "H1": month_end(hsi), "A1": month_end(ssec),
              "E1": (1 + kf_main["ret_energy"] / 100).cumprod(), "F1": (1 + kf_main["ret_fin"] / 100).cumprod()}
    signals = {"R1": ma_gap(rut), "H1": ma_gap(hsi), "A1": ma_gap(ssec), "E1": sh_main["share_energy"], "F1": sh_main["share_fin"]}
    pct = {k: rolling_pct(v) for k, v in signals.items()}
    main_res = {k: assess(pct[k], levels[k]) for k in signals}
    adj = holm({k: main_res[k]["pLower"] for k in signals})
    adj_up = holm({k: main_res[k]["pUpper"] for k in signals})
    for k in signals:
        r = main_res[k]
        r["pHolm"], r["pHolmUpper"] = adj[k], adj_up[k]
        r["verdict"], r["gates"] = verdict(r, adj[k], adj_up[k])
        if k in ("E1", "F1") and r["verdict"] == "有预测力":
            r["verdict"] = "有预测力（事后挑选，以 P49 为准）"

    p49 = panel(kf, share_end, INDUSTRIES, KF_FROM)
    if p49["betaBar"] < 0 and p49["pLower"] <= 0.05 and p49["nNeg"] >= 30:
        p49["verdict"] = "行业层面有预测力" + ("（边缘）" if p49["pLower"] > 0.02 else "")
    elif p49["betaBar"] < 0:
        p49["verdict"] = "行业层面方向偏负、不显著"
    else:
        p49["verdict"] = "行业层面没有预测力"

    report = {
        "spxTarget": {k: assess(pct[k], spx, placebo=False) for k in ("R1", "E1", "F1")},
        "top90": {k: assess(pct[k], levels[k], top=0.9, placebo=False) for k in signals},
        "h6": {k: assess(pct[k], levels[k], h=6, placebo=False) for k in signals},
        "p49exTech": panel(kf, share_end, [i for i in INDUSTRIES if i not in ("Hardw", "Softw", "Chips")], KF_FROM, placebo=False),
        "E1ex1979_82": excl(pct["E1"], levels["E1"], "1979-01", "1982-12"),
        "F1ex2006_08": excl(pct["F1"], levels["F1"], "2006-01", "2008-12"),
        "current": {k: {"month": signals[k].index[-1], "value": float(signals[k].iloc[-1]), "pct": float(pct[k].dropna().iloc[-1])} for k in signals},
    }
    out = {"study": "L-035", "inputSha256": sha, "main": main_res, "P49": p49, "report": report}
    (HERE / "results.json").write_text(json.dumps(out, ensure_ascii=False, indent=2, default=float) + "\n", encoding="utf-8")
    for k, r in main_res.items():
        print(k, r["verdict"], {x: (round(y, 4) if isinstance(y, float) else y) for x, y in r.items() if x not in ("gates", "verdict", "topSegments", "halves")},
              r["gates"], [round(h["beta"], 3) for h in r["halves"]], r["topSegments"])
    print("P49", p49["verdict"], {x: (round(y, 4) if isinstance(y, float) else y) for x, y in p49.items() if x not in ("betas",)})
    print("P49 exTech", round(report["p49exTech"]["betaBar"], 4), report["p49exTech"]["nNeg"], "E1ex", report["E1ex1979_82"], "F1ex", report["F1ex2006_08"])
    print("SPX", {k: {x: round(v[x], 3) for x in ("beta", "dR", "dD")} for k, v in report["spxTarget"].items() if "beta" in v})
    print("当前", report["current"])


if __name__ == "__main__":
    main()
