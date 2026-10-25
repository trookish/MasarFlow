import { db } from "@/lib/db";

/**
 * Bounded growth for AI history (v0.3 P4 T6). Run on app start and once a day.
 *
 * - Agent runs keep their newest 200 steps.
 * - Tool results older than 30 days are shortened to 2 KB.
 * - Undo records older than 30 days are removed (the change itself stays).
 * - Chat messages are never removed here; only "Clear thread history" does that.
 */
export const RETENTION = {
  stepsPerRun: 200,
  resultAgeMs: 30 * 24 * 60 * 60 * 1000,
  resultBytes: 2048,
  undoAgeMs: 30 * 24 * 60 * 60 * 1000,
} as const;

export interface RetentionReport {
  stepsRemoved: number;
  resultsShortened: number;
  undoRemoved: number;
}

const SHORTENED = "\n\n[Shortened after 30 days.]";

export async function pruneAiHistory(
  now = Date.now(),
): Promise<RetentionReport> {
  const report: RetentionReport = {
    stepsRemoved: 0,
    resultsShortened: 0,
    undoRemoved: 0,
  };

  await db.transaction(
    "rw",
    [db.agentRuns, db.agentSteps, db.aiUndo],
    async () => {
      for (const runId of (await db.agentRuns
        .toCollection()
        .primaryKeys()) as string[]) {
        const steps = await db.agentSteps
          .where("runId")
          .equals(runId)
          .sortBy("order");
        const excess = steps.length - RETENTION.stepsPerRun;
        if (excess > 0) {
          await db.agentSteps.bulkDelete(
            steps.slice(0, excess).map((s) => s.id),
          );
          report.stepsRemoved += excess;
        }
      }

      const oldResults = await db.agentSteps
        .where("createdAt")
        .below(now - RETENTION.resultAgeMs)
        .filter(
          (s) =>
            s.type === "result" && s.content.length > RETENTION.resultBytes,
        )
        .toArray();
      for (const s of oldResults) {
        await db.agentSteps.update(s.id, {
          content: s.content.slice(0, RETENTION.resultBytes) + SHORTENED,
        });
      }
      report.resultsShortened = oldResults.length;

      report.undoRemoved = await db.aiUndo
        .where("createdAt")
        .below(now - RETENTION.undoAgeMs)
        .delete();
    },
  );

  return report;
}

const DAY = 24 * 60 * 60 * 1000;

/** Prune now and then daily. Returns a stop function. Failures are logged, never thrown. */
export function startRetention(): () => void {
  const run = () =>
    void pruneAiHistory().catch((e) =>
      console.warn("[retention] prune failed", e),
    );
  const first = setTimeout(run, 5_000); // after start-up work settles
  const daily = setInterval(run, DAY);
  return () => {
    clearTimeout(first);
    clearInterval(daily);
  };
}
