import { describe, it, expect } from "vitest";
import { isRotatable, isPrunable, isRotatedFileName, MAX_LOG_BYTES } from "@desktop-shared/log-rotation";

describe("log rotation rules", () => {
  it("rotates above the limit, not at it", () => {
    expect(isRotatable(MAX_LOG_BYTES)).toBe(false);
    expect(isRotatable(MAX_LOG_BYTES + 1)).toBe(true);
  });
  it("prunes files older than a week", () => {
    const week = 7 * 24 * 60 * 60 * 1000;
    expect(isPrunable(week)).toBe(false);
    expect(isPrunable(week + 1)).toBe(true);
  });
  it("recognises only rotated log names", () => {
    expect(isRotatedFileName("server.log.1")).toBe(true);
    expect(isRotatedFileName("server.log")).toBe(false);
    expect(isRotatedFileName("desktop.log.12")).toBe(true);
  });
});
