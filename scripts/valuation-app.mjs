#!/usr/bin/env node
// 一条命令同时启动估值服务和本地页面，退出时一并关闭。
import { spawn } from "node:child_process";
const run = (args) =>
  spawn("npm", ["run", ...args], { stdio: "inherit", shell: false });
const children = [run(["valuation:server"]), run(["dev"])];
let closing = false;
const close = (code = 0) => {
  if (closing) return;
  closing = true;
  for (const c of children) c.kill("SIGTERM");
  setTimeout(() => process.exit(code), 300);
};
for (const c of children) c.on("exit", (code) => close(code ?? 0));
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => close(0));
console.log("估值页面：http://localhost:5173/ （路由见站内“公司估值”）");
