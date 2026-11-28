#!/usr/bin/env python3
"""L-051 第二实现：compute.md 列出的边界逐项核对（不靠 run.py 的计数，直接在数据上重新验证事件清单与口径性质）。

用法：cd research-py && uv run python ../docs/research/dead-cat-bounce-2026-11-28/replication/boundary_checks.py
输入：replication/events.csv、replication/results.json；输出：replication/boundary-checks.json
"""
from __future__ import annotations

import json
import math
import runpy
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "research-py"))
from factorlab.evaluate import nw_tstat  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / "boundary-checks.json"
sys.argv = ["x"]
R = runpy.run_path(str(HERE / "run.py"), run_name="lib")   # 只借用数据加载与 detect（被核对的对象）


def nw_manual(x, L):
    """Bartlett 核 NW 方差的手写版：var = (γ0 + 2 Σ_{k≤L} (1 − k/(L+1)) γk) / T，γk 除以 T。"""
    x = np.asarray(x, float)
    T = len(x)
    u = x - x.mean()
    s = u @ u / T
    for k in range(1, L + 1):
        s += 2 * (1 - k / (L + 1)) * (u[k:] @ u[:-k]) / T
    return x.mean() / math.sqrt(s / T)


def main():
    D = R["load_data"]()
    ev = pd.read_csv(HERE / "events.csv", dtype={"code": str})
    res = json.loads((HERE / "results.json").read_text(encoding="utf-8"))
    pos = {d: i for i, d in enumerate(D.dates.strftime("%Y-%m-%d"))}
    col = {c: j for j, c in enumerate(D.codes)}
    ev["s"] = ev["signal"].map(pos)
    ev["ce"] = ev["crash_end"].map(pos)
    ev["cs"] = ev["crash_start"].map(pos)
    ev["j"] = ev["code"].map(col)
    out = {}

    # 1. 事件检测：10 日跌幅、反弹 ≥ 10%（相对 crash_end 起滚动最低）、信号日有行情且非一字跌停、20 日内
    bad = []
    for r in ev.itertuples():
        px = D.close[:, r.j]
        c1 = D.valid[r.cs, r.j] and D.valid[r.ce, r.j] and px[r.ce] / px[r.cs] - 1 <= -0.25 and r.ce - r.cs == 10
        seg = px[r.ce:r.s + 1]
        seg = seg[np.isfinite(seg)]
        rm = np.min(seg[:-1]) if len(seg) > 1 else np.nan
        c2 = D.valid[r.s, r.j] and not D.oneword[r.s, r.j] and 1 <= r.s - r.ce <= 20 and px[r.s] >= rm * 1.10
        # 第一次触发：crash_end+1 … s−1 之间不得已满足反弹条件
        first = True
        m_ = px[r.ce]
        for k in range(r.ce + 1, r.s):
            if not D.valid[k, r.j]:
                continue
            m_ = min(m_, px[k])
            if px[k] >= m_ * 1.10:
                first = False
                break
        if not (c1 and c2 and first):
            bad.append((r.code, r.signal, bool(c1), bool(c2), first))
    out["detection_definition"] = {"n_events": int(len(ev)), "n_violations": len(bad), "examples": bad[:10]}

    # 2. 重扫 + 冷却：同一股票相邻事件 crash_end − 上一信号 ≥ 120；统计「暴跌锚点逐日重扫」的实例
    #    （crash_end 之前、上一信号 + 120 之后，已有满足 10 日跌 ≤ −25% 的锚点但未形成信号）
    viol, rescans = [], 0
    for code, g in ev.sort_values("s").groupby("code"):
        prev = None
        j = col[code]
        for r in g.itertuples():
            if prev is not None and r.ce - prev < 120:
                viol.append((code, r.signal))
            lo = (prev + 120) if prev is not None else 10
            px = D.close[:, j]
            for i in range(max(lo, 10), r.ce):
                if D.valid[i, j] and D.valid[i - 10, j] and px[i] / px[i - 10] - 1 <= -0.25:
                    rescans += 1
                    break
            prev = r.s
    out["cooldown_rescan"] = {"n_cooldown_violations_within_pool_events": len(viol), "examples": viol[:10],
                              "n_events_preceded_by_failed_anchor_rescan": rescans,
                              "note": "冷却按全部接受信号（含底池外）计；这里只能在底池事件子集上验证 ≥ 120 的必要条件"}

    # 3. 停牌 = 无行情行：is_suspended 字段全为 False；事件窗口内无行情日数
    susp_field = bool(D.panel["is_suspended"].fillna(False).to_numpy(bool).any())
    gaps = [int((~D.valid[r.cs:r.s + 1, r.j]).sum()) for r in ev.itertuples()]
    out["suspension_is_missing_row"] = {"is_suspended_any_true": susp_field,
                                        "events_with_missing_rows_in_[cs,s]": int(sum(g > 0 for g in gaps)),
                                        "max_missing_rows_in_[cs,s]": int(max(gaps)) if gaps else 0}

    # 4. 第 9 条：事件里不得出现 no_limit_inferred / 停牌 ≥ 60（从首个有效日起计）后的复牌首日 / 退市整理区间
    v9 = []
    for r in ev.itertuples():
        v = D.valid[:, r.j]
        first = int(np.flatnonzero(v)[0])
        resume = False
        for t in range(r.cs, r.s + 1):
            if v[t] and t > first:
                k = t - 1
                run = 0
                while k >= first and not v[k]:
                    run += 1
                    k -= 1
                if run >= 60:
                    resume = True
                    break
        nli = bool(D.nli[r.cs:r.s + 1, r.j].any())
        sd = D.dates[r.s]
        dl = any(a <= sd <= b for a, b in D.delist_iv.get(r.code, ()))
        if resume or nli or dl:
            v9.append((r.code, r.signal, resume, nli, dl))
    out["rule9"] = {"n_violations": len(v9), "examples": v9[:10], "skips": res["counts"]["skips"],
                    "terminate_events_in_st_pit": res["counts"]["terminate_events_in_st_pit"],
                    "alt_prelisting_counted_as_suspension": res["counts"]["alt_prelisting_counted_as_suspension"]}

    # 5. 层边界：探索 s ≤ 2014-12-31；验证 s ≥ 2015 且 s+60 ≤ 2023-10-31；截断事件单列
    lay = []
    for r in ev.itertuples():
        sd = D.dates[r.s]
        e60 = D.dates[r.s + 60] if r.s + 60 < D.n else None
        if r.layer == "explore":
            ok = sd <= pd.Timestamp("2014-12-31")
        elif r.layer == "validate":
            ok = sd >= pd.Timestamp("2015-01-01") and e60 is not None and e60 <= pd.Timestamp("2023-10-31")
        else:
            ok = sd >= pd.Timestamp("2015-01-01") and (e60 is None or e60 > pd.Timestamp("2023-10-31"))
        if not ok:
            lay.append((r.code, r.signal, r.layer))
    vt = ev[ev.layer == "validate"]
    out["layer_boundary"] = {"n_violations": len(lay), "counts": ev.layer.value_counts().to_dict(),
                             "last_validate_signal": str(vt.signal.max()), "first_truncated_signal":
                             str(ev[ev.layer == "validate_truncated"].signal.min()),
                             "explore_cross_2015": int(ev.cross_2015.sum())}

    # 6. 对照分档与放宽：严格格 ≥ 10 才不放宽；放宽后只去掉 vol 条件
    out["controls"] = {"n_relaxed": int(ev.ctrl_relaxed.fillna(False).astype(bool).sum()),
                       "n_strict_with_lt10": int(((~ev.ctrl_relaxed.fillna(True).astype(bool)) & (ev.n_ctrl < 10)).sum()),
                       "n_no_control": int((ev.n_ctrl == 0).sum()), "median_n_ctrl": float(ev.n_ctrl.median())}

    # 7. 日历组合 + NW(60)：手写 Bartlett NW 与 factorlab.nw_tstat（statsmodels HAC）对照
    nwc = {}
    evs, acc, _sk = R["detect"](D, R["BASE"])
    accm = R["accepted_mask"](D, acc)
    R["assign_controls"](D, evs, accm)
    for layer in ("explore", "validate"):
        sub = [e for e in evs if e["layer"] == layer]
        R["paths"](D, sub, 60)
        days, x = R["calendar"](D, sub)
        t_sm = nw_tstat(x, lag=60)
        t_man = nw_manual(x, 60)
        T = len(x)
        nwc[layer] = {"n_days": T, "mean_x60": float(x.mean() * 60), "t_factorlab_statsmodels": t_sm,
                      "t_manual_bartlett": t_man, "t_run_py_nw_t": R["nw_t"](x, 60),
                      "t_manual_x_sqrt((T-1)/T)": t_man * math.sqrt((T - 1) / T),
                      "results_json_nw_t": res["layers"][layer]["C1"]["inference"]["nw_t"],
                      "results_json_mean_x60": res["layers"][layer]["C1"]["inference"]["mean_x60"]}
    out["calendar_nw60"] = nwc

    # 8. 安慰剂种子：同种子重跑两次结果相同（只跑验证层 C1、50 次以省时）
    R["placebo"].__globals__["N_PLACEBO"] = 50
    lo, hi = R["layer_rows"](D, "validate")
    eng = R["Engine"](D, lo, hi)
    sub = [e for e in evs if e["layer"] == "validate"]
    a = R["placebo"](D, sub, eng, 60)
    b = R["placebo"](D, sub, eng, 60)
    out["placebo_seed"] = {"seed": R["SEED"], "deterministic": a == b, "p5_50draws": a["p5"], "first_run": a}

    # 9. 退市按最后成交：窗口内退市的事件，终止日 = 最后有行情日，持有收益此后为 0、无 −100%
    dl_ev = []
    for e in sub + [e for e in evs if e["layer"] == "explore"]:
        d_ = D.delist_date[e["j"]]
        if pd.isna(d_):
            continue
        lim = D.dates[min(e["s"] + 60, D.n - 1)]
        if D.dates[e["s"]] < pd.Timestamp(d_) <= lim:
            end = R["event_end"](D, e, 60)
            sp = R["seg_path"](D, e, e.get("ctrl"), 60)
            v = np.flatnonzero(D.valid[:, e["j"]])
            dl_ev.append({"code": e["code"], "signal": str(D.dates[e["s"]].date()), "delist_date": str(pd.Timestamp(d_).date()),
                          "end": str(D.dates[end].date()), "last_trade": str(D.dates[v[-1]].date()),
                          "last_segment_end": (str(D.dates[sp[0][-1]].date()) if sp is not None else None),
                          "min_segment_return": (float(sp[2].min()) if sp is not None else None)})
    out["delist_last_trade"] = {"events": dl_ev, "all_end_eq_last_trade": all(x["end"] == x["last_trade"] for x in dl_ev)}

    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2, default=str) + "\n", encoding="utf-8")
    print(json.dumps(out, ensure_ascii=False, indent=1, default=str)[:6000])


if __name__ == "__main__":
    main()
