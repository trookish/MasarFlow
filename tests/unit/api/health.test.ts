import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("reports ok and the build version", async () => {
    process.env.MASARFLOW_VERSION = "9.9.9-test";
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, version: "9.9.9-test" });
  });
});
