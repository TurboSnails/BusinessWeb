"""L-032 纳斯达克与半导体「超配 / 过热」读数的预测力：按 PREREG.md 计算 N1、S1、N2、S2（N3 探索）。

用法：cd research-py && uv run python ../docs/research/nasdaq-semis-heat-2026-11-26/run.py
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy import stats

HERE = Path(__file__).resolve().parent
PROC = HERE / "inputs/processed"
REPO = HERE.parents[2]
WINDOW, MIN_OBS, MIN_OBS_N3 = 120, 60, 36
HORIZON = 12
END = "2026-10"  # 截至 2026-10 月末（删除不完整的 2026-11）
KF_FROM = "1973-07"  # KF 1963-07、1973-07 样本扩容断点：主检验从 1973-07 起、窗口重新累积
MIN_SHIFT = 24


def daily_csv(name: str, col: str, date_col: str = "date") -> pd.Series:
    df = pd.read_csv(PROC / name)
    val_col = col
    s = pd.Series(pd.to_numeric(df[val_col], errors="coerce").to_numpy(float), index=pd.to_datetime(df[date_col]).dt.strftime("%Y-%m-%d")).sort_index()
    return s[~s.index.duplicated(keep="last")].dropna()


def month_end(s: pd.Series) -> pd.Series:
    """日序列 → 每月最后一个观测（索引为 YYYY-MM）。"""
    m = s.groupby(s.index.str[:7]).last()
    return m


def ma_gap(daily: pd.Series) -> pd.Series:
    """月末收盘 ÷ 最近 200 个交易日均值 − 1。"""
    ma = daily.rolling(200, min_periods=200).mean()
    gap = (daily / ma - 1).dropna()
    return month_end(gap)


def rolling_pct(x: pd.Series, window: int = WINDOW, min_obs: int = MIN_OBS, expanding: bool = False) -> pd.Series:
    vals = x.to_numpy()
    out = np.full(len(vals), np.nan)
    for i in range(len(vals)):
        lo = 0 if expanding else max(0, i - window + 1)
        w = vals[lo : i + 1]
        if len(w) >= min_obs:
            out[i] = stats.percentileofscore(w, vals[i], kind="mean") / 100  # 窗口含自身，并列取平均
    return pd.Series(out, index=x.index)


def forward(levels: pd.Series, h: int = HORIZON) -> tuple[pd.Series, pd.Series]:
    v = levels.to_numpy()
    n = len(v)
    r = np.full(n, np.nan)
    d = np.full(n, np.nan)
    for i in range(n - h):
        r[i] = v[i + h] / v[i] - 1
        d[i] = np.min(v[i + 1 : i + h + 1] / v[i]) - 1
    return pd.Series(r, index=levels.index), pd.Series(d, index=levels.index)


def slope(x: np.ndarray, y: np.ndarray) -> float:
    xc = x - x.mean()
    return float((xc * (y - y.mean())).sum() / (xc ** 2).sum())


def shift_pvalues(x: np.ndarray, y: np.ndarray, beta: float) -> tuple[float, float, int]:
    """循环平移安慰剂：信号相对目标平移 k = 24 … n−24 个月（全部枚举），返回 (下尾 p, 上尾 p, k 个数)。"""
    n = len(x)
    ks = range(MIN_SHIFT, n - MIN_SHIFT + 1)
    bs = np.array([slope(np.roll(x, k), y) for k in ks])
    return (float(((bs <= beta).sum() + 1) / (len(bs) + 1)), float(((bs >= beta).sum() + 1) / (len(bs) + 1)), len(bs))


def segments(mask: pd.Series) -> list[list[str]]:
    """高位月份的独立段：相隔 12 个月以上算新段。"""
    months = list(mask[mask].index)
    out: list[list[str]] = []
    for m in months:
        if out and (pd.Period(m, "M") - pd.Period(out[-1][-1], "M")).n <= 12:
            out[-1].append(m)
        else:
            out.append([m])
    return [[seg[0], seg[-1]] for seg in out]


def assess(p: pd.Series, levels: pd.Series, h: int = HORIZON, top: float = 0.8, placebo: bool = True) -> dict:
    r, d = forward(levels, h)
    df = pd.concat({"p": p, "r": r, "d": d}, axis=1).dropna()
    if len(df) < 60:
        return {"n": len(df)}
    x, y, yd = df["p"].to_numpy(), df["r"].to_numpy(), df["d"].to_numpy()
    fit = sm.OLS(y, sm.add_constant(x)).fit(cov_type="HAC", cov_kwds={"maxlags": 12})
    beta, t = float(fit.params[1]), float(fit.tvalues[1])
    hi = df["p"] >= top
    half = len(df) // 2
    halves = []
    for part in (df.iloc[:half], df.iloc[half:]):
        f = sm.OLS(part["r"].to_numpy(), sm.add_constant(part["p"].to_numpy())).fit(cov_type="HAC", cov_kwds={"maxlags": 12})
        halves.append({"beta": float(f.params[1]), "t": float(f.tvalues[1])})
    out = {
        "n": len(df), "from": df.index[0], "to": df.index[-1], "beta": beta, "tNW": t,
        "dR": float(df.loc[hi, "r"].mean() - df.loc[~hi, "r"].mean()) if hi.any() else None,
        "dD": float(df.loc[hi, "d"].mean() - df.loc[~hi, "d"].mean()) if hi.any() else None,
        "nTop": int(hi.sum()), "topSegments": segments(hi), "halves": halves, "betaD": slope(x, yd),
    }
    if placebo:
        lo, up, k = shift_pvalues(x, y, beta)
        dlo, _, _ = shift_pvalues(x, yd, out["betaD"])
        out.update({"pLower": lo, "pUpper": up, "shifts": k, "pLowerD": dlo})
    return out


def holm(ps: dict[str, float]) -> dict[str, float]:
    order = sorted(ps, key=ps.get)
    out, run = {}, 0.0
    for i, k in enumerate(order):
        run = max(run, min(1.0, ps[k] * (len(order) - i)))
        out[k] = run
    return out


def main() -> None:
    sha = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(PROC.glob("*.csv"))}
    ndx = daily_csv("nasdaq_daily.csv", "ixic_yahoo")  # 审计：FRED 2003–04 有错值，以 Yahoo 为主
    ndx = ndx[(ndx.index != "2019-04-19") & (ndx.index.str[:7] <= END)]  # 删除休市日与不完整月
    sox = daily_csv("sox_daily.csv", "sox_yahoo")
    sox = sox[sox.index.str[:7] <= END]
    kf = pd.read_csv(PROC / "kf49_tech.csv", dtype={"month": str}).set_index("month").sort_index()
    kf[["chips_ret", "tech_ret"]] = kf[["chips_ret", "tech_ret"]] / 100  # KF 收益单位为 %
    # KF 第 t 行的市值占比是 t 月初（= t−1 月末）的值：月末 t 的读数取第 t+1 行
    share_end = kf[["chips_share", "tech_share"]].shift(-1).dropna()
    spx_rows = json.loads((REPO / "data-raw/macro-posture-daily/spx-daily.json").read_text())["rows"]
    spx = month_end(pd.Series({d: c for d, c in spx_rows}, dtype=float).sort_index())
    spx = spx[spx.index <= END]

    kf_main = kf[kf.index >= KF_FROM]
    share_main = share_end[share_end.index >= KF_FROM]
    levels = {
        "N1": month_end(ndx), "S1": month_end(sox),
        "N2": (1 + kf_main["tech_ret"]).cumprod(), "S2": (1 + kf_main["chips_ret"]).cumprod(),
    }
    signals = {"N1": ma_gap(ndx), "S1": ma_gap(sox), "N2": share_main["tech_share"], "S2": share_main["chips_share"]}
    pct = {k: rolling_pct(v) for k, v in signals.items()}

    main_res = {k: assess(pct[k], levels[k]) for k in signals}
    adj = holm({k: main_res[k]["pLower"] for k in signals})
    adj_up = holm({k: main_res[k]["pUpper"] for k in signals})
    for k in signals:
        r = main_res[k]
        r["pHolm"], r["pHolmUpper"] = adj[k], adj_up[k]
        g = {"G1": r["beta"] < 0 and adj[k] <= 0.05, "G2": r["dD"] is not None and r["dD"] <= -0.05,
             "G3": all(h["beta"] < 0 for h in r["halves"]), "G4": r["dR"] is not None and r["dR"] <= -0.05}
        r["gates"] = g
        if all(g.values()):
            v = "有预测力"
        elif g["G1"]:
            v = "斜率显著、幅度不足"
        elif g["G2"] and g["G3"] and g["G4"]:
            v = "方向一致、统计上不显著"
        elif r["beta"] > 0 and adj_up[k] <= 0.05:
            v = "没有预测力（高位之后反而更好）"
        else:
            v = "没有预测力"
        r["verdict"] = v

    # N3 探索
    n3 = None
    cftc_path = PROC / "cftc_ndx.csv"
    if cftc_path.exists():
        raw = daily_csv("cftc_ndx.csv", "am_net_pct_oi", "report_date")
        # 周二统计、周五发布：按发布日（+3 天）归入月份，月末取当月最后一期已发布的读数
        raw.index = (pd.to_datetime(raw.index) + pd.Timedelta(days=3)).strftime("%Y-%m-%d")
        c = month_end(raw)
        n3 = assess(rolling_pct(c[c.index <= END], min_obs=MIN_OBS_N3, expanding=True), levels["N1"])

    # 只报告
    report = {
        "spxTarget": {k: assess(pct[k], spx, placebo=False) for k in signals},
        "top90": {k: assess(pct[k], levels[k], top=0.9, placebo=False) for k in signals},
        "h6": {k: assess(pct[k], levels[k], h=6, placebo=False) for k in signals},
        "kfFull1926": {k: assess(rolling_pct(share_end[c]), (1 + kf[ret]).cumprod(), placebo=False) for k, c, ret in (("N2", "tech_share", "tech_ret"), ("S2", "chips_share", "chips_ret"))},
        "current": {k: {"month": signals[k].index[-1], "value": float(signals[k].iloc[-1]), "pct": float(pct[k].dropna().iloc[-1])} for k in signals},
    }
    out = {"study": "L-032", "inputSha256": sha, "main": main_res, "N3": n3, "report": report}
    (HERE / "results.json").write_text(json.dumps(out, ensure_ascii=False, indent=2, default=float) + "\n", encoding="utf-8")
    for k, r in main_res.items():
        print(k, r["verdict"], {x: (round(y, 4) if isinstance(y, float) else y) for x, y in r.items() if x not in ("gates", "verdict", "topSegments")}, r["gates"], "高位段", r["topSegments"])
    print("N3", n3)
    print("标普目标", {k: {x: round(v[x], 3) for x in ("beta", "tNW", "dR", "dD")} for k, v in report["spxTarget"].items() if "beta" in v})
    print("当前", report["current"])


if __name__ == "__main__":
    main()
