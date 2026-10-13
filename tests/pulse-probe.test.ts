import { describe, it, expect, vi } from "vitest";
import { isPublicPulseIp, parsePulseUrl, probeProductWebsite } from "@/lib/moderation/pulse-probe";

function dependencies() {
  return { resolve: vi.fn(async () => ["93.184.215.14"]), request: vi.fn(async () => ({ status: 200, location: null as string | null })) };
}

describe("Pulse egress safety", () => {
  it.each(["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "224.0.0.1", "198.18.0.1", "0.0.0.0", "::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "64:ff9b::a00:1", "2002:a00:1::", "fc00::1", "fe80::1", "2001:db8::1", "3fff::1"])("rejects non-public address %s", address => {
    expect(isPublicPulseIp(address)).toBe(false);
  });
  it.each(["93.184.215.14", "1.1.1.1", "2606:4700:4700::1111", "2001:4860:4860::8888"])("allows public address %s", address => {
    expect(isPublicPulseIp(address)).toBe(true);
  });
  it.each(["http://127.1", "http://0x7f000001", "http://2130706433", "http://[::ffff:7f00:1]", "https://localhost", "https://foo.internal", "http://example.com:8080", "https://secret:password@example.com", "file:///etc/passwd"])("rejects unsafe URL %s", url => {
    expect(() => parsePulseUrl(url)).toThrow("blocked_target");
  });
  it("checks every DNS answer and makes no request when one is private", async () => {
    const deps = dependencies();
    deps.resolve.mockResolvedValue(["93.184.215.14", "10.0.0.1"]);
    expect(await probeProductWebsite("https://example.com", deps)).toMatchObject({ outcome: "unknown", reason: "blocked_target" });
    expect(deps.request).not.toHaveBeenCalled();
  });
  it("blocks a redirect to a private host before connecting", async () => {
    const deps = dependencies();
    deps.request.mockResolvedValueOnce({ status: 302, location: "http://169.254.169.254/latest/meta-data/" });
    expect(await probeProductWebsite("https://example.com", deps)).toMatchObject({ outcome: "unknown", reason: "blocked_target" });
    expect(deps.request).toHaveBeenCalledTimes(1);
  });
  it("resolves and revalidates redirect DNS, including a changed answer for the same host", async () => {
    const deps = dependencies();
    deps.resolve.mockResolvedValueOnce(["93.184.215.14"]).mockResolvedValueOnce(["127.0.0.1"]);
    deps.request.mockResolvedValueOnce({ status: 302, location: "/new" });
    expect(await probeProductWebsite("https://example.com", deps)).toMatchObject({ outcome: "unknown", reason: "blocked_target" });
    expect(deps.request).toHaveBeenCalledTimes(1);
  });
  it("follows a bounded public HTTPS redirect and reports the actual final status", async () => {
    const deps = dependencies();
    deps.request.mockResolvedValueOnce({ status: 301, location: "https://www.example.com/" }).mockResolvedValueOnce({ status: 503, location: null });
    expect(await probeProductWebsite("https://example.com", deps)).toMatchObject({ outcome: "down", httpStatus: 503 });
    expect(deps.resolve).toHaveBeenNthCalledWith(2, "www.example.com");
  });
  it("caps redirect loops", async () => {
    const deps = dependencies();
    deps.request.mockResolvedValue({ status: 302, location: "/again" });
    expect(await probeProductWebsite("https://example.com", deps)).toMatchObject({ outcome: "unknown", reason: "redirect_limit" });
    expect(deps.request).toHaveBeenCalledTimes(4);
  });
  it("does not label unsupported HEAD checks as downtime", async () => {
    const deps = dependencies();
    deps.request.mockResolvedValue({ status: 405, location: null });
    expect(await probeProductWebsite("https://example.com", deps)).toMatchObject({ outcome: "unknown", reason: "head_unsupported" });
  });
  it("bounds DNS resolution as well as HTTP requests", async () => {
    vi.useFakeTimers();
    try {
      const deps = dependencies();
      deps.resolve.mockImplementation(() => new Promise(() => {}));
      const pending = probeProductWebsite("https://example.com", deps, 50);
      await vi.advanceTimersByTimeAsync(51);
      expect(await pending).toMatchObject({ outcome: "down", reason: "timeout" });
      expect(deps.request).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it("aborts an in-flight HTTP request at the total deadline", async () => {
    vi.useFakeTimers();
    try {
      const resolve = vi.fn(async () => ["93.184.215.14"]);
      let signal: AbortSignal | undefined;
      const request = vi.fn(async (_url: URL, _addresses: string[], input: AbortSignal) => {
        signal = input;
        return new Promise<{ status: number; location: null }>(() => {});
      });
      const pending = probeProductWebsite("https://example.com", { resolve, request }, 50);
      await vi.advanceTimersByTimeAsync(51);
      expect(await pending).toMatchObject({ outcome: "down", reason: "timeout" });
      expect(signal?.aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});
