import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SERVICE = "valuation-bridge.service";
const DESKTOP = "valuation-bridge.desktop";
const MIME = "x-scheme-handler/valuation";

function systemdArg(value) {
  return `"${String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%")}"`;
}

export function render({ nodePath, cliPath }) {
  return {
    unit: `[Unit]\nDescription=BusinessWeb Valuation Bridge\n\n[Service]\nType=simple\nExecStart=${systemdArg(nodePath)} ${systemdArg(cliPath)} serve\nRestart=on-failure\nRestartSec=30\n\n[Install]\nWantedBy=default.target\n`,
    desktop: `[Desktop Entry]\nType=Application\nName=ValuationBridge\nNoDisplay=true\nExec=systemctl --user start ${SERVICE}\nMimeType=${MIME};\n`,
  };
}

function paths(home) {
  return {
    unit: join(home, ".config", "systemd", "user", SERVICE),
    desktop: join(home, ".local", "share", "applications", DESKTOP),
    state: join(home, ".config", "valuation-bridge", "install-state.json"),
    mimeapps: join(home, ".config", "mimeapps.list"),
  };
}

async function currentDefault() {
  try {
    const { stdout } = await execFileAsync("xdg-mime", ["query", "default", MIME]);
    return stdout.trim();
  } catch {
    return "";
  }
}

export async function install({ nodePath, cliPath, home = homedir() }) {
  const destination = paths(home);
  const content = render({ nodePath, cliPath });
  await mkdir(join(home, ".config", "systemd", "user"), { recursive: true });
  await mkdir(join(home, ".local", "share", "applications"), { recursive: true });
  await mkdir(join(home, ".config", "valuation-bridge"), { recursive: true });
  let previous = "";
  try {
    previous = JSON.parse(await readFile(destination.state, "utf8")).previousDefault || "";
  } catch {
    const found = await currentDefault();
    previous = found === DESKTOP ? "" : found;
  }
  await writeFile(destination.unit, content.unit);
  await writeFile(destination.desktop, content.desktop);
  await writeFile(destination.state, JSON.stringify({ previousDefault: previous }));
  await execFileAsync("systemctl", ["--user", "daemon-reload"]);
  await execFileAsync("systemctl", ["--user", "enable", "--now", SERVICE]);
  await execFileAsync("systemctl", ["--user", "restart", SERVICE]);
  await execFileAsync("xdg-mime", ["default", DESKTOP, MIME]);
}

export async function uninstall({ home = homedir() }) {
  const destination = paths(home);
  let previous = "";
  try {
    previous = JSON.parse(await readFile(destination.state, "utf8")).previousDefault || "";
  } catch { /* no saved prior association */ }
  let unitExists = false;
  try {
    await readFile(destination.unit);
    unitExists = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (unitExists) await execFileAsync("systemctl", ["--user", "disable", "--now", SERVICE]);
  if (await currentDefault() === DESKTOP) {
    if (previous) await execFileAsync("xdg-mime", ["default", previous, MIME]);
    else {
      // xdg-mime has no unset command; remove only our association from the user file.
      try {
        const contents = await readFile(destination.mimeapps, "utf8");
        const updated = contents.replace(/^x-scheme-handler\/valuation=valuation-bridge\.desktop;?\r?\n/gm, "");
        if (updated !== contents) await writeFile(destination.mimeapps, updated);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }
  await rm(destination.unit, { force: true });
  await rm(destination.desktop, { force: true });
  await rm(destination.state, { force: true });
  await execFileAsync("systemctl", ["--user", "daemon-reload"]);
}
