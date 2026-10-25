import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/obsidian/media/route";
import { MEDIA_SESSION_TTL_MS, createMediaSession, getMediaSession } from "@/lib/server/media-sessions";

const base = "http://localhost:3000/api/obsidian/media";
const post = (body: unknown) =>
  POST(new NextRequest(base, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

describe("/api/obsidian/media", () => {
  it("issues a session for a loopback Obsidian server; the key stays out of the response", async () => {
    const res = await post({ baseUrl: "https://127.0.0.1:27124", apiKey: "secret-key-value" });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("secret-key-value");
    expect(JSON.parse(text).session).toMatch(/^[\w-]{40,}$/);
  });
  it("refuses non-loopback targets", async () => {
    expect((await post({ baseUrl: "https://example.com", apiKey: "k" })).status).toBe(400);
  });
  it("rejects any URL that still carries an API key", async () => {
    const res = await GET(new NextRequest(`${base}?baseUrl=https://127.0.0.1:27124&apiKey=k&path=a.png`));
    expect(res.status).toBe(400);
  });
  it("rejects an unknown session", async () => {
    const res = await GET(new NextRequest(`${base}?session=nope&path=a.png`));
    expect(res.status).toBe(401);
  });
});

describe("media sessions", () => {
  it("expire after the TTL", () => {
    const id = createMediaSession("https://127.0.0.1:27124/", "k", 1000);
    expect(getMediaSession(id, 1000 + MEDIA_SESSION_TTL_MS - 1)?.apiKey).toBe("k");
    expect(getMediaSession(id, 1000 + MEDIA_SESSION_TTL_MS)).toBeNull();
  });
});
