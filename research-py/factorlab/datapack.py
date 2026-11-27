"""数据包：在另一台电脑上拿到与本机**逐字节相同**的 factor-data，或从零重下。

    python -m factorlab.datapack status [--quick] [--root DIR]
    python -m factorlab.datapack pack --out PATH [--include-raw] [--gzip] [--root DIR]
    python -m factorlab.datapack unpack PATH [--force] [--root DIR]
    python -m factorlab.datapack fetch-all [--markets cn,hk,us,kf] [--dry-run] [--from N]

status：逐市场列出数据是否在、行数与日期范围（取自 MANIFEST / meta，不读大表）、引擎记进登记簿的数据快照
哈希（直接调 data.snapshot_hash 与各基本面模块的 snapshot()，不另算），并按 MANIFEST 与预注册
（docs/research/*/PREREG.md 里「`路径` sha256 `64 位哈希`」）逐个核对文件 sha256，给出 OK / MISMATCH / MISSING。
另报告 .secrets/sec_user_agent 是否存在（不读、不打印内容）。

pack：把评估所需的数据打成一个 tar（parquet 已压缩，默认不再压缩；--gzip 可选）。默认不含 raw/ 下载缓存，
但保留评估或重建要用、又无法原样重下的小文件（见 RAW_KEEP）；不含按 sha 缓存的 */derived/*.npz（评估时会
自动重算）。包内第一个成员是 DATAPACK.json：文件清单、大小、sha256、git 提交、打包时间、各市场快照哈希。

unpack：先整体检查（成员只能是清单里的普通文件、相对路径、不含 ..、解析后仍在数据目录内），再检查会被覆盖
的已有文件（内容不同就拒绝，除非 --force），然后逐个解到临时文件、核对 sha256 后再原子替换，最后跑 status。

fetch-all：按依赖顺序调用各数据源模块的命令（子进程），每一步本身可断点续传；中断后重跑同一命令即可，
或用 --from N 从第 N 步接着跑。默认不请求东方财富（A 股、港股日线用 --source tencent）。SEC 需要
User-Agent（环境变量 SEC_USER_AGENT 或 .secrets/sec_user_agent），没有就跳过 SEC 相关步骤并说明怎么自己建。
"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import tarfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

PKG_DIR = Path(__file__).resolve().parent
RESEARCH_DIR = PKG_DIR.parent                      # research-py/
REPO_DIR = RESEARCH_DIR.parent                     # 仓库根
SECRETS_UA = RESEARCH_DIR / ".secrets" / "sec_user_agent"

FORMAT = "factorlab-datapack/1"
MANIFEST_NAME = "DATAPACK.json"
MARKETS = ("cn", "hk", "us", "us_kf")

# raw/ 下默认也要打包的文件（相对数据目录的 glob）：
# - us_sec/raw/company_tickers.json：fundamentals_us 评估时读它做代码 → CIK 映射，缺了美股基本面不可用；
# - us_kf/raw/*：Ken French 原始 zip 列在 us_kf/MANIFEST.json 的 sha256 里（属于快照的一部分）；
# - 证券名单快照（cn/hk raw/meta、us raw/symdir、selected_codes.json）：重建证券表要用，名单只能下到「当天」版本；
#   其中 cn/raw/meta/bse_em.parquet 是北交所名单，唯一来源是东方财富，带上它新机器重建时不必请求东方财富；
# - cn/raw/pit/p_stock2117_all.json：巨潮上市状态变动全表（2.8 MB），cn build 用它确定沪市 / 北交所点时 ST 覆盖的代码。
RAW_KEEP = ("us_sec/raw/company_tickers.json", "us_kf/raw/*", "cn/raw/meta/*", "hk/raw/meta/*",
            "us/raw/symdir/*", "cn/raw/selected_codes.json", "hk/raw/selected_codes.json",
            "cn/raw/pit/p_stock2117_all.json")
# 永远不打包：按（版本、财报 sha、可见范围…）缓存的中间结果，评估时缺了会自动重算；下载日志；半截文件。
ALWAYS_SKIP = ("cn/derived/*.npz", "hk/derived/*.npz", "*.log", "*.part", "*.tmp", "*/.DS_Store", ".DS_Store",
               MANIFEST_NAME, "*.datapack-tmp")


# ================================================================ 小工具
def data_root(root: str | Path | None = None) -> Path:
    if root is not None:
        os.environ["FACTORLAB_DATA"] = str(Path(root).resolve())
    from . import store
    return store.root()


@contextmanager
def using_root(root: str | Path | None):
    """临时把 store 指向 root（FACTORLAB_DATA），退出时恢复；root 为 None 时不变。"""
    if root is None:
        yield data_root()
        return
    old = os.environ.get("FACTORLAB_DATA")
    os.environ["FACTORLAB_DATA"] = str(Path(root).resolve())
    try:
        yield Path(os.environ["FACTORLAB_DATA"])
    finally:
        if old is None:
            os.environ.pop("FACTORLAB_DATA", None)
        else:
            os.environ["FACTORLAB_DATA"] = old


def _n(x) -> str:
    return f"{x:,}" if isinstance(x, int) else str(x if x is not None else "?")


def sha256_file(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _match(rel: str, patterns) -> bool:
    return any(fnmatch.fnmatchcase(rel, pat) for pat in patterns)


def git_commit() -> tuple[str | None, bool | None]:
    try:
        head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=REPO_DIR, capture_output=True, text=True,
                              timeout=10, check=True).stdout.strip()
        dirty = bool(subprocess.run(["git", "status", "--porcelain", "--", "research-py/factorlab"], cwd=REPO_DIR,
                                    capture_output=True, text=True, timeout=10).stdout.strip())
        return head, dirty
    except (OSError, subprocess.SubprocessError):
        return None, None


def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} GB"


# ================================================================ 预注册里冻结的 sha256
_PREREG_RE = re.compile(r"`([^`\s]+)`\s*sha256\s*`([0-9a-f]{64})`")


def parse_prereg_hashes(text: str) -> list[tuple[str, str]]:
    """预注册正文里的「`路径` sha256 `哈希`」→ [(路径, 哈希)]，按出现顺序、去重。"""
    out, seen = [], set()
    for path, h in _PREREG_RE.findall(text):
        if (path, h) not in seen:
            seen.add((path, h))
            out.append((path, h))
    return out


def resolve_frozen_path(rel: str, root: Path) -> Path:
    """factor-data/... → 当前数据目录；其他（research-py/...、docs/...）→ 仓库根。"""
    if rel.startswith("factor-data/"):
        return root / rel[len("factor-data/"):]
    if rel.startswith("research-py/factor-data/"):
        return root / rel[len("research-py/factor-data/"):]
    return REPO_DIR / rel


def prereg_files() -> list[Path]:
    return sorted((REPO_DIR / "docs" / "research").glob("*/PREREG*.md"))


def check_frozen(root: Path, files: list[Path] | None = None) -> list[dict]:
    rows = []
    for doc in prereg_files() if files is None else files:
        for rel, want in parse_prereg_hashes(doc.read_text(encoding="utf-8")):
            p = resolve_frozen_path(rel, root)
            if not p.exists():
                state = "MISSING"
            else:
                state = "OK" if sha256_file(p) == want else "MISMATCH"
            rows.append({"prereg": str(doc.relative_to(REPO_DIR)) if doc.is_relative_to(REPO_DIR) else str(doc),
                         "path": rel, "sha256": want, "state": state})
    return rows


# ================================================================ status
def _rows_parquet(p: Path) -> int | None:
    try:
        import pyarrow.parquet as pq
        return pq.ParquetFile(p).metadata.num_rows
    except Exception:
        return None


def _read_json(p: Path) -> dict | None:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def _check_hashes(base: Path, mapping: dict, quick: bool) -> list[tuple[str, str]]:
    out = []
    for name, want in sorted((mapping or {}).items()):
        p = base / name
        if not p.exists():
            out.append((name, "MISSING"))
        elif quick or not want:
            out.append((name, "present"))
        else:
            out.append((name, "OK" if sha256_file(p) == want else "MISMATCH"))
    return out


def engine_snapshots(root: Path) -> dict[str, dict]:
    """各市场引擎会记进登记簿的 data_snapshot：只有价格时 = data.snapshot_hash；请求基本面字段时
    = snapshot_hash + '+' + 提供方 snapshot()（与 data.load_market 相同的拼法）。不存在的部分为 None。"""
    from . import data

    out = {}
    for m in MARKETS:
        if not (root / m / "MANIFEST.json").exists():
            out[m] = {"prices": None, "with_fundamentals": None}
            continue
        base = data.snapshot_hash(m)
        prov = data.extra_provider(m)
        out[m] = {"prices": base, "with_fundamentals": f"{base}+{prov.snapshot()}" if prov is not None else None}
    return out


def status(root: Path | None = None, quick: bool = False, out=sys.stdout) -> dict:
    """打印状态并返回汇总（problems = MISMATCH 的条目数）。"""
    with using_root(root) as r:
        return _status(r, quick, out)


def _status(root: Path, quick: bool, out) -> dict:
    pr = lambda *a: print(*a, file=out)  # noqa: E731
    problems = 0
    missing = 0
    pr(f"数据目录：{root}{'' if root.exists() else '（不存在）'}")
    snaps = engine_snapshots(root) if root.exists() else {m: {"prices": None, "with_fundamentals": None} for m in MARKETS}

    def report(label: str, checks):
        nonlocal problems, missing
        checks = list(checks)
        fine = [c for c in checks if c[1] in ("OK", "present")]
        for name, state in checks if len(checks) <= 10 else [c for c in checks if c not in fine]:
            pr(f"    {state:<8} {label}{name}")
        if len(checks) > 10 and fine:
            pr(f"    {fine[0][1]:<8} {label}{'全部' if len(fine) == len(checks) else '其余'} {len(fine)} 个文件"
               "（MANIFEST 所列）")
        for _name, state in checks:
            problems += state == "MISMATCH"
            missing += state == "MISSING"

    for m in MARKETS:
        mdir = root / m
        man = _read_json(mdir / "MANIFEST.json")
        if man is None:
            pr(f"[{m}] 缺 MANIFEST.json（没有数据）")
            missing += 1
            continue
        cov = man.get("coverage") or ["?", "?"]
        pr(f"[{m}] {_n(man.get('rows'))} 行 · {man.get('securities', '?')} 只 · {cov[0]} → {cov[1]} · "
           f"下载 {str(man.get('downloaded_at', '?'))[:10]}")
        s = snaps[m]
        pr(f"    快照   价格 {s['prices']}" + (f" · 含基本面 {s['with_fundamentals']}" if s["with_fundamentals"] else ""))
        report("", _check_hashes(mdir, man.get("sha256"), quick))
        if m in ("cn", "hk"):
            meta = _read_json(mdir / "fin_pit.meta.json")
            if meta is None:
                pr("    MISSING  fin_pit.parquet / fin_pit.meta.json（点时财报，基本面字段不可用）")
                missing += 1
            else:
                rng = meta.get("report_period_range") or ["?", "?"]
                pr(f"    财报   fin_pit.parquet {_n(meta.get('rows'))} 行 · {meta.get('codes', '?')} 只 · "
                   f"报告期 {rng[0]} → {rng[-1]} · 构建 {str(meta.get('built_at', '?'))[:10]}")
                report("", _check_hashes(mdir, {"fin_pit.parquet": meta.get("sha256")}, quick))
        if m == "cn":
            for name in ("shares_pit.parquet", "st_pit.parquet", "industry_pit.parquet"):
                p = mdir / name
                pr(f"    {'present' if p.exists() else 'MISSING':<8} {name}" +
                   (f"（{_n(_rows_parquet(p))} 行）" if p.exists() else ""))
                missing += not p.exists()
        if m == "us":
            sec = root / "us_sec"
            pit = sorted((sec / "pit").glob("CIK*.parquet")) if (sec / "pit").exists() else []
            pr(f"[us_sec] pit/ {len(pit)} 个公司点时表")
            tick = sec / "raw" / "company_tickers.json"
            pr(f"    {'present' if tick.exists() else 'MISSING':<8} raw/company_tickers.json（评估时代码 → CIK）")
            missing += not tick.exists()
            for mf in ("MANIFEST.json", "SURPRISE_MANIFEST.json"):
                dm = _read_json(sec / "derived" / mf)
                if dm is None:
                    pr(f"    MISSING  derived/{mf}")
                    missing += 1
                    continue
                pr(f"    derived/{mf}：{_n(dm.get('rows'))} 行 · {dm.get('ciks', '?')} 家 · 版本 {dm.get('version')}")
                report("derived/", _check_hashes(sec / "derived", dm.get("sha256"), quick))

    pr("[预注册冻结的 sha256]")
    frozen = check_frozen(root)
    if not frozen:
        pr("    （没有找到）")
    for r in frozen:
        pr(f"    {r['state']:<8} {r['path']}  ← {r['prereg']}")
        problems += r["state"] == "MISMATCH"
        missing += r["state"] == "MISSING"
    ua_env = bool(os.environ.get("SEC_USER_AGENT", "").strip())
    pr(f"[SEC User-Agent] .secrets/sec_user_agent {'存在' if SECRETS_UA.exists() else '不存在'}；"
       f"环境变量 SEC_USER_AGENT {'已设置' if ua_env else '未设置'}（只有下载 SEC 数据时需要）")
    verdict = "有 MISMATCH" if problems else ("有缺失" if missing else "全部 OK")
    pr(f"结论：{verdict}" + ("（--quick：未核对 MANIFEST 里的哈希）" if quick else ""))
    return {"root": str(root), "problems": problems, "missing": missing, "frozen": frozen, "snapshots": snaps}


# ================================================================ pack
def select_files(root: Path, include_raw: bool = False) -> list[str]:
    """数据目录下要打包的文件（相对路径，'/' 分隔，排序）。"""
    out = []
    for p in sorted(root.rglob("*")):
        if not p.is_file() or p.is_symlink():
            continue
        rel = p.relative_to(root).as_posix()
        if _match(rel, ALWAYS_SKIP):
            continue
        parts = rel.split("/")
        if "raw" in parts[1:2] and not include_raw and not _match(rel, RAW_KEEP):
            continue
        out.append(rel)
    return out


def _tarinfo(name: str, size: int, mtime: float) -> tarfile.TarInfo:
    ti = tarfile.TarInfo(name)
    ti.size, ti.mtime, ti.mode = size, int(mtime), 0o644
    ti.uid = ti.gid = 0
    ti.uname = ti.gname = ""          # 不把本机用户名写进包
    return ti


class _HashingReader:
    def __init__(self, f):
        self.f, self.h = f, hashlib.sha256()

    def read(self, n=-1):
        b = self.f.read(n)
        self.h.update(b)
        return b


def build_manifest(root: Path, files: list[str], include_raw: bool) -> dict:
    commit, dirty = git_commit()
    entries = []
    for rel in files:
        p = root / rel
        entries.append({"path": rel, "size": p.stat().st_size, "sha256": sha256_file(p)})
    return {"format": FORMAT, "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "git_commit": commit, "git_dirty_factorlab": dirty, "include_raw": include_raw,
            "files": entries, "total_bytes": sum(e["size"] for e in entries),
            "snapshots": engine_snapshots(root),
            "frozen": [{k: r[k] for k in ("path", "sha256", "state")} for r in check_frozen(root)]}


def pack(out: Path, root: Path | None = None, include_raw: bool = False, gzip: bool = False,
         log=sys.stderr) -> dict:
    with using_root(root) as r:
        return _pack(Path(out), r, include_raw, gzip, log)


def _pack(out: Path, root: Path, include_raw: bool, gzip: bool, log) -> dict:
    out = Path(out).resolve()
    if out.is_relative_to(root.resolve()):
        raise ValueError("数据包不能写在数据目录里面")
    files = select_files(root, include_raw)
    if not files:
        raise FileNotFoundError(f"{root} 下没有可打包的文件")
    print(f"[datapack] {len(files)} 个文件，计算 sha256…", file=log, flush=True)
    man = build_manifest(root, files, include_raw)
    out.parent.mkdir(parents=True, exist_ok=True)
    tmp = out.with_name(out.name + ".partial")
    body = (json.dumps(man, ensure_ascii=False, indent=1) + "\n").encode()
    with tarfile.open(tmp, "w:gz" if gzip else "w", format=tarfile.PAX_FORMAT) as tar:
        tar.addfile(_tarinfo(MANIFEST_NAME, len(body), datetime.now().timestamp()), io.BytesIO(body))
        for i, e in enumerate(man["files"], 1):
            p = root / e["path"]
            st = p.stat()
            if st.st_size != e["size"]:
                raise RuntimeError(f"{e['path']} 在打包过程中变了（大小不同），请停掉写数据的进程后重打")
            with open(p, "rb") as f:
                r = _HashingReader(f)
                tar.addfile(_tarinfo(e["path"], e["size"], st.st_mtime), r)
            if r.h.hexdigest() != e["sha256"]:
                raise RuntimeError(f"{e['path']} 在打包过程中变了（sha256 不同），请停掉写数据的进程后重打")
            if i % 1000 == 0:
                print(f"[datapack] 已写 {i}/{len(files)}", file=log, flush=True)
    os.replace(tmp, out)
    man["archive"] = str(out)
    man["archive_bytes"] = out.stat().st_size
    return man


# ================================================================ unpack
def safe_relpath(name: str) -> str:
    """tar 成员名 → 安全的相对路径；绝对路径、..、反斜杠、盘符、空段一律拒绝。"""
    if not name or name.startswith(("/", "\\")) or "\\" in name or "\x00" in name:
        raise ValueError(f"不安全的成员路径：{name!r}")
    parts = name.split("/")
    if any(p in ("", ".", "..") for p in parts) or re.match(r"^[A-Za-z]:", parts[0]):
        raise ValueError(f"不安全的成员路径：{name!r}")
    return name


def _inside(root: Path, rel: str) -> Path:
    dest = (root / rel).resolve()
    if not dest.is_relative_to(root.resolve()):
        raise ValueError(f"成员解析后不在数据目录内：{rel!r}")
    return dest


def read_pack_manifest(tar: tarfile.TarFile) -> dict:
    first = tar.next()
    if first is None or first.name != MANIFEST_NAME or not first.isfile():
        raise ValueError(f"不是 factorlab 数据包：第一个成员应为 {MANIFEST_NAME}")
    man = json.loads(tar.extractfile(first).read().decode("utf-8"))
    if man.get("format") != FORMAT:
        raise ValueError(f"数据包格式 {man.get('format')!r} 不认识（应为 {FORMAT}）")
    return man


def unpack(archive: Path, root: Path | None = None, force: bool = False, log=sys.stderr) -> dict:
    with using_root(root) as r:
        return _unpack(Path(archive), r, force, log)


def _unpack(archive: Path, root: Path, force: bool, log) -> dict:
    root.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, "r:*") as tar:
        man = read_pack_manifest(tar)
        want = {}
        for e in man["files"]:
            rel = safe_relpath(e["path"])
            _inside(root, rel)
            if rel in want or _match(rel, (MANIFEST_NAME,)):
                raise ValueError(f"清单里重复或保留的路径：{rel!r}")
            want[rel] = e
        # 1. 整体检查成员：只允许清单里的普通文件（目录成员忽略），不允许链接、设备等
        members = {}
        for m in tar.getmembers():
            if m.name == MANIFEST_NAME:
                continue
            safe_relpath(m.name.rstrip("/") if m.isdir() else m.name)
            if m.isdir():
                _inside(root, m.name.rstrip("/"))
                continue
            if not m.isfile():
                raise ValueError(f"数据包里有非普通文件成员（链接 / 设备等），拒绝：{m.name!r}")
            if m.name not in want:
                raise ValueError(f"成员不在清单里，拒绝：{m.name!r}")
            if m.name in members:
                raise ValueError(f"成员重复：{m.name!r}")
            if m.size != want[m.name]["size"]:
                raise ValueError(f"成员大小与清单不符：{m.name!r}")
            members[m.name] = m
        lost = sorted(set(want) - set(members))
        if lost:
            raise ValueError(f"清单里有 {len(lost)} 个文件不在包里，例如 {lost[:3]}")
        # 2. 已有文件：相同就跳过，不同就拒绝（除非 --force）
        skip, conflicts = set(), []
        for rel, e in want.items():
            dest = root / rel
            if dest.is_symlink() or dest.is_dir():
                conflicts.append(rel)
            elif dest.exists():
                if dest.stat().st_size == e["size"] and sha256_file(dest) == e["sha256"]:
                    skip.add(rel)
                else:
                    conflicts.append(rel)
        if conflicts and not force:
            raise FileExistsError(f"{len(conflicts)} 个已有文件与数据包不同，未做任何改动（确认要覆盖请加 --force）：" +
                                  "、".join(conflicts[:10]) + ("…" if len(conflicts) > 10 else ""))
        # 3. 逐个解到临时文件、核对 sha256、原子替换
        written = 0
        for i, (rel, m) in enumerate(sorted(members.items()), 1):
            if rel in skip:
                continue
            dest = _inside(root, rel)
            dest.parent.mkdir(parents=True, exist_ok=True)
            if dest.is_symlink() or dest.is_dir():
                raise FileExistsError(f"目标是链接或目录，不覆盖：{rel}")
            tmp = dest.with_name(dest.name + ".datapack-tmp")
            h = hashlib.sha256()
            src = tar.extractfile(m)
            try:
                with open(tmp, "wb") as f:
                    for chunk in iter(lambda: src.read(1 << 20), b""):
                        h.update(chunk)
                        f.write(chunk)
                if h.hexdigest() != want[rel]["sha256"]:
                    raise ValueError(f"sha256 不符，数据包损坏：{rel}")
                os.utime(tmp, (m.mtime, m.mtime))
                os.replace(tmp, dest)
            finally:
                if tmp.exists():
                    tmp.unlink()
            written += 1
            if i % 1000 == 0:
                print(f"[datapack] 已解 {i}/{len(members)}", file=log, flush=True)
    rec = {**{k: v for k, v in man.items() if k != "files"}, "files": len(want),
           "unpacked_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "archive": Path(archive).name}
    (root / MANIFEST_NAME).write_text(json.dumps(rec, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return {"files": len(want), "written": written, "skipped_identical": len(skip),
            "overwritten": len(conflicts) if force else 0, "manifest": man}


# ================================================================ fetch-all
# (组, 命令参数, 估计分钟, 说明)。顺序即依赖顺序：证券表 / 日线 → 依赖证券表的点时补充 → 依赖价格面板的财报。
# 估计按 docs/research/factorlab/DATA-CN-HK.md、DATA-US.md 里的实测请求数与限速（腾讯后备、默认限速）。
STEPS = [
    ("kf", ["factorlab.sources.kf", "fetch"], 2, "Ken French 94 个 zip"),
    ("kf", ["factorlab.sources.kf", "build"], 1, "→ us_kf/portfolios.parquet"),
    ("cn", ["factorlab.sources.cn", "fetch", "--source", "tencent"], 140,
     "A 股证券表 + 日线（腾讯 + 新浪因子，约 16,600 次请求，默认 2 次/秒）"),
    ("cn", ["factorlab.sources.cn", "build"], 5, "→ cn/prices.parquet、securities.parquet、MANIFEST"),
    ("cn", ["factorlab.sources.cn_pit", "fetch"], 200, "巨潮 ST / 行业 / 股本（约 11,200 次请求，1 次/秒）"),
    ("cn", ["factorlab.sources.cn_pit", "build"], 5, "→ st/industry/shares_pit.parquet，并增补 prices（is_st、mcap_total、industry）"),
    ("cn", ["factorlab.sources.cn_fin", "fetch"], 230, "巨潮利润表 + 指标表（约 11,200 次）+ 新浪退市股（939 次）"),
    ("cn", ["factorlab.sources.cn_fin", "build"], 4, "→ cn/fin_pit.parquet + meta"),
    ("hk", ["factorlab.sources.hk", "fetch", "--source", "tencent"], 70, "港股日线（腾讯 + 新浪，约 8,300 次请求）"),
    ("hk", ["factorlab.sources.hk", "build"], 3, "→ hk/prices.parquet、securities.parquet、MANIFEST"),
    ("hk", ["factorlab.sources.hk_fin", "fetch"], 21, "巨潮港股财报（约 791 次请求）"),
    ("hk", ["factorlab.sources.hk_fin", "build"], 1, "→ hk/fin_pit.parquet + meta"),
    ("us", ["factorlab.sources.us", "fetch"], 115, "美股证券表 + Yahoo 日线（约 5,264 次请求）"),
    ("us", ["factorlab.sources.us", "fetch", "--retry-failed"], 5, "重试失败的代码"),
    ("us", ["factorlab.sources.us", "build"], 5, "→ us/prices.parquet、actions.parquet、MANIFEST"),
    ("sec", ["factorlab.sources.sec", "bulk"], 30, "SEC companyfacts 打包文件（约 1.4 GB，一次请求）→ us_sec/pit/"),
    ("sec", ["factorlab.fundamentals_us", "build"], 2, "→ us_sec/derived/events.parquet"),
    ("sec", ["factorlab.fundamentals_us", "build-surprise"], 3, "→ us_sec/derived/surprise.parquet"),
]
MARKET_GROUPS = {"cn": ("cn",), "hk": ("hk",), "us": ("us", "sec"), "kf": ("kf",)}

UA_HELP = ("SEC 要求请求头带可联系的 User-Agent，请自己创建（本工具不会替你写任何个人信息）：\n"
           "    mkdir -p research-py/.secrets && chmod 700 research-py/.secrets\n"
           "    printf '%s\\n' '<组织或项目名> <联系邮箱>' > research-py/.secrets/sec_user_agent\n"
           "    chmod 600 research-py/.secrets/sec_user_agent\n"
           "  或者 export SEC_USER_AGENT='<组织或项目名> <联系邮箱>'。.secrets/ 已在 .gitignore 里。")


def sec_ua_available() -> bool:
    return bool(os.environ.get("SEC_USER_AGENT", "").strip()) or (
        SECRETS_UA.exists() and SECRETS_UA.stat().st_size > 0)


def plan_steps(markets=("cn", "hk", "us", "kf"), ua: bool | None = None) -> tuple[list[dict], list[str]]:
    """按依赖顺序给出要跑的步骤；返回（步骤列表, 提示）。"""
    unknown = set(markets) - set(MARKET_GROUPS)
    if unknown:
        raise ValueError(f"未知市场 {sorted(unknown)}；可选 {sorted(MARKET_GROUPS)}")
    groups = {g for m in markets for g in MARKET_GROUPS[m]}
    ua = sec_ua_available() if ua is None else ua
    notes = []
    if "sec" in groups and not ua:
        groups.discard("sec")
        notes.append("没有 SEC User-Agent，跳过 SEC 三步（美股基本面不可用，价格类因子不受影响）。\n" + UA_HELP)
    if "cn" in groups:
        notes.append("A 股证券表的北交所名单只有东方财富 clist 一个来源（1 次请求，缓存在 cn/raw/meta/bse_em.parquet）；"
                     "已有缓存就不会请求。要完全避开东方财富，先从数据包解出 cn/raw/meta/。")
    if "hk" in groups:
        notes.append("港股证券表会顺带尝试东方财富 clist 补中文名与上市日（失败不影响，只用港交所名单）。")
    steps = [{"n": i, "group": g, "argv": a, "minutes": mins, "what": what}
             for i, (g, a, mins, what) in enumerate((s for s in STEPS if s[0] in groups), 1)]
    return steps, notes


def _fmt_minutes(m: float) -> str:
    return f"约 {m:.0f} 分钟" if m < 90 else f"约 {m / 60:.1f} 小时"


def fetch_all(markets=("cn", "hk", "us", "kf"), dry_run: bool = False, start_from: int = 1, out=sys.stdout,
              runner=None) -> int:
    steps, notes = plan_steps(markets)
    pr = lambda *a: print(*a, file=out, flush=True)  # noqa: E731
    total = sum(s["minutes"] for s in steps if s["n"] >= start_from)
    pr(f"数据目录：{data_root()}")
    pr(f"共 {len(steps)} 步，从第 {start_from} 步起{_fmt_minutes(total)}（网络与限速不同会有出入）。"
       "每步可断点续传：中断后重跑同一命令，或加 --from N 从第 N 步接着跑。")
    for s in steps:
        mark = "跳过" if s["n"] < start_from else _fmt_minutes(s["minutes"])
        pr(f"  {s['n']:>2}. uv run python -m {' '.join(s['argv'])}    # {mark}；{s['what']}")
    for n in notes:
        pr("注意：" + n)
    if dry_run:
        return 0
    runner = runner or (lambda argv: subprocess.run([sys.executable, "-m", *argv], cwd=RESEARCH_DIR).returncode)
    for s in steps:
        if s["n"] < start_from:
            continue
        pr(f"\n[fetch-all] 第 {s['n']}/{len(steps)} 步：python -m {' '.join(s['argv'])}")
        code = runner(s["argv"])
        if code != 0:
            pr(f"[fetch-all] 第 {s['n']} 步退出码 {code}，停下。修好后用 --from {s['n']} 接着跑（已下载的部分不会重下）。")
            return code
    pr("\n[fetch-all] 全部完成。注意：重新下载的数据与原机器不是逐字节相同（数据源会修订），"
       "锁箱确认请用数据包（unpack）。下面是 status：")
    status(out=out)
    return 0


# ================================================================ 命令行
def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m factorlab.datapack", description="factor-data 数据包与从零下载")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("status", help="数据状态、快照哈希、预注册冻结哈希核对")
    s.add_argument("--quick", action="store_true", help="不核对 MANIFEST 里的 sha256（预注册冻结的仍核对）")
    p = sub.add_parser("pack", help="打包评估所需数据")
    p.add_argument("--out", required=True)
    p.add_argument("--include-raw", action="store_true", help="连同 raw/ 下载缓存（约 +9 GB）")
    p.add_argument("--gzip", action="store_true", help="gzip 压缩（parquet 已压缩，收益很小、慢很多）")
    u = sub.add_parser("unpack", help="解包到数据目录并逐个核对 sha256")
    u.add_argument("archive")
    u.add_argument("--force", action="store_true", help="覆盖内容不同的已有文件")
    f = sub.add_parser("fetch-all", help="从零下载全部数据（按依赖顺序）")
    f.add_argument("--markets", default="cn,hk,us,kf")
    f.add_argument("--dry-run", action="store_true")
    f.add_argument("--from", dest="start_from", type=int, default=1)
    for x in (s, p, u, f):
        x.add_argument("--root", default=None, help="数据目录（默认 research-py/factor-data，或环境变量 FACTORLAB_DATA）")
    a = ap.parse_args(argv)
    root = data_root(a.root)
    if a.cmd == "status":
        return 1 if status(root, quick=a.quick)["problems"] else 0
    if a.cmd == "pack":
        man = pack(Path(a.out), root, include_raw=a.include_raw, gzip=a.gzip)
        print(f"写入 {man['archive']}：{len(man['files'])} 个文件，数据 {human(man['total_bytes'])}，"
              f"包 {human(man['archive_bytes'])}；git {str(man['git_commit'])[:12]}")
        return 0
    if a.cmd == "unpack":
        try:
            res = unpack(Path(a.archive), root, force=a.force)
        except (ValueError, FileExistsError, tarfile.TarError) as e:
            print(f"[datapack] 解包失败：{e}", file=sys.stderr)
            return 2
        print(f"解包完成：{res['files']} 个文件，写入 {res['written']}，相同跳过 {res['skipped_identical']}，"
              f"覆盖 {res['overwritten']}；打包于 {res['manifest'].get('created_at')}，"
              f"git {str(res['manifest'].get('git_commit'))[:12]}")
        return 1 if status(root)["problems"] else 0
    if a.cmd == "fetch-all":
        markets = [m.strip() for m in a.markets.split(",") if m.strip()]
        return fetch_all(markets, dry_run=a.dry_run, start_from=a.start_from)
    return 2


if __name__ == "__main__":
    sys.exit(main())
