import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, join } from "node:path";
import { runProcess } from "./process.mjs";
export const BACKENDS = ["pi", "codex", "claude", "opencode"];
export async function executablePath(id) {
  if (!BACKENDS.includes(id)) throw new Error("不支持的CLI");
  for (const dir of (process.env.PATH || "").split(delimiter)) {
    const file = join(dir, id);
    try {
      await access(file, constants.X_OK);
      return file;
    } catch {}
  }
  return null;
}
export async function discoverBackends() {
  return Promise.all(
    BACKENDS.map(async (id) => {
      const executable = await executablePath(id);
      let cliVersion = "",
        error;
      if (executable)
        try {
          cliVersion = (
            await runProcess(executable, ["--version"], { timeout: 10000 })
          ).stdout
            .trim()
            .slice(0, 100);
        } catch (e) {
          error = e.message;
        }
      return {
        id,
        installed: !!executable,
        cliVersion,
        canListModels: true,
        ...(error ? { error } : {}),
      };
    }),
  );
}
