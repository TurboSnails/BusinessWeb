"""护栏：试验登记簿、锁箱（分层与批量解封）、截面留出、多重检验（BH / Holm / DSR / 有效试验数 / PBO）。

分层（DESIGN.md 第四节，每个市场一套，配置固定在 factorlab/lockbox.json）：
- 探索区：锁箱起点以前、按 sha256(code) 取 70% 的证券（mode='explore'）；
- 截面验证：同期另外 30%（mode='validate'）；
- 锁箱：固定区间 [start, end]，全部证券（mode='confirm'，须持批量解封凭证，且因子与解封时冻结的候选完全一致）；
- 前推记录：end 以后（mode='forward'，须给出已提交、含预注册文件的提交；没有解封凭证时锁箱区间的行被删掉）。
前瞻收益按结束日归层，探索区与锁箱之间留 embargo_months 个月间隔。

登记簿：research-py/factor-ledger/{market}.jsonl（进 git），evaluate_factor 每调用一次自动追加（文件锁）；
月度收益序列存 series/{market}/{trial_id}.csv；解封记录在 unseals.json。

路径不可由调用方更换：Lockbox() / TrialLedger() 永远用包内 lockbox.json 与仓库登记簿。唯一的例外是
显式命名的测试钩子 set_test_overrides(lockbox_path=..., ledger_root=...)：启用后每条登记记录都写上
lockbox_path / ledger_root / test_override=true；若 store 指向仓库数据目录（factor-data/），数据层拒绝
confirm / forward，其他模式一律截在包内锁箱起点以前（锁箱确认只能在合成面板或临时数据目录上做）。旧的环境变量 FACTORLAB_LEDGER /
FACTORLAB_LOCKBOX 已停用，设置了会直接报错（防止以为写到临时目录、实际写进了仓库登记簿）。
"""

from __future__ import annotations

import fcntl
import hashlib
import itertools
import json
import math
import os
import re
import subprocess
from contextlib import contextmanager
from dataclasses import dataclass
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
# 预注册文件：提交里须有一个路径在 docs/research/ 下、文件名含 PREREG 的文件，且列出本批候选名
PREREG_DIR = "docs/research/"
PREREG_TAG = "PREREG"
_HEX = re.compile(r"^[0-9a-f]{7,40}$")
_DEPRECATED_ENV = ("FACTORLAB_LEDGER", "FACTORLAB_LOCKBOX")


# ---------------------------------------------------------------- 路径与测试钩子
_TEST_OVERRIDES: dict = {}


def set_test_overrides(*, lockbox_path: Path | str | None = None, ledger_root: Path | str | None = None) -> None:
    """测试钩子（只给测试用）：把锁箱配置 / 登记簿根目录换成临时路径。传 None 的项保持原状。

    启用后：每条登记记录写 test_override=true 与实际路径；store 指向仓库数据目录时 data.load_market 拒绝
    confirm / forward、其他模式截在包内锁箱起点以前，所以锁箱确认 / 前推只能作用于合成数据。"""
    if lockbox_path is not None:
        _TEST_OVERRIDES["lockbox_path"] = Path(lockbox_path)
    if ledger_root is not None:
        _TEST_OVERRIDES["ledger_root"] = Path(ledger_root)


def clear_test_overrides() -> None:
    _TEST_OVERRIDES.clear()


def overridden() -> bool:
    return bool(_TEST_OVERRIDES)


def _check_env() -> None:
    bad = [k for k in _DEPRECATED_ENV if os.environ.get(k)]
    if bad:
        raise RuntimeError(f"环境变量 {bad} 已停用：引擎固定使用包内 lockbox.json 与仓库登记簿；"
                           "测试请用 factorlab.guard.set_test_overrides(...)")


def ledger_root() -> Path:
    _check_env()
    return _TEST_OVERRIDES.get("ledger_root", DEFAULT_LEDGER)


def lockbox_path() -> Path:
    _check_env()
    return _TEST_OVERRIDES.get("lockbox_path", DEFAULT_LOCKBOX)


def _show_path(p: Path) -> str:
    """登记簿里记录的路径：仓库内的写相对路径（不暴露本机目录），其余写绝对路径。"""
    p = Path(p).resolve()
    try:
        return p.relative_to(RESEARCH_DIR).as_posix()
    except ValueError:
        return str(p)


def path_record() -> dict:
    return {"lockbox_path": _show_path(lockbox_path()), "ledger_root": _show_path(ledger_root()),
            "test_override": overridden()}


@contextmanager
def _file_lock(root: Path):
    """登记簿目录级排他锁（fcntl.flock），并发写入的进程依次进入。"""
    root.mkdir(parents=True, exist_ok=True)
    with open(root / ".lock", "a") as fh:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


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
    """模块级时钟（解封的季度判断、登记时间都用它；测试可 monkeypatch）。"""
    return datetime.now(timezone.utc)


def stable_hash(obj, n: int = 12) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()[:n]


# ---------------------------------------------------------------- 登记簿
CANDIDATE_FIELDS = ("factor", "source_hash", "params_hash", "config_hash")


def trial_key(r: dict) -> tuple:
    """一种「写法」的身份：因子名 + 源码哈希（DataFrame 因子为内容哈希）+ 参数哈希 + 配置哈希。"""
    return tuple(r.get(k) for k in CANDIDATE_FIELDS)


class TrialLedger:
    """试验登记簿（JSONL，一行一个事件：evaluate / unseal / data_access）。根目录不可由调用方指定。"""

    def __init__(self):
        self.root = ledger_root()

    def path(self, market: str) -> Path:
        return self.root / f"{market}.jsonl"

    @contextmanager
    def locked(self):
        with _file_lock(self.root):
            yield

    def append(self, market: str, record: dict, *, _locked: bool = False) -> dict:
        event = record.get("event", "evaluate")
        if event == "evaluate" and record.get("mode", "explore") not in MODES:
            raise ValueError(f"mode 只能是 {MODES}")
        g = git_state()
        rec = {"ts": _now().isoformat(timespec="seconds"), "market": market, "event": event,
               "git_commit": g["commit"], "git_dirty": g["dirty"], **path_record(), **record}
        line = json.dumps(rec, ensure_ascii=False, default=str) + "\n"
        if _locked:
            self._write(market, line)
        else:
            with self.locked():
                self._write(market, line)
        return rec

    def _write(self, market: str, line: str) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        with open(self.path(market), "a", encoding="utf-8") as f:
            f.write(line)
            f.flush()

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
        """评估记录（不含解封 / 读数事件；默认不含报错中断与被护栏拒绝的记录）。"""
        out = [r for r in self.read(market) if r.get("event", "evaluate") == "evaluate"
               and (include_errors or r.get("status") not in ("error", "refused"))]
        if since is not None:
            t0 = pd.Timestamp(since)
            t0 = t0.tz_localize("UTC") if t0.tzinfo is None else t0
            out = [r for r in out if pd.Timestamp(r["ts"]) >= t0]
        if mode is not None:
            out = [r for r in out if r.get("mode") == mode]
        return out

    _key = staticmethod(trial_key)

    def count_trials(self, market: str, since=None, mode: str | None = None, distinct: bool = False) -> int:
        """评估次数；distinct=True 按（因子、源码哈希、参数哈希、配置哈希）去重 = 不同写法个数。"""
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

    def confirmed(self, market: str, batch_id: str, key: tuple) -> bool:
        """该批次的这个候选是否已经成功确认过一次（每个候选只能确认一次）。"""
        return any(r.get("batch_id") == batch_id and trial_key(r) == tuple(key)
                   for r in self.trials(market, mode="confirm"))


def count_trials(market: str, since=None, mode: str | None = None, distinct: bool = False) -> int:
    return TrialLedger().count_trials(market, since, mode, distinct)


# ---------------------------------------------------------------- 锁箱与分层
@dataclass(frozen=True)
class UnsealToken:
    """批量解封凭证（只由 unseal() 产生；评估时再核对 unseals.json）。

    candidates：解封时冻结的候选，每个是（因子名, 源码哈希, 参数哈希, 配置哈希）。"""

    market: str
    batch_id: str
    preregs: tuple
    candidates: tuple
    unsealed_at: str

    @property
    def names(self) -> tuple:
        return tuple(c[0] for c in self.candidates)


def _cand_tuple(c) -> tuple:
    if not isinstance(c, dict):
        raise TypeError("候选须为 dict（factor / source_hash / params_hash / config_hash），"
                        "用 factorlab.evaluate.candidate_spec(...) 生成")
    missing = [k for k in CANDIDATE_FIELDS if not c.get(k)]
    if missing:
        raise ValueError(f"候选 {c.get('factor')} 缺字段 {missing}（DataFrame 因子不能做候选）")
    return tuple(str(c[k]) for k in CANDIDATE_FIELDS)


class Lockbox:
    """锁箱配置与解封记录。路径固定（包内 lockbox.json、登记簿下的 unseals.json），不接受参数。"""

    def __init__(self):
        self.path = lockbox_path()
        self.ledger_dir = ledger_root()
        self.config = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else {}

    @property
    def overridden(self) -> bool:
        return overridden()

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

    @staticmethod
    def _entry_cands(u: dict) -> tuple:
        return tuple(_cand_tuple(c) for c in u["candidates"])

    def token(self, market: str, batch_id: str) -> UnsealToken:
        """取回已解封批次的凭证（解封本身只能发生一次；之后在别的进程里做确认评估用）。"""
        for u in self.unseals(market):
            if u["batch_id"] == batch_id:
                return UnsealToken(market, batch_id, tuple(u["preregs"]), self._entry_cands(u), u["unsealed_at"])
        raise PermissionError(f"{market} 没有解封过批次 {batch_id}")

    def is_valid(self, token: UnsealToken | None, market: str) -> bool:
        if token is None or token.market != market:
            return False
        return any(u["batch_id"] == token.batch_id and tuple(u["preregs"]) == tuple(token.preregs)
                   and self._entry_cands(u) == tuple(token.candidates) for u in self.unseals(market))

    # 可见范围
    def window(self, market: str, mode: str, token: UnsealToken | None = None,
               prereg_ok: bool = False) -> tuple[pd.Timestamp | None, tuple | None]:
        """（可见上界（不含）或 None = 不截断，要删掉的区间 [lo, hi) 或 None）。

        explore / validate：截到锁箱起点；confirm：须有效凭证，截到锁箱终点（含）；
        forward：须已核验的预注册（prereg_ok）；有本市场有效凭证时全部可见，否则删掉锁箱区间。"""
        if mode not in MODES:
            raise ValueError(f"未知 mode：{mode}")
        iv = self.interval(market)
        if mode == "forward" and not prereg_ok:
            raise PermissionError("forward 需要已提交并核验过的预注册（prereg）")
        if iv is None:
            return None, None
        lo, hi = iv
        if mode in ("explore", "validate"):
            return lo, None
        if mode == "confirm":
            if not self.is_valid(token, market):
                raise PermissionError("confirm 需要有效的批量解封凭证（unseal(market, batch_id, prereg_commits, candidates)）")
            return hi + pd.Timedelta(days=1), None
        if self.is_valid(token, market):
            return None, None
        return None, (lo, hi + pd.Timedelta(days=1))

    def visible_end(self, market: str, mode: str, token: UnsealToken | None = None,
                    prereg_ok: bool = False) -> pd.Timestamp | None:
        return self.window(market, mode, token, prereg_ok)[0]

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


def truncate_panel(panel: dict, end_exclusive: pd.Timestamp | None, hidden: tuple | None = None) -> dict:
    """截掉 end_exclusive 及以后的行；hidden=(lo, hi) 时再删掉 [lo, hi) 的行。"""
    if end_exclusive is None and hidden is None:
        return panel
    out = {}
    for k, v in panel.items():
        keep = np.ones(len(v), dtype=bool)
        if end_exclusive is not None:
            keep &= v.index < end_exclusive
        if hidden is not None:
            keep &= ~((v.index >= hidden[0]) & (v.index < hidden[1]))
        out[k] = v.loc[keep]
    return out


def verify_prereg(commit: str, repo=None, names=()) -> tuple[str, list[str]]:
    """核验预注册提交，返回（完整哈希，预注册文件列表）。

    要求：commit 是 7–40 位十六进制哈希（不接受 HEAD、分支名、标签等会移动的符号引用）；在 git 里存在；
    该提交改动的文件里有路径在 docs/research/ 下、文件名含 PREREG 的文件；names 里每个名字都出现在
    这些文件（该提交时的内容）里。"""
    c = str(commit).strip().lower()
    if not _HEX.match(c):
        raise ValueError(f"预注册必须给提交哈希（7–40 位十六进制），不接受 {commit!r} 这类符号引用")
    r = _git(["cat-file", "-e", f"{c}^{{commit}}"], repo)
    if r is None or r.returncode != 0:
        raise ValueError(f"预注册提交 {commit} 在 git 里不存在（必须先提交预注册）")
    full = _git(["rev-parse", f"{c}^{{commit}}"], repo).stdout.strip()
    top = _git(["rev-parse", "--show-toplevel"], repo)
    files = _git(["show", "--name-only", "--format=", "--no-renames", full], repo)
    if files is None or files.returncode != 0:
        raise ValueError(f"读不到提交 {full[:8]} 的文件列表")
    pre = [f for f in files.stdout.splitlines()
           if f.startswith(PREREG_DIR) and PREREG_TAG in Path(f).name.upper()]
    texts = []
    for f in pre:
        s = _git(["show", f"{full}:{f}"], repo if top is None or top.returncode else top.stdout.strip())
        if s is not None and s.returncode == 0:
            texts.append(s.stdout)
    if not texts:
        raise ValueError(f"提交 {full[:8]} 里没有预注册文件（{PREREG_DIR}… 下、文件名含 {PREREG_TAG}）")
    missing = [n for n in names if not any(re.search(rf"(?<![\w]){re.escape(n)}(?![\w])", t) for t in texts)]
    if missing:
        raise ValueError(f"预注册 {full[:8]} 的文件里没有列出候选 {missing}")
    return full, pre


def resolve_commit(commit: str, repo=None) -> str:
    """兼容旧接口：核验预注册提交并返回完整哈希。"""
    return verify_prereg(commit, repo)[0]


def unseal(market: str, batch_id: str, prereg_commits, candidates, repo=None, note: str = "") -> UnsealToken:
    """按季度批量解封某市场的锁箱。

    candidates：本批冻结的候选，每个是 dict(factor, source_hash, params_hash, config_hash)
    （用 evaluate.candidate_spec 生成；不接受 DataFrame 因子）。确认评估只接受与之完全一致的写法，
    每个候选只能确认一次。
    校验：每个预注册都是真实提交且含预注册文件、文件里列出了全部候选名；batch_id 与预注册在该市场都没用过；
    同一自然季度（按 _now() 的真实时间）只能解封一批；终身候选预算（默认 24）不超；锁箱未作废。
    通过后写 unseals.json 并记入登记簿（都在文件锁内完成）。
    """
    ledger = TrialLedger()
    lockbox = Lockbox()
    cands = tuple(_cand_tuple(c) for c in candidates)
    if not prereg_commits or not cands:
        raise ValueError("至少要有一个预注册提交和一个候选")
    if len(set(cands)) != len(cands) or len({c[0] for c in cands}) != len(cands):
        raise ValueError("同一批候选不能重复（同名候选也不行）")
    names = [c[0] for c in cands]
    checked = [verify_prereg(c, repo) for c in prereg_commits]
    preregs = tuple(h for h, _ in checked)
    # 每个候选名至少出现在本批某一份预注册里
    unlisted = []
    for n in names:
        if not any(_listed(h, n, repo) for h in preregs):
            unlisted.append(n)
    if unlisted:
        raise ValueError(f"候选 {unlisted} 没有出现在本批任何一份预注册文件里")
    now = _now()
    with ledger.locked():
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
        if lockbox.budget_used(market) + len(cands) > lockbox.budget:
            raise PermissionError(f"超出 {market} 锁箱终身候选预算 {lockbox.budget}（已用 {lockbox.budget_used(market)}）")
        iv = lockbox.interval(market)
        cand_dicts = [dict(zip(CANDIDATE_FIELDS, c)) for c in cands]
        entry = {"market": market, "batch_id": batch_id, "preregs": list(preregs), "candidates": cand_dicts,
                 "unsealed_at": now.isoformat(timespec="seconds"), "quarter": q,
                 "interval": None if iv is None else [d.strftime("%Y-%m-%d") for d in iv], "note": note,
                 **path_record()}
        all_rows = lockbox.unseals()
        lockbox.unseals_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = lockbox.unseals_path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(all_rows + [entry], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        os.replace(tmp, lockbox.unseals_path)
        ledger.append(market, {"event": "unseal", "batch_id": batch_id, "preregs": list(preregs),
                               "candidates": cand_dicts, "quarter": q, "note": note}, _locked=True)
    return UnsealToken(market, batch_id, preregs, cands, entry["unsealed_at"])


def _listed(commit: str, name: str, repo=None) -> bool:
    try:
        verify_prereg(commit, repo, [name])
        return True
    except ValueError:
        return False


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
