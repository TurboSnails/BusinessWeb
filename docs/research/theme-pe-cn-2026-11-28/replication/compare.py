#!/usr/bin/env python3
"""L-052 两实现逐项比较：../results.json（主实现） vs replication/results.json（第二实现）。

规则（任务书）：
- 确定性字段：|a − b| ≤ 1e-8（布尔、字符串须相等）。
- 随机抽样类（随机行业安慰剂 p、bootstrap p、功效）：蒙特卡洛容差 |p₁ − p₂| ≤ 3·√(p̄(1 − p̄)/N) + 1/N。
- 依赖随机 p 的判定（c5、Holm、grade）单列，按 p 的容差结论解读。
- 抽样分布的均值 / 分位数只列差值，不判通过（两实现的抽样设计可不同）。
- 只在一边出现的键列为「结构差异」。

用法：python3 replication/compare.py [--main ../results.json] [--rep results.json]
输出：replication/compare-report.json + 终端摘要。
"""
from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOL = 1e-8

# 路径分类（正则作用于以 '.' 连接的路径）
MC_P = [r"^placebo\.randomIndustry\.[^.]+\.p\.", r"^placebo\.bootstrap\..*\.(pLE0|pGE0|p)$",
        r"^placebo\.bootstrap\..*\.p\.", r"^power\."]
MC_DERIVED = [r"^placebo\.holm\.", r"^judgments\.[^.]+\.c5\.", r"^judgments\.[^.]+\.grade$",
              r"^headline\.[^.]+\.grade$", r"^verdict\.(C1a|C1b)$"]
MC_INFO = [r"^placebo\.randomIndustry\.[^.]+\.dist\.", r"^placebo\.bootstrap\.", r"\.draws?\.",
           r"^placebo\.randomIndustry\.[^.]+\.(n|seed|nSegments)$"]
# 定义差异（不判通过）。主实现按 CLARIFY-2 第 13 条改为分窗口 turnoverAnn / costAnn 后，这两项回到确定性比较。
DEFN = [r"^params\.nBoot$",
        # 现金占比均值：第二实现 = 调仓成交后现金占比的调仓日均值；主实现取法不同（其余 feasibility 度量逐位一致）
        r"^feasibility1e6\.[^.]+\.[^.]+\.cashShareMean$"]
SKIP = [r"^meta\.(generatedAt|runtimeSec|impl|notes|deviations|lockbox|allocMode|clarifications)", r"^verdict\.summary$",
        r"\.rule$", r"^inputs\.finPitNote$", r"^inputs\.rf\.(dailyRule|source)$",
        r"^verdict\.lockboxNote$", r"^trials\.", r"\.note$", r"\.gradeRule$", r"^e4Etf\.source$",
        r"\.method$", r"\.design$", r"^headline\.firstSentence$"]


def flat(x, pre=""):
    out = {}
    if isinstance(x, dict):
        for k, v in x.items():
            out.update(flat(v, f"{pre}.{k}" if pre else str(k)))
    elif isinstance(x, list):
        if all(not isinstance(v, (dict, list)) for v in x):
            out[pre] = x
        else:
            for i, v in enumerate(x):
                out.update(flat(v, f"{pre}[{i}]"))
    else:
        out[pre] = x
    return out


# 第二实现 → 主实现 的命名对齐（只改名，不改值）
VARIANT = {"E1_K1_C1a": "E1_C1a_K1", "E1_K3_C1a": "E1_C1a_K3", "E1_K1_C1b": "E1_C1b_K1", "E1_K3_C1b": "E1_C1b_K3",
           "E2_exit3_C1a": "E2_C1a_exit3", "E2_exit5_C1a": "E2_C1a_exit5", "E5_C1a": "E5_C1a_EP",
           "E5_C1b": "E5_C1b_EP", "E6_thr080_C1a": "E6_C1a_thr080", "E6_thr095_C1a": "E6_C1a_thr095",
           "E6_thr080_C1b": "E6_C1b_thr080", "E6_thr095_C1b": "E6_C1b_thr095", "E3_C1a": "E3_C1a_emptyB1",
           "E3_C1b": "E3_C1b_emptyB1", "B2C2": "B2p_C2"}
REWRITE = [
    (r"^sensitivity\.([^.]+)\.metrics\.", r"sensitivity.\1."),
    (r"^sensitivity\.([^.]+)\.L\.net$", r"sensitivity.\1.validate.L"),
    (r"^sensitivity\.([^.]+)\.judgment14\.net\.", r"sensitivity.\1.readings."),
    (r"^c2\.nByWindow\.", "c2.nTriggers."),
    (r"^c2\.metrics\.([^.]+)\.B2p_C2\.", r"c2.B2pWithC2.\1."),
    (r"^c2\.metrics\.([^.]+)\.B2p\.", r"c2.B2p.\1."),
    (r"^power\.([^.]+)\.power_p10$", r"power.\1.power_alpha_0.10"),
    (r"^power\.([^.]+)\.power_p05$", r"power.\1.power_alpha_0.05_holm_worst"),
    (r"^power\.([^.]+)\.nullSdL$", r"power.\1.placeboL_sd"),
    (r"^judgments\.([^.]+)\.c5\.detail\.pL$", r"judgments.\1.c5.detail.pRaw"),
    (r"^judgments\.([^.]+)\.c5\.detail\.holm$", r"judgments.\1.c5.detail.pHolm"),
]


def rename_rep(path):
    parts = re.split(r"(\.|\[)", path)
    parts = [VARIANT.get(x, x) for x in parts]
    p = "".join(parts)
    for a, b in REWRITE:
        p = re.sub(a, b, p)
    return p


def norm(path):
    """大小写与下划线不敏感（monthsWithHeld ≡ months_with_held）。"""
    return path.replace("_", "").lower()


def cls(path):
    for kind, pats in (("skip", SKIP), ("defn", DEFN), ("mc_p", MC_P), ("mc_derived", MC_DERIVED), ("mc_info", MC_INFO)):
        if any(re.search(p, path) for p in pats):
            return kind
    return "det"


def num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def mc_tol(p1, p2, n):
    pb = (p1 + p2) / 2
    return 3 * math.sqrt(max(pb * (1 - pb), 0.0) / n) + 1 / n


def find_n(path, F):
    """随机 p 所在块的抽样次数 N。"""
    parts = path.split(".")
    for i in range(len(parts), 0, -1):
        base = ".".join(parts[:i])
        for key in ("n", "N", "nPlacebo", "nBoot"):
            v = F.get(f"{base}.{key}")
            if num(v):
                return int(v)
    return 1000


def same(a, b):
    if num(a) and num(b):
        return abs(a - b) <= TOL, abs(a - b)
    if a is None and b is None:
        return True, 0.0
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return False, None
        ok, md = True, 0.0
        for x, y in zip(a, b):
            o, dd = same(x, y)
            ok &= o
            if dd is not None and md is not None:
                md = max(md, dd)
        return ok, md
    return a == b, None


REP2MAIN_VARIANT = {**VARIANT, "E0_C1a_ttmStrict": "E0_C1a_ttmStrict", "E0_C1b_ttmStrict": "E0_C1b_ttmStrict"}


def compare_daily(main_dir: Path, rep_csv: Path, tol: float = 1e-10) -> dict:
    """主实现 daily/validate_*.csv 与第二实现 daily_series*.csv.gz 逐日比较（验证段）。"""
    import pandas as pd
    if not main_dir.exists() or not rep_csv.exists():
        return {"available": False}
    R = pd.read_csv(rep_csv, index_col=0, parse_dates=True)
    src = {"net": "validate_net_returns.csv", "gross": "validate_gross_returns.csv"}
    out = {"available": True, "tol": tol, "series": {}}
    for typ, f in src.items():
        M = pd.read_csv(main_dir / f, index_col=0, parse_dates=True)
        for col in M.columns:
            rc = {"B2p_C2": "B2C2"}.get(col, col)
            rc = next((k for k, v in REP2MAIN_VARIANT.items() if v == col), rc)
            key = f"{rc}_{typ}" if f"{rc}_{typ}" in R.columns else (col if col in R.columns and typ == "net" else None)
            if key is None:
                continue
            dd = (M[col] - R[key].reindex(M.index)).abs()
            bad = dd[dd > tol]
            out["series"][f"{col}.{typ}"] = {"days": int(len(dd)), "nBad": int(len(bad)) + int(dd.isna().sum()),
                                             "firstBad": str(bad.index[0].date()) if len(bad) else None,
                                             "maxAbs": float(dd.max())}
    ct = main_dir / "validate_cost_turnover.csv"
    if ct.exists():
        M = pd.read_csv(ct, index_col=0, parse_dates=True)
        for col in M.columns:
            if col in R.columns:
                dd = (M[col] - R[col].reindex(M.index).fillna(0.0)).abs()
                bad = dd[dd > tol]
                out["series"][col] = {"days": int(len(dd)), "nBad": int(len(bad)),
                                      "firstBad": str(bad.index[0].date()) if len(bad) else None, "maxAbs": float(dd.max())}
    out["nSeries"] = len(out["series"])
    out["nSeriesAllWithinTol"] = sum(1 for v in out["series"].values() if v["nBad"] == 0)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--main", default=str(HERE.parent / "results.json"))
    ap.add_argument("--rep", default=str(HERE / "results.json"))
    ap.add_argument("--out", default=str(HERE / "compare-report.json"))
    ap.add_argument("--daily", default=None, help="第二实现日度序列（默认按 --rep 推断）")
    a = ap.parse_args()
    M = json.loads(Path(a.main).read_text())
    R = json.loads(Path(a.rep).read_text())
    FM0, FR0 = flat(M), flat(R)
    FM = {norm(k): v for k, v in FM0.items()}
    FR = {norm(rename_rep(k)): v for k, v in FR0.items()}
    orig = {norm(k): k for k in FM0}
    orig.update({norm(rename_rep(k)): orig.get(norm(rename_rep(k)), k) for k in FR0})
    rows = {"det_ok": [], "det_bad": [], "mc_ok": [], "mc_bad": [], "mc_derived": [], "mc_info": [], "defn": [],
            "only_main": [], "only_rep": [], "skipped": []}
    for pn in sorted(set(FM) | set(FR)):
        p = orig[pn]
        k = cls(p)
        if k == "skip":
            rows["skipped"].append(p)
            continue
        if pn not in FR:
            rows["only_main"].append(p)
            continue
        if pn not in FM:
            rows["only_rep"].append(p)
            continue
        m, r = FM[pn], FR[pn]
        if k == "mc_p" and num(m) and num(r):
            n = find_n(p, FM0)
            tol = mc_tol(m, r, n)
            rec = {"path": p, "main": m, "rep": r, "diff": abs(m - r), "tol": tol, "N": n}
            rows["mc_ok" if abs(m - r) <= tol else "mc_bad"].append(rec)
            continue
        if k in ("mc_derived", "mc_info", "defn"):
            ok, dd = same(m, r)
            rows[k].append({"path": p, "main": m, "rep": r, "equal": ok, "diff": dd})
            continue
        ok, dd = same(m, r)
        rec = {"path": p, "main": m, "rep": r, "diff": dd}
        rows["det_ok" if ok else "det_bad"].append(rec)

    def sect(p):
        return re.split(r"[.\[]", p)[0]

    summary = {}
    for key in ("det_ok", "det_bad", "mc_ok", "mc_bad", "only_main", "only_rep"):
        for rec in rows[key]:
            s = sect(rec if isinstance(rec, str) else rec["path"])
            summary.setdefault(s, {}).setdefault(key, 0)
            summary[s][key] += 1
    hist = {}
    for rec in rows["det_bad"]:
        dd = rec["diff"]
        key = "non-numeric" if dd is None else next(f"<{t:g}" for t in (1e-6, 1e-4, 1e-3, 1e-2, 1e-1, float("inf")) if dd < t)
        hist[key] = hist.get(key, 0) + 1
    rep_path = Path(a.rep)
    daily_csv = Path(a.daily) if a.daily else rep_path.with_name(
        rep_path.name.replace("results", "daily_series").replace(".json", ".csv.gz"))
    daily = compare_daily(HERE.parent / "daily", daily_csv)
    rep = {"tolerance": TOL, "detBadDiffHistogram": hist, "daily": daily, "mcRule": "|p1-p2| <= 3*sqrt(pbar(1-pbar)/N) + 1/N",
           "counts": {k: len(v) for k, v in rows.items()}, "bySection": summary, **rows}
    Path(a.out).write_text(json.dumps(rep, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps(rep["counts"], ensure_ascii=False))
    print("det_bad |diff| histogram:", json.dumps(hist))
    if daily.get("available"):
        print(f"daily: {daily['nSeriesAllWithinTol']}/{daily['nSeries']} series within 1e-10 on every validate day")
        for k, v in daily["series"].items():
            if v["nBad"]:
                print(f"   {k}: nBad={v['nBad']} first={v['firstBad']} max={v['maxAbs']:.2e}")
    for s, v in sorted(summary.items()):
        print(f"  {s:18s} {v}")
    print("\n== MC p ==")
    for r_ in rows["mc_ok"] + rows["mc_bad"]:
        flag = "OK " if r_ in rows["mc_ok"] else "BAD"
        print(f"  {flag} {r_['path']}: main={r_['main']:.4f} rep={r_['rep']:.4f} |d|={r_['diff']:.4f} tol={r_['tol']:.4f}")
    print("\n== MC-derived (judgment depending on random p) ==")
    for r_ in rows["mc_derived"]:
        print(f"  {'=' if r_['equal'] else '≠'} {r_['path']}: main={r_['main']} rep={r_['rep']}")
    print(f"\nwrote {a.out}")


if __name__ == "__main__":
    main()
