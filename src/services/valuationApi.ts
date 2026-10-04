import type {
  Backend,
  BackendInfo,
  ModelOption,
  SecurityIdentity,
  FinancialSnapshot,
  ValuationReport,
} from "../features/valuation";
const base = "/api/valuation";
let token = "";
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", "X-Valuation-Token": token },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || "本地服务请求失败");
  return value as T;
}
export async function connectValuation() {
  const health = await request<{ ok: boolean; token: string }>("/health");
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
  payload: {
    message?: string;
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
  const stream = new EventSource(`${base}/jobs/${id}/events`);
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
