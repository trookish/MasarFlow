import { describe, it, expect } from "vitest";
import { groupLogsByDay, dayLabel, dayKey } from "@/lib/devlogs";
import type { DevLog } from "@/lib/db/schema";

function log(id: string, createdAt: number): DevLog {
  return {
    id,
    projectId: "p",
    type: "change",
    title: id,
    body: "",
    refType: null,
    refId: null,
    createdAt,
  };
}

const NOW = new Date("2026-06-19T12:00:00").getTime();
const DAY = 86_400_000;

describe("groupLogsByDay", () => {
  it("groups entries by calendar day, newest day first", () => {
    const groups = groupLogsByDay(
      [
        log("today-a", NOW - 3_600_000),
        log("yesterday", NOW - DAY),
        log("today-b", NOW - 60_000),
      ],
      NOW,
    );
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday"]);
    // Newest entry first within a day.
    expect(groups[0].logs.map((l) => l.id)).toEqual(["today-b", "today-a"]);
    expect(groups[1].logs.map((l) => l.id)).toEqual(["yesterday"]);
  });

  it("is total — empty input yields no groups", () => {
    expect(groupLogsByDay([], NOW)).toEqual([]);
  });

  it("does not mutate the input array order", () => {
    const input = [log("a", NOW), log("b", NOW - DAY)];
    const snapshot = input.map((l) => l.id);
    groupLogsByDay(input, NOW);
    expect(input.map((l) => l.id)).toEqual(snapshot);
  });

  it("labels Today and Yesterday relative to now", () => {
    expect(dayLabel(NOW, NOW)).toBe("Today");
    expect(dayLabel(NOW - DAY, NOW)).toBe("Yesterday");
    expect(dayLabel(NOW - 5 * DAY, NOW)).not.toBe("Today");
  });

  it("keys distinct calendar days differently", () => {
    expect(dayKey(NOW)).not.toBe(dayKey(NOW - DAY));
    expect(dayKey(NOW)).toBe(dayKey(NOW - 3_600_000));
  });
});
