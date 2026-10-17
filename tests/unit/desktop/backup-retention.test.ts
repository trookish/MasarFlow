import { describe, it, expect } from "vitest";
import { backupFileName, isBackupFileName, planRetention } from "@desktop/backups";

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 16, 12, 0, 0);
const f = (hoursAgo: number) => ({
  name: backupFileName(new Date(now - hoursAgo * 3_600_000)),
  mtimeMs: now - hoursAgo * 3_600_000,
});

describe("backup file names", () => {
  it("round-trips and rejects foreign names", () => {
    const n = backupFileName(new Date(Date.UTC(2026, 9, 16, 8, 5, 3)));
    expect(n).toBe("masarflow-20261016-080503.json.gz");
    expect(isBackupFileName(n)).toBe(true);
    for (const bad of ["x.json", "../masarflow-20261016-080503.json.gz", "masarflow-1.json.gz"]) expect(isBackupFileName(bad)).toBe(false);
  });
});

describe("planRetention", () => {
  it("keeps everything while there are few files", () => {
    expect(planRetention([f(1), f(2), f(3)], now)).toEqual([]);
  });
  it("keeps the 5 newest, the newest per day for 7 days and the newest per week for 4 weeks", () => {
    const files = Array.from({ length: 60 }, (_, i) => f(i * 6)); // a backup every 6 hours for 15 days
    const doomed = new Set(planRetention(files, now));
    const kept = files.filter((x) => !doomed.has(x.name));
    expect(kept.length).toBeLessThan(files.length);
    expect(kept.length).toBeGreaterThanOrEqual(11);
    for (const newest of files.slice(0, 5)) expect(doomed.has(newest.name)).toBe(false);
    // every calendar day that has a file younger than 7 days keeps at least one
    const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
    const young = (x: { mtimeMs: number }): boolean => now - x.mtimeMs < 7 * DAY;
    const daysIn = new Set(files.filter(young).map((x) => dayOf(x.mtimeMs)));
    const daysKept = new Set(kept.filter(young).map((x) => dayOf(x.mtimeMs)));
    expect(daysKept).toEqual(daysIn);
  });
  it("deletes files older than 4 weeks unless they are among the newest 5", () => {
    const old = [f(24 * 40), f(24 * 41)];
    const doomed = planRetention([f(1), f(2), f(3), f(4), f(5), ...old], now);
    expect(doomed.sort()).toEqual(old.map((o) => o.name).sort());
  });
});
