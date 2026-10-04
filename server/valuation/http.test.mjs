import test from "node:test";
import assert from "node:assert/strict";
import { createJobStore } from "./jobs.mjs";
test("rejects concurrent work and ignores late completion after cancellation", async () => {
  let release;
  const store = createJobStore({
    execute: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const job = store.start({
    backend: "codex",
    modelId: "default",
    security: { market: "us", code: "AAPL" },
  });
  assert.throws(() => store.start({}), /忙碌/);
  await new Promise((resolve) => setTimeout(resolve, 0));
  store.cancel(job.id);
  store.cancel(job.id);
  release({ fake: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(store.get(job.id).state, "cancelled");
  assert.equal(store.get(job.id).report, null);
  const events = store.events(job.id, 1);
  assert.ok(events.every((e) => e.id > 1));
  assert.equal(events.at(-1).type, "cancelled");
  store.close();
});
test("completed tasks retain exactly one terminal event", async () => {
  const store = createJobStore({ execute: async () => ({ schemaVersion: 1 }) });
  const job = store.start({});
  await new Promise((resolve) => setTimeout(resolve, 0));
  store.cancel(job.id);
  assert.equal(store.get(job.id).state, "completed");
  assert.equal(
    store.events(job.id, 0).filter((e) => e.type === "completed").length,
    1,
  );
  store.close();
});
import { createValuationServer } from "./http.mjs";
import { Readable } from "node:stream";
function request(server, method, path, headers, body = "") {
  return new Promise((resolve) => {
    const req = Readable.from([body]);
    req.method = method;
    req.url = path;
    req.headers = { host: "localhost:8788", ...headers };
    const res = {
      status: 200,
      setHeader() {},
      writeHead(status) {
        this.status = status;
      },
      end(text) {
        resolve({ status: this.status, body: text ? JSON.parse(text) : null });
      },
    };
    server.emit("request", req, res);
  });
}
test("HTTP blocks hostile origins, missing tokens and oversized payloads", async () => {
  const server = createValuationServer({ token: "test-session" });
  assert.equal(
    (
      await request(server, "GET", "/health", {
        origin: "https://evil.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (await request(server, "GET", "/health", { host: "evil.example" })).status,
    403,
  );
  assert.equal((await request(server, "POST", "/jobs", {})).status, 403);
  assert.equal(
    (
      await request(
        server,
        "POST",
        "/jobs",
        { "x-valuation-token": "test-session" },
        "broken",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await request(
        server,
        "POST",
        "/jobs",
        { "x-valuation-token": "test-session" },
        "x".repeat(2 * 1024 * 1024 + 1),
      )
    ).status,
    413,
  );
  server.close();
});
