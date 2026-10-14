import { startValuationServer } from "../../../server/valuation/index.mjs";
import { install, installationStatus, uninstall } from "./install/index.mjs";
import { fileURLToPath } from "node:url";
import pkg from "../package.json" with { type: "json" };

// 让 /health 上报自己的版本，页面据此判断是否需要更新
process.env.VALUATION_BRIDGE_VERSION ||= pkg.version;

const HEALTH_PATH = "/api/valuation/health";
const PORT_OCCUPIED_EXIT_CODE = 75;

async function existingBridge(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}${HEALTH_PATH}`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return false;
    const body = await response.json();
    return body?.ok === true && body?.service === "valuation";
  } catch {
    return false;
  }
}

async function serve() {
  try {
    await startValuationServer({ showDevHint: false });
  } catch (error) {
    if (error.code !== "EADDRINUSE") throw error;
    const port = Number(process.env.VALUATION_PORT || 8788);
    if (await existingBridge(port)) {
      console.log(`公司估值服务已在运行：http://127.0.0.1:${port}`);
      await new Promise(() => setInterval(() => {}, 60_000));
    }
    throw Object.assign(new Error(`${port} 端口被其他程序占用，可设置 VALUATION_PORT 后重试`), {
      exitCode: PORT_OCCUPIED_EXIT_CODE,
    });
  }
}

async function main(command) {
  switch (command) {
    case "serve":
      await serve();
      break;
    case "status": {
      const port = Number(process.env.VALUATION_PORT || 8788);
      const running = await existingBridge(port);
      console.log(running ? "公司估值服务已在运行" : "公司估值服务未运行");
      const installed = await installationStatus();
      if (!installed.ok) console.log("安装文件或 Node 路径已失效，请重新运行 npx -y businessweb-valuation-bridge install");
      if (!running || !installed.ok) process.exitCode = 1;
      break;
    }
    case "install":
      await install({ nodePath: process.execPath, cliPath: fileURLToPath(import.meta.url) });
      break;
    case "uninstall":
      await uninstall();
      break;
    default:
      console.log("用法：valuation-bridge <serve|install|uninstall|status>");
      if (command && command !== "--help" && command !== "-h") process.exitCode = 1;
  }
}

main(process.argv[2]).catch((error) => {
  console.error(error.message);
  process.exitCode = error.exitCode || 1;
});
