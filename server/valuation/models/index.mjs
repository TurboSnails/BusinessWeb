import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { executablePath } from "../cli/registry.mjs";
import { runProcess } from "../cli/process.mjs";
const cache = new Map();
export function modelOption(
  backend,
  modelId,
  displayName = modelId,
  source = "cli",
) {
  return {
    backend,
    provider: modelId.includes("/") ? modelId.split("/")[0] : backend,
    modelId,
    displayName,
    version: null,
    isDefault: modelId === "default",
    discoverySource: source,
    discoveredAt: new Date().toISOString(),
    availability: modelId === "default" ? "unknown" : "discovered",
    capabilities: [],
  };
}
export function parseModelOutput(backend, output) {
  return output.split(/\r?\n/).flatMap((line) => {
    const parts = line.trim().split(/\s+/);
    if (backend === "pi")
      return parts.length >= 4 &&
        parts[0] !== "provider" &&
        !line.startsWith(" ") &&
        /^[a-z][\w-]*$/.test(parts[0])
        ? [modelOption(backend, `${parts[0]}/${parts[1]}`)]
        : [];
    return /^[\w.-]+\/[\w./:-]+$/.test(line.trim())
      ? [modelOption(backend, line.trim())]
      : [];
  });
}
export function modelsFromCodexCache(value) {
  return (Array.isArray(value.models) ? value.models : []).flatMap((m) =>
    typeof m.slug === "string"
      ? [modelOption("codex", m.slug, m.display_name || m.slug, "localCatalog")]
      : [],
  );
}
const CLAUDE_CATALOG = [
  ["claude-fable-5-1", "Fable 5.1（需付费额度）"],
  ["claude-opus-5-5", "Opus 5.5"],
  ["claude-sonnet-5-5", "Sonnet 5.5"],
  ["claude-haiku-4-5-20251001", "Haiku 4.5"],
  ["fable", "Fable（最新别名）"],
  ["opus", "Opus（最新别名）"],
  ["sonnet", "Sonnet（最新别名）"],
  ["haiku", "Haiku（最新别名）"],
];
export async function claudeLocalModels() {
  const ids = new Map(CLAUDE_CATALOG);
  try {
    const settings = JSON.parse(
      await readFile(
        join(
          process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"),
          "settings.json",
        ),
        "utf8",
      ),
    );
    const local = [settings.model, ...Object.values(settings.env || {})];
    for (const id of local)
      if (typeof id === "string" && /^claude-[\w.-]+$/.test(id) && !ids.has(id))
        ids.set(id, id + "（本机设置）");
  } catch {}
  return [...ids].map(([id, name]) =>
    modelOption("claude", id, name, "builtinCatalog"),
  );
}
export async function listModels(backend, { refresh = false, signal } = {}) {
  const executable = await executablePath(backend);
  if (!executable) throw new Error("CLI未安装");
  const previous = cache.get(backend);
  if (!refresh && previous && Date.now() - previous.time < 60000)
    return previous.models;
  let models = [];
  if (backend === "codex")
    try {
      models = modelsFromCodexCache(
        JSON.parse(
          await readFile(
            join(
              process.env.CODEX_HOME || join(homedir(), ".codex"),
              "models_cache.json",
            ),
            "utf8",
          ),
        ),
      );
    } catch {}
  if (backend === "claude") models = await claudeLocalModels();
  if (backend === "pi" || backend === "opencode") {
    const args =
      backend === "pi"
        ? ["--offline", "--no-extensions", "--no-skills", "--list-models"]
        : ["models"];
    const result = await runProcess(executable, args, {
      timeout: 30000,
      signal,
    });
    models = parseModelOutput(backend, result.stdout);
  }
  const result = [
    modelOption(backend, "default", "CLI 默认模型（别名）", "default"),
    ...models,
  ];
  cache.set(backend, { time: Date.now(), models: result });
  return result;
}
export function markModel(backend, modelId, availability) {
  const entry = cache.get(backend);
  const item = entry?.models.find((m) => m.modelId === modelId);
  if (item) item.availability = availability;
}
