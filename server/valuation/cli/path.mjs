import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

// 开机自启的服务由 launchd/systemd 启动，PATH 只有 /usr/bin:/bin 等系统目录，
// 找不到装在 nvm、~/.local/bin 等位置的 CLI（codex 脚本还需要 PATH 里有 node）。
// 这里把常见安装目录和用户登录 shell 的 PATH 并入，且保持原有条目在前。
const START = "__VB_PATH__";
const END = "__VB_END__";

export function mergePath(base = "", ...groups) {
  const seen = new Set();
  const out = [];
  for (const entry of [base.split(delimiter), ...groups].flat()) {
    if (!entry || seen.has(entry)) continue;
    seen.add(entry);
    out.push(entry);
  }
  return out.join(delimiter);
}

const isDir = (dir) => stat(dir).then((s) => s.isDirectory(), () => false);

export async function knownCliDirs(home = homedir()) {
  const candidates = [
    join(home, ".local/bin"),
    join(home, ".opencode/bin"),
    join(home, ".kimi-code/bin"),
    join(home, ".bun/bin"),
    join(home, ".cargo/bin"),
    join(home, ".volta/bin"),
    join(home, ".npm-global/bin"),
    join(home, "Library/pnpm"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  try {
    const root = join(home, ".nvm/versions/node");
    for (const version of (await readdir(root)).sort().reverse())
      candidates.unshift(join(root, version, "bin"));
  } catch {}
  const existing = [];
  for (const dir of candidates) if (await isDir(dir)) existing.push(dir);
  return existing;
}

export function parseShellPath(output) {
  const from = output.indexOf(START);
  const to = output.indexOf(END, from);
  return from === -1 || to === -1 ? "" : output.slice(from + START.length, to);
}

function loginShellPath(shell) {
  return new Promise((resolve) => {
    if (!shell || process.platform === "win32") return resolve("");
    execFile(
      shell,
      ["-ilc", `printf '${START}%s${END}' "$PATH"`],
      { timeout: 5000, env: { ...process.env, TERM: "dumb" }, windowsHide: true },
      (error, stdout) => resolve(error && !stdout ? "" : parseShellPath(String(stdout))),
    );
  });
}

let ensured;
export function ensureCliPath({ home = homedir(), shell = process.env.SHELL } = {}) {
  ensured ||= (async () => {
    const original = process.env.PATH || "";
    process.env.PATH = mergePath(original, await knownCliDirs(home), (await loginShellPath(shell)).split(delimiter));
    return process.env.PATH;
  })();
  return ensured;
}
// 测试用：清除缓存
export function resetCliPath() {
  ensured = undefined;
}
