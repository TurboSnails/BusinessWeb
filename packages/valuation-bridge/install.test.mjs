import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installationDir, stageCli, installationStatus } from "./src/install/index.mjs";
import { reloadLaunchAgent, render as renderDarwin } from "./src/install/darwin.mjs";
import { render as renderLinux } from "./src/install/linux.mjs";
import { render as renderWin32 } from "./src/install/win32.mjs";

const options = { nodePath: "/Users/Example User/node&tools/node", cliPath: "/tmp/valuation bridge/cli.mjs" };

test("macOS render produces launch agent and valuation URL app deterministically", () => {
  const first = renderDarwin(options);
  assert.deepEqual(first, renderDarwin(options));
  assert.match(first.plist, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(first.plist, /<key>KeepAlive<\/key>\s*<dict>\s*<key>SuccessfulExit<\/key>\s*<false\/>\s*<\/dict>/);
  assert.match(first.plist, /<key>ThrottleInterval<\/key>\s*<integer>30<\/integer>/);
  assert.match(first.plist, /<key>ProgramArguments<\/key>\s*<array>\s*<string>\/Users\/Example User\/node&amp;tools\/node<\/string>\s*<string>\/tmp\/valuation bridge\/cli.mjs<\/string>\s*<string>serve<\/string>/);
  assert.match(first.infoPlist, /<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>valuation<\/string>/);
  assert.match(first.launcher, /launchctl kickstart/);
  assert.match(first.launcher, /com\.businessweb\.valuation/);
});

test("macOS waits for bootout before bootstrap and retries a failed bootstrap once", async () => {
  const calls = [];
  let polls = 0;
  let bootstraps = 0;
  await reloadLaunchAgent({
    target: "gui/501/com.businessweb.valuation",
    domain: "gui/501",
    plist: "/tmp/agent.plist",
    isLoaded: async () => ++polls < 3,
    run: async (command, args) => {
      calls.push([command, ...args]);
      if (args[0] === "bootstrap" && ++bootstraps === 1) throw new Error("Bootstrap failed: 5");
    },
    sleep: async () => {},
  });
  assert.equal(polls, 3);
  assert.deepEqual(calls.map((call) => call[1]), ["bootout", "bootstrap", "bootstrap"]);
});

test("Linux render produces deterministic systemd user unit and URL desktop entry", () => {
  const first = renderLinux(options);
  assert.deepEqual(first, renderLinux(options));
  assert.match(first.unit, /ExecStart="\/Users\/Example User\/node&tools\/node" "\/tmp\/valuation bridge\/cli\.mjs" serve/);
  assert.match(first.unit, /Restart=on-failure/);
  assert.match(first.unit, /RestartSec=30/);
  assert.match(first.desktop, /MimeType=x-scheme-handler\/valuation;/);
  assert.match(first.desktop, /Exec=systemctl --user start valuation-bridge\.service/);
});

test("Windows render produces deterministic HKCU startup and protocol registrations", () => {
  const input = { nodePath: "C:\\Program Files\\nodejs\\node.exe", cliPath: "C:\\Users\\Jane Doe\\bridge\\cli.mjs", localAppData: "C:\\Users\\Jane Doe\\AppData\\Local" };
  const first = renderWin32(input);
  assert.deepEqual(first, renderWin32(input));
  assert.ok(first.registryWrites.some(({ key }) => key === "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"));
  assert.ok(first.registryWrites.some(({ key }) => key === "HKCU\\Software\\Classes\\valuation\\shell\\open\\command"));
  const commands = first.registryWrites.filter(({ key }) => key === "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" || key.endsWith("\\shell\\open\\command"));
  assert.equal(commands.length, 2);
  for (const { value } of commands) {
    assert.ok(value.length < 260);
    assert.match(value, /^powershell\.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "C:\\Users\\Jane Doe\\AppData\\Local\\ValuationBridge\\launch\.ps1"$/);
  }
  assert.match(first.launcher, /Start-Process -PassThru -WindowStyle Hidden/);
  assert.match(first.launcher, /'C:\\Program Files\\nodejs\\node\.exe'/);
  assert.match(first.launcher, /'"C:\\Users\\Jane Doe\\bridge\\cli\.mjs"'/);
  assert.match(first.launcher, /serve/);
});

test("installation copies the CLI to a stable user path and detects missing Node", async () => {
  const home = await mkdtemp(join(tmpdir(), "valuation-install-test-"));
  try {
    const source = join(home, "npx-cache-cli.mjs");
    const nodePath = join(home, "node");
    await writeFile(source, "console.log('bridge')\n");
    await writeFile(nodePath, "node");
    const installed = await stageCli({ nodePath, cliPath: source, home, platform: "darwin" });
    assert.equal(installed.cliPath, join(home, ".businessweb-valuation", "cli.mjs"));
    assert.equal(await readFile(installed.cliPath, "utf8"), "console.log('bridge')\n");
    await rm(source);
    assert.equal((await installationStatus({ home, platform: "darwin" })).ok, true);
    await rm(installed.cliPath);
    assert.equal((await installationStatus({ home, platform: "darwin" })).ok, false);
    await writeFile(installed.cliPath, "console.log('bridge')\n");
    await rm(nodePath);
    assert.equal((await installationStatus({ home, platform: "darwin" })).ok, false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("Windows keeps its copied CLI under LOCALAPPDATA", () => {
  assert.equal(
    installationDir({ platform: "win32", localAppData: "C:\\Users\\Jane Doe\\AppData\\Local" }),
    "C:\\Users\\Jane Doe\\AppData\\Local\\businessweb-valuation",
  );
});
