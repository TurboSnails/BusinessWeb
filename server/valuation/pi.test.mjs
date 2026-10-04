import test from "node:test";
import assert from "node:assert/strict";
import { resetRuntime, listPiModels, runPiAnalysis } from "./pi/index.mjs";
const model = { provider: "anthropic", id: "claude-opus-5-5", name: "Opus" };
const runtime = (response, available = [model]) => ({
  getAvailable: async () => available,
  completeSimple: async () => response,
});
test("lists only models with configured auth as provider/id", async () => {
  resetRuntime(runtime(null));
  const list = await listPiModels();
  assert.equal(list[0].modelId, "anthropic/claude-opus-5-5");
  assert.equal(list[0].backend, "pi");
  resetRuntime(runtime(null, []));
  assert.deepEqual(await listPiModels(), []);
});
test("returns assistant text and resolved model", async () => {
  resetRuntime(
    runtime({ stopReason: "stop", content: [{ type: "text", text: "{}" }] }),
  );
  const r = await runPiAnalysis({
    modelId: "anthropic/claude-opus-5-5",
    prompt: "x",
  });
  assert.equal(r.text, "{}");
  assert.equal(r.resolvedModelId, "anthropic/claude-opus-5-5");
});
test("explains missing auth and surfaces provider errors", async () => {
  resetRuntime(runtime(null, []));
  await assert.rejects(
    runPiAnalysis({ modelId: "default", prompt: "x" }),
    /\/login/,
  );
  resetRuntime(
    runtime({
      stopReason: "error",
      errorMessage: "quota exceeded",
      content: [],
    }),
  );
  await assert.rejects(
    runPiAnalysis({ modelId: "default", prompt: "x" }),
    /quota exceeded/,
  );
  await assert.rejects(
    runPiAnalysis({ modelId: "openai/none", prompt: "x" }),
    /未找到该模型/,
  );
});
