import { describe, it, expect } from "vitest";
import { createServer } from "node:net";
import { findFreePort } from "@desktop/backend/ports";

describe("findFreePort", () => {
  it("returns a loopback port that can be bound immediately", async () => {
    const port = await findFreePort();
    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThan(1023);
    await new Promise<void>((resolve, reject) => {
      const s = createServer();
      s.once("error", reject);
      s.listen(port, "127.0.0.1", () => s.close(() => resolve()));
    });
  });
});
