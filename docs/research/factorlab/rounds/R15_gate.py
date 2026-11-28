"""R15 第 3、4 关（只读探索区，不调用 evaluate_factor、不记账）→ R15-gate.json。
    cd research-py && PYTHONPATH=. uv run python ../docs/research/factorlab/rounds/R15_gate.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

import factorlab.factors  # noqa: F401
from factorlab import data as data_mod
from factorlab.calendar import month_end_dates, trading_days
from factorlab.evaluate import PANEL_FIELDS, nw_tstat, spanning_regression
from factorlab.guard import Lockbox, split_codes
from factorlab.registry import FACTORS
from factorlab.universe import AdvCache, UniverseSpec, build_universe

PIN = {"size": "20261126T212426", "rev_1m": "20261126T212624", "vol_60d": "20261126T212754",
       "turnover_20d": "20261126T212925", "cn_ep_ttm": "20261127T014535", "cn_bp": "20261127T014701"}
CANDS = {"cn_ep_hist_pct": ["tmu_ew"], "cn_fscore_cheap": ["tmu_cap", "tmu_ew"]}


def rec(name):
    out = None
    for line in Path("factor-ledger/cn.jsonl").read_text().splitlines():
        r = json.loads(line)
        if r.get("factor") != name or r.get("mode") != "explore" or r.get("status") != "ok":
            continue
        if name in PIN and not r["trial_id"].startswith(PIN[name]):
            continue
        if name not in PIN and r.get("family") != "R15-cn-M":
            continue
        out = r
    assert out, name
    return out


ser = lambda r: pd.read_csv(Path("factor-ledger") / r["series_path"], index_col=0, parse_dates=True)


def rank_corr():
    names = list(CANDS) + ["cn_ep_ttm", "cn_bp"]
    fields = sorted(set(PANEL_FIELDS) | {f for n in names for f in FACTORS[n].needs})
    md = data_mod.load_market("cn", fields, "explore", log=False)
    p = md.panel
    dates = month_end_dates(trading_days(p["close_adj"]))
    mask = build_universe(p, dates, "cn", md.securities, UniverseSpec(), adv=AdvCache(p["amount"], UniverseSpec().amount_window))
    mask.loc[:, ~mask.columns.isin(split_codes(mask.columns, "explore", Lockbox().explore_frac))] = False
    v = {n: FACTORS[n](p, dates).reindex(index=dates, columns=mask.columns).where(mask) for n in names}
    out = {}
    for c in CANDS:
        for b in ("cn_ep_ttm", "cn_bp"):
            rs = []
            for d in dates:
                ok = v[c].loc[d].notna() & v[b].loc[d].notna()
                if ok.sum() >= 30:
                    rs.append(v[c].loc[d][ok].rank().corr(v[b].loc[d][ok].rank()))
            out[f"{c}~{b}"] = float(np.mean(rs))
    return out


def main():
    res = {"rank_corr": rank_corr(), "spanning": {}, "t": {}}
    base = ["size", "rev_1m", "vol_60d", "turnover_20d"]
    for c, cols in CANDS.items():
        s = ser(rec(c))
        for col in cols:
            for label, bs in (("R1+EP", base + ["cn_ep_ttm"]), ("R1", base)):
                X = pd.concat({b: ser(rec(b))[col] for b in bs}, axis=1)
                res["spanning"][f"{c}:{col}:{label}"] = spanning_regression(s[col], X)
    for n in ["cn_ep_ttm", "cn_bp"] + list(CANDS):
        s = ser(rec(n))
        res["t"][n] = {col: float(nw_tstat(s[col].dropna())) for col in ("tmu_cap", "tmu_ew")}
    Path("../docs/research/factorlab/rounds/R15-gate.json").write_text(json.dumps(res, indent=2, ensure_ascii=False, default=float) + "\n")
    print(json.dumps(res["rank_corr"]), json.dumps(res["t"]))
    for k, v in res["spanning"].items():
        print(k, f"alpha {v['alpha']*100:+.3f}% t {v['alpha_t_nw']:+.2f} R2 {v.get('r2', float('nan')):.2f}")


if __name__ == "__main__":
    main()
