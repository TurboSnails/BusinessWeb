"""共用 HTTP 客户端：全局限速、重试退避、curl 兜底、JSON 助手、磁盘缓存（断点续传）。

约定：
- 只发浏览器通用 UA「Mozilla/5.0」，不带 cookie、不带任何个人信息（邮箱、姓名、账号）。
  需要特定 UA 的数据源（如 SEC）由调用方显式传 headers。
- 全局限速：同一进程内所有请求共用一个令牌间隔，默认 ≤ 2 次/秒；
  可用环境变量 FACTORLAB_RPS 或 set_rate() 修改。缓存命中不计入限速。
- 重试：连接被重置 / 超时 / 5xx / 429 时指数退避重试；requests 连续失败后改用
  `curl -sS --http1.1` 兜底（东方财富 push2his 对 Python TLS 指纹偶尔直接断开连接），
  某个主机一旦 curl 成功而 requests 失败，本进程内之后对该主机直接用 curl。
- 磁盘缓存：键 = URL + 排序后的参数（sha1），存于 {store.root()}/{market}/raw/http/{ns}/。
  调用方也可传 cache_file 指定可读的文件名（例如按代码存原始 K 线）。
"""

from __future__ import annotations

import hashlib
import json
import os
import random
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urlsplit

import requests

UA = "Mozilla/5.0"
DEFAULT_RPS = float(os.environ.get("FACTORLAB_RPS", "2"))
RETRY_STATUS = {429, 500, 502, 503, 504}


class HttpError(RuntimeError):
    pass


class HttpStatusError(HttpError):
    """不可重试的 HTTP 状态（4xx，429 除外）。"""


class _RateLimiter:
    """进程级最小间隔限速（线程安全）。"""

    def __init__(self, rps: float):
        self._lock = threading.Lock()
        self._next = 0.0
        self.set_rate(rps)

    def set_rate(self, rps: float) -> None:
        if rps <= 0:
            raise ValueError("rps 必须为正")
        self.interval = 1.0 / rps

    def wait(self) -> None:
        with self._lock:
            now = time.monotonic()
            if now < self._next:
                time.sleep(self._next - now)
                now = time.monotonic()
            self._next = now + self.interval


_LIMITER = _RateLimiter(DEFAULT_RPS)
_STATS = {"network": 0, "cache_hits": 0, "curl": 0, "retries": 0}
_CURL_HOSTS: set[str] = set()


def set_rate(rps: float) -> None:
    """修改全局限速（次/秒）。"""
    _LIMITER.set_rate(rps)


def stats() -> dict[str, int]:
    """本进程的请求计数（network = 实际发出的请求数，含重试）。"""
    return dict(_STATS)


def full_url(url: str, params: dict | None = None) -> str:
    if not params:
        return url
    return url + ("&" if "?" in url else "?") + urlencode(sorted((k, str(v)) for k, v in params.items()))


def cache_key(url: str, params: dict | None = None) -> str:
    return hashlib.sha1(full_url(url, params).encode("utf-8")).hexdigest()


def raw_dir(market: str, *parts: str) -> Path:
    from .. import store

    d = store.root() / market / "raw"
    for p in parts:
        d = d / p
    d.mkdir(parents=True, exist_ok=True)
    return d


class Client:
    """礼貌的 HTTP 客户端。market 用于定位缓存目录；不传 market 则不做磁盘缓存。"""

    def __init__(self, market: str | None = None, *, retries: int = 4, backoff: float = 1.5,
                 timeout: float = 30.0, curl: str = "auto", headers: dict | None = None):
        if curl not in {"auto", "always", "never"}:
            raise ValueError("curl 取 auto / always / never")
        self.market = market
        self.retries = retries
        self.backoff = backoff
        self.timeout = timeout
        self.curl = curl if shutil.which("curl") else "never"
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": UA, "Accept": "*/*"})
        if headers:
            self.session.headers.update(headers)

    # ---------- 缓存 ----------
    def cache_path(self, url: str, params: dict | None = None, ns: str = "misc",
                   cache_file: str | None = None) -> Path | None:
        if self.market is None:
            return None
        if cache_file:
            p = raw_dir(self.market) / cache_file
            p.parent.mkdir(parents=True, exist_ok=True)
            return p
        return raw_dir(self.market, "http", ns) / f"{cache_key(url, params)}.bin"

    # ---------- 底层请求 ----------
    def _requests_get(self, url: str, params: dict | None, headers: dict | None) -> tuple[int, bytes]:
        r = self.session.get(url, params=params, headers=headers, timeout=self.timeout)
        return r.status_code, r.content

    def _curl_get(self, url: str, params: dict | None, headers: dict | None) -> tuple[int, bytes]:
        cmd = ["curl", "-sS", "--http1.1", "--compressed", "-L", "-m", str(int(self.timeout)),
               "-A", (headers or {}).get("User-Agent", self.session.headers.get("User-Agent", UA)),
               "-w", "\n%{http_code}"]
        for k, v in (headers or {}).items():
            if k.lower() != "user-agent":
                cmd += ["-H", f"{k}: {v}"]
        cmd.append(full_url(url, params))
        res = subprocess.run(cmd, capture_output=True, timeout=self.timeout + 15)
        if res.returncode != 0:
            raise HttpError(f"curl 退出码 {res.returncode}: {res.stderr.decode(errors='replace')[:200]}")
        body, _, code = res.stdout.rpartition(b"\n")
        _STATS["curl"] += 1
        return int(code or 0), body

    def fetch(self, url: str, params: dict | None = None, headers: dict | None = None) -> bytes:
        """发请求（限速 + 重试 + curl 兜底），返回响应体；失败抛 HttpError。"""
        host = urlsplit(url).netloc
        last: Exception | None = None
        for attempt in range(self.retries + 1):
            use_curl = self.curl == "always" or (self.curl == "auto" and (host in _CURL_HOSTS or attempt >= 2))
            _LIMITER.wait()
            _STATS["network"] += 1
            try:
                status, body = (self._curl_get if use_curl else self._requests_get)(url, params, headers)
                if status == 200:
                    if use_curl and self.curl == "auto" and attempt >= 2:
                        _CURL_HOSTS.add(host)
                    return body
                if status not in RETRY_STATUS and 400 <= status < 500:
                    raise HttpStatusError(f"HTTP {status}: {full_url(url, params)[:200]}")
                last = HttpError(f"HTTP {status}")
            except HttpStatusError:
                raise
            except (requests.ConnectionError, requests.Timeout, subprocess.TimeoutExpired, HttpError) as e:
                last = e
            if attempt < self.retries:
                _STATS["retries"] += 1
                time.sleep(self.backoff * (2 ** attempt) + random.uniform(0, 0.5))
        raise HttpError(f"重试 {self.retries} 次仍失败：{full_url(url, params)[:200]}；最后错误：{last!r}")

    # ---------- 带缓存的接口 ----------
    def get(self, url: str, params: dict | None = None, *, headers: dict | None = None,
            cache: bool = True, ns: str = "misc", cache_file: str | None = None,
            max_age: float | None = None, validate=None) -> bytes:
        """GET，命中磁盘缓存则不发请求。max_age（秒）超时则重新下载；validate(body) 返回 False 则不写缓存。"""
        p = self.cache_path(url, params, ns, cache_file) if cache else None
        if p is not None and p.exists() and p.stat().st_size > 0:
            if max_age is None or time.time() - p.stat().st_mtime < max_age:
                _STATS["cache_hits"] += 1
                return p.read_bytes()
        body = self.fetch(url, params, headers)
        if p is not None and (validate is None or validate(body)):
            tmp = p.with_suffix(p.suffix + ".tmp")
            tmp.write_bytes(body)
            tmp.replace(p)
        return body

    def get_text(self, url: str, params: dict | None = None, encoding: str = "utf-8", **kw) -> str:
        return self.get(url, params, **kw).decode(encoding, errors="replace")

    def get_json(self, url: str, params: dict | None = None, **kw) -> Any:
        """GET 并解析 JSON（兼容 JSONP：截取第一个 { 或 [ 到最后一个 } 或 ]）。"""
        kw.setdefault("validate", _is_json)
        return parse_json(self.get(url, params, **kw))


def parse_json(body: bytes | str) -> Any:
    text = body.decode("utf-8", errors="replace") if isinstance(body, bytes) else body
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        starts = [i for i in (text.find("{"), text.find("[")) if i >= 0]
        if not starts:
            raise
        i = min(starts)
        j = max(text.rfind("}"), text.rfind("]"))
        return json.loads(text[i:j + 1])


def _is_json(body: bytes) -> bool:
    try:
        parse_json(body)
        return True
    except (ValueError, json.JSONDecodeError):
        return False


_DEFAULT: dict[str | None, Client] = {}


def client(market: str | None = None) -> Client:
    """每个 market 一个共享客户端（共享全局限速）。"""
    if market not in _DEFAULT:
        _DEFAULT[market] = Client(market)
    return _DEFAULT[market]


def get_json(url: str, params: dict | None = None, market: str | None = None, **kw) -> Any:
    return client(market).get_json(url, params, **kw)


def get_text(url: str, params: dict | None = None, market: str | None = None, **kw) -> str:
    return client(market).get_text(url, params, **kw)
