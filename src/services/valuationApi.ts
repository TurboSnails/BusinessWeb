import type {
  Backend,
  BackendInfo,
  ModelOption,
  SecurityIdentity,
  FinancialSnapshot,
  ValuationReport,
} from "../features/valuation";
const localPage =
  typeof location === "undefined" ||
  ["localhost", "127.0.0.1"].includes(location.hostname);
// 线上页面由浏览器直连用户本机的估值服务；本地开发走 Vite 代理
export const hostedPage = !localPage;
const base = localPage
  ? "/api/valuation"
  : `${(import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_VALUATION_URL || "http://127.0.0.1:8788"}/api/valuation`;
let token = "";
async function request<T>(
  path: string,
  body?: unknown,
  retry = true,
): Promise<T> {
  if (body !== undefined && !token) await connectValuation();
  const response = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-Valuation-Token": token },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (response.status === 403 && body !== undefined && retry) {
    await connectValuation();
    return request<T>(path, body, false);
  }
  if (!response.ok) throw new Error(value.error || "本地服务请求失败");
  return value as T;
}
export async function connectValuation() {
  const health = await request<{ ok: boolean; token: string; version?: number; features?: string[] }>("/health");
  token = health.token;
  return health;
}
export const fetchBackends = () => request<BackendInfo[]>("/backends");
export const fetchModels = (backend: Backend, refresh = false) =>
  request<ModelOption[]>(`/models?backend=${backend}&refresh=${refresh}`);
export const searchCompanies = (query: string) =>
  request<SecurityIdentity[]>("/companies?q=" + encodeURIComponent(query));
export const startValuation = (input: {
  security: SecurityIdentity;
  backend: Backend;
  modelId: string;
  snapshot?: FinancialSnapshot;
}) => request<{ id: string; state: string }>("/jobs", input);
export const cancelValuation = (id: string) =>
  request("/jobs/" + id + "/cancel", {});
export const getValuation = (id: string) =>
  request<{
    state: string;
    report: ValuationReport | null;
    error: string | null;
  }>("/jobs/" + id);
export interface JobEvent {
  id: number;
  jobId: string;
  type: string;
  stage: string;
  at?: string;
  payload: {
    message?: string;
    /** activity 事件：模型累计输出字数与最近一段输出 */
    chars?: number;
    preview?: string;
    error?: string;
    snapshot?: FinancialSnapshot;
    report?: ValuationReport;
  };
}
export function subscribeValuation(
  id: string,
  onEvent: (event: JobEvent) => void,
  onError: () => void,
) {
  return subscribeJob(`/jobs/${id}/events`, onEvent, onError);
}
function subscribeJob(
  path: string,
  onEvent: (event: JobEvent) => void,
  onError: () => void,
) {
  const stream = new EventSource(base + path);
  stream.onmessage = (message) => {
    try {
      const event = JSON.parse(message.data) as JobEvent;
      onEvent(event);
      if (["completed", "cancelled", "failed"].includes(event.type))
        stream.close();
    } catch {
      stream.close();
      onError();
    }
  };
  stream.onerror = onError;
  return () => stream.close();
}

// ── 宏观温度「AI 解读」：同一个本地服务，独立任务队列 ──
export interface MacroInterpretation {
  summary: string;
  changes: { indicator: string; direction: "变好" | "变坏" | "持平"; evidence: string }[];
  analogs: { period: string; similar: string; different: string }[];
  watch: { item: string; trigger: string }[];
  caveats: string;
}
export interface MacroInterpretationResult {
  interpretation: MacroInterpretation;
  asOf: string | null;
  stage: string | null;
  execution: { backend: Backend; requestedModelId: string; resolvedModelId?: string | null; cliVersion?: string };
  createdAt: string;
}
export const startMacroInterpretation = (input: { backend: Backend; modelId: string; digest: unknown }) =>
  request<{ id: string; state: string }>("/macro/jobs", input);
export const cancelMacroInterpretation = (id: string) => request("/macro/jobs/" + id + "/cancel", {});
export const getMacroInterpretation = (id: string) =>
  request<{ state: string; report: MacroInterpretationResult | null; error: string | null }>("/macro/jobs/" + id);
export const subscribeMacroInterpretation = (id: string, onEvent: (event: JobEvent) => void, onError: () => void) =>
  subscribeJob(`/macro/jobs/${id}/events`, onEvent, onError);
