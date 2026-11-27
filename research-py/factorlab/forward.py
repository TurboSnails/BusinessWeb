"""A 股 2026Q4 锁箱候选的前推记账（L-038）与批内 Holm 三档判定。

CLI::

    uv run python -m factorlab.forward run --market cn [--dry-run] [--out PATH] [--prereg H]
    uv run python -m factorlab.forward status --market cn [--out PATH]
    uv run python -m factorlab.forward holm --market cn --batch BATCH
           [--mean K1=.. --mean K2=..]   # 可选覆盖；默认读 confirm 登记簿
           [--p K1=..]                  # 可选覆盖单边 p；默认 stats.p_tmu

设计：
- 候选身份（源码/参数/配置哈希 + 判定口径）冻结在 CANDIDATES，与 PREREG.md 一致；
  运行时用 candidate_spec 核对，不一致拒绝。
- 统计复用 evaluate_factor(..., mode='forward')；只记账前推区（锁箱 end 之后）已完成月份。
- forward.json 已写入的月份冻结：再次运行若旧行被改写则失败（frozen_violations）。
- 撤下：累计期数 ≥ 24 且累计 NW t < −1。
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

from .evaluate import candidate_spec, evaluate_factor, nw_tstat
from .guard import Lockbox, TrialLedger, confirm_passes, holm

REPO = Path(__file__).resolve().parents[2]
DEFAULT_OUT = REPO / "docs/research/factorlab-confirm-2026Q4/forward.json"
PREREG_COMMIT = "001087bd"
PREREG_BATCH = "2026Q4-cn"
WITHDRAW_MIN_PERIODS = 24
WITHDRAW_T = -1.0

# 与 docs/research/factorlab-confirm-2026Q4/PREREG.md 冻结值一致（小数，非百分数）
CANDIDATES: list[dict] = [
    {
        "id": "K1",
        "factor": "cn_sue",
        "metric": "tmu_cap",
        "source_hash": "5e60044b630a",
        "params_hash": "2f0d6888b739",
        "config_hash": "efc06e526d76",
        "half_m_star": 0.00137,   # +0.137%/月
        "m_star": 0.00274,
    },
    {
        "id": "K2",
        "factor": "cn_sur",
        "metric": "tmu_cap",
        "source_hash": "e4013d23f458",
        "params_hash": "8f32cce74a31",
        "config_hash": "efc06e526d76",
        "half_m_star": 0.00153,
        "m_star": 0.00306,
    },
    {
        "id": "K3",
        "factor": "turnover_vol_20d",
        "metric": "tmu_ew",
        "source_hash": "864ea3375908",
        "params_hash": "ba71e90221ca",
        "config_hash": "97643c4fdcb6",
        "half_m_star": 0.00226,
        "m_star": 0.00451,
    },
]

TIER_PASS = "通过"
TIER_WEAK = "方向一致、证据不足"
TIER_FAIL = "不通过"


# ---------------------------------------------------------------- 哈希核对
def verify_frozen(market: str = "cn", candidates: list[dict] | None = None) -> list[str]:
    """当前代码的 candidate_spec 与冻结哈希不一致时返回错误信息列表（空 = 全部 OK）。"""
    errs = []
    for c in candidates or CANDIDATES:
        got = candidate_spec(market, c["factor"])
        for k in ("source_hash", "params_hash", "config_hash"):
            if got.get(k) != c[k]:
                errs.append(
                    f"{c['factor']}: {k} 当前={got.get(k)!r} 冻结={c[k]!r}（拒绝前推，先对齐代码与 PREREG）"
                )
    return errs


# ---------------------------------------------------------------- 撤下与月度行
def withdraw_triggered(n_periods: int, nw_t: float | None) -> bool:
    """连续前推满 24 期且累计 NW t < −1 → 撤下。"""
    if n_periods < WITHDRAW_MIN_PERIODS:
        return False
    if nw_t is None or not np.isfinite(nw_t):
        return False
    return bool(nw_t < WITHDRAW_T)


def month_key(ts) -> str:
    t = pd.Timestamp(ts)
    return f"{t.year:04d}-{t.month:02d}"


def build_rows_from_series(rets: pd.Series, existing: list[dict] | None = None,
                           now: datetime | None = None) -> list[dict]:
    """由判定口径月收益序列生成（或追加）冻结行。

    rets：索引为期末日期（与 EvalResult.series 一致），值为该月判定口径收益。
    已有行按 month 保留原样；只追加新月份。累计统计按截至该月的全部收益重算。
    """
    now = now or datetime.now(timezone.utc)
    frozen_at = now.isoformat(timespec="seconds")
    existing = list(existing or [])
    by_month = {r["month"]: r for r in existing}
    out = list(existing)

    if rets is None or len(rets) == 0:
        return out

    s = pd.Series(rets).dropna().sort_index()
    for i, (dt, ret) in enumerate(s.items(), start=1):
        m = month_key(dt)
        cum = s.iloc[:i]
        mean = float(cum.mean())
        t = nw_tstat(cum) if len(cum) >= 3 else float("nan")
        t_out = None if not np.isfinite(t) else float(t)
        row = {
            "month": m,
            "period_end": str(pd.Timestamp(dt).date()),
            "ret": float(ret),
            "n_periods": int(i),
            "cum_mean": mean,
            "nw_t": t_out,
            "withdraw_trigger": withdraw_triggered(i, t_out),
            "frozen_at": frozen_at,
        }
        if m in by_month:
            continue  # 已冻结，不改写；违规由 frozen_violations 在合并后检测
        by_month[m] = row
        out.append(row)
    out.sort(key=lambda r: r["month"])
    return out


def frozen_violations(previous: dict | None, nxt: dict | None) -> list[str]:
    """已冻结行不能改、不能删。返回违规描述（候选.月份）。"""
    prev_c = (previous or {}).get("candidates") or {}
    next_c = (nxt or {}).get("candidates") or {}
    bad = []
    for name, pc in prev_c.items():
        prev_rows = {r["month"]: r for r in (pc.get("rows") or [])}
        nc = next_c.get(name) or {}
        next_rows = {r["month"]: r for r in (nc.get("rows") or [])}
        for m, old in prev_rows.items():
            if m not in next_rows:
                bad.append(f"{name}.{m}: 已冻结行被删除")
                continue
            # 比较除 frozen_at 外的业务字段是否被改（frozen_at 本应保持，一并比对）
            if json.dumps(old, sort_keys=True, ensure_ascii=False) != json.dumps(
                next_rows[m], sort_keys=True, ensure_ascii=False
            ):
                bad.append(f"{name}.{m}: 已冻结行被改写")
    return bad


# ---------------------------------------------------------------- Holm 三档
def tier_verdict(mean: float, half_m_star: float, holm_p: float, alpha: float = 0.05) -> str:
    """PREREG 三档：通过 / 方向一致、证据不足 / 不通过。

    门槛：均值 ≥ ½·m*（同号）；再要求 Holm 单边 p < alpha 才叫「通过」。
    """
    if not np.isfinite(mean) or not np.isfinite(half_m_star):
        return TIER_FAIL
    # confirm_passes(effect, m*)：方向一致且 |effect| ≥ 0.5·|m*|；此处 half_m_star = ½·m*
    m_star = half_m_star / 0.5
    if not confirm_passes(mean, m_star, ratio=0.5):
        return TIER_FAIL
    if not np.isfinite(holm_p) or holm_p >= alpha:
        return TIER_WEAK
    return TIER_PASS


def holm_judge(means: dict[str, float], pvals: dict[str, float],
               candidates: list[dict] | None = None, alpha: float = 0.05) -> dict:
    """批内 Holm + 三档判定。keys = 因子名。返回 {factor: {mean, p, holm_p, half_m_star, verdict}}。"""
    cands = {c["factor"]: c for c in (candidates or CANDIDATES)}
    names = [n for n in means if n in pvals and n in cands]
    if not names:
        return {}
    adj, _ = holm([pvals[n] for n in names], alpha=alpha)
    out = {}
    for n, hp in zip(names, adj.tolist()):
        c = cands[n]
        m = float(means[n])
        out[n] = {
            "id": c["id"],
            "metric": c["metric"],
            "mean": m,
            "p": float(pvals[n]),
            "holm_p": float(hp),
            "half_m_star": c["half_m_star"],
            "m_star": c["m_star"],
            "verdict": tier_verdict(m, c["half_m_star"], float(hp), alpha),
        }
    return out


def holm_from_ledger(market: str, batch_id: str, means: dict[str, float] | None = None,
                     pvals: dict[str, float] | None = None, metric_key: str | None = None) -> dict:
    """从 confirm 登记簿取单边 p（默认 p_tmu）与均值，再 Holm 三档。

    means / pvals 可手动覆盖（测试或补缺）。均值默认按候选判定口径取
    stats.tmu_cap_mean / tmu_ew_mean。
    """
    led = TrialLedger()
    last = {}
    for r in led.trials(market, mode="confirm"):
        if r.get("batch_id") != batch_id or r.get("status") != "ok":
            continue
        last[r["factor"]] = r
    cands = {c["factor"]: c for c in CANDIDATES}
    means = dict(means or {})
    pvals = dict(pvals or {})
    for name, r in last.items():
        st = r.get("stats") or {}
        c = cands.get(name)
        if name not in means and c is not None:
            key = f"{c['metric']}_mean"
            if st.get(key) is not None:
                means[name] = float(st[key])
        if name not in pvals and st.get("p_tmu") is not None:
            # 引擎 p_tmu 是主口径 tmu_cap 的单边 p；K3 判 tmu_ew 时若登记簿没有专用 p，
            # 用 NW t 重算单边 p（见下方）
            pvals[name] = float(st["p_tmu"])
        if name not in pvals and c is not None:
            tkey = f"{c['metric']}_t_nw"
            t = st.get(tkey)
            if t is not None and np.isfinite(t):
                from scipy import stats as sp_stats
                pvals[name] = float(1 - sp_stats.norm.cdf(float(t)))
    # holm_batch 也可作对照；这里用 holm_judge 统一三档
    return holm_judge(means, pvals)


# ---------------------------------------------------------------- forward.json
def empty_doc(market: str, reason: str, prereg: str = PREREG_COMMIT) -> dict:
    lb = Lockbox()
    iv = lb.interval(market)
    end = None if iv is None else str(iv[1].date())
    cands = {}
    for c in CANDIDATES:
        cands[c["factor"]] = {
            "id": c["id"],
            "metric": c["metric"],
            "source_hash": c["source_hash"],
            "params_hash": c["params_hash"],
            "config_hash": c["config_hash"],
            "withdrawn": False,
            "rows": [],
        }
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "market": market,
        "prereg": prereg,
        "lockbox_end": end,
        "note": reason,
        "rule": f"前推区（锁箱 end 之后）按月冻结；累计 ≥{WITHDRAW_MIN_PERIODS} 期且 NW t < {WITHDRAW_T} 撤下",
        "candidates": cands,
    }


def load_forward(path: Path) -> dict | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def save_forward(doc: dict, path: Path, previous: dict | None = None) -> None:
    bad = frozen_violations(previous, doc)
    if bad:
        raise SystemExit("forward.json 冻结行被改写/删除，拒绝写入：\n  - " + "\n  - ".join(bad))
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def series_for_metric(res, metric: str) -> pd.Series:
    s = res.series
    if metric not in s.columns:
        raise KeyError(f"评估结果没有列 {metric}（有 {list(s.columns)}）")
    return s[metric].dropna()


def run_forward(market: str = "cn", *, prereg: str = PREREG_COMMIT, out: Path | None = None,
                dry_run: bool = False, panel=None, securities=None, repo=None,
                run_backtest: bool = False) -> dict:
    """核对哈希 →（可选）evaluate_factor forward → 追加冻结行 → 写 forward.json。

    panel/securities/repo 仅测试注入；生产路径走数据层，锁箱区间由 guard 截掉。
    """
    out = Path(out) if out else DEFAULT_OUT
    errs = verify_frozen(market)
    if errs:
        raise SystemExit("候选哈希与 PREREG 冻结值不一致：\n  - " + "\n  - ".join(errs))

    previous = load_forward(out)
    lb = Lockbox()
    iv = lb.interval(market)
    lockbox_end = None if iv is None else iv[1]

    reasons = []
    cand_out = {}
    for c in CANDIDATES:
        name, metric = c["factor"], c["metric"]
        prev_rows = []
        if previous and name in (previous.get("candidates") or {}):
            prev_rows = list(previous["candidates"][name].get("rows") or [])
        rows = list(prev_rows)
        err = None
        try:
            kw = dict(mode="forward", prereg=prereg, run_backtest=run_backtest, repo=repo)
            if panel is not None:
                kw.update(panel=panel, securities=securities)
            res = evaluate_factor(market, name, **kw)
            rets = series_for_metric(res, metric)
            # 防御：只保留锁箱 end 之后的期末
            if lockbox_end is not None:
                rets = rets[rets.index > lockbox_end]
            rows = build_rows_from_series(rets, prev_rows)
            if len(rets) == 0:
                err = "前推区尚无已完成调仓期"
        except PermissionError as e:
            err = f"PermissionError: {e}"
        except ValueError as e:
            # 常见：层内调仓期不足（锁箱刚结束、数据未补到下一交易日）
            err = f"ValueError: {e}"
        except FileNotFoundError as e:
            err = f"FileNotFoundError: {e}"
        except Exception as e:
            err = f"{type(e).__name__}: {e}"

        if err:
            reasons.append(f"{name}: {err}")
        withdrawn = bool(rows and rows[-1].get("withdraw_trigger"))
        cand_out[name] = {
            "id": c["id"],
            "metric": metric,
            "source_hash": c["source_hash"],
            "params_hash": c["params_hash"],
            "config_hash": c["config_hash"],
            "withdrawn": withdrawn,
            "rows": rows,
            **({"last_error": err} if err else {}),
        }

    if not any(v["rows"] for v in cand_out.values()):
        note = ("还没有前推月份可记账。"
                + (" " + "; ".join(reasons) if reasons else
                   f" 锁箱结束于 {lockbox_end.date() if lockbox_end is not None else '?'}，"
                   "需行情补到其后第一个交易日且至少跑完一期调仓。"))
    else:
        note = "按月追加前推记录；已有行冻结。"
        if reasons:
            note += " 部分候选未更新：" + "; ".join(reasons)

    doc = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "market": market,
        "prereg": prereg,
        "lockbox_end": None if lockbox_end is None else str(lockbox_end.date()),
        "note": note,
        "rule": f"前推区（锁箱 end 之后）按月冻结；累计 ≥{WITHDRAW_MIN_PERIODS} 期且 NW t < {WITHDRAW_T} 撤下",
        "candidates": cand_out,
    }

    if dry_run:
        print(json.dumps(doc, ensure_ascii=False, indent=2))
        print("[dry-run] 未写入", out)
        return doc

    save_forward(doc, out, previous)
    print(f"已写 {out}；各候选行数："
          + ", ".join(f"{n}={len(v['rows'])}" for n, v in cand_out.items()))
    if reasons:
        print("备注：", note)
    return doc


def status_forward(market: str = "cn", out: Path | None = None) -> int:
    out = Path(out) if out else DEFAULT_OUT
    errs = verify_frozen(market)
    print(f"市场 {market} 锁箱 {Lockbox().interval(market)}")
    print(f"输出 {out} {'存在' if out.exists() else '不存在'}")
    if errs:
        print("哈希核对 FAIL：")
        for e in errs:
            print(" ", e)
    else:
        print("哈希核对 OK（与 PREREG 冻结值一致）")
    doc = load_forward(out)
    if not doc:
        print("尚无 forward.json（可先 run 写空结构）")
        return 1 if errs else 0
    print(f"generated_at={doc.get('generated_at')} prereg={doc.get('prereg')}")
    print(f"note: {doc.get('note')}")
    for name, c in (doc.get("candidates") or {}).items():
        rows = c.get("rows") or []
        last = rows[-1] if rows else None
        print(f"  {c.get('id', '?')} {name} metric={c.get('metric')} rows={len(rows)} "
              f"withdrawn={c.get('withdrawn')} "
              + (f"last={last['month']} n={last['n_periods']} mean={last['cum_mean']:.6f} "
                 f"t={last['nw_t']}" if last else "（无行）"))
    return 1 if errs else 0


# ---------------------------------------------------------------- CLI
def _parse_kv(items: list[str] | None) -> dict[str, float]:
    out = {}
    for raw in items or []:
        if "=" not in raw:
            raise SystemExit(f"期望 NAME=VALUE，收到 {raw!r}")
        k, v = raw.split("=", 1)
        out[k.strip()] = float(v)
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m factorlab.forward",
                                 description="L-038 前推记账与 Holm 三档判定")
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("run", help="评估前推区已完成月份并追加冻结行")
    r.add_argument("--market", default="cn")
    r.add_argument("--prereg", default=PREREG_COMMIT, help="预注册提交哈希（默认 001087bd）")
    r.add_argument("--out", type=Path, default=None)
    r.add_argument("--dry-run", action="store_true")

    s = sub.add_parser("status", help="核对冻结哈希并显示 forward.json 摘要")
    s.add_argument("--market", default="cn")
    s.add_argument("--out", type=Path, default=None)

    h = sub.add_parser("holm", help="批内 Holm + PREREG 三档判定（读 confirm 登记簿）")
    h.add_argument("--market", default="cn")
    h.add_argument("--batch", default=PREREG_BATCH, help="解封批次号，默认 2026Q4-cn")
    h.add_argument("--mean", action="append", help="覆盖均值，可重复：cn_sue=0.002")
    h.add_argument("--p", action="append", dest="pvals", help="覆盖单边 p，可重复：cn_sue=0.03")
    h.add_argument("--json", type=Path, help="把判定结果写到该路径")

    a = ap.parse_args(argv)

    if a.cmd == "run":
        run_forward(a.market, prereg=a.prereg, out=a.out, dry_run=a.dry_run)
        return 0
    if a.cmd == "status":
        return status_forward(a.market, out=a.out)
    if a.cmd == "holm":
        means = _parse_kv(a.mean)
        pvals = _parse_kv(a.pvals)
        res = holm_from_ledger(a.market, a.batch, means=means or None, pvals=pvals or None)
        if not res:
            # 允许纯手动输入（登记簿尚无 confirm）
            if means and pvals:
                res = holm_judge(means, pvals)
            else:
                print(f"批次 {a.batch} 无可用 confirm 记录，且未提供足够的 --mean/--p", file=sys.stderr)
                return 1
        print(json.dumps(res, ensure_ascii=False, indent=2))
        for n, v in res.items():
            print(f"{v['id']} {n}: mean={v['mean']:.6f} ½m*={v['half_m_star']:.6f} "
                  f"p={v['p']:.4f} holm_p={v['holm_p']:.4f} → {v['verdict']}")
        if a.json:
            a.json.write_text(json.dumps(res, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
