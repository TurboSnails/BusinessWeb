import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const ensureBridge = vi.fn();
vi.mock("../../services/localBridge", async (original) => ({
  ...(await original<typeof import("../../services/localBridge")>()),
  ensureBridge: (...args: unknown[]) => ensureBridge(...args),
}));
import { INSTALL_COMMAND } from "../../services/localBridge";
import BridgeSetup from "./BridgeSetup";
import { backendLabel, loginHint, loginHintForError } from "./backends";

afterEach(() => {
  cleanup();
  ensureBridge.mockReset();
});

describe("BridgeSetup", () => {
  it("needsInstall：点击复制安装命令会写入剪贴板", async () => {
    ensureBridge.mockResolvedValue({ kind: "needsInstall", command: INSTALL_COMMAND });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<BridgeSetup state={{ kind: "needsInstall", command: INSTALL_COMMAND }} pollMs={20} />);
    expect(screen.getByText(INSTALL_COMMAND)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "复制安装命令" }));
    expect(writeText).toHaveBeenCalledWith(INSTALL_COMMAND);
    await screen.findByText("已复制");
  });

  it("安装后轮询到服务，自动变为已连接并通知页面，无需刷新", async () => {
    ensureBridge
      .mockResolvedValueOnce({ kind: "needsInstall", command: INSTALL_COMMAND })
      .mockResolvedValue({ kind: "connected", features: [] });
    const onConnected = vi.fn();
    render(<BridgeSetup state={{ kind: "needsInstall", command: INSTALL_COMMAND }} onConnected={onConnected} pollMs={20} />);
    await screen.findByText("本地服务已连接");
    await waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1));
    expect(ensureBridge).toHaveBeenCalledWith({ launch: false });
    expect(screen.queryByRole("button", { name: "复制安装命令" })).toBeNull();
  });

  it("unsupportedBrowser 提示使用 Chrome 或 Edge，且不轮询", () => {
    render(<BridgeSetup state={{ kind: "unsupportedBrowser" }} pollMs={20} />);
    expect(screen.getByText(/请使用 Chrome 或 Edge/)).toBeTruthy();
    expect(ensureBridge).not.toHaveBeenCalled();
  });

  it("portConflict 提示端口被占用，不显示安装命令且不轮询", () => {
    render(<BridgeSetup state={{ kind: "portConflict" }} pollMs={20} />);
    expect(screen.getByText(/8788 端口被其他程序占用，请关闭占用程序后点重新连接/)).toBeTruthy();
    expect(screen.queryByText(INSTALL_COMMAND)).toBeNull();
    expect(ensureBridge).not.toHaveBeenCalled();
  });

  it("starting 显示正在启动本地服务…", () => {
    render(<BridgeSetup state={{ kind: "starting" }} pollMs={20} />);
    expect(screen.getByText("正在启动本地服务…")).toBeTruthy();
  });
});

describe("后端显示名与登录提示", () => {
  it("agy→Antigravity，kimi→Kimi，其余原样", () => {
    expect(backendLabel("agy")).toBe("Antigravity");
    expect(backendLabel("kimi")).toBe("Kimi");
    expect(backendLabel("codex")).toBe("codex");
  });
  it("按后端给出登录命令", () => {
    expect(loginHint("codex")).toContain("codex login");
    expect(loginHint("claude")).toContain("/login");
    expect(loginHint("kimi")).toContain("kimi login");
    expect(loginHint("agy")).toContain("agy");
    expect(loginHint("pi")).toMatch(/pi.*\/login/);
    expect(loginHint("opencode")).toBe("");
  });
  it("登录错误识别：provider.auth_error / Invalid API key / invalid_api_key / unauthorized / HTTP 401", () => {
    for (const m of ["provider.auth_error: bad token", "Invalid API key", "invalid_api_key", "unauthorized", "HTTP 401", "status 401", "401 Unauthorized"])
      expect(loginHintForError("kimi", m), m).toContain("kimi login");
  });
  it("额度类 auth_error 与无关的 401 不触发登录提示", () => {
    expect(loginHintForError("kimi", "provider.auth_error: usage limit reached")).toBe("");
    expect(loginHintForError("kimi", "provider.auth_error 额度已用尽")).toBe("");
    expect(loginHintForError("codex", "处理了 401 条记录")).toBe("");
  });
  it("仅在错误像登录问题时给出提示", () => {
    expect(loginHintForError("codex", "Not logged in, please login")).toContain("codex login");
    expect(loginHintForError("codex", "请先登录")).toContain("codex login");
    expect(loginHintForError("codex", "网络超时")).toBe("");
  });
});
