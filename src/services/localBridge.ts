export type BridgeState =
  | { kind: "connected"; version?: number; features: string[]; bridgeVersion?: string }
  | { kind: "starting" }
  | { kind: "needsInstall"; command: string }
  | { kind: "unsupportedBrowser" }
  | { kind: "portConflict" };

// @latest：npx 会复用本机缓存的旧版本，不带它用户可能一直装到旧版
export const PACKAGE_NAME = "businessweb-valuation-bridge";
export const INSTALL_COMMAND = `npx -y ${PACKAGE_NAME}@latest install`;
export const UNINSTALL_COMMAND = `npx -y ${PACKAGE_NAME}@latest uninstall`;
export const STATUS_COMMAND = `npx -y ${PACKAGE_NAME}@latest status`;
// 低于此版本的本机服务有已知问题（0.1.2 起修复：自启时找不到 CLI）
export const MIN_BRIDGE_VERSION = "0.1.2";

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}
/** 旧版本服务不上报版本号，也算过旧 */
export const bridgeOutdated = (version?: string | null): boolean =>
  !version || compareVersions(version, MIN_BRIDGE_VERSION) < 0;

export type Platform = "mac" | "windows" | "linux";
export function detectPlatform(userAgent: string): Platform {
  if (/Windows/i.test(userAgent)) return "windows";
  if (/Mac OS X|Macintosh/i.test(userAgent)) return "mac";
  return "linux";
}
export const BRIDGE_PROTOCOL_URL = "valuation://start";
const WAIT_MS = 8000;
const POLL_MS = 500;
const PROBE_TIMEOUT_MS = 2000;

const localPage =
  typeof location === "undefined" ||
  ["localhost", "127.0.0.1"].includes(location.hostname);
// 线上页面由浏览器直连用户本机的估值服务；本地开发走 Vite 代理
export const hostedPage = !localPage;
export const bridgeBase = localPage
  ? "/api/valuation"
  : `${(import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_VALUATION_URL || "http://127.0.0.1:8788"}/api/valuation`;

export interface BridgeDeps {
  fetch: typeof fetch;
  launch: (url: string) => void;
  userAgent: string;
  hosted: boolean;
  base: string;
}

// 隐藏 iframe 触发自定义协议，不离开当前页面；不依赖其结果
function launchViaIframe(url: string) {
  if (typeof document === "undefined") return;
  const frame = document.createElement("iframe");
  frame.style.display = "none";
  frame.src = url;
  document.body.appendChild(frame);
  setTimeout(() => frame.remove(), 3000);
}

const isSafari = (ua: string) =>
  /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|FxiOS|Android/.test(ua);

function defaultDeps(): BridgeDeps {
  return {
    fetch: (...args) => fetch(...args),
    launch: launchViaIframe,
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    hosted: hostedPage,
    base: bridgeBase,
  };
}

// null：没有响应；"conflict"：有响应但不是估值服务（端口被占用）
async function probe(d: BridgeDeps, timeoutMs = PROBE_TIMEOUT_MS): Promise<BridgeState | "conflict" | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(PROBE_TIMEOUT_MS, timeoutMs)));
  try {
    const response = await d.fetch(d.base + "/health", { signal: controller.signal });
    let body: { service?: unknown; version?: unknown; features?: unknown; bridgeVersion?: unknown } | null = null;
    try {
      body = response.ok ? await response.json() : null;
    } catch {
      body = null;
    }
    if (body?.service !== "valuation") return "conflict";
    return {
      kind: "connected",
      version: typeof body.version === "number" ? body.version : undefined,
      features: Array.isArray(body.features) ? (body.features as string[]) : [],
      ...(typeof body.bridgeVersion === "string" ? { bridgeVersion: body.bridgeVersion } : {}),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const needsInstall = (): BridgeState => ({ kind: "needsInstall", command: INSTALL_COMMAND });

export async function ensureBridge(
  opts: { launch?: boolean; deps?: Partial<BridgeDeps>; onState?: (state: BridgeState) => void } = {},
): Promise<BridgeState> {
  const d = { ...defaultDeps(), ...opts.deps };
  if (d.hosted && isSafari(d.userAgent)) return { kind: "unsupportedBrowser" };
  const first = await probe(d);
  // 本地开发页走 Vite 代理，代理失败也会有响应，不当作端口冲突
  if (first === "conflict") return d.hosted ? { kind: "portConflict" } : needsInstall();
  if (first) return first;
  // 本地开发页走 Vite 代理，不唤起；launch:false 只探测一次
  if (!d.hosted || opts.launch === false) return needsInstall();
  d.launch(BRIDGE_PROTOCOL_URL);
  opts.onState?.({ kind: "starting" });
  // 唤起后总共 8 秒（含 probe），probe 超时取 min(2s, 剩余时间)
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(Math.min(POLL_MS, Math.max(0, deadline - Date.now())));
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const state = await probe(d, remaining);
    if (state === "conflict") return { kind: "portConflict" };
    if (state) return state;
  }
  return needsInstall();
}
