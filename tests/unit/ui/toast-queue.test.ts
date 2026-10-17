import { describe, expect, it } from "vitest";
import {
  DEFAULT_TTL_MS,
  MAX_VISIBLE,
  dismiss,
  enqueue,
  nextExpiry,
  prune,
  type Toast,
} from "@/lib/ui/toast-queue";

function toast(id: string, createdAt = 0, ttlMs = DEFAULT_TTL_MS): Toast {
  return { id, title: id, createdAt, ttlMs, tone: "default" };
}

describe("toast queue", () => {
  it("keeps the newest MAX_VISIBLE toasts", () => {
    let list: Toast[] = [];
    for (const id of ["a", "b", "c", "d"]) list = enqueue(list, toast(id));
    expect(list.map((t) => t.id)).toEqual(["b", "c", "d"]);
    expect(MAX_VISIBLE).toBe(3);
  });

  it("dismisses by id and ignores unknown ids", () => {
    const list = [toast("a"), toast("b")];
    expect(dismiss(list, "a").map((t) => t.id)).toEqual(["b"]);
    expect(dismiss(list, "zzz")).toHaveLength(2);
  });

  it("prunes only what has actually expired", () => {
    const list = [toast("old", 0, 1000), toast("fresh", 900, 1000)];
    expect(prune(list, 1500).map((t) => t.id)).toEqual(["fresh"]);
    expect(prune(list, 2500)).toEqual([]);
  });

  it("reports the next expiry so one timer is enough", () => {
    expect(nextExpiry([])).toBeNull();
    // "a" expires at 100 + 500 = 600 — earlier than "b" (0 + 900 = 900), so it
    // is the timestamp the store's single timer must wake for.
    expect(nextExpiry([toast("a", 100, 500), toast("b", 0, 900)])).toBe(600);
  });
});
