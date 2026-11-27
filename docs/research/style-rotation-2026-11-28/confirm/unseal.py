"""L-042 锁箱解封（us_kf，批次 L042-2026Q4）。须在 PREREG-confirm.md 提交之后运行，只运行一次。
    cd research-py && uv run python ../docs/research/style-rotation-2026-11-28/confirm/unseal.py <预注册提交哈希>
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[3] / "research-py"))
from factorlab import guard  # noqa: E402

h = lambda b: hashlib.sha256(b).hexdigest()
src = h((HERE.parent / "run.py").read_bytes())
config = h(json.dumps({"data": "us_kf portfolios.parquet 767b1b96 vw, legs per inputs/build.py, cutoff 2026-09",
                       "hold": ["2023-11", "2026-09"], "markets": ["dxus", "em", "us"]}, sort_keys=True).encode())
cands = [
    {"factor": "L042_R1", "source_hash": src, "params_hash": h(json.dumps({"L": 12, "top": 3, "cost": 0.001}, sort_keys=True).encode()), "config_hash": config},
    {"factor": "L042_R2", "source_hash": src, "params_hash": h(json.dumps({"L": 12, "cost": 0.001}, sort_keys=True).encode()), "config_hash": config},
]
tok = guard.unseal("us_kf", "L042-2026Q4", [sys.argv[1]], cands, note="L-042 风格轮动锁箱确认（组合级规则，不经 evaluate；数据由 confirm/build_full.py 直接读 parquet）")
print(tok)
