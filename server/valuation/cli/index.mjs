import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { executablePath, discoverBackends } from "./registry.mjs";
import { runProcess } from "./process.mjs";
import { markModel } from "../models/index.mjs";
import { runPiAnalysis, piVersion } from "../pi/index.mjs";
export function buildArgs(backend, modelId, schemaPath, schema = {}) {
  const model = modelId && modelId !== "default" ? ["--model", modelId] : [];
  if (backend === "codex")
    return [
      "exec",
      "--json",
      "--ephemeral",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
      ...model,
      ...(schemaPath ? ["--output-schema", schemaPath] : []),
      "-",
    ];
  if (backend === "claude")
    return [
      "--print",
      "--verbose",
      "--output-format",
      "stream-json",
      "--tools",
      "",
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
      "--no-session-persistence",
      ...model,
      ...(schema ? ["--json-schema", JSON.stringify(schema)] : []),
    ];
  if (backend === "opencode")
    return ["run", "--pure", "--format", "json", ...model];
  if (backend === "pi")
    return [
      "--mode",
      "rpc",
      "--no-session",
      "--no-tools",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--no-context-files",
      ...model,
    ];
  throw new Error("不支持的CLI");
}
export function extractOutput(backend, records) {
  let text = "",
    resolvedModelId = null;
  for (const r of records) {
    if (
      r.type === "error" ||
      r.type === "turn.failed" ||
      (r.type === "result" && r.is_error)
    )
      throw new Error(
        "模型调用失败：" +
          String(
            r.error?.data?.message ||
              r.error?.message ||
              r.message ||
              r.result ||
              "请检查CLI登录、额度及模型权限",
          ).slice(0, 300),
      );
    if (
      backend === "codex" &&
      r.type === "item.completed" &&
      r.item?.type === "agent_message"
    )
      text = r.item.text;
    if (backend === "claude" && r.type === "result")
      text = r.structured_output
        ? JSON.stringify(r.structured_output)
        : r.result;
    if (backend === "claude" && r.type === "system" && r.model)
      resolvedModelId = r.model;
    if (backend === "opencode" && r.type === "text") text += r.part?.text || "";
    if (
      backend === "pi" &&
      r.type === "message_end" &&
      r.message?.role === "assistant"
    ) {
      if (r.message.stopReason === "error") throw new Error("Pi模型调用失败");
      text = (r.message.content || [])
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("");
      resolvedModelId = r.message.model || null;
    }
  }
  if (!text) throw new Error("CLI未返回可解析的最终文本");
  return { text, resolvedModelId };
}
/** 从各 CLI 的流式记录里取出模型这一步产出的文字（取不到返回 ""） */
export function streamText(r) {
  if (r.type === "item.completed" || r.type === "item.updated")
    return typeof r.item?.text === "string" ? r.item.text : "";
  if (r.type === "text" || r.type === "reasoning")
    return typeof r.part?.text === "string" ? r.part.text : "";
  if (r.type === "message_update") {
    const e = r.assistantMessageEvent || {};
    return typeof e.delta === "string" ? e.delta : "";
  }
  return "";
}

/** 进度汇报：累计字数 + 最近一段输出；节流，避免刷屏和撑爆事件日志 */
export function createProgress(onEvent, { interval = 1200, now = Date.now } = {}) {
  let chars = 0,
    tail = "",
    last = -Infinity, // 第一段输出立即汇报
    pendingKind = "";
  const flush = () => {
    last = now();
    onEvent?.({
      type: "activity",
      message: pendingKind === "reasoning" ? "模型正在推理" : "模型正在输出分析",
      chars,
      preview: tail.replace(/\s+/g, " ").trim().slice(-160),
    });
  };
  return {
    push(text, kind = "text") {
      if (!text) return;
      chars += text.length;
      tail = (tail + text).slice(-400);
      pendingKind = kind;
      if (now() - last >= interval) flush();
    },
    flush,
  };
}

export async function runAnalysis({
  backend,
  modelId = "default",
  prompt,
  schema,
  signal,
  onEvent,
}) {
  const executable =
    backend === "pi" ? "pi-sdk" : await executablePath(backend);
  if (!executable) throw new Error("CLI未安装");
  if (
    typeof modelId !== "string" ||
    modelId.length > 200 ||
    !modelId.trim() ||
    /[\x00-\x1f]/.test(modelId)
  )
    throw new Error("模型ID无效");
  if (backend === "pi")
    try {
      const output = await runPiAnalysis({ modelId, prompt, signal, onEvent });
      markModel(backend, modelId, "verified");
      return {
        output: output.text,
        requestedModelId: modelId,
        resolvedModelId: output.resolvedModelId,
        cliVersion: await piVersion(),
      };
    } catch (error) {
      markModel(backend, modelId, "unavailable");
      throw error;
    }
  const cwd = await mkdtemp(join(tmpdir(), "businessweb-valuation-")),
    schemaPath = join(cwd, "schema.json"),
    records = [],
    progress = createProgress(onEvent);
  onEvent?.({ type: "activity", message: "已把财务资料交给模型，等待响应", chars: 0 });
  try {
    await writeFile(schemaPath, JSON.stringify(schema));
    const input =
      backend === "pi"
        ? JSON.stringify({ id: "valuation", type: "prompt", message: prompt }) +
          "\n"
        : prompt;
    const run = (restrict) =>
      runProcess(executable, buildArgs(backend, modelId, schemaPath, schema), {
        input,
        cwd,
        signal,
        timeout: 1200000,
        keepOpen: backend === "pi",
        env: {
          ...process.env,
          ...(restrict
            ? {
                OPENCODE_CONFIG_CONTENT: JSON.stringify({
                  permission: { "*": "deny" },
                }),
              }
            : {}),
        },
        onLine: (line, child) => {
          if (!line.trim()) return;
          let r;
          try {
            r = JSON.parse(line);
          } catch {
            return;
          }
          records.push(r);
          if (r.type === "response" && r.success === false)
            throw new Error("Pi拒绝分析请求");
          if (r.type === "agent_settled" && backend === "pi") child.stdin.end();
          const text = streamText(r);
          if (text)
            progress.push(text, r.type === "reasoning" || r.item?.type === "reasoning" ? "reasoning" : "text");
        },
      });
    try {
      await run(true);
    } catch (error) {
      // opencode 免费档拒绝带权限限制的请求；在空临时目录中去掉限制重试
      const rejected = records.some((r) =>
        /free tier/i.test(r.error?.data?.message || ""),
      );
      if (backend !== "opencode" || !rejected) {
        extractOutput(backend, records);
        throw error;
      }
      records.length = 0;
      await run(false);
    }
    const output = extractOutput(backend, records);
    markModel(backend, modelId, "verified");
    const info = (await discoverBackends()).find((b) => b.id === backend);
    return {
      output: output.text,
      requestedModelId: modelId,
      resolvedModelId: output.resolvedModelId,
      cliVersion: info?.cliVersion || "",
    };
  } catch (error) {
    markModel(backend, modelId, "unavailable");
    throw error;
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}
