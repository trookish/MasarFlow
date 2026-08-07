import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { notesRepo, aiUndoRepo } from "@/lib/db/repos";
import { executeWorkspaceToolWithUndo } from "@/lib/ai/undo";

const PROJECT = "undo-test-project";
const MESSAGE = "msg-1";

function call(name: string, args: Record<string, unknown>) {
  return { id: "call-1", name, arguments: args };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("executeWorkspaceToolWithUndo", () => {
  it("records an update entry with before/after snapshots and reverts it", async () => {
    const note = await notesRepo.create({
      projectId: PROJECT,
      title: "Original",
      body: "before body",
    });

    const result = await executeWorkspaceToolWithUndo(
      PROJECT,
      call("update_note", { id: note.id, body: "after body" }),
      MESSAGE,
    );
    expect(JSON.parse(result).ok).toBe(true);

    const updated = await notesRepo.get(note.id);
    expect(updated?.body).toBe("after body");

    const entries = await aiUndoRepo.listByMessage(MESSAGE);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "update",
      kind: "note",
      table: "notes",
      entityId: note.id,
      toolName: "update_note",
    });
    expect((entries[0].before as { body: string }).body).toBe("before body");
    expect((entries[0].after as { body: string }).body).toBe("after body");

    await aiUndoRepo.revert(entries[0]);

    const restored = await notesRepo.get(note.id);
    expect(restored?.body).toBe("before body");
    expect(await aiUndoRepo.listByMessage(MESSAGE)).toHaveLength(0);
  });

  it("records a create entry and revert deletes the entity", async () => {
    const result = await executeWorkspaceToolWithUndo(
      PROJECT,
      call("create_note", { title: "New note", body: "hello" }),
      MESSAGE,
    );
    const id = (JSON.parse(result) as { id: string }).id;

    const entries = await aiUndoRepo.listByMessage(MESSAGE);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ action: "create", entityId: id });
    expect(entries[0].before).toBeNull();

    await aiUndoRepo.revert(entries[0]);
    expect(await notesRepo.get(id)).toBeUndefined();
    expect(await aiUndoRepo.listByMessage(MESSAGE)).toHaveLength(0);
  });

  it("does not record read-only tools", async () => {
    const note = await notesRepo.create({
      projectId: PROJECT,
      title: "Readable",
      body: "x",
    });
    await executeWorkspaceToolWithUndo(
      PROJECT,
      call("read_note", { id: note.id }),
      MESSAGE,
    );
    expect(await aiUndoRepo.listByMessage(MESSAGE)).toHaveLength(0);
  });

  it("does not record failed calls", async () => {
    const result = await executeWorkspaceToolWithUndo(
      PROJECT,
      call("update_note", { id: "missing-id", body: "nope" }),
      MESSAGE,
    );
    expect(JSON.parse(result).ok).toBe(false);
    expect(await aiUndoRepo.listByMessage(MESSAGE)).toHaveLength(0);
  });

  it("does not record no-op updates", async () => {
    const note = await notesRepo.create({
      projectId: PROJECT,
      title: "Stable",
      body: "same body",
    });
    await executeWorkspaceToolWithUndo(
      PROJECT,
      call("update_note", { id: note.id, body: "same body" }),
      MESSAGE,
    );
    expect(await aiUndoRepo.listByMessage(MESSAGE)).toHaveLength(0);
  });
});
