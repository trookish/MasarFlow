import { db } from "@/lib/db";
import {
  agentSchema,
  agentRunSchema,
  agentStepSchema,
  type Agent,
  type AgentRun,
  type AgentStep,
} from "@/lib/db/schema";
import { uuid, now } from "@/lib/utils/ids";
import { AGENT_ROSTER, DEFAULT_AGENT_MODEL } from "@/lib/ai/agents";

export const agentsRepo = {
  list(): Promise<Agent[]> {
    return db.agents.toArray();
  },
  get(id: string): Promise<Agent | undefined> {
    return db.agents.get(id);
  },
  /** Seed any missing roster agents (idempotent — keyed by stable id). */
  async ensureSeeded(): Promise<void> {
    const existing = new Set((await db.agents.toCollection().primaryKeys()) as string[]);
    const ts = now();
    const missing = AGENT_ROSTER.filter((a) => !existing.has(a.id)).map((a) =>
      agentSchema.parse({
        id: a.id,
        name: a.name,
        role: a.role,
        description: a.description,
        systemPrompt: a.systemPrompt,
        model: DEFAULT_AGENT_MODEL,
        enabled: true,
        createdAt: ts,
        updatedAt: ts,
      }),
    );
    if (missing.length) await db.agents.bulkAdd(missing);
  },
  async update(id: string, patch: Partial<Agent>): Promise<void> {
    await db.agents.update(id, { ...patch, updatedAt: now() });
  },
};

export const agentRunsRepo = {
  async listByAgent(
    projectId: string | null | undefined,
    agentId: string,
  ): Promise<AgentRun[]> {
    if (!projectId) return [];
    return db.agentRuns
      .where("projectId")
      .equals(projectId)
      .and((r) => r.agentId === agentId)
      .reverse()
      .sortBy("createdAt");
  },
  async create(
    input: Partial<AgentRun> & Pick<AgentRun, "projectId" | "agentId">,
  ): Promise<AgentRun> {
    const ts = now();
    const run = agentRunSchema.parse({
      ...input,
      id: input.id ?? uuid(),
      createdAt: input.createdAt ?? ts,
    });
    await db.agentRuns.add(run);
    return run;
  },
  async update(id: string, patch: Partial<AgentRun>): Promise<void> {
    await db.agentRuns.update(id, patch);
  },
  async remove(id: string): Promise<void> {
    await db.transaction("rw", [db.agentRuns, db.agentSteps], async () => {
      await db.agentSteps.where("runId").equals(id).delete();
      await db.agentRuns.delete(id);
    });
  },
};

export const agentStepsRepo = {
  listByRun(runId: string): Promise<AgentStep[]> {
    return db.agentSteps.where("runId").equals(runId).sortBy("order");
  },
  async append(
    runId: string,
    type: AgentStep["type"],
    content: string,
  ): Promise<AgentStep> {
    const count = await db.agentSteps.where("runId").equals(runId).count();
    const step = agentStepSchema.parse({
      id: uuid(),
      runId,
      order: count,
      type,
      content,
      createdAt: now(),
    });
    await db.agentSteps.add(step);
    return step;
  },
};
