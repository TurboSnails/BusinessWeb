"""R11 运行：stage1（5 个，探索区）/ stage2 <市场:因子 ...>（验证区，只对通过者各跑一次）。
    cd research-py && PYTHONPATH=. uv run python ../docs/research/factorlab/rounds/R11_run.py stage1
"""
import sys

from factorlab.evaluate import evaluate_factor

PLAN = [("cn", "resmom_12_1"), ("cn", "cn_ind_mom"), ("cn", "season_hs"), ("hk", "resmom_12_1"), ("hk", "season_hs")]


def main():
    stage = sys.argv[1]
    items = [tuple(a.split(":")) for a in sys.argv[2:]] or PLAN
    for mk, n in items:
        evaluate_factor(mk, n, mode="explore" if stage == "stage1" else "validate", family=f"R11-{mk}",
                        motivation="literature: R11", note=f"R11-2026-11-28 {stage}")
        print(mk, n, "ok", flush=True)


if __name__ == "__main__":
    main()
