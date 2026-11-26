"""护栏：试验登记簿、锁箱（分层与批量解封）、截面留出、多重检验（BH / Holm / DSR / 有效试验数 / PBO）。

分层（DESIGN.md 第四节，每个市场一套，配置在 factorlab/lockbox.json，可用 FACTORLAB_LOCKBOX 指向别处）：
- 探索区：锁箱起点以前、按 sha256(code) 取 70% 的证券（mode='explore'）；
- 截面验证：同期另外 30%（mode='validate'）；
- 锁箱：固定区间 [start, end]，全部证券（mode='confirm'，须持批量解封凭证）；
- 前推记录：end 以后（mode='forward'，须给出已提交的预注册）。
前瞻收益按结束日归层，探索区与锁箱之间留 embargo_months 个月间隔。

登记簿：{FACTORLAB_LEDGER 或 research-py/factor-ledger}/{market}.jsonl（进 git），evaluate_factor 每调用一次
自动追加；月度收益序列存 series/{market}/{trial_id}.csv；解封记录在 unseals.json。
"""

from __future__ import annotations

import hashlib
import itertools
import json
import math
import os
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import squareform

PKG_DIR = Path(__file__).resolve().parent
RESEARCH_DIR = PKG_DIR.parent
DEFAULT_LEDGER = RESEARCH_DIR / "factor-ledger"
DEFAULT_LOCKBOX = PKG_DIR / "lockbox.json"
MODES = ("explore", "validate", "confirm", "forward")
EULER = 0.5772156649015329


def ledger_root() -> Path:
    return Path(os.environ.get("FACTORLAB_LEDGER", DEFAULT_LEDGER))


def _git(args: list[str], repo=None) -> subprocess.CompletedProcess | None:
    try:
        return subprocess.run(["git", *args], cwd=repo or RESEARCH_DIR, capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return None


def git_state(repo=None) -> dict:
    """{'commit': 短哈希或 None, 'dirty': 是否有未提交改动（None = 未知）}。"""
    r = _git(["rev-parse", "--short", "HEAD"], repo)
    if r is None or r.returncode != 0:
        return {"commit": None, "dirty": None}
    s = _git(["status", "--porcelain", "--untracked-files=no"], repo)
    return {"commit": r.stdout.strip(), "dirty": None if s is None else bool(s.stdout.strip())}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def stable_hash(obj, n: int = 12) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()[:n]


# ---------------------------------------------------------------- 登记簿
class TrialLedger:
    """试验登记簿（JSONL，一行一个事件：evaluate 或 unseal）。"""

    def __init__(self, root: Path | str | None = None):
        self.root = Path(root) if root is not None else ledger_root()

    def path(self, market: str) -> Path:
        return self.root / f"{market}.jsonl"

    def append(self, market: str, record: dict) -> dict:
        event = record.get("event", "evaluate")
        if event == "evaluate" and record.get("mode", "explore") not in MODES:
            raise ValueError(f"mode 只能是 {MODES}")
        g = git_state()
        rec = {"ts": _now().isoformat(timespec="seconds"), "market": market, "event": event,
               "git_commit": g["commit"], "git_dirty": g["dirty"], **record}
        self.root.mkdir(parents=True, exist_ok=True)
        with open(self.path(market), "a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False, default=str) + "\n")
        return rec

    def save_series(self, market: str, trial_id: str, df: pd.DataFrame) -> str:
        """保存月度收益序列，返回相对登记簿根目录的路径（写进记录）。"""
        rel = Path("series") / market / f"{trial_id}.csv"
        p = self.root / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(p, float_format="%.8g", index_label="date")
        return rel.as_posix()

    def load_series(self, rel: str) -> pd.DataFrame:
        return pd.read_csv(self.root / rel, index_col=0, parse_dates=True)

    def read(self, market: str) -> list[dict]:
        p = self.path(market)
        if not p.exists():
            return []
        return [json.loads(line) for line in p.read_text(encoding="utf-8").splitlines() if line.strip()]

    def trials(self, market: str, since=None, mode: str | None = None, include_errors: bool = False) -> list[dict]:
        """评估记录（不含解封事件；默认不含报错中断的记录）。"""
        out = [r for r in self.read(market) if r.get("event", "evaluate") == "evaluate"
               and (include_errors or r.get("status") != "error")]
        if since is not None:
            t0 = pd.Timestamp(since)
            t0 = t0.tz_localize("UTC") if t0.tzinfo is None else t0
            out = [r for r in out if pd.Timestamp(r["ts"]) >= t0]
        if mode is not None:
            out = [r for r in out if r.get("mode") == mode]
        return out

    @staticmethod
    def _key(r: dict) -> tuple:
        return r.get("factor"), r.get("params_hash"), r.get("config_hash")

    def count_trials(self, market: str, since=None, mode: str | None = None, distinct: bool = False) -> int:
        """评估次数；distinct=True 按（因子、参数哈希、配置哈希）去重 = 不同写法个数。"""
        rs = self.trials(market, since, mode)
        return len({self._key(r) for r in rs}) if distinct else len(rs)

    def latest_by_trial(self, market: str, since=None, mode: str | None = None) -> list[dict]:
        last: dict = {}
        for r in self.trials(market, since, mode):
            last[self._key(r)] = r
        return list(last.values())

    def trial_sharpes(self, market: str, key: str = "sr_period", since=None) -> np.ndarray:
        vals = [(r.get("stats") or {}).get(key) for r in self.latest_by_trial(market, since)]
        return np.array([v for v in vals if v is not None and np.isfinite(v)], dtype=float)

    def series_matrix(self, market: str, column: str = "tmu_cap", since=None, mode: str | None = None) -> pd.DataFrame:
        """各不同写法最近一次的月度序列拼成 日期 × 试验 的矩阵。"""
        cols = {}
        for r in self.latest_by_trial(market, since, mode):
            rel = r.get("series_path")
            if rel and (self.root / rel).exists():
                s = self.load_series(rel)
                if column in s:
                    cols[r.get("trial_id") or rel] = s[column]
        return pd.DataFrame(cols)


def count_trials(market: str, since=None, mode: str | None = None, distinct: bool = False,
                 root: Path | str | None = None) -> int:
    return TrialLedger(root).count_trials(market, since, mode, distinct)


# ---------------------------------------------------------------- 锁箱与分层
@dataclass(frozen=True)
class UnsealToken:
    """批量解封凭证（只由 unseal() 产生；评估时再核对 unseals.json）。"""

    market: str
    batch_id: str
    preregs: tuple
    candidates: tuple
    unsealed_at: str


class Lockbox:
    def __init__(self, path: Path | str | None = None, ledger_dir: Path | str | None = None):
        self.path = Path(path or os.environ.get("FACTORLAB_LOCKBOX", DEFAULT_LOCKBOX))
        self.ledger_dir = Path(ledger_dir) if ledger_dir is not None else ledger_root()
        self.config = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else {}

    # 配置
    def interval(self, market: str) -> tuple[pd.Timestamp, pd.Timestamp] | None:
        m = self.config.get("markets", {}).get(market)
        return (pd.Timestamp(m["start"]), pd.Timestamp(m["end"])) if m else None

    @property
    def embargo(self) -> pd.DateOffset:
        return pd.DateOffset(months=int(self.config.get("embargo_months", 1)))

    @property
    def budget(self) -> int:
        return int(self.config.get("budget_candidates", 24))

    @property
    def explore_frac(self) -> float:
        return float(self.config.get("explore_frac", 0.7))

    # 解封记录
    @property
    def unseals_path(self) -> Path:
        return self.ledger_dir / "unseals.json"

    def unseals(self, market: str | None = None) -> list[dict]:
        p = self.unseals_path
        rows = json.loads(p.read_text(encoding="utf-8")) if p.exists() else []
        return [u for u in rows if market is None or u["market"] == market]

    def budget_used(self, market: str) -> int:
        return sum(len(u["candidates"]) for u in self.unseals(market))

    def is_void(self, market: str) -> bool:
        """候选预算用完即宣布锁箱作废。"""
        return self.budget_used(market) >= self.budget

    def token(self, market: str, batch_id: str) -> UnsealToken:
        """取回已解封批次的凭证（解封本身只能发生一次；之后在别的进程里做确认评估用）。"""
        for u in self.unseals(market):
            if u["batch_id"] == batch_id:
                return UnsealToken(market, batch_id, tuple(u["preregs"]), tuple(u["candidates"]), u["unsealed_at"])
        raise PermissionError(f"{market} 没有解封过批次 {batch_id}")

    def is_valid(self, token: UnsealToken | None, market: str) -> bool:
        if token is None or token.market != market:
            return False
        return any(u["batch_id"] == token.batch_id and tuple(u["candidates"]) == tuple(token.candidates)
                   for u in self.unseals(market))

    # 可见范围
    def visible_end(self, market: str, mode: str, token: UnsealToken | None = None) -> pd.Timestamp | None:
        """该模式下数据可见的上界（不含）；None = 不截断。"""
        iv = self.interval(market)
        if iv is None or mode == "forward":
            return None
        if mode in ("explore", "validate"):
            return iv[0]
        if mode == "confirm":
            if not self.is_valid(token, market):
                raise PermissionError("confirm 需要有效的批量解封凭证（unseal(market, batch_id, prereg_commits, candidates)）")
            return iv[1] + pd.Timedelta(days=1)
        raise ValueError(f"未知 mode：{mode}")

    def period_in_zone(self, starts: pd.DatetimeIndex, ends: pd.DatetimeIndex, market: str, mode: str) -> np.ndarray:
        """前瞻收益期 (start, end] 是否属于该模式的层（按结束日归层，探索区与锁箱之间留 embargo）。"""
        starts, ends = pd.DatetimeIndex(starts), pd.DatetimeIndex(ends)
        ok = ~pd.isna(ends)
        iv = self.interval(market)
        if iv is None:
            return np.asarray(ok)
        lo, hi = iv
        if mode in ("explore", "validate"):
            z = ends < lo - self.embargo
        elif mode == "confirm":
            z = (ends >= lo) & (ends <= hi) & (starts >= lo - self.embargo)
        else:  # forward
            z = (ends > hi) & (starts >= hi - pd.Timedelta(days=7))
        return np.asarray(ok & z)


def code_bucket(code: str) -> float:
    """sha256(code) 映射到 [0, 1)，确定性。"""
    return int(hashlib.sha256(str(code).encode()).hexdigest()[:8], 16) / 16 ** 8


def split_codes(codes, part: str, frac: float = 0.7) -> pd.Index:
    """截面留出：part='explore' 取 bucket < frac 的代码，'validate' 取其余；其他值返回全部。"""
    codes = pd.Index(codes)
    if part not in ("explore", "validate"):
        return codes
    b = np.array([code_bucket(c) for c in codes])
    return codes[b < frac] if part == "explore" else codes[b >= frac]


def truncate_panel(panel: dict, end_exclusive: pd.Timestamp | None) -> dict:
    if end_exclusive is None:
        return panel
    return {k: v.loc[v.index < end_exclusive] for k, v in panel.items()}


def resolve_commit(commit: str, repo=None) -> str:
    """校验提交存在（git cat-file -e <hash>^{commit}）并返回完整哈希。"""
    r = _git(["cat-file", "-e", f"{commit}^{{commit}}"], repo)
    if r is None or r.returncode != 0:
        raise ValueError(f"预注册提交 {commit} 在 git 里不存在（必须先提交预注册）")
    return _git(["rev-parse", f"{commit}^{{commit}}"], repo).stdout.strip()


def unseal(market: str, batch_id: str, prereg_commits, candidates, repo=None,
           ledger: TrialLedger | None = None, lockbox: Lockbox | None = None, note: str = "",
           now: datetime | None = None) -> UnsealToken:
    """按季度批量解封某市场的锁箱。

    校验：每个预注册提交都存在于 git；batch_id 与预注册在该市场都没用过；同一自然季度只能解封一批；
    终身候选预算（默认 24）不超；锁箱未作废。通过后写 unseals.json 并记入登记簿。
    candidates：本批确认的因子名（confirm 评估只接受这些名字）。
    """
    ledger = ledger or TrialLedger()
    lockbox = lockbox or Lockbox(ledger_dir=ledger.root)
    now = now or _now()
    preregs = tuple(resolve_commit(c, repo) for c in prereg_commits)
    candidates = tuple(candidates)
    if not preregs or not candidates:
        raise ValueError("至少要有一个预注册提交和一个候选")
    done = lockbox.unseals(market)
    if any(u["batch_id"] == batch_id for u in done):
        raise PermissionError(f"批次 {batch_id} 已在 {market} 解封过")
    used = {p for u in done for p in u["preregs"]}
    if used & set(preregs):
        raise PermissionError(f"预注册 {[p[:8] for p in used & set(preregs)]} 已在 {market} 解封过一次")
    q = f"{now.year}Q{(now.month - 1) // 3 + 1}"
    if any(u.get("quarter") == q for u in done):
        raise PermissionError(f"{market} 在 {q} 已解封过一批；锁箱按季度批量解封")
    if lockbox.is_void(market):
        raise PermissionError(f"{market} 的锁箱候选预算已用完，锁箱已作废")
    if lockbox.budget_used(market) + len(candidates) > lockbox.budget:
        raise PermissionError(f"超出 {market} 锁箱终身候选预算 {lockbox.budget}（已用 {lockbox.budget_used(market)}）")
    iv = lockbox.interval(market)
    entry = {"market": market, "batch_id": batch_id, "preregs": list(preregs), "candidates": list(candidates),
             "unsealed_at": now.isoformat(timespec="seconds"), "quarter": q,
             "interval": None if iv is None else [d.strftime("%Y-%m-%d") for d in iv], "note": note}
    all_rows = lockbox.unseals()
    lockbox.unseals_path.parent.mkdir(parents=True, exist_ok=True)
    lockbox.unseals_path.write_text(json.dumps(all_rows + [entry], ensure_ascii=False, indent=2) + "\n",
                                    encoding="utf-8")
    ledger.append(market, {"event": "unseal", "batch_id": batch_id, "preregs": list(preregs),
                           "candidates": list(candidates), "quarter": q, "note": note})
    return UnsealToken(market, batch_id, preregs, candidates, entry["unsealed_at"])


def confirm_passes(lockbox_effect: float, insample_shrunk: float, ratio: float = 0.5) -> bool:
    """锁箱确认门槛：方向一致，且幅度 ≥ ratio × 样本内收缩估计（统计显著性只报告）。"""
    if not np.isfinite(lockbox_effect) or not np.isfinite(insample_shrunk) or insample_shrunk == 0:
        return False
    return bool(np.sign(lockbox_effect) == np.sign(insample_shrunk) and abs(lockbox_effect) >= ratio * abs(insample_shrunk))


# ---------------------------------------------------------------- 多重检验
def benjamini_hochberg(pvals, q: float = 0.05) -> tuple[np.ndarray, np.ndarray]:
    """BH 校正：返回（调整后 p，是否拒绝）。"""
    p = np.asarray(pvals, dtype=float)
    n = len(p)
    order = np.argsort(p)
    adj = np.minimum.accumulate((p[order] * n / np.arange(1, n + 1))[::-1])[::-1].clip(max=1.0)
    out = np.empty(n)
    out[order] = adj
    return out, out <= q


def holm(pvals, alpha: float = 0.05) -> tuple[np.ndarray, np.ndarray]:
    """Holm 逐步校正：返回（调整后 p，是否拒绝）。"""
    p = np.asarray(pvals, dtype=float)
    n = len(p)
    order = np.argsort(p)
    adj = np.maximum.accumulate(p[order] * (n - np.arange(n))).clip(max=1.0)
    out = np.empty(n)
    out[order] = adj
    return out, out <= alpha


def holm_batch(market: str, batch_id: str, ledger: TrialLedger | None = None, key: str = "p_tmu") -> dict:
    """批内 Holm：取该批每个候选最近一次 confirm 记录的单侧 p 值，返回 {候选: 调整后 p}。"""
    ledger = ledger or TrialLedger()
    last = {r["factor"]: (r.get("stats") or {}).get(key) for r in ledger.trials(market, mode="confirm")
            if r.get("batch_id") == batch_id}
    names = [k for k, v in last.items() if v is not None]
    if not names:
        return {}
    adj, _ = holm([last[k] for k in names])
    return dict(zip(names, adj.tolist()))


def expected_max_sharpe(n_trials: float, sr_var: float) -> float:
    """N 次独立试验下最大夏普的期望（零假设 SR = 0）。"""
    if n_trials <= 1:
        return 0.0
    n = float(n_trials)
    return math.sqrt(sr_var) * ((1 - EULER) * stats.norm.ppf(1 - 1 / n) + EULER * stats.norm.ppf(1 - 1 / (n * math.e)))


def probabilistic_sharpe(sr: float, sr_ref: float, T: int, skew: float = 0.0, kurt: float = 3.0) -> float:
    """PSR：真实夏普高于 sr_ref 的概率。sr 为每期（非年化）夏普，T 为期数，kurt 为非超额峰度。"""
    denom = math.sqrt(max(1 - skew * sr + (kurt - 1) / 4 * sr ** 2, 1e-12))
    return float(stats.norm.cdf((sr - sr_ref) * math.sqrt(T - 1) / denom))


def deflated_sharpe(sr: float, n_trials: float, sr_var: float | None, T: int, skew: float = 0.0,
                    kurt: float = 3.0) -> float:
    """DSR = PSR(sr, 期望最大夏普(N, 方差))；sr_var 缺失时用 1/(T-1)。"""
    v = sr_var if sr_var and sr_var > 0 else 1 / (T - 1)
    return probabilistic_sharpe(sr, expected_max_sharpe(n_trials, v), T, skew, kurt)


def effective_trials(market: str | None = None, ledger: TrialLedger | None = None, threshold: float = 0.7,
                     column: str = "tmu_cap", matrix: pd.DataFrame | None = None, min_overlap: int = 24) -> dict:
    """有效试验数：把登记簿里各写法的月度序列按 |相关| 做平均连接层次聚类，在 |相关| > threshold 处切开，
    簇数即有效试验数（正负号相反的同一信号视为同一试验）。重叠期数不足 min_overlap 的两两相关记为 0。"""
    m = matrix if matrix is not None else (ledger or TrialLedger()).series_matrix(market, column)
    n = m.shape[1]
    if n <= 1:
        return {"n_raw": n, "n_effective": n, "labels": {c: 1 for c in m.columns}}
    c = m.corr(min_periods=min_overlap).abs().fillna(0.0).to_numpy()
    np.fill_diagonal(c, 1.0)
    d = squareform(np.clip(1 - c, 0, None), checks=False)
    labels = fcluster(linkage(d, method="average"), t=1 - threshold, criterion="distance")
    return {"n_raw": n, "n_effective": int(len(set(labels))), "labels": dict(zip(m.columns, labels.tolist()))}


def pbo_cscv(returns: pd.DataFrame, n_blocks: int = 16) -> dict:
    """组合对称交叉验证（CSCV）的过拟合概率 PBO（Bailey et al. 2017）。

    returns：期 × 试验 的收益矩阵（缺失按行剔除）。把期切成 n_blocks 段，枚举一半作样本内：
    样本内夏普最高的写法在样本外的相对排名 ω，λ = log(ω / (1 - ω))；PBO = P(λ ≤ 0)。
    """
    m = returns.dropna()
    T, N = m.shape
    if N < 2 or T < n_blocks * 2:
        return {"pbo": float("nan"), "n_splits": 0, "T": T, "N": N}
    blocks = np.array_split(np.arange(T), n_blocks)
    x = m.to_numpy(float)
    lam = []
    for train in itertools.combinations(range(n_blocks), n_blocks // 2):
        tr = np.concatenate([blocks[i] for i in train])
        te = np.concatenate([blocks[i] for i in range(n_blocks) if i not in train])
        sr_tr = x[tr].mean(0) / x[tr].std(0, ddof=1)
        sr_te = x[te].mean(0) / x[te].std(0, ddof=1)
        best = int(np.nanargmax(sr_tr))
        omega = stats.rankdata(sr_te)[best] / (N + 1)
        lam.append(math.log(omega / (1 - omega)))
    lam = np.array(lam)
    return {"pbo": float((lam <= 0).mean()), "n_splits": len(lam), "T": T, "N": N, "lambda_median": float(np.median(lam))}


def deflated_sharpe_from_ledger(market: str, returns: pd.Series, ledger: TrialLedger | None = None) -> dict:
    """用登记簿的有效试验数与各写法夏普的方差，对一条每期收益序列算 PSR / DSR（只报告）。"""
    ledger = ledger or TrialLedger()
    r = pd.Series(returns).dropna()
    T = len(r)
    sd = r.std(ddof=1)
    sr = float(r.mean() / sd) if T > 2 and sd > 0 else float("nan")
    n_eff = max(effective_trials(market, ledger)["n_effective"], 1)
    srs = ledger.trial_sharpes(market)
    v = float(np.var(srs, ddof=1)) if len(srs) > 2 else 1 / max(T - 1, 1)
    skew, kurt = float(stats.skew(r)), float(stats.kurtosis(r, fisher=False))
    return {"sr_period": sr, "T": T, "n_trials_raw": ledger.count_trials(market, distinct=True), "n_effective": n_eff,
            "sr_var": v, "psr": probabilistic_sharpe(sr, 0.0, T, skew, kurt),
            "dsr": deflated_sharpe(sr, n_eff, v, T, skew, kurt)}
