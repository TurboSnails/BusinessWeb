"""把因子实验室的状态导出成网站用的 public/data/factorlab.json（网站本身不跑 Python）。

内容：各市场数据概况（来自 MANIFEST）、试验登记簿计数、锁箱与解封状态、引擎校验摘要、各轮挖掘的结果。
不导出任何锁箱期数据或单个试验的收益序列。

用法：cd research-py && uv run python -m factorlab.export_site
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from . import store

ROOT = Path(__file__).resolve().parents[2]
LEDGER = Path(__file__).resolve().parents[1] / "factor-ledger"
LOCKBOX = Path(__file__).resolve().parent / "lockbox.json"
ROUNDS = ROOT / "docs/research/factorlab/rounds"
OUT = ROOT / "public/data/factorlab.json"

MARKETS = [
    ("cn", "A 股", "日线（腾讯 + 新浪乘法复权因子），含退市股；巨潮点时 ST、行业、总股本"),
    ("hk", "港股", "日线（腾讯 + 新浪复权），只含当前上市股"),
    ("us", "美股个股", "日线（Yahoo，已还原拆股），只含当前上市股"),
    ("us_kf", "美国因子组合", "Ken French 数据库，组合级、由提供方处理退市"),
]
GRADE = {"A": "无幸存者偏差", "B": "有幸存者偏差（只含当前上市）", "C": "组合级，视同无偏"}

# 引擎校验摘要（详见 docs/research/factorlab/VALIDATION.md）
VALIDATION = [
    {"market": "us", "check": "美股 12−1 月动量多空 vs Ken French 动量因子 UMD", "value": 0.91, "unit": "同月相关",
     "note": "错开 ±1 个月约为 0，时间对齐正确"},
    {"market": "cn", "check": "A 股规模因子多空 vs CH-4（Liu–Stambaugh–Yuan）SMB", "value": 0.93, "unit": "同月相关",
     "note": "反转、低波、低换手有效，动量无效，与公认规律一致"},
    {"market": "hk", "check": "港股股票池逐年收益 vs 大盘", "value": None, "unit": "",
     "note": "2006 +69%、2008 −46%、2009 +77%，与大盘一致；动量有效、短期反转无效"},
]


def _manifest(m: str) -> dict | None:
    try:
        return store.read_manifest(m)
    except FileNotFoundError:
        return None


def data_summary() -> list[dict]:
    out = []
    for m, label, desc in MARKETS:
        man = _manifest(m)
        if not man:
            continue
        out.append({"market": m, "label": label, "desc": desc, "rows": man.get("rows"),
                    "securities": man.get("securities"), "coverage": man.get("coverage"),
                    "grade": man.get("survivorship"), "gradeText": GRADE.get(man.get("survivorship"), ""),
                    "downloadedAt": (man.get("downloaded_at") or "")[:10]})
    pit = store.root() / "us_sec" / "pit"
    if pit.exists():
        n = sum(1 for _ in pit.glob("CIK*.parquet"))
        out.append({"market": "us_sec", "label": "美股财报（SEC）", "desc": "XBRL 点时财报，按申报日 + 1 个工作日生效",
                    "rows": None, "securities": n, "coverage": ["2009", "至今"], "grade": "A",
                    "gradeText": "含已退市公司的申报", "downloadedAt": datetime.fromtimestamp(
                        pit.stat().st_mtime, timezone.utc).date().isoformat()})
    return out


def ledger_summary() -> dict:
    per = {}
    for p in sorted(LEDGER.glob("*.jsonl")):
        recs = [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]
        evals = [r for r in recs if r.get("event", "evaluate") == "evaluate" or "stats" in r]
        ok = [r for r in evals if r.get("status") == "ok"]
        per[p.stem] = {
            "records": len(recs),
            "trials": len(ok),
            "distinct": len({(r.get("factor"), r.get("params_hash"), r.get("config_hash"), r.get("source_hash")) for r in ok}),
            "byMode": dict(Counter(r.get("mode") for r in ok)),
            "factors": sorted({r.get("factor") for r in ok if r.get("factor")}),
            "last": max((r.get("ts", "") for r in recs), default=None),
        }
    return per


def guard_summary() -> dict:
    cfg = json.loads(LOCKBOX.read_text(encoding="utf-8"))
    unseals = json.loads((LEDGER / "unseals.json").read_text(encoding="utf-8")) if (LEDGER / "unseals.json").exists() else []
    used = Counter()
    for u in unseals:
        used[u.get("market")] += len(u.get("candidates") or [])
    return {
        "budget": cfg.get("budget_candidates"),
        "exploreFrac": cfg.get("explore_frac"),
        "embargoMonths": cfg.get("embargo_months"),
        "markets": {m: {**v, "used": used.get(m, 0), "batches": sum(1 for u in unseals if u.get("market") == m)}
                    for m, v in cfg.get("markets", {}).items()},
    }


def rounds_summary() -> list[dict]:
    """每轮一个 docs/research/factorlab/rounds/R*.json（由研究脚本写，可缺）；没有 JSON 时只给计划文件。"""
    out = []
    for md in sorted(ROUNDS.glob("R*.md")):
        js = md.with_suffix(".json")
        item = {"id": md.stem.split("-")[0], "file": f"docs/research/factorlab/rounds/{md.name}", "status": "进行中"}
        if js.exists():
            item.update(json.loads(js.read_text(encoding="utf-8")))
        out.append(item)
    return out


def build() -> dict:
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "data": data_summary(),
        "validation": VALIDATION,
        "ledger": ledger_summary(),
        "guard": guard_summary(),
        "rounds": rounds_summary(),
    }


def main() -> None:
    d = build()
    OUT.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"已写 {OUT.relative_to(ROOT)}：{len(d['data'])} 个数据集，登记簿 {sum(v['trials'] for v in d['ledger'].values())} 次试验")


if __name__ == "__main__":
    main()
