import { describe, expect, it } from "vitest";
import { pushRecent, type RecentItem } from "@/lib/stores/recent";

const item = (id: string, kind: RecentItem["kind"] = "page"): RecentItem => ({
  id,
  kind,
  label: id,
  href: id,
  at: 0,
});

describe("pushRecent", () => {
  it("puts the newest first", () => {
    const list = pushRecent(pushRecent([], item("/tasks")), item("/chat"));
    expect(list.map((i) => i.id)).toEqual(["/chat", "/tasks"]);
  });

  it("re-visiting an item moves it to the front instead of duplicating", () => {
    const list = pushRecent(pushRecent([], item("/tasks")), item("/chat"));
    expect(pushRecent(list, item("/tasks")).map((i) => i.id)).toEqual(["/tasks", "/chat"]);
  });

  it("keeps pages and entities in separate lanes", () => {
    const list = pushRecent(pushRecent([], item("/tasks")), item("n1", "entity"));
    expect(list.filter((i) => i.kind === "page")).toHaveLength(1);
    expect(list.filter((i) => i.kind === "entity")).toHaveLength(1);
  });

  it("caps the lane at 12 entries", () => {
    let list: RecentItem[] = [];
    for (let i = 0; i < 20; i += 1) list = pushRecent(list, item(`/p${i}`));
    expect(list).toHaveLength(12);
    expect(list[0].id).toBe("/p19");
  });

  it("stamps the visit time when given one", () => {
    expect(pushRecent([], item("/tasks"), 1234)[0].at).toBe(1234);
  });
});
