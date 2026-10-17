import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { notesRepo } from "@/lib/db/repos/notes";
import { dayKey, dailyPathKey, dailyTitle, ensureDailyNote, findDailyNote } from "@/lib/vault/daily";
import { pathFor } from "@/lib/vault/paths";
import { noteRow } from "./_fixtures";

describe("dayKey", () => {
  it("uses the LOCAL calendar day, not UTC", () => {
    expect(dayKey(new Date(2026, 9, 16, 0, 5))).toBe("2026-10-16");
    expect(dayKey(new Date(2026, 9, 16, 23, 55))).toBe("2026-10-16");
    expect(dayKey(new Date(2026, 9, 17, 0, 0))).toBe("2026-10-17");
  });
});

describe("daily paths", () => {
  it("maps a day to its file and its title", () => {
    expect(dailyPathKey("2026-10-16")).toBe("daily/2026-10-16.md");
    expect(dailyTitle("2026-10-16")).toBe("2026-10-16");
    expect(pathFor("note", noteRow({ title: "2026-10-16", props: { day: "2026-10-16" } }))).toBe("daily/2026-10-16.md");
  });
});

describe("findDailyNote", () => {
  it("matches on props.day and ignores everything else", () => {
    const daily = noteRow({ id: "d1", props: { day: "2026-10-16" } });
    const other = noteRow({ id: "n2", title: "2026-10-16", props: {} });
    expect(findDailyNote([other, daily], "2026-10-16")?.id).toBe("d1");
    expect(findDailyNote([other], "2026-10-16")).toBeNull();
  });
});

describe("ensureDailyNote", () => {
  beforeEach(async () => {
    await db.notes.clear();
  });

  it("creates today's note once, in the daily tag, and reuses it afterwards", async () => {
    const first = await ensureDailyNote("p1", "2026-10-16");
    const second = await ensureDailyNote("p1", "2026-10-16");
    expect(second.id).toBe(first.id);
    expect(first.tags).toContain("daily");
    expect(first.props?.day).toBe("2026-10-16");
    expect(pathFor("note", first)).toBe("daily/2026-10-16.md");
    expect(await db.notes.where("projectId").equals("p1").count()).toBe(1);
  });

  it("keeps a separate note per day", async () => {
    await ensureDailyNote("p1", "2026-10-16");
    await ensureDailyNote("p1", "2026-10-17");
    expect(await db.notes.where("projectId").equals("p1").count()).toBe(2);
  });

  it("reuses a note the user already made for that day (even without the tag)", async () => {
    await notesRepo.create({ id: "manual", projectId: "p1", title: "2026-10-16", body: "jotted", props: { day: "2026-10-16" } });
    expect((await ensureDailyNote("p1", "2026-10-16")).id).toBe("manual");
  });
});
