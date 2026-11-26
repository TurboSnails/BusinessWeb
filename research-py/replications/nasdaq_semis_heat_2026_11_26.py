"""L-032 纳指与半导体超配/过热读数预测力的独立第二实现（只按 PREREG.md 文字实现，不读 run.py / results.json）。

运行：
    cd research-py && uv run python -m replications.nasdaq_semis_heat_2026_11_26 [out.json]

PREREG 没写死、这里做出的选择：
  1. 月末 = 当月最后一个有收盘的交易日。纳指用 ixic_yahoo，丢掉其空值行（即 FRED 独有的 2019-04-19）；
     SOX 用 sox_yahoo。N1/S1 信号 = 收盘 / 最近 200 个交易日（含当日）收盘均值 − 1，不足 200 日为空。
     月度序列截至 2026-10（删除 2026-11）。标普：spx-daily.json 月末收盘，同样截至 2026-10。
  2. N2/S2：信号月 t 的读数 = kf49_tech.csv 第 t+1 行的 tech_share / chips_share；目标 V 为含息累计净值
     V_t = Π_{s≤t}(1 + ret_s/100)，ret 取第 s 行（比值与起点无关）。主检验「从 1973-07 起」解释为
     信号月 t ≥ 1973-07（即第 1973-08 行起的份额），百分位窗口只用 ≥1973-07 的信号，故首个百分位在
     1978-06。另报「信号月 ≥ 1973-06（第 1973-07 行起）」的替代解释。全样本：信号月 ≥ 1926-07。
  3. 百分位：窗口 = 最近 120 个日历月（含 t）中有读数的月份，scipy percentileofscore(kind='mean')/100，
     窗口内读数 < 60 为空。N3 为扩展窗口、≥36。
  4. 检验样本 = p_t 与 R_t（12 个月）都有定义的月份。D_t 需要 t+1..t+12 全部有值（与 R 同样本）。
     6 个月前瞻的只报告项用 p_t 与 R6_t 都有定义的月份（比 12 个月样本多 6 个月）。
  5. 斜率 β = Σ(x−x̄)(y−ȳ)/Σ(x−x̄)²（含截距的 OLS）。循环平移：x_k = np.roll(x, k)，k = 24..n−24
     （集合对称，方向无关），下尾 p = (#{β_k ≤ β}+1)/(K+1)，上尾 p = (#{β_k ≥ β}+1)/(K+1)。
  6. Holm：族 = N1、S1、N2、S2，下尾 p 与上尾 p 各自做一次 Holm（statsmodels multipletests 'holm'）。
  7. 高位：p ≥ 0.8；ΔR、ΔD = 高位均值 − 其余均值。两半：前 n//2 个月与其余（n 为奇数时后半多一个月）。
  8. Newey–West：statsmodels OLS cov_type='HAC', maxlags=12, 其余默认（Bartlett 核）。
  9. N3：CFTC report_date + 3 天为发布日，按发布日归月，月末取当月最后一期；月度序列 2010-06..2026-10。
 10. 高位段：检验样本内 p ≥ 0.8 的月份，相邻两个高位月相隔 > 12 个月记为新段。
 11. 当前读数：各指标最后一个信号月（N1/S1/N3 为 2026-10，N2/S2 为 2026-08）的 x 与 p；
     N1/S1 另报 2026-11-25 日读数及其相对前 119 个月末 + 当日的百分位（只作参考）。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm
from scipy.stats import percentileofscore
from statsmodels.stats.multitest import multipletests

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "docs/research/nasdaq-semis-heat-2026-11-26/inputs/processed"
SPX = ROOT / "data-raw/macro-posture-daily/spx-daily.json"
END = pd.Period("2026-10", "M")
KF_END = pd.Period("2026-09", "M")


# ---------------------------------------------------------------- data
def daily_close(path: Path, col: str) -> pd.Series:
    df = pd.read_csv(path, parse_dates=["date"])
    s = df.set_index("date")[col].dropna()
    return s.astype(float)


def month_end(s: pd.Series) -> pd.Series:
    m = s.groupby(s.index.to_period("M")).last()
    return m[m.index <= END]


def ma_gap_monthly(s: pd.Series) -> pd.Series:
    ma = s.rolling(200, min_periods=200).mean()
    g = s / ma - 1
    return month_end(g).dropna()


def load_spx() -> pd.Series:
    rows = json.loads(SPX.read_text())["rows"]
    s = pd.Series([r[1] for r in rows], index=pd.to_datetime([r[0] for r in rows]), dtype=float)
    return month_end(s)


def load_kf() -> pd.DataFrame:
    kf = pd.read_csv(D / "kf49_tech.csv")
    kf.index = pd.PeriodIndex(kf["month"], freq="M")
    return kf


def load_cftc() -> pd.Series:
    c = pd.read_csv(D / "cftc_ndx.csv", parse_dates=["report_date"])
    c["pub"] = c["report_date"] + pd.to_timedelta(3, unit="D")
    c = c.sort_values("pub")
    m = c.groupby(c["pub"].dt.to_period("M"))["am_net_pct_oi"].last()
    return m[m.index <= END].astype(float)


# ---------------------------------------------------------------- stats
def to_full(s: pd.Series) -> pd.Series:
    idx = pd.period_range(s.index.min(), s.index.max(), freq="M")
    return s.reindex(idx)


def pct_rolling(x: pd.Series, window=120, minp=60, expanding=False) -> pd.Series:
    x = to_full(x)
    vals = x.to_numpy()
    out = np.full(len(vals), np.nan)
    for i in range(len(vals)):
        if np.isnan(vals[i]):
            continue
        lo = 0 if expanding else max(0, i - window + 1)
        w = vals[lo : i + 1]
        w = w[~np.isnan(w)]
        if len(w) < minp:
            continue
        out[i] = percentileofscore(w, vals[i], kind="mean") / 100.0
    return pd.Series(out, index=x.index)


def fwd(V: pd.Series, h: int) -> tuple[pd.Series, pd.Series]:
    V = to_full(V)
    v = V.to_numpy()
    n = len(v)
    R = np.full(n, np.nan)
    Dd = np.full(n, np.nan)
    for i in range(n - h):
        seg = v[i + 1 : i + h + 1]
        if np.isnan(v[i]) or np.isnan(seg).any():
            continue
        R[i] = v[i + h] / v[i] - 1
        Dd[i] = seg.min() / v[i] - 1
    return pd.Series(R, index=V.index), pd.Series(Dd, index=V.index)


def slope(x, y) -> float:
    xm = x - x.mean()
    return float(np.dot(xm, y - y.mean()) / np.dot(xm, xm))


def shift_p(x, y):
    b = slope(x, y)
    n = len(x)
    ks = range(24, n - 24 + 1)
    bk = np.array([slope(np.roll(x, k), y) for k in ks])
    K = len(bk)
    return b, (np.sum(bk <= b) + 1) / (K + 1), (np.sum(bk >= b) + 1) / (K + 1), K


def nw_t(x, y) -> float:
    r = sm.OLS(y, sm.add_constant(x)).fit(cov_type="HAC", cov_kwds={"maxlags": 12})
    return float(r.tvalues[1])


def segments(months, hi_mask, R, Dd):
    hm = [i for i in range(len(months)) if hi_mask[i]]
    segs, cur = [], []
    for i in hm:
        if cur and (months[i] - months[cur[-1]]).n > 12:
            segs.append(cur)
            cur = []
        cur.append(i)
    if cur:
        segs.append(cur)
    return [
        dict(start=str(months[s[0]]), end=str(months[s[-1]]), n=len(s),
             meanR=float(np.mean(R[s])), meanD=float(np.mean(Dd[s])))
        for s in segs
    ]


def evaluate(p: pd.Series, V: pd.Series, h=12, thr=0.8, full=True) -> dict:
    R, Dd = fwd(V, h)
    df = pd.concat({"p": p, "R": R, "D": Dd}, axis=1).dropna()
    months = list(df.index)
    x, y, d = df["p"].to_numpy(), df["R"].to_numpy(), df["D"].to_numpy()
    n = len(x)
    b, pl, pu, K = shift_p(x, y)
    hi = x >= thr
    out = dict(n=n, start=str(months[0]), end=str(months[-1]), beta=b, p_lower=pl, p_upper=pu, K=K,
               n_hi=int(hi.sum()),
               dR=float(y[hi].mean() - y[~hi].mean()) if hi.any() and (~hi).any() else None,
               dD=float(d[hi].mean() - d[~hi].mean()) if hi.any() and (~hi).any() else None)
    if not full:
        return out
    bd, pdl, pdu, _ = shift_p(x, d)
    out.update(betaD=bd, betaD_p_lower=pdl, nw_t=nw_t(x, y))
    m = n // 2
    out["halves"] = []
    for sl in (slice(0, m), slice(m, n)):
        xs, ys = x[sl], y[sl]
        out["halves"].append(dict(start=str(months[sl][0]), end=str(months[sl][-1]), n=len(xs),
                                  beta=slope(xs, ys), nw_t=nw_t(xs, ys)))
    out["segments"] = segments(months, hi, y, d)
    return out


def verdict(r, holm_l, holm_u) -> tuple[str, dict]:
    G1 = bool(r["beta"] < 0 and holm_l <= 0.05)
    G2 = r["dD"] <= -0.05
    G3 = all(h["beta"] < 0 for h in r["halves"])
    G4 = r["dR"] <= -0.05
    g = dict(G1=G1, G2=G2, G3=G3, G4=G4)
    if G1 and G2 and G3 and G4:
        v = "有预测力"
    elif G1:
        v = "斜率显著、幅度不足"
    elif G2 and G3 and G4:
        v = "方向一致、统计上不显著"
    elif r["beta"] > 0 and holm_u <= 0.05:
        v = "没有预测力（高位之后反而更好）"
    else:
        v = "没有预测力"
    return v, g


# ---------------------------------------------------------------- main
def main(out_path: str | None = None):
    ndq = daily_close(D / "nasdaq_daily.csv", "ixic_yahoo")
    sox = daily_close(D / "sox_daily.csv", "sox_yahoo")
    V_ndq, V_sox, V_spx = month_end(ndq), month_end(sox), load_spx()
    kf = load_kf()
    V_tech = (1 + kf["tech_ret"] / 100).cumprod()
    V_chips = (1 + kf["chips_ret"] / 100).cumprod()
    V_tech, V_chips = V_tech[V_tech.index <= KF_END], V_chips[V_chips.index <= KF_END]

    def kf_signal(col, start):
        s = kf[col].copy()
        s.index = s.index - 1  # 第 t+1 行 -> 信号月 t
        return s[s.index >= pd.Period(start, "M")]

    x = {
        "N1": ma_gap_monthly(ndq),
        "S1": ma_gap_monthly(sox),
        "N2": kf_signal("tech_share", "1973-07"),
        "S2": kf_signal("chips_share", "1973-07"),
    }
    P = {k: pct_rolling(v) for k, v in x.items()}
    tgt = {"N1": V_ndq, "S1": V_sox, "N2": V_tech, "S2": V_chips}

    res = {}
    for k in x:
        res[k] = evaluate(P[k], tgt[k])
    names = list(res)
    holm_l = multipletests([res[k]["p_lower"] for k in names], method="holm")[1]
    holm_u = multipletests([res[k]["p_upper"] for k in names], method="holm")[1]
    for i, k in enumerate(names):
        res[k]["holm_lower"], res[k]["holm_upper"] = float(holm_l[i]), float(holm_u[i])
        res[k]["verdict"], res[k]["gates"] = verdict(res[k], holm_l[i], holm_u[i])
        # 只报告
        res[k]["spx"] = evaluate(P[k], V_spx)
        res[k]["thr09"] = evaluate(P[k], tgt[k], thr=0.9)
        res[k]["h6"] = evaluate(P[k], tgt[k], h=6)
        last = x[k].dropna().index.max()
        res[k]["current"] = dict(month=str(last), x=float(x[k][last]), p=float(P[k][last]))

    # N2/S2 全样本、替代起点
    for k, col, V in (("N2", "tech_share", V_tech), ("S2", "chips_share", V_chips)):
        pf = pct_rolling(kf_signal(col, "1926-07"))
        res[k]["full1926"] = evaluate(pf, V)
        pa = pct_rolling(kf_signal(col, "1973-06"))
        res[k]["alt_start_1973_06"] = evaluate(pa, V)

    # N1/S1 日内最新读数（参考）
    for k, s in (("N1", ndq), ("S1", sox)):
        g = (s / s.rolling(200).mean() - 1)
        last = g.index[-1]
        hist = to_full(x[k]).iloc[-119:].dropna().to_numpy()
        w = np.append(hist, g.iloc[-1])
        res[k]["current_daily"] = dict(date=str(last.date()), x=float(g.iloc[-1]),
                                       p=float(percentileofscore(w, g.iloc[-1], kind="mean") / 100))

    # N3
    x3 = load_cftc()
    p3 = pct_rolling(x3, minp=36, expanding=True)
    n3 = evaluate(p3, V_ndq)
    n3["spx"] = evaluate(p3, V_spx)
    n3["thr09"] = evaluate(p3, V_ndq, thr=0.9)
    n3["h6"] = evaluate(p3, V_ndq, h=6)
    last = x3.index.max()
    n3["current"] = dict(month=str(last), x=float(x3[last]), p=float(p3[last]))
    res["N3"] = n3

    print_report(res)
    if out_path:
        Path(out_path).write_text(json.dumps(res, ensure_ascii=False, indent=1, default=str))
    return res


def fmt(v):
    return f"{v:.12g}" if isinstance(v, float) else str(v)


def print_report(res):
    for k, r in res.items():
        print(f"\n===== {k} =====")
        for key in ("n", "start", "end", "beta", "p_lower", "p_upper", "K", "holm_lower", "holm_upper",
                    "n_hi", "dR", "dD", "betaD", "betaD_p_lower", "nw_t", "verdict", "gates", "current",
                    "current_daily"):
            if key in r:
                print(f"  {key}: {fmt(r[key])}")
        for i, h in enumerate(r.get("halves", [])):
            print(f"  half{i+1}: {h['start']}..{h['end']} n={h['n']} beta={fmt(h['beta'])} nw_t={fmt(h['nw_t'])}")
        for s in r.get("segments", []):
            print(f"  seg: {s['start']}..{s['end']} n={s['n']} meanR={s['meanR']:.4f} meanD={s['meanD']:.4f}")
        for sub in ("spx", "thr09", "h6", "alt_start_1973_06"):
            if sub in r:
                q = r[sub]
                print(f"  [{sub}] n={q['n']} {q['start']}..{q['end']} beta={fmt(q['beta'])} pl={fmt(q['p_lower'])} "
                      f"pu={fmt(q['p_upper'])} n_hi={q['n_hi']} dR={fmt(q['dR'])} dD={fmt(q['dD'])}")
        if "full1926" in r:
            q = r["full1926"]
            print(f"  [full1926] n={q['n']} {q['start']}..{q['end']} beta={fmt(q['beta'])} pl={fmt(q['p_lower'])} "
                  f"pu={fmt(q['p_upper'])} dR={fmt(q['dR'])} dD={fmt(q['dD'])} nw_t={fmt(q['nw_t'])} "
                  f"halves={[fmt(h['beta']) for h in q['halves']]}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
