import React from "react";
import { STATUS_COMMAND, UNINSTALL_COMMAND, type Platform } from "../../services/localBridge";

const OPEN_TERMINAL: Record<Platform, string> = {
  mac: "按 ⌘+空格，输入“终端”并回车，打开终端。",
  windows: "按 Win 键，输入 PowerShell（或“终端”）并回车，打开它。",
  linux: "打开你系统自带的终端程序。",
};

// 安装引导里的“怎么做 + 出问题怎么办”，按系统给出对应说明
export default function BridgeHelp({ platform }: { platform: Platform }): JSX.Element {
  return (
    <div className="bridge-help">
      <ol>
        <li>{OPEN_TERMINAL[platform]}</li>
        <li>
          需要 Node.js 20 或更高版本。输入 <code>node -v</code> 检查；如果提示找不到命令或版本过低，
          请到 <a href="https://nodejs.org" target="_blank" rel="noreferrer">nodejs.org</a> 安装 LTS 版本，
          装完<strong>重新打开终端</strong>再继续。
        </li>
        <li>粘贴上面的安装命令并回车，等待出现“安装完成”。无需管理员权限。</li>
        <li>回到本页，会自动连接，不需要刷新。</li>
      </ol>
      <details>
        <summary>遇到问题？</summary>
        <ul>
          <li>
            <strong>提示 command not found、不是内部或外部命令：</strong>
            说明还没装 Node.js，或装完没有重新打开终端。
          </li>
          <li>
            <strong>装好后本页仍显示未连接：</strong>
            请使用 Chrome 或 Edge 打开本页（Safari 会拦截）；若浏览器地址栏弹出“访问本地网络/本地设备”的请求，请选允许；
            广告拦截或隐私插件（如 Brave Shields）也可能拦截，可对本站暂时关闭；然后点“重新连接”。
          </li>
          {platform === "windows" && (
            <li>
              <strong>Windows 防火墙或 SmartScreen 弹窗：</strong>
              服务只监听本机 127.0.0.1，选择“允许”或“仍要运行”即可。
            </li>
          )}
          {platform === "linux" && (
            <li>
              <strong>开机不自动启动：</strong>
              自启依赖 systemd 用户服务；没有 systemd 的系统可在终端运行 <code>npx -y businessweb-valuation-bridge@latest serve</code> 并保持窗口不关。
            </li>
          )}
          <li>
            <strong>已安装但检测不到 codex、claude 等命令行：</strong>
            这些命令行需要已安装并登录；若是旧版本服务，重新运行上面的安装命令即可更新。
          </li>
          <li>
            查看服务状态：<code>{STATUS_COMMAND}</code>
          </li>
          <li>
            不想用了，卸载：<code>{UNINSTALL_COMMAND}</code>
          </li>
          <li>实在连不上，也可以用页面下方的 DCF 计算器手动估值。</li>
        </ul>
      </details>
    </div>
  );
}
