import { resolve, basename } from "node:path";
import { pathToFileURL } from "node:url";
import { createValuationServer } from "./http.mjs";
import { ensureCliPath } from "./cli/path.mjs";

export async function startValuationServer({
  port = process.env.VALUATION_PORT || 8788,
  showDevHint = true,
} = {}) {
  const requestedPort = Number(port);
  if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535 ||
      (requestedPort > 0 && requestedPort < 1024))
    throw new Error("VALUATION_PORT无效");

  const server = createValuationServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(requestedPort, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  // 自启服务的 PATH 很短，后台补全以找到用户装的 CLI；请求处理会等它完成
  ensureCliPath();
  const actualPort = server.address().port;
  console.log(`公司估值服务：http://127.0.0.1:${actualPort}${showDevHint ? "，请同时运行 npm run dev" : ""}`);
  const stop = () => server.close();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  server.once("close", () => {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  });
  return server;
}

const entryPath = process.argv[1] && resolve(process.argv[1]);
if (entryPath && basename(entryPath) === "index.mjs" &&
    import.meta.url === pathToFileURL(entryPath).href)
  startValuationServer().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
