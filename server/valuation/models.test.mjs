import test from "node:test";
import assert from "node:assert/strict";
import { parseModelOutput, modelsFromCodexCache } from "./models/index.mjs";
test("preserves provider/version identity without treating discovery as authorization", () => {
  const models = parseModelOutput(
    "opencode",
    "openai/gpt-5.1\nanthropic/claude-sonnet-4\n",
  );
  assert.equal(models[0].modelId, "openai/gpt-5.1");
  assert.equal(models[0].availability, "discovered");
  assert.equal(models[1].provider, "anthropic");
});
test("only returns model metadata from a Codex cache", () => {
  const models = modelsFromCodexCache({
    apiKey: "SECRET",
    models: [{ slug: "gpt-5.1", display_name: "GPT 5.1", secret: "SECRET" }],
  });
  assert.equal(models[0].modelId, "gpt-5.1");
  assert.ok(!JSON.stringify(models).includes("SECRET"));
});
test("parses pi model table without inventing a model list", () => {
  const models = parseModelOutput(
    "pi",
    "provider model context max-out reasoning images\nopenai gpt-5.1 400k 128k yes yes\ngoogle gemini-2.5-pro 1M 64k yes yes",
  );
  assert.equal(models[0].modelId, "openai/gpt-5.1");
  assert.equal(models.length, 2);
});
test("claude exposes versioned catalog models", async () => {
  const { claudeLocalModels } = await import("./models/index.mjs");
  const models = await claudeLocalModels();
  assert.ok(models.some((m) => m.modelId === "claude-opus-5-5"));
  assert.ok(models.every((m) => m.backend === "claude"));
});
