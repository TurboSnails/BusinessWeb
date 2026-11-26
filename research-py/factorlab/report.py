"""评估 / 回测结果 → dict（可存 JSON）与中文 Markdown 摘要。"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

from .evaluate import EvalResult

ZONE_LABEL = {"explore": "探索区（70% 证券，锁箱前）", "validate": "截面验证（另 30% 证券）",
              "confirm": "锁箱确认", "forward": "前推记录"}


def _clean(v):
    if isinstance(v, dict):
        return {str(k): _clean(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_clean(x) for x in v]
    if isinstance(v, (np.floating, float)):
        return None if not math.isfinite(float(v)) else float(v)
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, pd.Timestamp):
        return v.strftime("%Y-%m-%d")
    return v


def to_dict(res: EvalResult) -> dict:
    return _clean({
        "record": {k: res.record.get(k) for k in ("trial_id", "market", "factor", "version", "mode", "params_hash",
                                                  "config_hash", "git_commit", "git_dirty", "series_path")},
        "summary": res.summary,
        "decay": res.decay.reset_index().to_dict(orient="records"),
        "quantiles_mean": res.quantiles.mean().to_dict() if not res.quantiles.empty else {},
        "tiers": res.tiers,
        "segments": res.segments,
        "backtests": {w: {k: v for k, v in b["stats"].items()} for w, b in res.backtests.items()},
    })


def _f(x, pct=False, nd=3):
    if x is None or (isinstance(x, float) and not math.isfinite(x)):
        return "—"
    return f"{x * 100:.{max(nd - 2, 1)}f}%" if pct else f"{x:.{nd}f}"


EXEC_LABEL = {"open": "次日开盘成交", "close": "当日收盘成交"}


def _pct_label(q) -> str:
    q = float(q) * 100
    return f"{q:.0f}%" if abs(q - round(q)) < 1e-9 else f"{q:.1f}%"


def to_markdown(res: EvalResult) -> str:
    """中文摘要。措辞按本次口径生成（成交时点、前百分之几、是否用成交额代理市值），不写死。"""
    s, r = res.summary, res.record
    cfg = r.get("config") or {}
    n_q = int(cfg.get("n_quantiles") or 5)
    grp = _pct_label(1 / n_q)                       # 分组口径：前 1/n_q
    top_bt = _pct_label(cfg.get("top_q", 0.2))      # 回测口径：前 top_q
    execution = EXEC_LABEL.get(cfg.get("execution"), str(cfg.get("execution")))
    wa = r.get("weighting_applied") or {}
    cap_word = "市值加权" if not wa.get("adv_proxy") else f"市值加权（{wa['adv_proxy']} 期缺市值，用成交额中位数代理）"
    lines = [
        f"## 因子 {r.get('factor')}（v{r.get('version')}）· {r.get('market')} · {ZONE_LABEL.get(r.get('mode'), r.get('mode'))}",
        "",
        f"- 样本：{s.get('first_period')} 起至 {s.get('last_period_end')}，{s.get('n_periods')} 期；"
        f"平均股票池 {s.get('universe_size_mean', float('nan')):.0f} 只，覆盖率 {_f(s.get('coverage_mean'), True)}",
        f"- 登记：trial {r.get('trial_id')}，参数哈希 {r.get('params_hash')}，git {r.get('git_commit')}"
        f"{'（有未提交改动）' if r.get('git_dirty') else ''}",
        "",
        "| 指标 | 值 |", "|---|---|",
        f"| RankIC 均值 / IR / NW t | {_f(s.get('rank_ic_mean'))} / {_f(s.get('rank_ic_ir'), nd=2)} / {_f(s.get('rank_ic_t_nw'), nd=2)} |",
        f"| IC 均值 / IR | {_f(s.get('ic_mean'))} / {_f(s.get('ic_ir'), nd=2)} |",
        f"| 前 {grp} {cap_word} − 全股票池同加权（每期均值，主口径，{execution}，未扣成本） | {_f(s.get('tmu_cap_mean'), True, 4)}（NW t {_f(s.get('tmu_cap_t_nw'), nd=2)}） |",
        f"| 前 {grp} 等权 − 全股票池等权（每期均值） | {_f(s.get('tmu_ew_mean'), True, 4)} |",
        f"| 多空（前 {grp} − 后 {grp}，等权，只报告） | {_f(s.get('tmb_ew_mean'), True, 4)} |",
        f"| 前 {grp} 名单每期换手 | {_f(s.get('top_turnover_mean'), True)} |",
    ]
    if res.backtests:
        lines += ["", f"**回测（前 {top_bt}，扣成本，{execution}）**", "",
                  "| 加权 | 年化 | 夏普 | 最大回撤 | 对股票池年化超额 | 超额 IR | 单次换手 |",
                  "|---|---|---|---|---|---|---|"]
        for w, b in res.backtests.items():
            t = b["stats"]["top"]
            lines.append(f"| {'市值' if w == 'cap' else '等权'} | {_f(t['cagr'], True)} | {_f(t['sharpe'], nd=2)} | "
                         f"{_f(t['maxdd'], True)} | {_f(b['stats']['excess_cagr'], True)} | {_f(b['stats']['excess_ir'], nd=2)} | "
                         f"{_f(t['turnover_per_rebalance'], True)} |")
        cap = res.backtests.get("cap", {}).get("stats", {}).get("capacity", {})
        if cap:
            lines.append(f"\n容量：按 {cap.get('aum'):,.0f} 资金，持仓 / 日均成交额 中位 {_f(cap.get('median'), True)}，"
                         f"95% 分位 {_f(cap.get('p95'), True)}。")
    if res.tiers:
        lines += ["", "**市值三档**", "", f"| 档 | RankIC | 前 {grp} 等权超额（每期） |", "|---|---|---|"]
        for k, lab in (("small", "小"), ("mid", "中"), ("large", "大")):
            t = res.tiers.get(k, {})
            lines.append(f"| {lab} | {_f(t.get('rank_ic_mean'))} | {_f(t.get('tmu_ew_mean'), True, 4)} |")
    if res.segments:
        lines += ["", "**分段**", "", "| 区间 | 期数 | RankIC | 主口径月超额 |", "|---|---|---|---|"]
        for k, v in res.segments.items():
            lines.append(f"| {k} | {v['n_periods']} | {_f(v['rank_ic_mean'])} | {_f(v['tmu_cap_mean'], True, 4)} |")
    if not res.decay.empty:
        lines += ["", "**衰减（h 期累计收益的 RankIC，NW 滞后 = 基础 + h − 1）**", "",
                  "| h | " + " | ".join(str(h) for h in res.decay.index) + " |",
                  "|---|" + "---|" * len(res.decay), "| RankIC | " + " | ".join(_f(v) for v in res.decay["rank_ic_mean"]) + " |"]
    lines += ["", "t 值只作报告；探索区结论不能据此采用，须走「截面验证 → 预注册 → 锁箱确认」。"]
    return "\n".join(lines) + "\n"
