#!/usr/bin/env python3
"""L-051：主实现 ../results.json 与第二实现 replication/results.json 逐项比较。

- 判定数字（层 meta 计数、各候选 inference / S1 / S2 / S3 / S5 / gates / grade、C2 上下界、holm、headline、verdict、
  变体四项）：绝对容差 1e-8；字符串 / 布尔须完全相同。
- 其余共有数值叶子（报告项）：只列出差异，不作判定（相对容差 1e-6）。
- 事件清单：主实现事件文件（自动寻找 ../events.csv / ../events.json / results.json 内 events 列表）与
  replication/events.csv 按 (code, signal) 逐条比，并核对 crash_start / crash_end / trough / layer / c2_lo / c2_hi。

用法：cd research-py && uv run python ../docs/research/dead-cat-bounce-2026-11-28/replication/compare.py
输出：replication/compare-report.json（并打印摘要）；退出码 0 = 判定数字全部一致，2 = 有差异，3 = 主实现结果未就绪。
"""
from __future__ import annotations

import csv
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MAIN = HERE.parent / "results.json"
REPL = HERE / "results.json"
REPL_EVENTS = HERE / "events.csv"
OUT = HERE / "compare-report.json"
TOL = 1e-8
REL_REPORT = 1e-6

DECISION_KEYS = ("inference", "S1", "S2", "S3", "S5", "gates", "grade")


def is_num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def same(a, b, tol=TOL, rel=False):
    if a is None or b is None:
        return a is None and b is None
    if is_num(a) and is_num(b):
        fa, fb = float(a), float(b)
        if math.isnan(fa) or math.isnan(fb):
            return math.isnan(fa) and math.isnan(fb)
        lim = tol * max(1.0, abs(fa), abs(fb)) if rel else tol
        return abs(fa - fb) <= lim
    return a == b


def leaves(o, path=""):
    if isinstance(o, dict):
        for k, v in o.items():
            yield from leaves(v, f"{path}.{k}" if path else str(k))
    elif isinstance(o, list):
        for i, v in enumerate(o):
            yield from leaves(v, f"{path}[{i}]")
    else:
        yield path, o


def get(o, path):
    for k in path.split("."):
        if not isinstance(o, dict) or k not in o:
            return None
        o = o[k]
    return o


def decision_paths(r):
    """候选判定子树的路径前缀。"""
    out = []
    for layer in ("explore", "validate"):
        base = f"layers.{layer}"
        out += [f"{base}.meta", f"{base}.holm"]
        for cand in ("C1", "C2"):
            for k in DECISION_KEYS:
                out.append(f"{base}.{cand}.{k}")
        for b in ("bound_lo", "bound_hi"):
            for k in DECISION_KEYS:
                out.append(f"{base}.C2.{b}.{k}")
        out.append(f"{base}.C2.both_bounds_support")
    out += ["headline", "verdict"]
    return out


def compare_tree(m, r, prefix, tol, rel, diffs, kind):
    a, b = get(m, prefix), get(r, prefix)
    if a is None and b is None:
        return 0
    if not isinstance(a, (dict, list)) or not isinstance(b, (dict, list)):
        if not same(a, b, tol, rel):
            diffs.append({"kind": kind, "path": prefix, "main": a, "repl": b})
        return 1
    la, lb = dict(leaves(a, prefix)), dict(leaves(b, prefix))
    n = 0
    for p in sorted(set(la) | set(lb)):
        if p not in la:
            diffs.append({"kind": kind, "path": p, "type": "only_repl", "repl": lb[p]})
        elif p not in lb:
            diffs.append({"kind": kind, "path": p, "type": "only_main", "main": la[p]})
        else:
            n += 1
            if not same(la[p], lb[p], tol, rel):
                diffs.append({"kind": kind, "path": p, "main": la[p], "repl": lb[p]})
    return n


def load_events_main(main_r):
    for p in (HERE.parent / "events.csv", HERE.parent / "events_main.csv"):
        if p.exists():
            with open(p, encoding="utf-8") as f:
                return list(csv.DictReader(f)), str(p)
    p = HERE.parent / "events.json"
    if p.exists():
        d = json.loads(p.read_text(encoding="utf-8"))
        return (d if isinstance(d, list) else d.get("events", [])), str(p)
    ev = main_r.get("events")
    if isinstance(ev, list):
        return ev, "results.json:events"
    if isinstance(ev, dict) and isinstance(ev.get("list"), list):
        return ev["list"], "results.json:events.list"
    return None, None


def norm_bool(x):
    if isinstance(x, bool):
        return x
    return str(x).strip().lower() in ("true", "1", "yes")


def compare_events(main_ev):
    with open(REPL_EVENTS, encoding="utf-8") as f:
        rep = list(csv.DictReader(f))
    key = lambda e: (str(e.get("code")).zfill(6), str(e.get("signal") or e.get("s") or e.get("signal_date"))[:10])
    M = {key(e): e for e in main_ev}
    R = {key(e): e for e in rep}
    only_m = sorted(set(M) - set(R))
    only_r = sorted(set(R) - set(M))
    field_diff = []
    for k in sorted(set(M) & set(R)):
        for f in ("crash_start", "crash_end", "trough", "layer"):
            if f in M[k] and str(M[k][f])[:10] != str(R[k][f])[:10]:
                field_diff.append({"event": k, "field": f, "main": M[k][f], "repl": R[k][f]})
        for f in ("c2_lo", "c2_hi"):
            if f in M[k] and norm_bool(M[k][f]) != norm_bool(R[k][f]):
                field_diff.append({"event": k, "field": f, "main": M[k][f], "repl": R[k][f]})
    num = {}
    for fm, fr in (("event_excess", "excess"), ("cost_roundtrip", "cost_roundtrip")):
        nd, mx, nn = 0, 0.0, 0
        for k in sorted(set(M) & set(R)):
            if fm not in M[k] or fr not in R[k]:
                continue
            a, b = M[k][fm], R[k][fr]
            a = None if a in ("", None) else float(a)
            b = None if b in ("", None) else float(b)
            if (a is None) != (b is None):
                nn += 1
                continue
            if a is None:
                continue
            dd = abs(a - b)
            mx = max(mx, dd)
            nd += int(dd > TOL)
        num[fm] = {"n_gt_tol": nd, "max_abs_diff": mx, "n_null_mismatch": nn}
    return {"n_main": len(M), "n_repl": len(R), "only_main": only_m[:100], "only_repl": only_r[:100], "per_event_numeric": num,
            "n_only_main": len(only_m), "n_only_repl": len(only_r), "field_diffs": field_diff[:200],
            "n_field_diffs": len(field_diff), "identical": not only_m and not only_r and not field_diff}


def main():
    if not REPL.exists():
        print("缺少 replication/results.json")
        return 1
    if not MAIN.exists():
        rep = {"status": "waiting_main", "main": str(MAIN)}
        OUT.write_text(json.dumps(rep, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("主实现 results.json 尚未出现")
        return 3
    m = json.loads(MAIN.read_text(encoding="utf-8"))
    r = json.loads(REPL.read_text(encoding="utf-8"))
    dec, rep_d = [], []
    n_dec = sum(compare_tree(m, r, p, TOL, False, dec, "decision") for p in decision_paths(r))
    # 变体：四项
    for k in sorted(set(m.get("variants", {})) | set(r.get("variants", {}))):
        for f in ("n_events", "n_signal_months", "mean_x60", "nw_t"):
            n_dec += compare_tree(m, r, f"variants.{k}.{f}", TOL, False, dec, "decision")
    # 报告项（判定子树之外的共有叶子）
    covered = tuple(decision_paths(r)) + ("variants",)
    lm, lr = dict(leaves(m)), dict(leaves(r))
    n_rep = 0
    for p in sorted(set(lm) & set(lr)):
        if p.startswith(covered) or p.startswith(("meta", "inputs", "trials")):
            continue
        n_rep += 1
        if not same(lm[p], lr[p], REL_REPORT, rel=True):
            rep_d.append({"kind": "report", "path": p, "main": lm[p], "repl": lr[p]})
    inputs_same = m.get("inputs") == r.get("inputs")
    main_ev, src = load_events_main(m)
    ev = compare_events(main_ev) if main_ev is not None else {"status": "main_event_list_not_found"}
    if src:
        ev["main_source"] = src
    out = {"status": "identical" if not dec and ev.get("identical", False) else "mismatch",
           "tol_decision": TOL, "n_decision_leaves_compared": n_dec, "n_decision_diffs": len(dec),
           "n_report_leaves_compared": n_rep, "n_report_diffs": len(rep_d), "inputs_identical": inputs_same,
           "grades": {L: {c: (get(m, f"layers.{L}.{c}.grade"), get(r, f"layers.{L}.{c}.grade")) for c in ("C1", "C2")}
                      for L in ("explore", "validate")},
           "events": ev, "decision_diffs": dec[:400], "report_diffs": rep_d[:400]}
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: out[k] for k in ("status", "n_decision_leaves_compared", "n_decision_diffs",
                                          "n_report_diffs", "inputs_identical", "grades")}, ensure_ascii=False, indent=1))
    print("events:", {k: v for k, v in ev.items() if not isinstance(v, list)})
    return 0 if not dec else 2


if __name__ == "__main__":
    sys.exit(main())
