import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { pruneAiHistory, RETENTION } from "@/lib/db/retention";
import { chatMessagesRepo } from "@/lib/db/repos/chat";

const NOW = Date.UTC(2026, 9, 26);
const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  await db.agentRuns.add({
    id: "r1",
    projectId: "p",
    agentId: "a",
    task: "t",
    status: "done",
    createdAt: NOW,
  } as never);
});

describe("pruneAiHistory", () => {
  it("keeps the newest 200 steps of a run", async () => {
    await db.agentSteps.bulkAdd(
      Array.from({ length: 230 }, (_, i) => ({
        id: `s${i}`,
        runId: "r1",
        order: i,
        type: "think" as const,
        content: "x",
        createdAt: NOW,
      })),
    );
    const report = await pruneAiHistory(NOW);
    expect(report.stepsRemoved).toBe(30);
    const orders = (
      await db.agentSteps.where("runId").equals("r1").sortBy("order")
    ).map((s) => s.order);
    expect(orders).toHaveLength(RETENTION.stepsPerRun);
    expect(orders[0]).toBe(30);
  });

  it("shortens tool results older than 30 days to 2 KB and leaves recent ones whole", async () => {
    const big = "y".repeat(10_000);
    await db.agentSteps.bulkAdd([
      {
        id: "old",
        runId: "r1",
        order: 0,
        type: "result",
        content: big,
        createdAt: NOW - 31 * DAY,
      },
      {
        id: "new",
        runId: "r1",
        order: 1,
        type: "result",
        content: big,
        createdAt: NOW - 2 * DAY,
      },
      {
        id: "thought",
        runId: "r1",
        order: 2,
        type: "think",
        content: big,
        createdAt: NOW - 40 * DAY,
      },
    ]);
    expect((await pruneAiHistory(NOW)).resultsShortened).toBe(1);
    expect((await db.agentSteps.get("old"))!.content.length).toBeLessThan(
      2_200,
    );
    expect((await db.agentSteps.get("new"))!.content).toBe(big);
    expect((await db.agentSteps.get("thought"))!.content).toBe(big);
  });

  it("drops undo records after 30 days and never touches chat messages", async () => {
    const undo = (id: string, age: number) => ({
      id,
      projectId: "p",
      chatMessageId: "m",
      toolName: "create_note",
      kind: "note",
      table: "notes",
      entityId: "n",
      action: "create" as const,
      before: null,
      after: null,
      createdAt: NOW - age,
    });
    await db.aiUndo.bulkAdd([
      undo("u-old", 31 * DAY),
      undo("u-new", DAY),
    ] as never);
    await db.chatMessages.add({
      id: "m",
      threadId: "t",
      role: "user",
      content: "hi",
      createdAt: NOW - 400 * DAY,
    } as never);
    expect((await pruneAiHistory(NOW)).undoRemoved).toBe(1);
    expect(await db.aiUndo.toCollection().primaryKeys()).toEqual(["u-new"]);
    expect(await db.chatMessages.count()).toBe(1);

    await db.chatThreads.add({
      id: "t",
      projectId: "p",
      title: "T",
      createdAt: NOW,
      updatedAt: NOW,
    } as never);
    expect(await chatMessagesRepo.clearThread("t")).toBe(1);
    expect(await db.chatThreads.get("t")).toBeTruthy();
  });
});
