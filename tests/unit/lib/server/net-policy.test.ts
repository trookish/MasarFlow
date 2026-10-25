import { describe, it, expect } from "vitest";
import { assertPublicUrl, isPublicAddress } from "@/lib/server/net-policy";
import { safeFetchText, type Transport } from "@/lib/server/safe-fetch";

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "100.64.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fd00::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "0:0:0:0:0:ffff:10.0.0.1",
    "64:ff9b::a00:1",
    "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
  it.each(["1.1.1.1", "93.184.216.34", "172.32.0.1", "2606:4700::1111", "::ffff:1.1.1.1"])("allows %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });
});

describe("assertPublicUrl", () => {
  const resolveTo = (address: string) => async () => [{ address }];
  it("rejects non-http schemes, credentials and localhost names", async () => {
    await expect(assertPublicUrl(new URL("file:///etc/passwd"))).rejects.toThrow(/scheme/);
    await expect(assertPublicUrl(new URL("https://u:p@example.com"), resolveTo("1.1.1.1"))).rejects.toThrow(
      /credentials/,
    );
    await expect(assertPublicUrl(new URL("http://app.localhost/"))).rejects.toThrow(/private/);
  });
  it("rejects a public name that resolves to a private address", async () => {
    await expect(assertPublicUrl(new URL("https://rebind.test/"), resolveTo("10.0.0.5"))).rejects.toThrow(/private/);
  });
  it("rejects when any resolved address is private", async () => {
    const mixed = async () => [{ address: "1.1.1.1" }, { address: "127.0.0.1" }];
    await expect(assertPublicUrl(new URL("https://mixed.test/"), mixed)).rejects.toThrow(/private/);
  });
  it("returns the address to pin for a public host", async () => {
    await expect(assertPublicUrl(new URL("https://example.com/"), resolveTo("93.184.216.34"))).resolves.toBe(
      "93.184.216.34",
    );
  });
});

describe("safeFetchText", () => {
  const publicResolver = async () => [{ address: "93.184.216.34" }];
  it("rejects a redirect hop that points at loopback", async () => {
    const seen: string[] = [];
    const transport: Transport = async (url) => {
      seen.push(url.toString());
      return { status: 302, headers: { location: "http://127.0.0.1:3000/api/fs/shell" }, body: "" };
    };
    await expect(safeFetchText("https://example.com/", { resolve: publicResolver, transport })).rejects.toThrow(
      /private/,
    );
    expect(seen).toEqual(["https://example.com/"]);
  });
  it("pins every hop to the vetted address and follows public redirects", async () => {
    const calls: Array<[string, string]> = [];
    const transport: Transport = async (url, pinned) => {
      calls.push([url.toString(), pinned]);
      if (url.pathname === "/a") return { status: 301, headers: { location: "/b" }, body: "" };
      return { status: 200, headers: { "content-type": "text/html" }, body: "<title>ok</title>" };
    };
    const res = await safeFetchText("https://example.com/a", { resolve: publicResolver, transport });
    expect(res.finalUrl).toBe("https://example.com/b");
    expect(calls).toEqual([
      ["https://example.com/a", "93.184.216.34"],
      ["https://example.com/b", "93.184.216.34"],
    ]);
  });
  it("stops after the redirect limit", async () => {
    let n = 0;
    const transport: Transport = async () => ({ status: 302, headers: { location: `/r${n++}` }, body: "" });
    await expect(
      safeFetchText("https://example.com/", { resolve: publicResolver, transport, maxRedirects: 3 }),
    ).rejects.toThrow(/Too many redirects/);
    expect(n).toBe(4);
  });
});
