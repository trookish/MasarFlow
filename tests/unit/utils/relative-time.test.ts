import { describe, expect, it } from "vitest";
import { formatRelativeTime } from "@/lib/utils/relative-time";

const NOW = new Date(2026, 9, 16, 12, 0, 0).getTime();
const MIN = 60 * 1000;

describe("formatRelativeTime", () => {
  it("counts up in the units a person would use", () => {
    expect(formatRelativeTime(NOW - 5 * 1000, NOW)).toBe("just now");
    expect(formatRelativeTime(NOW - MIN, NOW)).toBe("1 minute ago");
    expect(formatRelativeTime(NOW - 59 * MIN, NOW)).toBe("59 minutes ago");
    expect(formatRelativeTime(NOW - 3 * 60 * MIN, NOW)).toBe("3 hours ago");
    expect(formatRelativeTime(NOW - 2 * 24 * 60 * MIN, NOW)).toBe("2 days ago");
  });

  it("falls back to a plain date after a week and never goes negative", () => {
    const old = NOW - 30 * 24 * 60 * MIN;
    expect(formatRelativeTime(old, NOW)).toBe(new Date(old).toLocaleDateString());
    expect(formatRelativeTime(NOW + MIN, NOW)).toBe("just now");
  });
});
