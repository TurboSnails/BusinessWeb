import { execFile } from "node:child_process";
import { mkdir, rm, rmdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { win32 as path } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
const PROTOCOL_KEY = "HKCU\\Software\\Classes\\valuation";

function psQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function encodedCommand(script) {
  return Buffer.from(script, "utf16le").toString("base64");
}

function installationPaths(localAppData) {
  const dir = path.join(localAppData, "ValuationBridge");
  return { dir, launcher: path.join(dir, "launch.ps1"), state: path.join(dir, "bridge.json") };
}

export function render({ nodePath, cliPath, localAppData = "%LOCALAPPDATA%" }) {
  const destination = installationPaths(localAppData);
  const launcher = `$p = Start-Process -PassThru -WindowStyle Hidden -FilePath ${psQuote(nodePath)} -ArgumentList ${psQuote(`"${cliPath}"`)},${psQuote("serve")}
@{ pid = $p.Id; cliPath = ${psQuote(cliPath)} } | ConvertTo-Json -Compress | Set-Content -Encoding UTF8 ${psQuote(destination.state)}
`;
  const value = `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${destination.launcher}"`;
  return {
    launcher,
    registryWrites: [
      { key: RUN_KEY, name: "ValuationBridge", value },
      { key: PROTOCOL_KEY, name: "", value: "URL:Valuation Protocol" },
      { key: PROTOCOL_KEY, name: "URL Protocol", value: "" },
      { key: `${PROTOCOL_KEY}\\shell\\open\\command`, name: "", value },
    ],
  };
}

export async function install({ nodePath, cliPath, home = homedir(), localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local") }) {
  const destination = installationPaths(localAppData);
  const content = render({ nodePath, cliPath, localAppData });
  await mkdir(destination.dir, { recursive: true });
  await writeFile(destination.launcher, content.launcher);
  for (const entry of content.registryWrites) {
    await execFileAsync("reg.exe", ["add", entry.key, entry.name ? "/v" : "/ve", ...(entry.name ? [entry.name] : []), "/t", "REG_SZ", ...(entry.value ? ["/d", entry.value] : []), "/f"]);
  }
  // Start the service for the current login as well as future logins.
  await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-File", destination.launcher]);
}

export async function uninstall({ home = homedir(), localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local") } = {}) {
  const destination = installationPaths(localAppData);
  const stopScript = `$f = ${psQuote(destination.state)}; if (Test-Path $f) { $r = Get-Content -Raw $f | ConvertFrom-Json; $p = Get-CimInstance Win32_Process -Filter "ProcessId = $($r.pid)"; if ($p -and $p.CommandLine -and $p.CommandLine.Contains($r.cliPath) -and $p.CommandLine.Contains('serve')) { Stop-Process -Id $r.pid -Force }; Remove-Item $f -Force }`;
  await execFileAsync("powershell.exe", ["-NoProfile", "-EncodedCommand", encodedCommand(stopScript)]);
  for (const args of [["delete", RUN_KEY, "/v", "ValuationBridge", "/f"], ["delete", PROTOCOL_KEY, "/f"]]) {
    try {
      await execFileAsync("reg.exe", args);
    } catch (error) {
      if (error.code === "ENOENT") throw error;
    }
  }
  await rm(destination.launcher, { force: true });
  try {
    await rmdir(destination.dir);
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTEMPTY") throw error;
  }
}
