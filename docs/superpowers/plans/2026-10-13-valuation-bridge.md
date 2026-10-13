# 估值本地服务：一次安装、之后无感 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用户在线上页面点“开始估值”时，用的是本机已登录的 CLI（codex / claude / opencode / pi / antigravity / kimi）；首次只需粘贴一行命令，之后服务开机自启，页面自动连接或自动唤起。

**Architecture:** 把 `server/valuation` 打成独立 npm 包 `businessweb-valuation-bridge`（esbuild 单文件，含 `src/features/valuation` 的 TS 计算代码），提供 `serve / install / uninstall` 三个命令。`install` 注册开机自启和 `valuation://` 协议。页面用一个统一的连接状态机（已连接 → 尝试唤起 → 显示安装命令），替换现有“请在 BusinessWeb 目录运行 npm run valuation:server”的提示。

**Tech Stack:** Node ≥ 20（包内用 esbuild 打包，不依赖 Node 的 TS 剥离），node:test，React + Vitest。

**Spec:** 本对话中确认的方案（无独立 spec 文件）：保留现有 HTTP + token + Origin 白名单机制；不引入云端、不要求用户 API Key。

## Global Constraints

- 服务只监听 `127.0.0.1`，默认端口固定 `8788`（协议唤起依赖固定端口），可用 `VALUATION_PORT` 覆盖。
- Origin 白名单保持现有逻辑（`http.mjs` 的 `HOSTED_ORIGINS` + `VALUATION_ALLOWED_ORIGINS`）；POST 继续校验 `X-Valuation-Token`。
- 安装命令不得使用 `sudo`；所有写入限定在用户目录（`~/Library/LaunchAgents`、`~/.config`、`HKCU`）。
- 对用户可见的文案使用中文。
- 现有 `npm run valuation:server` 与 `npm run valuation:app` 继续可用。

## Review Focus

- 8788 端口已被其他程序占用：`serve` 要报明确错误，页面不能误把别的服务当成估值服务（`/health` 必须校验 `service: "valuation"` 字段）。
- 重复执行 `install`：应幂等（更新而非重复注册）。
- CLI 已安装但未登录：页面要提示对应的登录命令，而不是笼统的“模型调用失败”。
- Safari / 非 Chrome 浏览器：给出明确提示而不是一直转圈。
- `valuation://` 唤起后服务起不来：页面最多等待 8 秒，之后回到“显示安装命令”，不能无限重试。

---

## File Structure

- Modify: `server/valuation/cli/registry.mjs`、`cli/index.mjs`、`models/index.mjs` — 增加 `agy`、`kimi` 后端。
- Create: `packages/valuation-bridge/` — `package.json`、`src/cli.mjs`（命令入口）、`src/install/{darwin,linux,win32}.mjs`、`build.mjs`（esbuild）。
- Modify: `server/valuation/http.mjs` — `/health` 增加 `service`、`backendsHint`。
- Create: `src/services/localBridge.ts` — 连接状态机（唯一对外入口）。
- Create: `src/components/valuation/BridgeSetup.tsx` — 安装命令引导组件。
- Modify: `src/services/valuationApi.ts`、`src/pages/Valuation.tsx`、`src/features/macro/AiInterpretation.tsx` — 改用状态机与组件。

---

### Task 1: 增加 antigravity（agy）与 kimi 后端

**Files:**
- Modify: `server/valuation/cli/registry.mjs:6`（BACKENDS）
- Modify: `server/valuation/cli/index.mjs`（`buildArgs`、`extractOutput`）
- Modify: `server/valuation/models/index.mjs`（`listModels`）
- Test: `server/valuation/cli.test.mjs`、`server/valuation/models.test.mjs`

**Interfaces:**
- Produces: `BACKENDS = ["pi","codex","claude","opencode","agy","kimi"]`；后端 id 用可执行文件名 `agy`、`kimi`，页面显示名映射在 Task 5。

已核实的 CLI 行为：
- `agy -p <prompt> --output-format stream-json --json-schema <schema>`：每行一个事件，`step_update.text_delta` 为流式文字，最终事件 `{"event":"result","result":{"status":"SUCCESS","response":"..."}}`。`agy models` 输出 `<id>\t<显示名>`。
- `kimi -p <prompt> --output-format stream-json`：成功时的事件格式尚未验证（本机额度已用尽）。第一版用 `--output-format text`，stdout 即最终文字；`kimi` 没有 `models` 子命令，模型从 `~/.kimi-code/config.toml` 的 `[models."<alias>"]` 读取别名。额度错误出现在 stderr：`provider.auth_error`，需转成“额度不足”提示。

- [ ] **Step 1: 写失败测试（`cli.test.mjs`）**

```js
test("agy 参数与输出解析", () => {
  assert.deepEqual(buildArgs("agy", "gemini-3.8-flash-high", null, { type: "object" }).slice(0, 4),
    ["--print", "--output-format", "stream-json", "--model"]);
  const out = extractOutput("agy", [
    { event: "init" },
    { event: "result", result: { status: "SUCCESS", response: "{\"a\":1}" } },
  ]);
  assert.equal(out.text, "{\"a\":1}");
});
test("agy 失败状态抛出可读错误", () => {
  assert.throws(() => extractOutput("agy", [{ event: "result", result: { status: "FAILED", response: "no quota" } }]), /模型调用失败/);
});
test("kimi 使用文本输出，额度错误转中文", () => {
  assert.deepEqual(buildArgs("kimi", "k3").includes("--output-format"), true);
  assert.throws(() => extractOutput("kimi", [{ type: "stderr", message: "provider.auth_error: 403 monthly usage limit" }]), /额度/);
});
```

- [ ] **Step 2: 运行确认失败**：`node --test server/valuation/cli.test.mjs`，预期 `不支持的CLI`。

- [ ] **Step 3: 实现。** `BACKENDS` 增加 `"agy","kimi"`；`buildArgs` 增加分支：

```js
if (backend === "agy")
  return ["--print", "--output-format", "stream-json", ...model,
    ...(schema && Object.keys(schema).length ? ["--json-schema", JSON.stringify(schema)] : [])];
if (backend === "kimi")
  return ["--print", "--output-format", "text", ...model];
```

注意：agy 的提示词走 stdin 还是参数，先用 `echo hi | agy --print --output-format stream-json` 验证；若必须走参数，改为在 `runAnalysis` 中对 agy 把 prompt 作为 `--print` 的值传入（提示词很长，需确认不超出系统参数长度上限，超出则写临时文件并让提示词读取）。`extractOutput` 增加：

```js
if (backend === "agy" && r.event === "result") {
  if (r.result?.status !== "SUCCESS")
    throw new Error("模型调用失败：" + String(r.result?.response || "请检查CLI登录与额度").slice(0, 300));
  text = r.result.response;
}
```

kimi 的 stdout 不是 JSON 行；在 `runAnalysis` 中对 kimi 把整段 stdout 当 `{type:"text", part:{text}}` 记录，stderr 含 `usage limit` 时抛出“kimi 额度已用尽，请到 kimi.com 购买额度或等待下个周期”。

- [ ] **Step 4: 模型列表。** `agy` 解析 `agy models` 的制表符输出；`kimi` 解析 `config.toml` 中 `[models."<alias>"]`。各写一个纯函数并配测试（输入样例用上面已核实的输出）。

- [ ] **Step 5: 运行** `npm run test:valuation-server` 全绿后提交：`feat(valuation): add antigravity and kimi backends`。

---

### Task 2: 打包成独立 npm 包

**Files:**
- Create: `packages/valuation-bridge/package.json`、`src/cli.mjs`、`build.mjs`
- Modify: `server/valuation/http.mjs`（`/health` 加 `service: "valuation"`）
- Test: `packages/valuation-bridge/cli.test.mjs`

**Interfaces:**
- Produces: bin `valuation-bridge`，子命令 `serve`（前台启动）、`install`、`uninstall`、`status`。Task 3 在 `install` 中调用 `serve`。

- [ ] **Step 1: 写失败测试**：启动打包产物 `dist/cli.mjs serve`（端口用 `VALUATION_PORT=0` 取随机端口），请求 `/api/valuation/health`，断言 `service === "valuation"` 且 `ok === true`。
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现。** `build.mjs`：

```js
import { build } from "esbuild";
await build({
  entryPoints: ["src/cli.mjs"], bundle: true, platform: "node", format: "esm",
  target: "node20", outfile: "dist/cli.mjs", banner: { js: "#!/usr/bin/env node" },
  external: ["@earendil-works/pi-coding-agent"], // pi 是可选依赖，缺失时 piAvailable() 返回 false
});
```

`src/cli.mjs` 按 `process.argv[2]` 分发；`serve` 复用 `server/valuation/index.mjs` 的启动逻辑；端口被占用时（`EADDRINUSE`）先请求 `/health`，若是估值服务就提示“已在运行”并退出 0，否则报错“8788 端口被其他程序占用，可设置 VALUATION_PORT”。`package.json`：`name: "businessweb-valuation-bridge"`、`bin`、`files: ["dist"]`、`engines.node: ">=20"`、`optionalDependencies` 放 pi。
- [ ] **Step 4: 运行测试通过**；手动验证 `node packages/valuation-bridge/dist/cli.mjs serve` 能完成一次估值。
- [ ] **Step 5: 提交**：`feat(valuation): package the local service as standalone bridge`。

---

### Task 3: install / uninstall（开机自启 + valuation:// 协议）

**Files:**
- Create: `packages/valuation-bridge/src/install/index.mjs`、`darwin.mjs`、`linux.mjs`、`win32.mjs`
- Test: `packages/valuation-bridge/install.test.mjs`（只测文件内容生成函数，不真正注册）

**Interfaces:**
- Consumes: Task 2 的 `serve`。
- Produces: `install({ nodePath, cliPath, home })`，`uninstall({ home })`；每个平台导出纯函数 `render(...)` 便于测试。

- [ ] **Step 1: 写失败测试**：`darwin.render({nodePath, cliPath})` 生成的 plist 含 `RunAtLoad`、`KeepAlive`、`ProgramArguments` 为 `[node, cli, "serve"]`；`linux.render` 生成含 `ExecStart=` 的 systemd user unit 与 `.desktop` 文件（`MimeType=x-scheme-handler/valuation;`）；`win32.render` 生成 `HKCU\Software\Classes\valuation` 的注册表写入命令；重复调用结果相同（幂等）。
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现。**
  - **macOS：** 写 `~/Library/LaunchAgents/com.businessweb.valuation.plist`（`RunAtLoad`+`KeepAlive`），`launchctl bootstrap gui/$UID`（已加载则先 `bootout`）。协议：在 `~/Applications/ValuationBridge.app` 生成极小 app（`Info.plist` 含 `CFBundleURLTypes` → `valuation`，可执行脚本里 `launchctl kickstart gui/$UID/com.businessweb.valuation`），并运行 `lsregister -f` 登记。
  - **Linux：** `~/.config/systemd/user/valuation-bridge.service` + `systemctl --user enable --now`；`~/.local/share/applications/valuation-bridge.desktop` + `xdg-mime default`。
  - **Windows：** 开机启动写 `HKCU\...\Run`；协议写 `HKCU\Software\Classes\valuation\shell\open\command`，命令为后台启动 `node cli serve`。
  - `install` 结尾输出中文提示：“安装完成，回到网页点‘重新连接’”。
- [ ] **Step 4: 运行测试通过。** 在本机手动跑一次 `install`，重启登录后确认 8788 在监听，再 `uninstall` 确认清理干净。
- [ ] **Step 5: 提交**：`feat(valuation): autostart and valuation:// protocol installer`。

---

### Task 4: 页面连接状态机

**Files:**
- Create: `src/services/localBridge.ts`、`src/services/localBridge.test.ts`
- Modify: `src/services/valuationApi.ts`（导出沿用现有函数；`connectValuation` 内部改走状态机）

**Interfaces:**
- Produces:

```ts
export type BridgeState =
  | { kind: "connected"; version?: number; features: string[] }
  | { kind: "starting" }                       // 已尝试 valuation:// 唤起，等待最多 8 秒
  | { kind: "needsInstall"; command: string }  // 显示安装命令
  | { kind: "unsupportedBrowser" };            // Safari
export function ensureBridge(opts?: { launch?: boolean }): Promise<BridgeState>;
export const INSTALL_COMMAND = "npx -y businessweb-valuation-bridge install";
```

- [ ] **Step 1: 写失败测试**（Vitest，mock `fetch` 与导航函数）：① `/health` 成功且 `service==="valuation"` → `connected`；② 首次失败 → 触发一次 `valuation://start` 并每 500ms 重试，8 秒内成功 → `connected`；③ 8 秒超时 → `needsInstall`，且只触发唤起一次；④ `/health` 返回非估值服务 → `needsInstall`；⑤ Safari UA → `unsupportedBrowser`。
- [ ] **Step 2: 运行确认失败**：`npx vitest run src/services/localBridge.test.ts`。
- [ ] **Step 3: 实现。** 唤起用隐藏 `iframe.src = "valuation://start"`（避免离开当前页面），不依赖其返回值；成功与否只由轮询 `/health` 判定。
- [ ] **Step 4: 通过后提交**：`feat(valuation): bridge connection state machine`。

---

### Task 5: 引导组件与页面接入

**Files:**
- Create: `src/components/valuation/BridgeSetup.tsx`、`BridgeSetup.test.tsx`
- Modify: `src/pages/Valuation.tsx`、`src/features/macro/AiInterpretation.tsx`（及其测试 `ai.test.tsx` 中依赖旧文案的断言）

**Interfaces:**
- Consumes: Task 4 的 `ensureBridge`、`BridgeState`、`INSTALL_COMMAND`。

- [ ] **Step 1: 写失败测试**：`needsInstall` 时渲染“复制安装命令”按钮，点击后 `navigator.clipboard.writeText(INSTALL_COMMAND)` 被调用；安装后（模拟轮询成功）自动变为已连接，无需刷新；`unsupportedBrowser` 显示“请使用 Chrome 或 Edge”；`starting` 显示“正在启动本地服务…”。
- [ ] **Step 2: 运行确认失败。**
- [ ] **Step 3: 实现组件，并替换两个页面里旧的“在 BusinessWeb 目录运行 npm run valuation:server”文案。** 后端下拉里 `agy` 显示为“Antigravity”，`kimi` 显示为“Kimi”；CLI 已安装但调用报登录错误时，按后端显示登录命令（`codex login`、`claude` 内 `/login`、`kimi login`、`agy` 内登录）。开发环境（localhost）保留原行为。
- [ ] **Step 4: 运行** `npm run test` 与 `npm run typecheck`，全绿。
- [ ] **Step 5: 提交**：`feat(valuation): guided local bridge setup in the page`。

---

### Task 6: 发布与端到端验证

- [ ] **Step 1:** `npm publish`（需要你提供 npm 账号与最终包名，包名确认前先用 `npm pack` 在本机 `npx ./businessweb-valuation-bridge-*.tgz install` 验证）。
- [ ] **Step 2:** 在干净的用户环境验证：粘贴一行命令 → 回到线上页面 → 自动连接 → 选 codex 完成一次估值。
- [ ] **Step 3:** 关闭服务后点“开始估值”，确认页面自动唤起并继续，而不是报错。

## Self-Review

- 覆盖：antigravity/kimi（Task 1）、不再依赖源码目录（Task 2）、首次一行命令与自启（Task 3）、点击自动唤起（Task 4）、分步引导文案（Task 5）、发布验证（Task 6）。
- 已知未验证项：kimi 的 stream-json 成功输出格式（本机额度用尽，计划里先用 text 输出）；agy 提示词是走 stdin 还是参数（Task 1 Step 3 开头要先验证）；macOS 上 `.app` 协议登记在最新系统版本的行为。
