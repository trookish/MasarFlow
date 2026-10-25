import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/canvas/embed/route";

const call = (u: string) => GET(new NextRequest(`http://localhost:3000/api/canvas/embed?url=${encodeURIComponent(u)}`));

describe("/api/canvas/embed private-network policy", () => {
  it.each(["http://169.254.169.254/latest/meta-data/", "http://127.0.0.1:3000/api/fs/list", "http://[::1]/", "http://localhost/"])(
    "rejects %s with 400 before any request",
    async (u) => {
      const res = await call(u);
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/Blocked/);
    },
  );
  it("rejects a non-http scheme", async () => {
    const res = await call("file:///C:/Windows/win.ini");
    expect(res.status).toBe(400);
  });
});
