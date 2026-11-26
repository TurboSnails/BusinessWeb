"""L-037 美股板块轮动：按 PREREG.md 计算 S1（12−1 月动量前 3）、S2（3/6/12 月平均动量前 3），KF 12 行业主检验 + 板块 ETF 确认。

用法：cd research-py && uv run python ../docs/research/sector-rotation-2026-11-26/run.py
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
PROC = HERE / "inputs/processed"
FF = REPO / "docs/research/trend-1871-2026-11-26/inputs/ff-factors.json"
SECTORS = ["BusEq", "Chems", "Durbl", "Enrgy", "Hlth", "Manuf", "Money", "NoDur", "Shops", "Telcm", "Utils"]  # 字母序
ETFS = ["XLB", "XLE", "XLF", "XLI", "XLK", "XLP", "XLU", "XLV", "XLY"]
START, END = "1927-07", "2026-09"
H1_END, H2_START = "1976-12", "1977-01"
POST = "2000-01"
E_START, E_END, E_CUR = "2000-01", "2026-09", "2026-10"  # ETF 统计到 2026-09（与 RF 对齐），2026-10 只用于当前入选
TOP = 3
MIN_SHIFT = 24


def load() -> tuple[pd.DataFrame, pd.Series, pd.Series, pd.DataFrame, dict]:
    sha = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(PROC.glob("*.csv"))}
    sha["ff-factors.json"] = hashlib.sha256(FF.read_bytes()).hexdigest()
    kf = pd.read_csv(PROC / "kf12_vw.csv", dtype={"month": str}).set_index("month")[SECTORS] / 100
    ff = json.loads(FF.read_text())
    mkt = pd.Series({m: (a + b) / 100 for m, a, b in ff["rows"]})
    rf = pd.Series({m: b / 100 for m, a, b in ff["rows"]})
    px = pd.read_csv(PROC / "etf_month_end_adjclose.csv", dtype={"month": str}).set_index("month")
    etf = (px / px.shift(1) - 1).iloc[1:]
    return kf, mkt, rf, etf, sha


def momentum(r: pd.DataFrame, kind: str, months: int = 12) -> pd.DataFrame:
    idx = (1 + r).cumprod()
    base = pd.DataFrame([[1.0] * r.shape[1]], columns=r.columns, index=["base"])
    idx = pd.concat([base, idx])  # 第一个收益月之前一个月 = 1
    if kind == "12-1":
        m = idx.shift(1) / idx.shift(months) - 1  # t−11 … t−1
    elif kind == "multi":
        m = sum(idx / idx.shift(L) - 1 for L in (3, 6, 12)) / 3
    elif kind == "single":
        m = idx / idx.shift(months) - 1
    else:
        raise ValueError(kind)
    return m.drop(index="base")


def select(mom: pd.DataFrame, top: int = TOP) -> pd.DataFrame:
    cols = list(mom.columns)
    out = pd.DataFrame(np.nan, index=mom.index, columns=cols)
    for t in mom.index:
        row = mom.loc[t]
        if row.isna().any():
            continue
        vals = row.to_numpy()
        base = sorted(range(len(cols)), key=lambda i: cols[i])  # 先按代码 ASCII 序
        order = sorted(base, key=lambda i: -vals[i])  # 再按动量稳定降序
        out.loc[t] = 0.0
        out.loc[t, [cols[i] for i in order[:top]]] = 1.0
    return out


def evaluate(w: pd.DataFrame, r: pd.DataFrame, cost: float, fee: float) -> pd.Series:
    """w：持有月 × 资产（可含 CASH 列，收益由 r 提供）；返回月净收益。"""
    R = r.loc[w.index, w.columns].to_numpy()
    W = w.to_numpy()
    gross = (W * R).sum(axis=1)
    tc = np.zeros(len(w))
    for t in range(1, len(w)):
        drift = W[t - 1] * (1 + R[t - 1])
        drift = drift / drift.sum()
        tc[t] = cost * np.abs(W[t] - drift).sum()
    feev = fee / 12 * (W[:, [c != "CASH" for c in w.columns]].sum(axis=1))
    return pd.Series(gross - tc - feev, index=w.index)


def turnover(w: pd.DataFrame, r: pd.DataFrame) -> float:
    R = r.loc[w.index, w.columns].to_numpy()
    W = w.to_numpy()
    t_ = [0.0]
    for t in range(1, len(w)):
        drift = W[t - 1] * (1 + R[t - 1])
        drift = drift / drift.sum()
        t_.append(np.abs(W[t] - drift).sum() / 2)
    return float(np.mean(t_) * 12)


def stats(net: pd.Series, rf: pd.Series, lo=None, hi=None, sharpe_hi=None) -> dict:
    x = net.loc[lo:hi]
    xs = net.loc[lo:(sharpe_hi or hi)]
    ex = xs - rf.reindex(xs.index)
    nav = (1 + x).cumprod()
    return {"n": len(x), "sharpe": float(ex.mean() / ex.std(ddof=1) * np.sqrt(12)),
            "cagr": float(nav.iloc[-1] ** (12 / len(x)) - 1), "vol": float(x.std(ddof=1) * np.sqrt(12)),
            "maxDd": float((nav / np.maximum.accumulate(np.maximum(nav, 1.0)) - 1).min())}


def cmp(c: pd.Series, b: pd.Series, rf: pd.Series, periods, sharpe_hi=None) -> dict:
    out = {}
    for name, lo, hi in periods:
        x, y = stats(c, rf, lo, hi, sharpe_hi), stats(b, rf, lo, hi, sharpe_hi)
        out[name] = {"cand": x, "bench": y, "dS": x["sharpe"] - y["sharpe"], "dCagr": x["cagr"] - y["cagr"]}
    return out


def holm(ps: dict) -> dict:
    order = sorted(ps, key=ps.get)
    out, run = {}, 0.0
    for i, k in enumerate(order):
        run = max(run, min(1.0, ps[k] * (len(order) - i)))
        out[k] = run
    return out


def main() -> None:
    kf, mkt, rf, etf, sha = load()
    kf = kf.loc[:END]
    hold = kf.loc[START:END].index
    assert len(hold) == 1191
    rr = kf.assign(MKT=mkt, CASH=rf)
    COST, FEE = 0.001, 0.001
    ew_w = pd.DataFrame(1 / len(SECTORS), index=hold, columns=SECTORS)
    ew = evaluate(ew_w, rr, COST, FEE)
    mk = evaluate(pd.DataFrame({"MKT": 1.0}, index=hold), rr, COST, 0.0003)
    P = [("full", START, END), ("half1", START, H1_END), ("half2", H2_START, END), ("post2000", POST, END), ("post1977", H2_START, END), ("post2011", "2011-01", END)]
    sel = {"S1": select(momentum(kf, "12-1")), "S2": select(momentum(kf, "multi"))}
    res, nets = {}, {}
    for k, s in sel.items():
        w = s.shift(1).loc[hold] / TOP
        assert not w.isna().any().any()
        net = evaluate(w, rr, COST, FEE)
        nets[k] = net
        res[k] = {"vsEW": cmp(net, ew, rf, P), "vsMKT": cmp(net, mk, rf, P), "turnoverPerYear": turnover(w, rr),
                  "picks": {c: int(w[c].gt(0).sum()) for c in SECTORS}}
        # 安慰剂
        base_s = stats(ew, rf)["sharpe"]
        dS = res[k]["vsEW"]["full"]["dS"]
        W0 = w.to_numpy()
        vals = []
        for kk in range(MIN_SHIFT, len(hold) - MIN_SHIFT + 1):
            ws = pd.DataFrame(np.roll(W0, kk, axis=0), index=hold, columns=SECTORS)
            vals.append(stats(evaluate(ws, rr, COST, FEE), rf)["sharpe"] - base_s)
        vals = np.array(vals)
        res[k]["placebo"] = {"pUpper": float(((vals >= dS - 1e-12).sum() + 1) / (len(vals) + 1)), "shifts": len(vals),
                             "median": float(np.median(vals)), "p95": float(np.quantile(vals, 0.95))}
        # 晚一个月
        wd = s.shift(2).loc[hold[1:]] / TOP
        res[k]["delay"] = cmp(evaluate(wd, rr, COST, FEE), ew, rf, [("full", hold[1], END)])["full"]
    # ETF 确认
    ehold = etf.loc[E_START:E_END].index
    assert len(ehold) == 321
    er = etf.assign(CASH=rf.reindex(etf.index))
    e_ew = evaluate(pd.DataFrame(1 / 9, index=ehold, columns=ETFS), er, 0.0005, 0.0)
    e_spy = evaluate(pd.DataFrame({"SPY": 1.0}, index=ehold), er, 0.0005, 0.0)
    EP = [("full", E_START, E_END), ("post2011", "2011-01", E_END)]
    E_RF_END = None
    ekind = {"S1": "12-1", "S2": "multi"}
    for k in ("S1", "S2"):
        es = select(momentum(etf.loc["1999-01":, ETFS], ekind[k]))  # 板块 ETF 首个完整月收益 1999-01，1998-12 月末为基点
        w = es.shift(1).loc[ehold] / TOP
        assert not w.isna().any().any()
        net = evaluate(w, er, 0.0005, 0.0)
        res[k]["etf"] = {"vsEW9": cmp(net, e_ew, rf, EP, E_RF_END), "vsSPY": cmp(net, e_spy, rf, EP, E_RF_END),
                         "turnoverPerYear": turnover(w, er), "current": [c for c in ETFS if es.loc[E_CUR, c] == 1]}
    adj = holm({k: res[k]["placebo"]["pUpper"] for k in sel})
    for k in sel:
        m = res[k]
        m["placebo"]["pHolm"] = adj[k]
        e, k_ = m["vsEW"], m["vsMKT"]
        g = {"G1": e["full"]["dS"] > 0 and adj[k] <= 0.05,
             "G2": e["half1"]["dS"] > 0 and e["half2"]["dS"] > 0,
             "G3": e["post2000"]["dS"] > 0,
             "G4": k_["full"]["dS"] > 0 and k_["post2000"]["dS"] > 0,
             "G5": m["delay"]["dS"] > 0,
             "G6": m["etf"]["vsEW9"]["full"]["dS"] > 0 and m["etf"]["vsSPY"]["full"]["dS"] > 0}
        m["gates"] = g
        if all(g.values()):
            v = "通过"
        elif all(g[x] for x in ("G2", "G3", "G4", "G5", "G6")):
            v = "方向一致，统计上不显著"
        elif e["full"]["dS"] > 0:
            v = "不稳定"
        else:
            v = "不通过"
        m["verdict"] = v
        m["current"] = [c for c in SECTORS if sel[k].loc[END, c] == 1]

    rep: dict = {}
    for top in (2, 5):
        rep[f"top{top}"] = {k: cmp(evaluate(select(momentum(kf, kind), top).shift(1).loc[hold] / top, rr, COST, FEE), ew, rf, P[:4])
                            for k, kind in (("S1", "12-1"), ("S2", "multi"))}
    rep["mom6"] = cmp(evaluate(select(momentum(kf, "single", 6)).shift(1).loc[hold] / TOP, rr, COST, FEE), ew, rf, P[:4])
    idx = (1 + kf).cumprod()
    below = idx < idx.rolling(10, min_periods=10).mean()
    for k in ("S1", "S2"):
        w = (sel[k] / TOP)
        wc = w.where(~below, 0.0)
        wc["CASH"] = 1 - wc.sum(axis=1)
        wc = wc.shift(1).loc[hold]
        rep[f"{k}trend"] = cmp(evaluate(wc, rr, COST, FEE), ew, rf, P[:4])
    for c in (0.0, 0.003):
        rep[f"cost{c}"] = {k: cmp(evaluate(sel[k].shift(1).loc[hold] / TOP, rr, c, FEE), evaluate(ew_w, rr, c, FEE), rf, P[:4]) for k in sel}
    rep["ewVsMkt"] = cmp(ew, mk, rf, P)
    # 第 3、4 名之差 < 1e-9 的月数
    rep["nearTies"] = {}
    for k, kind in (("S1", "12-1"), ("S2", "multi")):
        mm = momentum(kf, kind).loc["1927-06":END]
        srt = np.sort(mm.to_numpy(), axis=1)[:, ::-1]
        rep["nearTies"][k] = int((np.abs(srt[:, 2] - srt[:, 3]) < 1e-9).sum())
    # 含 Other 的 12 行业
    import zipfile
    with zipfile.ZipFile(HERE / "inputs/raw/12_Industry_Portfolios_CSV.zip") as z:
        lines = z.read("12_Industry_Portfolios.csv").decode("latin-1").splitlines()

    def section(title):
        i = next(k for k, ln in enumerate(lines) if ln.strip() == title)
        hdr = [h.strip() for h in lines[i + 1].split(",")[1:]]
        rec = {}
        for ln in lines[i + 2:]:
            c = [x.strip() for x in ln.split(",")]
            if not (c[0].isdigit() and len(c[0]) == 6):
                break
            rec[c[0][:4] + "-" + c[0][4:]] = [float(x) for x in c[1:]]
        return pd.DataFrame.from_dict(rec, orient="index", columns=hdr)
    kf_all = section("Average Value Weighted Returns -- Monthly").loc[:END] / 100
    s12 = sorted(kf_all.columns)
    rr12 = kf_all[s12].assign(CASH=rf)
    ew12 = evaluate(pd.DataFrame(1 / 12, index=hold, columns=s12), rr12, COST, FEE)
    rep["with12"] = {k: cmp(evaluate(select(momentum(kf_all[s12], kind)).shift(1).loc[hold] / TOP, rr12, COST, FEE), ew12, rf, P[:4])
                     for k, kind in (("S1", "12-1"), ("S2", "multi"))}
    # 对市值加权 11 板块（行 t 的公司数 × 平均规模 = t 月初市值）
    cap = (section("Number of Firms in Portfolios") * section("Average Firm Size")).loc[:END, SECTORS]
    wv = cap.loc[hold].div(cap.loc[hold].sum(axis=1), axis=0)
    vw11 = evaluate(wv, rr, COST, FEE)
    rep["vsVW11"] = {k: cmp(nets[k], vw11, rf, P[:4]) for k in nets}

    out = {"study": "L-037", "inputSha256": sha, "main": res, "report": rep,
           "series": {"months": list(hold), "S1": nets["S1"].round(10).tolist(), "S2": nets["S2"].round(10).tolist(), "EW": ew.round(10).tolist(), "MKT": mk.round(10).tolist()}}
    (HERE / "results.json").write_text(json.dumps(out, ensure_ascii=False, indent=2, default=float) + "\n", encoding="utf-8")
    for k in ("S1", "S2"):
        m = res[k]
        print(k, m["verdict"], m["gates"], "turn", round(m["turnoverPerYear"], 2))
        for b in ("vsEW", "vsMKT"):
            print("  ", b, {p: (round(v["dS"], 3), round(v["cand"]["sharpe"], 3), round(v["bench"]["sharpe"], 3), round(v["dCagr"], 4)) for p, v in m[b].items()})
        print("   placebo", m["placebo"], "delay", round(m["delay"]["dS"], 3))
        print("   etf", {b: {p: (round(v["dS"], 3), round(v["cand"]["sharpe"], 3), round(v["bench"]["sharpe"], 3), round(v["dCagr"], 4)) for p, v in m["etf"][b].items()} for b in ("vsEW9", "vsSPY")}, m["etf"]["current"], "cur", m["current"])
        print("   dd", round(m["vsEW"]["full"]["cand"]["maxDd"], 3), round(m["vsEW"]["full"]["bench"]["maxDd"], 3), round(m["vsMKT"]["full"]["bench"]["maxDd"], 3), "picks", m["picks"])
    print("explore", {k: {s: round(v[s]["full"]["dS"], 3) for s in v} if "S1" in v else round(v["full"]["dS"], 3) for k, v in rep.items() if k not in ("ewVsMkt", "nearTies")})
    print("post2000 explore", {k: {s: round(v[s]["post2000"]["dS"], 3) for s in v} if "S1" in v else round(v["post2000"]["dS"], 3) for k, v in rep.items() if k not in ("ewVsMkt", "nearTies")})
    print("ewVsMkt", {p: round(v["dS"], 3) for p, v in rep["ewVsMkt"].items()}, "nearTies", rep["nearTies"])


if __name__ == "__main__":
    main()
