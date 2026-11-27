"""factorlab.datapack：打包 → 解包往返与 sha256 核对、路径穿越拒绝、拒绝覆盖、预注册哈希解析、fetch-all 顺序（离线）。"""

from __future__ import annotations

import hashlib
import io
import json
import tarfile

import pytest

from factorlab import datapack, store
from factorlab.data import snapshot_hash
from factorlab.schema import Manifest
from factorlab_synth import market, to_long


def _sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


@pytest.fixture
def src_root(tmp_path, monkeypatch):
    """合成数据目录：cn 价格 + MANIFEST，外加应打包 / 不应打包的各类文件。"""
    d = tmp_path / "src"
    monkeypatch.setenv("FACTORLAB_DATA", str(d))
    panel, sec = market()
    codes = list(panel["close_adj"].columns[:20])
    long = to_long({k: v[codes] for k, v in panel.items()})
    store.write_securities("cn", sec[sec["code"].isin(codes)])
    store.write_prices("cn", long)
    store.write_manifest(Manifest(market="cn", source="synthetic", survivorship="A",
                                  downloaded_at="2026-11-26T00:00:00Z",
                                  coverage=(str(long["date"].min().date()), str(long["date"].max().date())),
                                  rows=len(long), securities=len(codes), sha256={}))
    files = {
        "cn/raw/kline/fqt0/600000.json": b"{}",               # 下载缓存：默认不打包
        "cn/raw/meta/bse_em.parquet": b"bse-list",            # 名单快照：打包
        "cn/derived/fund_cn_abc.npz": b"cache",               # 按 sha 缓存：不打包
        "us_sec/raw/company_tickers.json": b'{"0": {}}',      # 评估要用：打包
        "us_sec/raw/bulk/companyfacts.zip": b"zip",           # 下载缓存：不打包
        "us_sec/pit/CIK0000000001.parquet": b"pit",           # 处理后数据：打包
        "us_sec/derived/events.parquet": b"events",           # 构建产物：打包
        "cn-fetch.log": b"log",                               # 日志：不打包
    }
    for rel, body in files.items():
        p = d / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(body)
    return d


def _make_tar(path, manifest: dict | None, members: list[tuple[tarfile.TarInfo, bytes | None]]):
    with tarfile.open(path, "w") as tar:
        if manifest is not None:
            body = json.dumps(manifest).encode()
            ti = tarfile.TarInfo(datapack.MANIFEST_NAME)
            ti.size = len(body)
            tar.addfile(ti, io.BytesIO(body))
        for ti, body in members:
            tar.addfile(ti, io.BytesIO(body) if body is not None else None)
    return path


def _file(name: str, body: bytes) -> tuple[tarfile.TarInfo, bytes]:
    ti = tarfile.TarInfo(name)
    ti.size = len(body)
    return ti, body


def _manifest(entries: list[tuple[str, bytes]]) -> dict:
    return {"format": datapack.FORMAT, "files": [{"path": n, "size": len(b), "sha256": _sha(b)} for n, b in entries]}


# ================================================================ 打包 / 解包
def test_select_files_keeps_processed_and_whitelisted_raw(src_root):
    got = set(datapack.select_files(src_root))
    assert {"cn/prices.parquet", "cn/securities.parquet", "cn/MANIFEST.json", "cn/raw/meta/bse_em.parquet",
            "us_sec/raw/company_tickers.json", "us_sec/pit/CIK0000000001.parquet",
            "us_sec/derived/events.parquet"} <= got
    assert not got & {"cn/raw/kline/fqt0/600000.json", "cn/derived/fund_cn_abc.npz",
                      "us_sec/raw/bulk/companyfacts.zip", "cn-fetch.log"}
    with_raw = set(datapack.select_files(src_root, include_raw=True))
    assert {"cn/raw/kline/fqt0/600000.json", "us_sec/raw/bulk/companyfacts.zip"} <= with_raw
    assert "cn/derived/fund_cn_abc.npz" not in with_raw


def test_pack_unpack_roundtrip(src_root, tmp_path):
    out = tmp_path / "pack.tar"
    man = datapack.pack(out, src_root)
    assert out.exists() and man["total_bytes"] > 0
    assert man["snapshots"]["cn"]["prices"] == snapshot_hash("cn")
    with tarfile.open(out) as tar:
        names = tar.getnames()
        assert names[0] == datapack.MANIFEST_NAME
        assert all(m.uname == "" and m.uid == 0 for m in tar.getmembers())
    dst = tmp_path / "dst"
    res = datapack.unpack(out, dst)
    assert res["written"] == len(man["files"]) and res["skipped_identical"] == 0
    for e in man["files"]:
        assert datapack.sha256_file(dst / e["path"]) == e["sha256"] == datapack.sha256_file(src_root / e["path"])
    assert not (dst / "cn" / "raw" / "kline").exists() and not (dst / "cn" / "derived").exists()
    assert json.loads((dst / datapack.MANIFEST_NAME).read_text())["files"] == len(man["files"])
    # 解包后引擎看到的快照哈希与源目录一致
    with datapack.using_root(dst):
        assert snapshot_hash("cn") == man["snapshots"]["cn"]["prices"]
    # 再解一次：全部相同、跳过
    again = datapack.unpack(out, dst)
    assert again["written"] == 0 and again["skipped_identical"] == len(man["files"])
    # 包里不含 DATAPACK.json 以外的元数据文件；重新打包不会把 DATAPACK.json 打进去
    assert datapack.MANIFEST_NAME not in datapack.select_files(dst)


def test_pack_refuses_output_inside_data_root(src_root):
    with pytest.raises(ValueError):
        datapack.pack(src_root / "x.tar", src_root)


def test_unpack_detects_corruption(tmp_path):
    good = b"hello"
    man = _manifest([("cn/a.parquet", good)])
    bad = _make_tar(tmp_path / "bad.tar", man, [_file("cn/a.parquet", b"HELLO")])
    dst = tmp_path / "dst"
    with pytest.raises(ValueError, match="sha256"):
        datapack.unpack(bad, dst)
    assert not (dst / "cn" / "a.parquet").exists()
    assert not list(dst.rglob("*.datapack-tmp"))


@pytest.mark.parametrize("name", ["../evil.txt", "/tmp/evil.txt", "cn/../../evil.txt", "cn//a", "C:/evil",
                                  "cn\\..\\evil", "./cn/a"])
def test_unpack_rejects_unsafe_paths(tmp_path, name):
    body = b"x"
    arc = _make_tar(tmp_path / "evil.tar", _manifest([(name, body)]), [_file(name, body)])
    dst = tmp_path / "root" / "data"
    with pytest.raises(ValueError):
        datapack.unpack(arc, dst)
    assert not (tmp_path / "root" / "evil.txt").exists() and not (tmp_path / "evil.txt").exists()
    assert not [p for p in dst.rglob("*") if p.is_file()]


def test_unpack_rejects_links_and_unlisted_members(tmp_path):
    ok = b"ok"
    link = tarfile.TarInfo("cn/link")
    link.type, link.linkname = tarfile.SYMTYPE, "/etc/passwd"
    arc = _make_tar(tmp_path / "l.tar", _manifest([("cn/a", ok)]), [_file("cn/a", ok), (link, None)])
    with pytest.raises(ValueError, match="非普通文件"):
        datapack.unpack(arc, tmp_path / "d1")
    arc2 = _make_tar(tmp_path / "u.tar", _manifest([("cn/a", ok)]), [_file("cn/a", ok), _file("cn/extra", ok)])
    with pytest.raises(ValueError, match="不在清单"):
        datapack.unpack(arc2, tmp_path / "d2")
    arc3 = _make_tar(tmp_path / "m.tar", _manifest([("cn/a", ok), ("cn/b", ok)]), [_file("cn/a", ok)])
    with pytest.raises(ValueError, match="不在包里"):
        datapack.unpack(arc3, tmp_path / "d3")
    arc4 = _make_tar(tmp_path / "n.tar", None, [_file("cn/a", ok)])
    with pytest.raises(ValueError, match="不是 factorlab 数据包"):
        datapack.unpack(arc4, tmp_path / "d4")
    for d in ("d1", "d2", "d3", "d4"):
        assert not [p for p in (tmp_path / d).rglob("*") if p.is_file()]


def test_unpack_refuses_to_overwrite_different_files(src_root, tmp_path):
    out = tmp_path / "pack.tar"
    man = datapack.pack(out, src_root)
    dst = tmp_path / "dst"
    victim = dst / "cn" / "prices.parquet"
    victim.parent.mkdir(parents=True)
    victim.write_bytes(b"local edits")
    with pytest.raises(FileExistsError, match="--force"):
        datapack.unpack(out, dst)
    assert victim.read_bytes() == b"local edits"
    assert [p for p in dst.rglob("*") if p.is_file()] == [victim]      # 拒绝时一个文件都没写
    res = datapack.unpack(out, dst, force=True)
    assert res["overwritten"] == 1
    want = next(e["sha256"] for e in man["files"] if e["path"] == "cn/prices.parquet")
    assert datapack.sha256_file(victim) == want


def test_cli_unpack_reports_failure(tmp_path, capsys):
    arc = _make_tar(tmp_path / "evil.tar", _manifest([("../e", b"x")]), [_file("../e", b"x")])
    assert datapack.main(["unpack", str(arc), "--root", str(tmp_path / "d")]) == 2
    assert "解包失败" in capsys.readouterr().err


# ================================================================ 预注册哈希
def test_parse_prereg_hashes():
    h1, h2 = "a" * 64, "0123456789abcdef" * 4
    text = (f"- `research-py/factorlab/x.py` sha256 `{h1}`（说明）；\n"
            f"- 财报快照 `factor-data/cn/fin_pit.parquet` sha256 `{h2}`（2026-11-26）\n"
            f"- 重复 `research-py/factorlab/x.py` sha256 `{h1}`\n"
            "- 不是哈希 `foo.py` sha256 `abc`\n")
    assert datapack.parse_prereg_hashes(text) == [("research-py/factorlab/x.py", h1),
                                                  ("factor-data/cn/fin_pit.parquet", h2)]


def test_real_prereg_lists_frozen_files():
    doc = datapack.REPO_DIR / "docs" / "research" / "factorlab-confirm-2026Q4" / "PREREG.md"
    got = dict(datapack.parse_prereg_hashes(doc.read_text(encoding="utf-8")))
    assert set(got) == {"research-py/factorlab/fundamentals_cn.py", "research-py/factorlab/factors/surprise.py",
                        "research-py/factorlab/factors/price2.py", "factor-data/cn/fin_pit.parquet"}
    assert got["factor-data/cn/fin_pit.parquet"].startswith("1ff2d71cb755")
    assert doc in datapack.prereg_files()


def test_check_frozen_states(tmp_path):
    root = tmp_path / "data"
    (root / "cn").mkdir(parents=True)
    (root / "cn" / "fin_pit.parquet").write_bytes(b"fin")
    code = datapack.REPO_DIR / "research-py" / "factorlab" / "store.py"
    doc = tmp_path / "PREREG.md"
    doc.write_text(f"`factor-data/cn/fin_pit.parquet` sha256 `{_sha(b'fin')}`\n"
                   f"`factor-data/hk/fin_pit.parquet` sha256 `{'b' * 64}`\n"
                   f"`research-py/factorlab/store.py` sha256 `{'c' * 64}`\n"
                   f"`research-py/factorlab/store.py` sha256 `{datapack.sha256_file(code)}`\n", encoding="utf-8")
    assert datapack.resolve_frozen_path("factor-data/cn/fin_pit.parquet", root) == root / "cn" / "fin_pit.parquet"
    assert datapack.resolve_frozen_path("research-py/factorlab/store.py", root) == code
    states = [r["state"] for r in datapack.check_frozen(root, [doc])]
    assert states == ["OK", "MISSING", "MISMATCH", "OK"]


def test_status_on_empty_and_synthetic_roots(src_root, tmp_path):
    buf = io.StringIO()
    rep = datapack.status(src_root, out=buf)
    text = buf.getvalue()
    assert rep["problems"] == 0 and rep["snapshots"]["cn"]["prices"] == snapshot_hash("cn")
    assert "OK       prices.parquet" in text and "[hk] 缺 MANIFEST.json" in text
    assert "sec_user_agent" in text
    if datapack.SECRETS_UA.exists():   # 只报存在与否，绝不打印内容
        assert datapack.SECRETS_UA.read_text(encoding="utf-8").strip() not in text
    (src_root / "cn" / "securities.parquet").write_bytes(b"tampered")
    assert datapack.status(src_root, out=io.StringIO())["problems"] == 1
    empty = tmp_path / "empty"
    rep2 = datapack.status(empty, out=io.StringIO())
    assert rep2["problems"] == 0 and not empty.exists()          # status 不在空目录里建文件夹


# ================================================================ fetch-all
def _order(steps):
    return [" ".join(s["argv"]) for s in steps]


def test_fetch_all_plan_order():
    steps, notes = datapack.plan_steps(["cn", "hk", "us", "kf"], ua=True)
    seq = _order(steps)
    idx = {c: seq.index(c) for c in seq}
    chains = [
        ["factorlab.sources.cn fetch --source tencent", "factorlab.sources.cn build", "factorlab.sources.cn_pit fetch",
         "factorlab.sources.cn_pit build", "factorlab.sources.cn_fin fetch", "factorlab.sources.cn_fin build"],
        ["factorlab.sources.hk fetch --source tencent", "factorlab.sources.hk build", "factorlab.sources.hk_fin fetch",
         "factorlab.sources.hk_fin build"],
        ["factorlab.sources.us fetch", "factorlab.sources.us build", "factorlab.sources.sec bulk",
         "factorlab.fundamentals_us build", "factorlab.fundamentals_us build-surprise"],
        ["factorlab.sources.kf fetch", "factorlab.sources.kf build"],
    ]
    for chain in chains:
        assert [idx[c] for c in chain] == sorted(idx[c] for c in chain), chain
    assert len(seq) == len(set(seq)) == 18
    assert [s["n"] for s in steps] == list(range(1, 19))
    # 不默认请求东方财富：A 股、港股日线都显式走腾讯
    for s in steps:
        if s["argv"][0] in ("factorlab.sources.cn", "factorlab.sources.hk") and s["argv"][1] == "fetch":
            assert s["argv"][-2:] == ["--source", "tencent"]
    assert all(s["minutes"] > 0 for s in steps)


def test_fetch_all_skips_sec_without_user_agent():
    steps, notes = datapack.plan_steps(["us"], ua=False)
    assert _order(steps) == ["factorlab.sources.us fetch", "factorlab.sources.us fetch --retry-failed",
                             "factorlab.sources.us build"]
    assert any(".secrets/sec_user_agent" in n for n in notes)
    with pytest.raises(ValueError):
        datapack.plan_steps(["jp"])


def test_fetch_all_dry_run_and_runner(tmp_path, monkeypatch):
    monkeypatch.setenv("FACTORLAB_DATA", str(tmp_path / "data"))
    monkeypatch.setattr(datapack, "sec_ua_available", lambda: True)
    calls = []
    buf = io.StringIO()
    assert datapack.fetch_all(["kf", "hk"], dry_run=True, out=buf, runner=calls.append) == 0
    assert calls == []
    text = buf.getvalue()
    assert text.index("sources.kf fetch") < text.index("sources.hk fetch --source tencent") < text.index("hk_fin build")

    def run(argv):
        calls.append(" ".join(argv))
        return 0
    assert datapack.fetch_all(["hk"], out=io.StringIO(), runner=run) == 0
    assert calls == ["factorlab.sources.hk fetch --source tencent", "factorlab.sources.hk build",
                     "factorlab.sources.hk_fin fetch", "factorlab.sources.hk_fin build"]
    calls.clear()
    fail = lambda argv: calls.append(" ".join(argv)) or (3 if argv[-1] == "build" else 0)  # noqa: E731
    assert datapack.fetch_all(["hk"], out=io.StringIO(), runner=fail, start_from=2) == 3
    assert calls == ["factorlab.sources.hk build"]
