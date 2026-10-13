import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildArgs, extractOutput, runAnalysis, streamText } from "./cli/index.mjs";
import { runProcess } from "./cli/process.mjs";
import { BACKENDS } from "./cli/registry.mjs";
test("passes exact model IDs without a shell or fallback", () => {
  const args = buildArgs("codex", "gpt-6.1-sol", "/tmp/schema.json");
  assert.equal(args[args.indexOf("--model") + 1], "gpt-6.1-sol");
  assert.ok(!args.includes("--dangerously-bypass-approvals-and-sandbox"));
  assert.ok(!buildArgs("claude", "sonnet").includes("--fallback-model"));
});
test("extracts agent final text and excludes diagnostic events", () => {
  assert.equal(
    extractOutput("codex", [
      {
        type: "item.completed",
        item: { type: "agent_message", text: '{"ok":true}' },
      },
      { type: "thread.started", thread_id: "abc" },
    ]).text,
    '{"ok":true}',
  );
  assert.throws(() =>
    extractOutput("claude", [
      { type: "result", is_error: true, result: "failed" },
    ]),
  );
});
test("handles split unicode output and cancels real child processes", async () => {
  const r = await runProcess(process.execPath, [
    "-e",
    "process.stdout.write('中文\\n')",
  ]);
  assert.equal(r.stdout, "中文\n");
  const c = new AbortController();
  const p = runProcess(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
    signal: c.signal,
  });
  c.abort();
  await assert.rejects(p, /取消/);
});
test("lists agy and kimi as backends", () => {
  assert.deepEqual(BACKENDS, ["pi", "codex", "claude", "opencode", "agy", "kimi"]);
});
test("agy passes prompt as an argument and parses the final result", () => {
  const args = buildArgs("agy", "gemini-3.8-flash-high", null, { type: "object" }, "估值分析");
  assert.equal(args[0], "--sandbox");
  assert.deepEqual(args.slice(1, 5), ["--print", "估值分析", "--output-format", "stream-json"]);
  assert.deepEqual(args.slice(5, 7), ["--model", "gemini-3.8-flash-high"]);
  assert.equal(args[args.indexOf("--json-schema") + 1], '{"type":"object"}');
  assert.equal(extractOutput("agy", [
    { event: "init" },
    { event: "step_update", text_delta: "partial" },
    { event: "result", result: { status: "SUCCESS", response: '{"a":1}' } },
  ]).text, '{"a":1}');
});
test("agy reports a failed final status", () => {
  assert.throws(() => extractOutput("agy", [
    { event: "result", result: { status: "FAILED", response: "no quota" } },
  ]), /模型调用失败.*no quota/);
});
test("agy accepts a schema file path to keep the command line short", () => {
  const args = buildArgs("agy", "default", "/tmp/schema.json", { type: "object" }, "估值分析");
  assert.deepEqual(args.slice(-2), ["--json-schema", "/tmp/schema.json"]);
});
test("agy streams step updates for progress", () => {
  assert.equal(streamText({ event: "step_update", text_delta: "增量" }), "增量");
});
test("kimi sends prompt and reads text output", () => {
  const args = buildArgs("kimi", "k3", null, {}, "估值分析");
  assert.deepEqual(args, ["--prompt", "估值分析", "--output-format", "text", "--model", "k3"]);
  assert.equal(extractOutput("kimi", [{ type: "text", part: { text: '{"a":1}' } }]).text, '{"a":1}');
});
test("kimi turns quota stderr into an actionable Chinese error", () => {
  assert.throws(() => extractOutput("kimi", [
    { type: "stderr", message: "provider.auth_error: 403 monthly usage limit" },
  ]), /额度已用尽/);
});
test("kimi auth errors without a quota hint ask the user to log in", () => {
  assert.throws(() => extractOutput("kimi", [
    { type: "stderr", message: "provider.auth_error: 401 invalid token" },
  ]), /kimi login/);
});
test("failed child exposes stderr to the caller", async () => {
  await assert.rejects(
    runProcess(process.execPath, ["-e", "process.stderr.write('usage limit'); process.exit(1)"]),
    (error) => error.stderr === "usage limit",
  );
});
test("runAnalysis uses kimi plain stdout and reports quota failures", async () => {
  const dir = await mkdtemp(join(tmpdir(), "valuation-kimi-test-"));
  const oldPath = process.env.PATH;
  try {
    const fake = join(dir, "kimi");
    await writeFile(fake, `#!${process.execPath}\nif (process.argv.includes("quota")) { process.stderr.write("provider.auth_error: monthly usage limit"); process.exit(1); }\nprocess.stdout.write('{"ok":true}');\n`);
    await chmod(fake, 0o755);
    process.env.PATH = dir;
    const result = await runAnalysis({ backend: "kimi", modelId: "default", prompt: "估值分析", schema: {} });
    assert.equal(result.output, '{"ok":true}');
    await assert.rejects(runAnalysis({ backend: "kimi", modelId: "default", prompt: "quota", schema: {} }), /额度已用尽/);
  } finally {
    process.env.PATH = oldPath;
    await rm(dir, { recursive: true, force: true });
  }
});
