import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenCodeClient } from "@/lib/opencode/client";
import type { OpenCodeConfig } from "@/lib/opencode/config";
import { OpenCodeError } from "@/lib/opencode/errors";

const config: OpenCodeConfig = {
  baseUrl: "http://127.0.0.1:9999",
  username: "opencode",
  password: "secret",
  workspaceDir: "C:\\workspace",
  permissions: { edit: "ask", bash: "ask", webfetch: "ask" },
  firstEventMs: 1000,
  idleMs: 1000,
  totalMs: 1000,
  modelCacheTtlMs: 1000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("OpenCodeClient", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("adds basic auth headers when a password is configured", async () => {
    let captured: HeadersInit | null = null;
    const client = new OpenCodeClient({
      config,
      fetchImpl: (async (input, init) => {
        captured = init?.headers ?? null;
        return jsonResponse({ healthy: true, version: "1.18.15" });
      }) as typeof fetch,
    });
    await client.health();
    const headers = new Headers((captured as HeadersInit | null) ?? {});
    const expected = "Basic " + Buffer.from("opencode:secret").toString("base64");
    expect(headers.get("authorization")).toBe(expected);
  });

  it("omits auth headers when no password is set", async () => {
    let captured: HeadersInit | null = null;
    const client = new OpenCodeClient({
      config: { ...config, password: "" },
      fetchImpl: (async (input, init) => {
        captured = init?.headers ?? null;
        return jsonResponse({ healthy: true });
      }) as typeof fetch,
    });
    await client.health();
    expect(new Headers((captured as HeadersInit | null) ?? {}).has("authorization")).toBe(false);
  });

  it("classifies non-OK responses", async () => {
    const client = new OpenCodeClient({
      config,
      fetchImpl: (async () => jsonResponse({ error: "nope" }, 429)) as typeof fetch,
    });
    await expect(client.health()).resolves.toBeNull(); // health never throws
    await expect(client.sessionStatuses()).rejects.toMatchObject({ kind: "rate_limit" });
  });

  it("surfaces unavailable on network failure, but health returns null", async () => {
    const client = new OpenCodeClient({
      config,
      fetchImpl: (async () => {
        throw new TypeError("fetch failed");
      }) as typeof fetch,
    });
    expect(await client.health()).toBeNull();
    await expect(client.sessionStatuses()).rejects.toMatchObject({ kind: "unavailable", retryable: true });
  });

  it("maps a caller abort to cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const client = new OpenCodeClient({
      config,
      fetchImpl: (async () => {
        throw new DOMException("Aborted", "AbortError");
      }) as typeof fetch,
    });
    await expect(client.getSession("ses_abc", controller.signal)).rejects.toMatchObject({ kind: "cancelled" });
  });

  it("times out slow requests", async () => {
    const client = new OpenCodeClient({
      config,
      timeoutMs: 50,
      fetchImpl: (async (input, init) => {
        const signal = init?.signal as AbortSignal | undefined;
        await new Promise((_, reject) => {
          const t = setTimeout(() => reject(new Error("late")), 500);
          signal?.addEventListener("abort", () => {
            clearTimeout(t);
            reject(new DOMException("Aborted", "AbortError"));
          }, { once: true });
        });
        return jsonResponse({});
      }) as typeof fetch,
    });
    const err = await client.sessionStatuses().catch((e: OpenCodeError) => e);
    expect(err.kind).toBe("timeout");
  });

  it("builds correct query strings for createSession", async () => {
    let capturedUrl = "";
    const client = new OpenCodeClient({
      config,
      fetchImpl: (async (input) => {
        capturedUrl = typeof input === "string" ? input : (input as Request).url;
        return jsonResponse({ id: "ses_x", projectID: "p", directory: "d", title: "", version: "1", time: { created: 0, updated: 0 } });
      }) as typeof fetch,
    });
    await client.createSession("C:\\dir with spaces", { title: "t" });
    expect(capturedUrl).toContain("/session?");
    // URLSearchParams encodes spaces as "+".
    expect(capturedUrl).toContain(encodeURIComponent("C:\\dir") + "+with+spaces");
  });

  it("connectedModels returns only connected providers with models", async () => {
    const client = new OpenCodeClient({
      config,
      fetchImpl: (async () =>
        jsonResponse({
          all: [
            {
              id: "a",
              name: "A",
              source: "config",
              models: { m1: { id: "m1", providerID: "a", name: "M1", capabilities: {} } },
            },
            {
              id: "b",
              name: "B",
              source: "config",
              models: {},
            },
          ],
          connected: ["a"],
        })) as typeof fetch,
    });
    const result = await client.connectedModels();
    expect(result).toHaveLength(1);
    expect(result[0].provider.id).toBe("a");
    expect(result[0].models[0].id).toBe("m1");
  });
});
