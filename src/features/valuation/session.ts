import type { Backend, SecurityIdentity, ValuationReport } from "./types";

// 估值页的会话状态：离开页面再回来时恢复「正在运行的任务」和「最近一次结果」。
// 存在 sessionStorage：只在当前标签页内有效，关闭标签页即清除。
const RUNNING = "valuation-job";
const LAST = "valuation-last";

export interface RunningJob {
  id: string;
  security?: SecurityIdentity;
  backend?: Backend;
  model?: string;
  startedAt?: number;
}

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* 隐私模式或存储已满：恢复功能可选，不影响估值本身 */
  }
}

export function saveRunning(job: RunningJob) {
  write(RUNNING, JSON.stringify(job));
}

export function loadRunning(): RunningJob | null {
  const raw = read(RUNNING);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (value && typeof value.id === "string") return value as RunningJob;
  } catch {
    // 旧版本只存了任务 id 字符串
    if (/^[\w-]+$/.test(raw)) return { id: raw };
  }
  return null;
}

export const clearRunning = () => write(RUNNING, null);

export function saveLast(report: ValuationReport) {
  write(LAST, JSON.stringify(report));
}

export function loadLast(): ValuationReport | null {
  const raw = read(LAST);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    return value?.snapshot?.security?.code ? (value as ValuationReport) : null;
  } catch {
    return null;
  }
}

export const clearLast = () => write(LAST, null);

/** 任务阶段 → 进度条第几步（0 起） */
export const STEPS = ["采集财报", "模型分析", "计算估值", "完成"] as const;
export function stepOf(stage: string | undefined): number {
  if (stage === "analyzing") return 1;
  if (stage === "calculating") return 2;
  if (stage === "completed") return 3;
  return 0;
}

export function elapsedText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
