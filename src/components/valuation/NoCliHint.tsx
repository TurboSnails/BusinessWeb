import React, { useState } from "react";
import { Check, Copy } from "lucide-react";
import { detectPlatform, INSTALL_COMMAND } from "../../services/localBridge";
import BridgeHelp from "./BridgeHelp";

export const noCliDetected = <T extends { installed: boolean }>(backends: T[]) =>
  backends.length > 0 && backends.every((b) => !b.installed);

// 服务已连接但需要用户处理：版本过旧（需更新），或一个 CLI 都没检测到
export default function NoCliHint({ outdated = false, bridgeVersion }: { outdated?: boolean; bridgeVersion?: string | null }): JSX.Element {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="bridge-setup" role="alert">
      {outdated ? (
        <p>
          本机估值服务版本过旧（{bridgeVersion ? `v${bridgeVersion}` : "未标注版本"}），可能检测不到你已安装的命令行（codex、claude 等）。
          请在终端重新运行一次安装命令来更新：
        </p>
      ) : (
        <p>
          本地服务已连接，但没有检测到可用的 AI 命令行（codex、claude、opencode、pi、agy、kimi）。
          请先安装并登录其中任意一个；如果已经装过，重新运行一次安装命令更新服务：
        </p>
      )}
      <pre>
        <code>{INSTALL_COMMAND}</code>
      </pre>
      <button type="button" onClick={() => void copy()}>
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        复制安装命令
      </button>
      {copied && <span role="status"> 已复制</span>}
      <p>更新后点“重新连接”（或刷新本页）即可。</p>
      <BridgeHelp platform={detectPlatform(typeof navigator === "undefined" ? "" : navigator.userAgent)} />
    </div>
  );
}
