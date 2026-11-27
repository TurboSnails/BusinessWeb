"""R9 美国文献因子只做多版本（计划 R9-2026-11-28.md，跑之前提交）。只读 2023-10 以前的 KF 数据。
    cd research-py && uv run python ../docs/research/factorlab/rounds/R9_us_kf.py
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm

ROOT = Path(__file__).resolve().parents[4]
SRC = ROOT / "research-py/factor-data/us_kf/portfolios.parquet"
OUT = Path(__file__).resolve().parent / "R9-detail.json"
CUT = pd.Timestamp("2023-10-31")
START, MID_END, MID_START = "1963-07", "1993-08", "1993-09"
CANDS = [  # (编号, 名称, 文件, 组合列表, 发表年, 已被 L-042 锁箱看过)
    (1, "低贝塔", "Portfolios_Formed_on_BETA", ["Lo 20"], 1972, False),
    (2, "低波动", "Portfolios_Formed_on_VAR", ["Lo 20"], 2006, False),
    (3, "低特质波动", "Portfolios_Formed_on_RESVAR", ["Lo 20"], 2006, False),
    (4, "低应计", "Portfolios_Formed_on_AC", ["Lo 20"], 1996, False),
    (5, "净回购", "Portfolios_Formed_on_NI", ["< 0"], 2008, False),
    (6, "高经营盈利", "Portfolios_Formed_on_OP", ["Hi 20"], 2013, True),
    (7, "低投资", "Portfolios_Formed_on_INV", ["Lo 20"], 2004, True),
    (8, "高盈利收益率", "Portfolios_Formed_on_E-P", ["Hi 20"], 1977, False),
    (9, "高现金流收益率", "Portfolios_Formed_on_CF-P", ["Hi 20"], 1994, False),
    (10, "高股息率", "Portfolios_Formed_on_D-P", ["Hi 20"], 1979, False),
    (11, "高账面市值比", "Portfolios_Formed_on_BE-ME", ["Hi 20"], 1992, True),
    (12, "小盘", "Portfolios_Formed_on_ME", ["Lo 20"], 1981, True),
    (13, "12−2 月动量", "10_Portfolios_Prior_12_2", ["Hi PRIOR", "PRIOR 9"], 1993, True),
    (14, "1 月反转", "10_Portfolios_Prior_1_0", ["Lo PRIOR", "PRIOR 2"], 1990, False),
    (15, "长期反转", "10_Portfolios_Prior_60_13", ["Lo PRIOR", "PRIOR 2"], 1985, False),
]
MONTHLY_FORMED = {2, 3, 13, 14, 15}


def nw_lag(T):
    return int(np.floor(4 * (T / 100) ** (2 / 9)))


def stats(r, mkt, rf):
    ex, mx = r - rf, mkt - rf
    s = lambda x: float(x.mean() / x.std(ddof=1) * np.sqrt(12))
    X = sm.add_constant(mx.to_numpy())
    fit = sm.OLS(ex.to_numpy(), X).fit(cov_type="HAC", cov_kwds={"maxlags": nw_lag(len(ex))})
    return {"n": int(len(r)), "dS": s(ex) - s(mx), "sharpe": s(ex), "alpha_ann": float(fit.params[0] * 12),
            "alpha_t": float(fit.tvalues[0]), "beta": float(fit.params[1])}


def main():
    assert hashlib.sha256(SRC.read_bytes()).hexdigest().startswith("767b1b96")
    df = pd.read_parquet(SRC)
    df = df[(df.weighting == "vw") & (df.date <= CUT)]
    assert df.date.max() <= CUT
    fac = df[df.dataset == "F-F_Research_Data_Factors"].pivot(index="date", columns="portfolio", values="ret")
    fac.index = fac.index.strftime("%Y-%m")
    mkt, rf = fac["Mkt-RF"] + fac["RF"], fac["RF"]
    rets, res = {}, {"window": [START, "2023-10"], "candidates": []}
    for cid, name, ds, ports, pub, seen in CANDS:
        d = df[df.dataset == ds].pivot(index="date", columns="portfolio", values="ret")[ports]
        d.index = d.index.strftime("%Y-%m")
        r = d.mean(axis=1, skipna=False).loc[START:"2023-10"]
        assert r.notna().all(), name
        rets[cid] = r
        m, f = mkt.loc[r.index], rf.loc[r.index]
        full = stats(r, m, f)
        post_idx = r.index >= f"{pub + 1}-01"
        post = stats(r[post_idx], m[post_idx], f[post_idx])
        h1 = r.index <= MID_END
        a, b = stats(r[h1], m[h1], f[h1]), stats(r[~h1], m[~h1], f[~h1])
        g = {"G1": full["dS"] > 0 and full["alpha_t"] >= 2, "G2": post["dS"] > 0 and post["alpha_ann"] > 0,
             "G3": a["alpha_ann"] > 0 and b["alpha_ann"] > 0}
        res["candidates"].append({"id": cid, "name": name, "dataset": ds, "ports": ports, "pub": pub, "lockbox_seen": seen,
                                  "monthly_formed": cid in MONTHLY_FORMED, "full": full, "post": post, "h1": a, "h2": b,
                                  "gates": g, "pass123": all(g.values())})
    # G4 去重
    passed = [c for c in res["candidates"] if c["pass123"]]
    exc = pd.DataFrame({c["id"]: rets[c["id"]] - mkt.loc[rets[c["id"]].index] for c in passed})
    corr = exc.corr()
    keep = []
    for c in sorted(passed, key=lambda c: -c["full"]["alpha_t"]):
        if all(corr.loc[c["id"], k] <= 0.7 for k in keep):
            keep.append(c["id"])
    for c in res["candidates"]:
        c["G4_kept"] = c["id"] in keep
    res["excess_corr"] = {f"{a}-{b}": float(corr.loc[a, b]) for i, a in enumerate(corr.index) for b in corr.index[i + 1:]}
    # 通过者等权组合（报告）
    if keep:
        combo = pd.concat([rets[k] for k in keep], axis=1).mean(axis=1)
        m, f = mkt.loc[combo.index], rf.loc[combo.index]
        h1 = combo.index <= MID_END
        res["combo"] = {"members": keep, "full": stats(combo, m, f), "h1": stats(combo[h1], m[h1], f[h1]),
                        "h2": stats(combo[~h1], m[~h1], f[~h1]),
                        "post2000": stats(combo[combo.index >= "2000-01"], m[combo.index >= "2000-01"], f[combo.index >= "2000-01"])}
        elig = [k for k in keep if not next(c for c in res["candidates"] if c["id"] == k)["lockbox_seen"]]
        if elig:
            cb = pd.concat([rets[k] for k in elig], axis=1).mean(axis=1)
            m, f = mkt.loc[cb.index], rf.loc[cb.index]
            res["combo_lockbox_eligible"] = {"members": elig, "full": stats(cb, m, f),
                                             "post2000": stats(cb[cb.index >= "2000-01"], m[cb.index >= "2000-01"], f[cb.index >= "2000-01"])}
    res["market"] = stats(mkt.loc[START:"2023-10"], mkt.loc[START:"2023-10"], rf.loc[START:"2023-10"])
    OUT.write_text(json.dumps({"status": "已完成", "detail": res}, indent=2, ensure_ascii=False) + "\n")
    for c in res["candidates"]:
        F, P = c["full"], c["post"]
        print(f"{c['id']:>2} {c['name']:<8} ΔS {F['dS']:+.3f} α {F['alpha_ann']:+.2%} t {F['alpha_t']:+.2f} | 发表后 ΔS {P['dS']:+.3f} α {P['alpha_ann']:+.2%} t {P['alpha_t']:+.2f} | 两半 α {c['h1']['alpha_ann']:+.2%} {c['h2']['alpha_ann']:+.2%} | {''.join(k for k, v in c['gates'].items() if v) or '-'} {'保留' if c['G4_kept'] else ''}{' (锁箱已看)' if c['lockbox_seen'] else ''}")
    print(json.dumps({k: res.get(k) for k in ("combo", "combo_lockbox_eligible")}, ensure_ascii=False, indent=1, default=float)[:2500])


if __name__ == "__main__":
    main()
