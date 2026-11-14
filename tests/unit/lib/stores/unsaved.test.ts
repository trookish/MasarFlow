import { beforeEach, describe, expect, it } from "vitest";
import { useUnsavedStore } from "@/lib/stores/unsaved";

beforeEach(() => useUnsavedStore.setState({ byPage: {} }));

describe("unsaved edits per tab", () => {
  it("marks a tab while any of its editors holds an unwritten edit", () => {
    const { setUnsaved } = useUnsavedStore.getState();
    setUnsaved("/library", "doc", true);
    setUnsaved("/library", "spec", true);
    setUnsaved("/library", "doc", false);
    expect(useUnsavedStore.getState().byPage).toEqual({ "/library": ["spec"] });
    setUnsaved("/library", "spec", false);
    expect(useUnsavedStore.getState().byPage).toEqual({});
  });

  it("does not notify subscribers when nothing changed", () => {
    const { setUnsaved } = useUnsavedStore.getState();
    setUnsaved("/capture", "note", true);
    const before = useUnsavedStore.getState().byPage;
    setUnsaved("/capture", "note", true);
    setUnsaved("/work", "task", false);
    expect(useUnsavedStore.getState().byPage).toBe(before);
  });
});
