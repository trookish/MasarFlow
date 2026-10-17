import { db } from "@/lib/db";
import { exportBackup, serializeBackup } from "@/lib/db/backup";
import { installDirtyTracking, takeDirty } from "@/lib/db/dirty";
import { getDesktop } from "@/lib/desktop/bridge";

const H = 3_600_000;
const APP_VERSION = "0.2.0.0";

export interface BackupDecisionInput {
  now: number;
  lastBackupAt: number | null;
  dirty: number;
  hasData: boolean;
}

/** Pure scheduling rule: minimum 2 h between backups, and only when something changed. */
export function shouldBackup(i: BackupDecisionInput): boolean {
  if (!i.hasData) return false;
  if (i.lastBackupAt === null) return true;
  return i.dirty > 0 && i.now - i.lastBackupAt >= 2 * H;
}

let carriedDirty = 0;

async function hasAnyData(): Promise<boolean> {
  return (await db.projects.count()) > 0;
}

/** Write a backup now (desktop only). Returns the file name, or null when unavailable. */
export async function backupNow(): Promise<string | null> {
  const d = getDesktop();
  if (!d) return null;
  const json = serializeBackup(await exportBackup(db, APP_VERSION));
  return (await d.backups.write(json)).name;
}

/** Start silent rolling backups. Returns a stop function. */
export function startAutoBackup(): () => void {
  const d = getDesktop();
  if (!d) return () => {};
  const off = installDirtyTracking(db);
  const tick = async (): Promise<void> => {
    try {
      carriedDirty += takeDirty();
      const list = await d.backups.list();
      const last = list[0]?.mtimeMs ?? null;
      if (shouldBackup({ now: Date.now(), lastBackupAt: last, dirty: carriedDirty, hasData: await hasAnyData() })) {
        await backupNow();
        carriedDirty = 0;
      }
    } catch (e) {
      console.warn("[auto-backup] failed", e);
    }
  };
  const first = setTimeout(() => void tick(), 20_000);
  const timer = setInterval(() => void tick(), 30 * 60_000);
  return () => {
    clearTimeout(first);
    clearInterval(timer);
    off();
  };
}
