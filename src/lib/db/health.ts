import type { MasarFlowDB } from "@/lib/db";

export type DbErrorKind = "version" | "quota" | "closed" | "unreadable" | "unknown";

export interface DbProblem {
  kind: DbErrorKind;
  message: string;
}

export function classifyDbError(e: unknown): DbProblem {
  const name = e instanceof Error ? e.name : "";
  switch (name) {
    case "VersionError":
      return { kind: "version", message: "The workspace was saved by a newer version of MasarFlow. Update the application to open it." };
    case "QuotaExceededError":
      return { kind: "quota", message: "The computer has no free storage left for the workspace. Free some disk space and try again." };
    case "DatabaseClosedError":
      return { kind: "closed", message: "The workspace database was closed unexpectedly. Retry to open it again." };
    case "OpenFailedError":
    case "UnknownError":
      return { kind: "unreadable", message: "The workspace database could not be opened. It may be damaged." };
    default:
      return { kind: "unknown", message: "The workspace database reported an unexpected problem." };
  }
}

/** Resolves null when the database opens, otherwise a classified problem. */
export async function checkDb(db: MasarFlowDB): Promise<DbProblem | null> {
  try {
    if (!db.isOpen()) await db.open();
    await db.projects.count();
    return null;
  } catch (e) {
    return classifyDbError(e);
  }
}
