import { homedir } from "node:os";
import { access, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, win32 as windowsPath } from "node:path";
import * as darwin from "./darwin.mjs";
import * as linux from "./linux.mjs";
import * as win32 from "./win32.mjs";

const platforms = { darwin, linux, win32 };

function platformInstaller() {
  const selected = platforms[process.platform];
  if (!selected) throw new Error(`不支持的平台：${process.platform}`);
  return selected;
}

export function installationDir({ home = homedir(), platform = process.platform, localAppData = process.env.LOCALAPPDATA } = {}) {
  if (platform === "win32") return windowsPath.join(localAppData || windowsPath.join(home, "AppData", "Local"), "businessweb-valuation");
  return join(home, ".businessweb-valuation");
}

export async function stageCli({ nodePath, cliPath, home = homedir(), platform = process.platform, localAppData } = {}) {
  const dir = installationDir({ home, platform, localAppData });
  const pathJoin = platform === "win32" ? windowsPath.join : join;
  const installedCliPath = pathJoin(dir, "cli.mjs");
  await mkdir(dir, { recursive: true });
  if (cliPath !== installedCliPath) await copyFile(cliPath, installedCliPath);
  await writeFile(pathJoin(dir, "install-state.json"), JSON.stringify({ nodePath, cliPath: installedCliPath }));
  return { nodePath, cliPath: installedCliPath };
}

export async function installationStatus({ home = homedir(), platform = process.platform, localAppData } = {}) {
  const dir = installationDir({ home, platform, localAppData });
  const statePath = (platform === "win32" ? windowsPath.join : join)(dir, "install-state.json");
  try {
    const { nodePath, cliPath } = JSON.parse(await readFile(statePath, "utf8"));
    if (!nodePath || !cliPath) return { ok: false };
    await Promise.all([access(nodePath), access(cliPath)]);
    return { ok: true, nodePath, cliPath };
  } catch {
    return { ok: false };
  }
}

export async function install({ nodePath, cliPath, home = homedir() }) {
  const staged = await stageCli({ nodePath, cliPath, home });
  await platformInstaller().install({ ...staged, home });
  console.log("安装完成，回到网页点‘重新连接’");
}

export async function uninstall({ home = homedir() } = {}) {
  await platformInstaller().uninstall({ home });
  await rm(installationDir({ home }), { recursive: true, force: true });
  console.log("卸载完成");
}
