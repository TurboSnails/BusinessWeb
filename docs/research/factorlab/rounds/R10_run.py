"""R10 运行：stage1（港股 2 个 + A 股对照 2 个，探索区）/ stage2 <因子...>（港股验证区，只对第 1 关通过者各跑一次）。
    cd research-py && PYTHONPATH=. uv run python ../docs/research/factorlab/rounds/R10_run.py stage1
"""
import json
import sys

from factorlab.evaluate import evaluate_factor

PLAN = {"hk_vqs": ("hk", "post-hoc: R7 components"), "hk_vqs52": ("hk", "post-hoc: R4/R7 components"),
        "cn_vqs": ("cn", "post-hoc: R10 cross-market check"), "cn_vqs52": ("cn", "post-hoc: R10 cross-market check")}


def main():
    stage = sys.argv[1]
    names = sys.argv[2:] or list(PLAN)
    for n in names:
        mk, mot = PLAN[n]
        r = evaluate_factor(mk, n, mode="explore" if stage == "stage1" else "validate", family=f"R10-{mk}-composite",
                            motivation=mot, note=f"R10-2026-11-28 {stage}")
        print(n, "ok")


if __name__ == "__main__":
    main()
