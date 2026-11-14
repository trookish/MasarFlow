import { getDb, type Task, type Spec } from "../db/schema";

export async function buildContext(
  projectId: string,
  targetTask?: Task,
  targetSpec?: Spec,
): Promise<string> {
  const db = getDb();
  
  // 1. Gather high-weight memories
  const allMemories = await db.memories.where("projectId").equals(projectId).toArray();
  const importantMemories = allMemories
    .filter((m) => m.weight >= 0.5)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10);

  // 2. Gather enforced standards
  const allStandards = await db.standards.where("projectId").equals(projectId).toArray();
  const enforcedStandards = allStandards.filter((s) => s.enforced);

  // 3. Gather active specs
  const allSpecs = await db.specs.where("projectId").equals(projectId).toArray();
  const activeSpecs = allSpecs.filter((s) => s.status === "implementing" || s.status === "review");

  // 4. Gather recent dev logs
  const allLogs = await db.devLogs.where("projectId").equals(projectId).toArray();
  const recentLogs = allLogs.sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);

  let ctx = `<WORKSPACE_CONTEXT>\n`;

  if (importantMemories.length > 0) {
    ctx += `\n<MEMORIES>\n`;
    for (const m of importantMemories) {
      ctx += `[${m.kind.toUpperCase()}] (weight: ${m.weight.toFixed(2)}): ${m.content}\n`;
    }
    ctx += `</MEMORIES>\n`;
  }

  if (enforcedStandards.length > 0) {
    ctx += `\n<STANDARDS>\n`;
    for (const s of enforcedStandards) {
      ctx += `[${s.category.toUpperCase()}] ${s.title}: ${s.rule}\n`;
    }
    ctx += `</STANDARDS>\n`;
  }

  if (activeSpecs.length > 0) {
    ctx += `\n<ACTIVE_SPECS>\n`;
    for (const s of activeSpecs) {
      ctx += `- ${s.number}: ${s.title} (${s.status}, ${s.implementationProgress}% done)\n`;
    }
    ctx += `</ACTIVE_SPECS>\n`;
  }

  if (recentLogs.length > 0) {
    ctx += `\n<RECENT_LOGS>\n`;
    for (const l of recentLogs) {
      ctx += `- [${l.kind}] ${l.title}: ${l.body}\n`;
    }
    ctx += `</RECENT_LOGS>\n`;
  }

  ctx += `</WORKSPACE_CONTEXT>\n`;

  if (targetSpec) {
    ctx += `\n<TARGET_SPEC>\n${JSON.stringify(targetSpec, null, 2)}\n</TARGET_SPEC>\n`;
  }
  if (targetTask) {
    ctx += `\n<TARGET_TASK>\n${JSON.stringify(targetTask, null, 2)}\n</TARGET_TASK>\n`;
  }

  return ctx;
}
