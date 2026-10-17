import { describe, it, expect } from "vitest";
import { applyUrlFocus } from "@/lib/dock/dock-core";
import { defaultProjectState } from "@/lib/dock/presets";
import { deriveActiveContext, formatActiveContext } from "@/lib/ai/active-context";

function stateWith(...urls: string[]) {
  let s = defaultProjectState();
  for (const u of urls) s = applyUrlFocus(s, u);
  return s;
}

describe("deriveActiveContext", () => {
  it("is null without a project dock", () => {
    expect(deriveActiveContext(null)).toBeNull();
  });
  it("reports the focused panel and the entity it shows", () => {
    const ctx = deriveActiveContext(stateWith("/brain?note=n1", "/tasks?task=t1"))!;
    expect(ctx.focusedUrl).toBe("/tasks?task=t1");
    const focused = ctx.panels.find((p) => p.focused)!;
    expect(focused.path).toBe("/tasks");
    expect(focused.ref).toEqual({ kind: "task", id: "t1" });
  });
  it("lists every open panel once, focused first", () => {
    const ctx = deriveActiveContext(stateWith("/brain?note=n1", "/tasks?task=t1"))!;
    expect(ctx.panels[0].focused).toBe(true);
    const paths = ctx.panels.map((p) => p.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("/brain");
    expect(ctx.panels.find((p) => p.path === "/brain")!.ref).toEqual({ kind: "note", id: "n1" });
  });
  it("a cleared selection yields no ref", () => {
    const ctx = deriveActiveContext(stateWith("/tasks?task=t1", "/tasks?task="))!;
    expect(ctx.panels.find((p) => p.path === "/tasks")!.ref).toBeNull();
  });
});

describe("formatActiveContext", () => {
  it("names the focused entity and the other open panels", () => {
    const ctx = deriveActiveContext(stateWith("/brain?note=n1", "/tasks?task=t1"))!;
    const titles = new Map([["task:t1", "Fix login"], ["note:n1", "Auth design"]]);
    const text = formatActiveContext(ctx, titles);
    expect(text).toContain("## Currently open");
    expect(text).toContain('Focused: Task Boards — Task "Fix login" (id t1)');
    expect(text).toContain('Note "Auth design" (id n1)');
  });
  it("falls back to the bare page when no entity is selected", () => {
    const ctx = deriveActiveContext(stateWith("/dashboard"))!;
    expect(formatActiveContext(ctx, new Map())).toContain("Focused: Dashboard");
  });
});
