import { describe, it, expect } from "vitest";
import { shouldBackup } from "@/lib/db/auto-backup";

const H = 3_600_000;
describe("shouldBackup", () => {
  const now = 1_000 * H;
  it("backs up immediately when none exists and the workspace has data", () => {
    expect(shouldBackup({ now, lastBackupAt: null, dirty: 0, hasData: true })).toBe(true);
    expect(shouldBackup({ now, lastBackupAt: null, dirty: 0, hasData: false })).toBe(false);
  });
  it("on boot, refreshes a stale backup only if something changed", () => {
    expect(shouldBackup({ now, lastBackupAt: now - 21 * H, dirty: 1, hasData: true })).toBe(true);
    expect(shouldBackup({ now, lastBackupAt: now - 21 * H, dirty: 0, hasData: true })).toBe(false);
  });
  it("while running, waits two hours between backups", () => {
    expect(shouldBackup({ now, lastBackupAt: now - 1 * H, dirty: 50, hasData: true })).toBe(false);
    expect(shouldBackup({ now, lastBackupAt: now - 3 * H, dirty: 1, hasData: true })).toBe(true);
  });
});
