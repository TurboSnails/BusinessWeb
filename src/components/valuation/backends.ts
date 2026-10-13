const LABELS: Record<string, string> = { agy: "Antigravity", kimi: "Kimi" };
const LOGIN: Record<string, string> = {
  codex: "在终端运行 codex login",
  claude: "在终端运行 claude 后输入 /login",
  kimi: "在终端运行 kimi login",
  agy: "在终端运行 agy 并在其中登录",
  pi: "在终端运行 pi 后输入 /login",
};

export const backendLabel = (id: string) => LABELS[id] ?? id;
export const loginHint = (id: string) => LOGIN[id] ?? "";
const LOGIN_ERROR =
  /log\s?in|logged|unauthori[sz]ed|authenticat|HTTP 401|status 401|401 Unauthorized|provider\.auth_error|Invalid API key|invalid_api_key|登录|未授权|认证/i;
const QUOTA_AUTH_ERROR = /provider\.auth_error[\s\S]*(usage limit|额度)|(usage limit|额度)[\s\S]*provider\.auth_error/i;
// 只有错误看起来像登录问题时才给出登录命令，避免误导；kimi 的额度耗尽也走 auth_error，不算登录问题
export const loginHintForError = (id: string, message: string) =>
  LOGIN_ERROR.test(message) && !QUOTA_AUTH_ERROR.test(message) ? loginHint(id) : "";
