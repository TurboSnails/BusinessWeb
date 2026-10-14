import { execFile } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const LABEL = "com.businessweb.valuation";
const LSREGISTER = "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

function xml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

export function render({ nodePath, cliPath }) {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${xml(nodePath)}</string><string>${xml(cliPath)}</string><string>serve</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict>
  <key>ThrottleInterval</key><integer>30</integer>
</dict></plist>
`;
  const infoPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.businessweb.valuation.launcher</string>
  <key>CFBundleName</key><string>ValuationBridge</string>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSBackgroundOnly</key><true/>
  <key>CFBundleURLTypes</key><array><dict>
    <key>CFBundleURLName</key><string>Valuation Bridge</string>
    <key>CFBundleURLSchemes</key><array><string>valuation</string></array>
  </dict></array>
</dict></plist>
`;
  // 不带 -k：服务已在运行时是空操作，不会打断正在进行的估值；
  // 服务没被加载（如被 bootout）时，用磁盘上的 plist 重新加载再启动
  const launcher = `#!/bin/sh
uid=$(/usr/bin/id -u)
target="gui/$uid/${LABEL}"
/bin/launchctl kickstart "$target" 2>/dev/null && exit 0
/bin/launchctl bootstrap "gui/$uid" "$HOME/Library/LaunchAgents/${LABEL}.plist" 2>/dev/null
exec /bin/launchctl kickstart "$target"
`;
  return { plist, infoPlist, launcher };
}

function paths(home) {
  const app = join(home, "Applications", "ValuationBridge.app");
  return {
    plist: join(home, "Library", "LaunchAgents", `${LABEL}.plist`),
    app,
    contents: join(app, "Contents"),
    executable: join(app, "Contents", "MacOS", "launch"),
  };
}

async function loaded(target) {
  try {
    await execFileAsync("launchctl", ["print", target]);
    return true;
  } catch {
    return false;
  }
}

export async function reloadLaunchAgent({
  target,
  domain,
  plist,
  isLoaded = loaded,
  run = execFileAsync,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (await isLoaded(target)) {
    await run("launchctl", ["bootout", target]);
    const deadline = Date.now() + 5_000;
    while (await isLoaded(target)) {
      if (Date.now() >= deadline) throw new Error("launchctl 卸载服务超时，请稍后重试安装");
      await sleep(100);
    }
  }
  try {
    await run("launchctl", ["bootstrap", domain, plist]);
  } catch {
    await sleep(200);
    await run("launchctl", ["bootstrap", domain, plist]);
  }
}

export async function install({ nodePath, cliPath, home = homedir() }) {
  const uid = process.getuid();
  const target = `gui/${uid}/${LABEL}`;
  const destination = paths(home);
  const content = render({ nodePath, cliPath });
  await mkdir(join(home, "Library", "LaunchAgents"), { recursive: true });
  await mkdir(join(destination.contents, "MacOS"), { recursive: true });
  await writeFile(destination.plist, content.plist);
  await writeFile(join(destination.contents, "Info.plist"), content.infoPlist);
  await writeFile(destination.executable, content.launcher, { mode: 0o755 });
  await reloadLaunchAgent({ target, domain: `gui/${uid}`, plist: destination.plist });
  await execFileAsync(LSREGISTER, ["-f", destination.app]);
}

export async function uninstall({ home = homedir() }) {
  const target = `gui/${process.getuid()}/${LABEL}`;
  const destination = paths(home);
  if (await loaded(target)) await execFileAsync("launchctl", ["bootout", target]);
  try {
    await execFileAsync(LSREGISTER, ["-u", destination.app]);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await rm(destination.plist, { force: true });
  await rm(destination.app, { recursive: true, force: true });
}
