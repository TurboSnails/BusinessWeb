"""R8 运行脚本：stage1（探索区）/ stage2（验证区，只对第 1 关通过者各跑一次）。
    cd research-py && uv run python ../docs/research/factorlab/rounds/R8_run.py stage1
    cd research-py && uv run python ../docs/research/factorlab/rounds/R8_run.py stage2 cn_pead2 [cn_multi4]
"""
import json
import sys

from factorlab.evaluate import evaluate_factor

MOT = {"cn_pead2": "literature: R8 (Jegadeesh-Livnat 2006)", "cn_multi4": "post-hoc: R2/R4/R5 components"}
KEYS = ["rank_ic_mean", "rank_ic_t", "tmu_cap_mean", "tmu_cap_t", "tmu_ew_mean", "tmu_ew_t", "bt_excess_cagr", "bt_equal_excess_cagr"]


def show(res):
    s = res.summary if hasattr(res, "summary") else res
    out = {k: s.get(k) for k in KEYS if k in s}
    out["segments"] = s.get("segments")
    out["trial_id"] = getattr(res, "trial_id", None)
    return out


def main():
    stage = sys.argv[1]
    names = sys.argv[2:] or ["cn_pead2", "cn_multi4"]
    mode = "explore" if stage == "stage1" else "validate"
    for n in names:
        r = evaluate_factor("cn", n, mode=mode, family="R8-cn-composite", motivation=MOT[n], note=f"R8-2026-11-28 {stage}")
        print(n, json.dumps(show(r), ensure_ascii=False, default=str)[:3000])


if __name__ == "__main__":
    main()
