import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { INSTALL_COMMAND, UNINSTALL_COMMAND } from "../../services/localBridge";
import BridgeHelp from "./BridgeHelp";

afterEach(cleanup);
const text = () => document.body.textContent || "";

describe("BridgeHelp", () => {
  it("mac：指引用 ⌘+空格 搜索终端", () => {
    render(<BridgeHelp platform="mac" />);
    expect(text()).toMatch(/终端/);
    expect(text()).toMatch(/⌘/);
  });
  it("windows：指引用 PowerShell，且不出现 ⌘", () => {
    render(<BridgeHelp platform="windows" />);
    expect(text()).toMatch(/PowerShell/);
    expect(text()).not.toMatch(/⌘/);
  });
  it("linux：提示打开终端程序", () => {
    render(<BridgeHelp platform="linux" />);
    expect(text()).toMatch(/打开.*终端/);
  });
  it("所有平台都说明 Node.js 前提、并给出常见问题与卸载命令", () => {
    for (const platform of ["mac", "windows", "linux"] as const) {
      cleanup();
      render(<BridgeHelp platform={platform} />);
      expect(text()).toMatch(/Node\.js 20/);
      expect(text()).toMatch(/nodejs\.org/);
      expect(text()).toMatch(/Chrome 或 Edge/);
      expect(screen.getByText(UNINSTALL_COMMAND)).toBeTruthy();
    }
  });
  it("不重复展示安装命令本身（由上层组件负责）", () => {
    render(<BridgeHelp platform="mac" />);
    expect(screen.queryByText(INSTALL_COMMAND)).toBeNull();
  });
});
