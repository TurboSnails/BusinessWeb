"""R10 第 3、4 关（港股）（只用探索区，不调用 evaluate_factor、不记账）。
第 4 关：候选与 cn_sue、cn_sur、turnover_vol_20d 的截面秩相关（方向调整后、股票池内 Spearman、调仓日平均）。
第 3 关：候选探索区序列对 R1 基准序列（规模、1 月反转、60 日波动、20 日换手）的 spanning；另报告对三个成分序列的 spanning。
    cd research-py && PYTHONPATH=. uv run python ../docs/research/factorlab/rounds/R10_gate34.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

from factorlab import data as data_mod
from factorlab.calendar import month_end_dates, trading_days
from factorlab.evaluate import PANEL_FIELDS, nw_tstat, spanning_regression
from factorlab.guard import Lockbox, split_codes
import factorlab.factors  # noqa: F401  注册全部因子
from factorlab.registry import FACTORS
from factorlab.universe import AdvCache, UniverseSpec, build_universe

LEDGER = Path("factor-ledger/hk.jsonl")
CANDS = ["hk_vqs", "hk_vqs52"]
COMPS = ["hk_ep_ttm", "hk_roe_ttm", "hk_sue_h", "high_52w"]


# 基准与成分序列钉死到 R4 / R5 用过的探索记录（同一因子有多条时不取「最新」，避免混入其他口径）
PINNED = {"size": "20261126T213617", "rev_1m": "20261126T213651", "vol_60d": "20261126T213708",
          "high_52w": "20261126T213846"}


def latest_explore(name):
    rec = None
    for line in LEDGER.read_text().splitlines():
        r = json.loads(line)
        if r.get("factor") == name and r.get("mode") == "explore" and r.get("status") == "ok":
            if name in PINNED and not r["trial_id"].startswith(PINNED[name]):
                continue
            rec = r
    assert rec is not None, name
    return rec


def rank_corr():
    names = CANDS + COMPS
    fields = sorted(set(PANEL_FIELDS) | {f for n in names for f in FACTORS[n].needs})
    md = data_mod.load_market("hk", fields, "explore", log=False)
    panel = md.panel
    days = trading_days(panel["close_adj"])
    dates = month_end_dates(days)
    adv = AdvCache(panel["amount"], UniverseSpec.for_market('hk') if hasattr(UniverseSpec, 'for_market') else UniverseSpec().amount_window)
    mask = build_universe(panel, dates, "hk", md.securities, UniverseSpec.for_market('hk') if hasattr(UniverseSpec, 'for_market') else UniverseSpec(), adv=adv)
    part = split_codes(mask.columns, "explore", Lockbox().explore_frac)
    mask.loc[:, ~mask.columns.isin(part)] = False
    vals = {n: (FACTORS[n].direction * FACTORS[n](panel, dates)).reindex(index=dates, columns=mask.columns).where(mask) for n in names}
    out = {}
    for c in CANDS:
        for k in COMPS:
            # 逐日只用两者都有值的入池证券，秩的 Pearson = Spearman
            r2 = []
            for d in dates:
                x, y = vals[c].loc[d], vals[k].loc[d]
                ok = x.notna() & y.notna()
                if ok.sum() >= 30:
                    r2.append(x[ok].rank().corr(y[ok].rank()))
            out[f"{c}~{k}"] = {"mean": float(np.mean(r2)), "median": float(np.median(r2)), "n": len(r2)}
    return out


def series(rec):
    s = pd.read_csv(rec["series_path"] if Path(rec["series_path"]).exists() else Path("factor-ledger") / rec["series_path"], index_col=0, parse_dates=True)
    return s


def main():
    res = {"rank_corr": rank_corr(), "spanning": {}}
    bench = {n: latest_explore(n) for n in ["size", "rev_1m", "vol_60d"]}  # 港股换手数据无效，不用
    comps = {n: latest_explore(n) for n in COMPS}
    for c in CANDS:
        rc = latest_explore(c)
        sc = series(rc)
        for col in ("tmu_cap", "tmu_ew"):
            y = sc[col]
            X = pd.concat({n: series(r)[col] for n, r in bench.items()}, axis=1)
            res["spanning"][f"{c}:{col}:R1bench"] = spanning_regression(y, X)
            Xc = pd.concat({n: series(r)[col] for n, r in comps.items()}, axis=1)
            res["spanning"][f"{c}:{col}:components"] = spanning_regression(y, Xc)
    res["bench_trials"] = {n: r["trial_id"] for n, r in {**bench, **comps}.items()}
    res["comp_t"] = {n: {col: float(nw_tstat(series(r)[col].dropna())) for col in ("tmu_cap", "tmu_ew")} for n, r in {**comps, **{c: latest_explore(c) for c in CANDS}}.items()}
    Path("../docs/research/factorlab/rounds/R10-gate34.json").write_text(json.dumps(res, indent=2, ensure_ascii=False, default=float) + "\n")
    print(json.dumps(res, indent=1, ensure_ascii=False, default=float)[:4000])


if __name__ == "__main__":
    main()
