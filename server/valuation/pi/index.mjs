import { readFile, realpath, access } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { modelOption } from "../models/index.mjs";
import { ensureCliPath } from "../cli/path.mjs";
let runtimePromise;
const PI_PACKAGE = "@earendil-works/pi-coding-agent";

/** 在 PATH 目录里找到 pi 可执行文件，沿符号链接上溯到包目录，返回包入口文件；找不到返回 null */
export async function findPiPackage(pathValue = process.env.PATH || "") {
  for (const dir of pathValue.split(delimiter)) {
    if (!dir) continue;
    let file;
    try {
      file = await realpath(join(dir, "pi"));
    } catch {
      continue;
    }
    for (let d = dirname(file); d !== dirname(d); d = dirname(d)) {
      try {
        const meta = JSON.parse(await readFile(join(d, "package.json"), "utf8"));
        if (meta.name !== PI_PACKAGE) break;
        const entry = join(d, meta.main || "index.js");
        await access(entry);
        return entry;
      } catch {}
    }
  }
  return null;
}

// 独立安装的服务副本里没有 node_modules：按名字导入失败时，改用全局安装的 pi 包
async function importPi() {
  try {
    return await import(PI_PACKAGE);
  } catch (error) {
    await ensureCliPath();
    const entry = await findPiPackage();
    if (!entry) throw error;
    return import(pathToFileURL(entry).href);
  }
}
// pi 的做法：不启动别家 CLI，而是用 ModelRuntime 读取 ~/.pi/agent 的
// auth.json（订阅登录/API key）、models.json（Ollama 等本地模型）与环境变量，直连模型接口。
export function getRuntime() {
  runtimePromise ||= importPi().then((m) => m.ModelRuntime.create());
  return runtimePromise;
}
export function resetRuntime(runtime) {
  runtimePromise = runtime ? Promise.resolve(runtime) : undefined;
}
export async function piVersion() {
  try {
    const file = new URL(
      "../../../node_modules/@earendil-works/pi-coding-agent/package.json",
      import.meta.url,
    );
    return JSON.parse(await readFile(file, "utf8")).version;
  } catch {
    return "";
  }
}
export async function piAvailable() {
  try {
    await getRuntime();
    return true;
  } catch {
    return false;
  }
}
const idOf = (m) => `${m.provider}/${m.id}`;
export async function listPiModels() {
  const runtime = await getRuntime();
  return (await runtime.getAvailable()).map((m) =>
    modelOption("pi", idOf(m), `${m.name || m.id} · ${m.provider}`, "piAuth"),
  );
}
export async function runPiAnalysis({ modelId, prompt, signal, onEvent }) {
  const runtime = await getRuntime();
  const available = await runtime.getAvailable();
  if (!available.length)
    throw new Error(
      "pi 没有可用模型：请在终端运行 pi 后输入 /login 登录订阅或填写 API key，或在 ~/.pi/agent/models.json 配置 Ollama 等本地模型",
    );
  const model =
    !modelId || modelId === "default"
      ? available[0]
      : available.find((m) => idOf(m) === modelId);
  if (!model) throw new Error("pi 中未找到该模型或尚未配置认证：" + modelId);
  onEvent?.({ type: "activity", message: "模型正在分析财务资料" });
  const response = await runtime.completeSimple(
    model,
    {
      messages: [{ role: "user", content: prompt, timestamp: Date.now() }],
    },
    { signal },
  );
  if (response.stopReason === "aborted") throw new Error("任务已取消");
  if (response.stopReason === "error")
    throw new Error(
      "模型调用失败：" +
        String(response.errorMessage || "请检查认证与额度").slice(0, 300),
    );
  const text = (response.content || [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("");
  if (!text) throw new Error("模型未返回文本");
  return { text, resolvedModelId: idOf(model) };
}
