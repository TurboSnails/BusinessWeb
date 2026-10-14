import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureBridge, INSTALL_COMMAND } from "./localBridge";

const chrome = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";
const safari = "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15";
const ok = (extra = {}) =>
  ({ ok: true, json: async () => ({ ok: true, service: "valuation", version: 2, features: ["a"], token: "t", ...extra }) }) as Response;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const deps = (fetchImpl: ReturnType<typeof vi.fn>, userAgent = chrome) => {
  const launch = vi.fn();
  return { launch, deps: { fetch: fetchImpl as unknown as typeof fetch, launch, userAgent, hosted: true, base: "http://127.0.0.1:8788/api/valuation" } };
};

describe("ensureBridge", () => {
  it("connects when /health reports the valuation service", async () => {
    const f = vi.fn().mockResolvedValue(ok());
    const d = deps(f);
    await expect(ensureBridge({ deps: d.deps })).resolves.toEqual({ kind: "connected", version: 2, features: ["a"] });
    expect(d.launch).not.toHaveBeenCalled();
  });

  it("launches valuation://start once and polls every 500ms until connected", async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error("down")).mockRejectedValueOnce(new Error("down")).mockRejectedValueOnce(new Error("down")).mockResolvedValue(ok());
    const d = deps(f);
    const states: string[] = [];
    const p = ensureBridge({ deps: d.deps, onState: (s) => states.push(s.kind) });
    await vi.advanceTimersByTimeAsync(1500);
    await expect(p).resolves.toMatchObject({ kind: "connected" });
    expect(d.launch).toHaveBeenCalledTimes(1);
    expect(d.launch).toHaveBeenCalledWith("valuation://start");
    expect(f).toHaveBeenCalledTimes(4);
    expect(states).toContain("starting");
  });

  it("gives needsInstall after 8s and launches only once", async () => {
    const f = vi.fn().mockRejectedValue(new Error("down"));
    const d = deps(f);
    const p = ensureBridge({ deps: d.deps });
    await vi.advanceTimersByTimeAsync(9000);
    await expect(p).resolves.toEqual({ kind: "needsInstall", command: INSTALL_COMMAND });
    expect(d.launch).toHaveBeenCalledTimes(1);
  });

  it("reports portConflict (no launch) when /health answers with another service", async () => {
    const f = vi.fn().mockResolvedValue(ok({ service: "other" }));
    const d = deps(f);
    await expect(ensureBridge({ deps: d.deps })).resolves.toEqual({ kind: "portConflict" });
    expect(d.launch).not.toHaveBeenCalled();
  });

  it("reports portConflict when /health answers with non-JSON", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError("x"); } } as unknown as Response);
    const d = deps(f);
    await expect(ensureBridge({ deps: d.deps })).resolves.toEqual({ kind: "portConflict" });
    expect(d.launch).not.toHaveBeenCalled();
  });

  it("reports portConflict when the conflict only shows up while polling after launch", async () => {
    const f = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(ok({ service: "other" }));
    const d = deps(f);
    const p = ensureBridge({ deps: d.deps });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toEqual({ kind: "portConflict" });
  });

  it("keeps total wait strict: hanging probes end by ~8.5s after launch", async () => {
    const f = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_res, rej) => {
      init?.signal?.addEventListener("abort", () => rej(new Error("aborted")));
    }));
    const d = deps(f as unknown as ReturnType<typeof vi.fn>);
    let result: unknown;
    const p = ensureBridge({ deps: d.deps }).then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(2000 + 8500);
    await p;
    expect(result).toEqual({ kind: "needsInstall", command: INSTALL_COMMAND });
  });

  it("reports unsupportedBrowser for Safari without probing", async () => {
    const f = vi.fn();
    const d = deps(f, safari);
    await expect(ensureBridge({ deps: d.deps })).resolves.toEqual({ kind: "unsupportedBrowser" });
    expect(f).not.toHaveBeenCalled();
    expect(d.launch).not.toHaveBeenCalled();
  });
});

import { bridgeOutdated, compareVersions, detectPlatform, MIN_BRIDGE_VERSION } from "./localBridge";

describe("版本与平台判断", () => {
  it("compareVersions 按数字逐段比较", () => {
    expect(compareVersions("0.1.2", "0.1.10")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("0.1.2", "0.1.2")).toBe(0);
  });
  it("没有版本号（旧服务不上报）或低于最低版本都算过旧", () => {
    expect(bridgeOutdated(undefined)).toBe(true);
    expect(bridgeOutdated(null)).toBe(true);
    expect(bridgeOutdated("0.1.1")).toBe(true);
    expect(bridgeOutdated(MIN_BRIDGE_VERSION)).toBe(false);
    expect(bridgeOutdated("9.0.0")).toBe(false);
  });
  it("detectPlatform 区分 mac / windows / linux", () => {
    expect(detectPlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120")).toBe("mac");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120")).toBe("windows");
    expect(detectPlatform("Mozilla/5.0 (X11; Linux x86_64) Chrome/120")).toBe("linux");
    expect(detectPlatform("")).toBe("linux");
  });
  it("连接成功时带上服务上报的 bridgeVersion", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ service: "valuation", version: 2, features: [], bridgeVersion: "0.1.2" }) });
    const state = await ensureBridge({ deps: { fetch: fetchMock as unknown as typeof fetch, hosted: true, userAgent: "Chrome", launch: () => {}, base: "x" } });
    expect(state).toMatchObject({ kind: "connected", bridgeVersion: "0.1.2" });
  });
});
