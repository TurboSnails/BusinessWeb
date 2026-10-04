import { spawn } from "node:child_process";
export function runProcess(
  executable,
  args,
  {
    input = "",
    cwd,
    signal,
    timeout = 30000,
    onLine,
    keepOpen = false,
    maxBytes = 5 * 1024 * 1024,
    env = process.env,
  } = {},
) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("任务已取消"));
    const child = spawn(executable, args, {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      detached: process.platform !== "win32",
    });
    let stdout = "",
      stderr = "",
      pending = "",
      bytes = 0,
      done = false,
      failure = null,
      killTimer;
    const stop = (kind = "SIGTERM") => {
      try {
        if (process.platform === "win32") child.kill(kind);
        else process.kill(-child.pid, kind);
      } catch {}
    };
    const finish = (error) => {
      if (done) return;
      if (
        error &&
        child.pid &&
        child.exitCode === null &&
        child.signalCode === null
      ) {
        if (failure) return;
        failure = error;
        clearTimeout(timer);
        stop();
        killTimer = setTimeout(() => stop("SIGKILL"), 500);
        return;
      }
      done = true;
      clearTimeout(killTimer);
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) {
        stop();
        reject(error);
      } else resolve({ stdout, stderr });
    };
    const abort = () => finish(new Error("任务已取消"));
    const timer = setTimeout(() => finish(new Error("CLI调用超时")), timeout);
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      bytes += Buffer.byteLength(chunk);
      if (bytes > maxBytes) return finish(new Error("CLI输出超出上限"));
      stdout += chunk;
      pending += chunk;
      let pos;
      while ((pos = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, pos).replace(/\r$/, "");
        pending = pending.slice(pos + 1);
        try {
          onLine?.(line, child);
        } catch (error) {
          finish(error);
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 16000) stderr += chunk;
    });
    child.on("error", (error) =>
      finish(new Error(`CLI启动失败：${error.code || error.message}`)),
    );
    child.on("close", (code) => {
      if (pending)
        try {
          onLine?.(pending, child);
        } catch (error) {
          return finish(error);
        }
      finish(
        failure ||
          (code === 0
            ? null
            : new Error(`CLI退出码 ${code}；请检查该CLI登录和模型权限`)),
      );
    });
    child.stdin.on("error", () => {});
    if (keepOpen) child.stdin.write(input);
    else child.stdin.end(input);
  });
}
