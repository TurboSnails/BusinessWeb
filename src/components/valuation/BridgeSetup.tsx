import React, { useEffect, useRef, useState } from "react";
import { Check, Copy, Server } from "lucide-react";
import { detectPlatform, ensureBridge, INSTALL_COMMAND, type BridgeState } from "../../services/localBridge";
import BridgeHelp from "./BridgeHelp";

// 安装命令引导：needsInstall 时轮询本机服务，装好后自动变为已连接
export default function BridgeSetup({
  state,
  onConnected,
  pollMs = 2000,
}: {
  state: BridgeState;
  onConnected?: () => void;
  pollMs?: number;
}): JSX.Element {
  const [connected, setConnected] = useState(state.kind === "connected");
  const [copied, setCopied] = useState(false);
  const notify = useRef(onConnected);
  notify.current = onConnected;

  useEffect(() => {
    if (state.kind !== "needsInstall") return;
    let alive = true;
    const timer = setInterval(async () => {
      const next = await ensureBridge({ launch: false }).catch(() => null);
      if (!alive || next?.kind !== "connected") return;
      alive = false;
      clearInterval(timer);
      setConnected(true);
      notify.current?.();
    }, pollMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [state.kind, pollMs]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (connected)
    return (
      <p className="bridge-setup" role="status">
        <Server size={14} aria-hidden="true" /> 本地服务已连接
      </p>
    );
  if (state.kind === "starting")
    return (
      <p className="bridge-setup" role="status">
        正在启动本地服务…
      </p>
    );
  if (state.kind === "unsupportedBrowser")
    return (
      <p className="bridge-setup" role="alert">
        Safari 会拦截网页访问本机服务，请使用 Chrome 或 Edge 打开本页。
      </p>
    );
  if (state.kind === "portConflict")
    return (
      <p className="bridge-setup" role="alert">
        8788 端口被其他程序占用，请关闭占用程序后点重新连接。
      </p>
    );
  if (state.kind === "needsInstall")
    return (
      <div className="bridge-setup">
        <p>首次使用需要在本机安装一次估值服务，复制下面这行命令到终端运行（无需 sudo）：</p>
        <pre>
          <code>{INSTALL_COMMAND}</code>
        </pre>
        <button type="button" onClick={() => void copy()}>
          {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          复制安装命令
        </button>
        {copied && <span role="status"> 已复制</span>}
        <BridgeHelp platform={detectPlatform(typeof navigator === "undefined" ? "" : navigator.userAgent)} />
      </div>
    );
  return <></>;
}
