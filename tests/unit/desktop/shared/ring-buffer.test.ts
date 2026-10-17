import { describe, it, expect } from "vitest";
import { RingBuffer } from "@desktop-shared/ring-buffer";

describe("RingBuffer", () => {
  it("keeps the newest N lines", () => {
    const b = new RingBuffer(3);
    ["a", "b", "c", "d"].forEach((l) => b.push(l));
    expect(b.tail(2)).toEqual(["c", "d"]);
    expect(b.tail(10)).toEqual(["b", "c", "d"]);
    expect(b.size).toBe(3);
  });
  it("rejects a nonsense capacity", () => {
    expect(() => new RingBuffer(0)).toThrow(/positive/);
  });
});
