import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { INSTALL_COMMAND } from "../../services/localBridge";
import NoCliHint, { noCliDetected } from "./NoCliHint";

afterEach(cleanup);

describe("noCliDetected", () => {
  it("已拿到后端列表且一个都没装时为真", () => {
    expect(noCliDetected([{ id: "codex", installed: false }, { id: "pi", installed: false }])).toBe(true);
  });
  it("列表为空（还没取到）或至少装了一个时为假", () => {
    expect(noCliDetected([])).toBe(false);
    expect(noCliDetected([{ id: "codex", installed: true }, { id: "pi", installed: false }])).toBe(false);
  });
});

describe("NoCliHint", () => {
  it("说明可能原因，并给出可复制的重装命令", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<NoCliHint />);
    expect(screen.getByRole("alert").textContent).toMatch(/没有检测到/);
    expect(screen.getByRole("alert").textContent).toMatch(/重新运行/);
    expect(screen.getByRole("alert").textContent).toMatch(/Node\.js 20/);
    expect(screen.getByText(INSTALL_COMMAND)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /复制安装命令/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(INSTALL_COMMAND));
  });
  it("版本过旧：提示更新并显示当前版本", () => {
    render(<NoCliHint outdated bridgeVersion="0.1.1" />);
    expect(screen.getByRole("alert").textContent).toMatch(/版本过旧.*v0\.1\.1/);
    expect(screen.getByText(INSTALL_COMMAND)).toBeTruthy();
  });
  it("版本过旧且没有上报版本号时标注“未标注版本”", () => {
    render(<NoCliHint outdated bridgeVersion={null} />);
    expect(screen.getByRole("alert").textContent).toMatch(/未标注版本/);
  });
});
