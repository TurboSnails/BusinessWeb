"""命令行。

    python -m factorlab.cli list-factors
    python -m factorlab.cli eval --market cn --factor mom_12_1 [--mode explore|validate|confirm --batch B|forward --prereg H]
                                 [--start --end] [--json out.json]
    python -m factorlab.cli ledger --market cn
    python -m factorlab.cli unseal --market cn --batch 2027Q1-cn --prereg <hash> [--prereg ...] --candidate mom_12_1 [...]
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter

from . import registry
from .guard import Lockbox, TrialLedger, effective_trials, unseal


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="factorlab")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list-factors")
    e = sub.add_parser("eval")
    e.add_argument("--market", required=True)
    e.add_argument("--factor", required=True)
    e.add_argument("--mode", default="explore", choices=["explore", "validate", "confirm", "forward"])
    e.add_argument("--batch", help="confirm 用：已解封的批次号")
    e.add_argument("--prereg", help="forward 用：预注册提交")
    e.add_argument("--start")
    e.add_argument("--end")
    e.add_argument("--execution", default="open", choices=["open", "close"])
    e.add_argument("--motivation", default="mining")
    e.add_argument("--no-backtest", action="store_true")
    e.add_argument("--json")
    lg = sub.add_parser("ledger")
    lg.add_argument("--market", required=True)
    u = sub.add_parser("unseal")
    u.add_argument("--market", required=True)
    u.add_argument("--batch", required=True)
    u.add_argument("--prereg", action="append", required=True)
    u.add_argument("--candidate", action="append", required=True)
    u.add_argument("--note", default="")
    a = ap.parse_args(argv)

    if a.cmd == "list-factors":
        registry.get("mom_12_1")
        for n, s in sorted(registry.FACTORS.items()):
            print(f"{n:14s} v{s.version}  方向 {s.direction:+d}  回看 {s.lookback:4d}  市场 {','.join(s.markets)}  {s.doc}")
        return 0
    if a.cmd == "eval":
        from .evaluate import evaluate_factor
        from .report import to_dict, to_markdown

        tok = Lockbox().token(a.market, a.batch) if a.mode == "confirm" else None
        res = evaluate_factor(a.market, a.factor, mode=a.mode, token=tok, prereg=a.prereg, start=a.start, end=a.end,
                              execution=a.execution, motivation=a.motivation, run_backtest=not a.no_backtest)
        print(to_markdown(res))
        if a.json:
            with open(a.json, "w", encoding="utf-8") as f:
                json.dump(to_dict(res), f, ensure_ascii=False, indent=2)
        return 0
    if a.cmd == "ledger":
        led, lb = TrialLedger(), Lockbox()
        rs = led.trials(a.market)
        print(f"{a.market}：评估 {len(rs)} 次，不同写法 {led.count_trials(a.market, distinct=True)} 个，"
              f"有效试验数（|相关| > 0.7 聚类）{effective_trials(a.market, led)['n_effective']}")
        for m, n in sorted(Counter(r.get("mode") for r in rs).items()):
            print(f"  {m}: {n}")
        for f, n in Counter(r.get("factor") for r in rs).most_common():
            print(f"  {f}: {n}")
        print(f"锁箱：{lb.interval(a.market)}，已用候选 {lb.budget_used(a.market)}/{lb.budget}，"
              f"解封批次 {[u['batch_id'] for u in lb.unseals(a.market)]}")
        return 0
    if a.cmd == "unseal":
        tok = unseal(a.market, a.batch, a.prereg, a.candidate, note=a.note)
        print(f"已解封 {tok.market} 批次 {tok.batch_id}：候选 {list(tok.candidates)}；记录在 unseals.json 与登记簿")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
