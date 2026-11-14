import { getDb } from "../db/schema";
import type { Agent, Task, Spec } from "../db/schema";
import { useAi } from "../stores/ai";

export type AIProvider = "simulated" | "openai" | "anthropic";

export interface AIProviderConfig {
  provider: AIProvider;
  apiKey?: string;
  model?: string;
}

// In a real app, this would be set via env vars or user settings

export interface AgentRunContext {
  agent: Agent;
  targetTask?: Task;
  targetSpec?: Spec;
  projectId: string;
}

export interface AgentStep {
  kind: "think" | "read" | "write" | "tool" | "done" | "error";
  text: string;
}

export type StepCallback = (step: AgentStep) => void;

/**
 * Runs an agent pipeline.
 * Currently uses a simulated provider that mocks thinking steps and
 * randomly modifies DB state to prove integration.
 */
export async function runAgentCompletion(
  context: AgentRunContext,
  onStep: StepCallback
): Promise<void> {
  const { agent, targetTask, targetSpec, projectId } = context;
  const { provider, apiKey } = useAi.getState();

  const runId = crypto.randomUUID();
  let targetStr = "the workspace";
  if (targetTask) targetStr = `Task: ${targetTask.title}`;
  if (targetSpec) targetStr = `Spec: ${targetSpec.title}`;

  await getDb().agentRuns.add({
    id: runId,
    projectId,
    agentId: agent.id,
    target: targetStr,
    status: "running",
    durationMs: 0,
    startedAt: Date.now(),
    updatedAt: Date.now(),
  });

  let stepOrder = 0;
  const startTime = Date.now();

  const handleStep = async (step: AgentStep) => {
    onStep(step);
    await getDb().agentSteps.add({
      id: crypto.randomUUID(),
      runId,
      kind: step.kind,
      text: step.text,
      order: stepOrder++,
    });
  };

  try {
    if (provider === "simulated") {
      await handleStep({ kind: "think", text: "Simulated mode not implemented in new engine. Please select a provider." });
      await runRealAgent(agent, targetTask, targetSpec, projectId, handleStep, "fake-key", "simulated");
    } else {
      await runRealAgent(agent, targetTask, targetSpec, projectId, handleStep, apiKey, provider);
    }
    await getDb().agentRuns.update(runId, {
      status: "completed",
      durationMs: Date.now() - startTime,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error(err);
    await getDb().agentRuns.update(runId, {
      status: "error",
      durationMs: Date.now() - startTime,
      updatedAt: Date.now(),
    });
    throw err;
  }
}

async function runRealAgent(
  agent: Agent,
  targetTask: Task | undefined,
  targetSpec: Spec | undefined,
  projectId: string,
  onStep: (step: AgentStep) => Promise<void>,
  apiKey: string,
  provider: string,
) {
  await getDb().agents.update(agent.id, { status: "thinking" });

  await onStep({ kind: "think", text: `I am ${agent.name}, initializing as ${agent.role}...` });
  
  // 1. Build Context
  const { buildContext } = await import("./context");
  const ctx = await buildContext(projectId, targetTask, targetSpec);

  const systemPrompt = `You are an AI Agent operating within MasarFlow, a development workflow platform.
Your persona: ${agent.persona}
Your role: ${agent.role}
Your capabilities: ${agent.capabilities.join(", ")}

You will be provided with the current workspace context (active specs, important memories, standards, recent logs).
You must analyze the target, think through the necessary steps, and then optionally execute actions to modify the database.

CRITICAL INSTRUCTIONS:
1. Always wrap your internal thoughts and analysis in <think>...</think> tags. This will be streamed to the user.
2. If you want to modify the database, output your actions in a single <action>...</action> block at the very end of your response, containing a valid JSON array.

Supported JSON Actions:
- { "type": "createTask", "title": string, "description": string, "priority": "low"|"medium"|"high"|"urgent", "assignee": string }
- { "type": "updateTask", "id": string, "status": "todo"|"in_progress"|"review"|"done", "progress": number }
- { "type": "createMemory", "content": string, "kind": "pattern"|"decision"|"lesson"|"preference", "weight": number }

Example response:
<think>
I see the user wants to implement the login page. I will create a task for the frontend and a memory noting this design choice.
</think>
<action>
[
  { "type": "createTask", "title": "Build Login UI", "description": "Implement the form", "priority": "high", "assignee": "programmer" },
  { "type": "createMemory", "content": "Authentication is standard email/password.", "kind": "decision", "weight": 0.8 }
]
</action>`;

  const payload = {
    provider,
    apiKey,
    prompt: systemPrompt + "\n\n" + ctx,
  };

  await onStep({ kind: "read", text: `Sending context to ${provider}...` });

  const res = await fetch("/api/ai/completion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`LLM API failed: ${res.statusText}`);
  }

  if (!res.body) throw new Error("No response body");

  await getDb().agents.update(agent.id, { status: "acting" });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let done = false;
  let fullText = "";

  while (!done) {
    const { value, done: doneReading } = await reader.read();
    done = doneReading;
    if (value) {
      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;
      
      // We could parse <think> tags progressively, but for now we'll just emit a general tool step
      // if it exceeds a certain length, or just keep it simple.
    }
  }

  // Parse out <think> and <action>
  const thinkMatch = fullText.match(/<think>([\s\S]*?)<\/think>/i);
  if (thinkMatch && thinkMatch[1]) {
    await onStep({ kind: "think", text: thinkMatch[1].trim() });
  } else {
    await onStep({ kind: "think", text: "Finished analysis without explicit thoughts." });
  }

  const actionMatch = fullText.match(/<action>([\s\S]*?)<\/action>/i);
  if (actionMatch && actionMatch[1]) {
    await onStep({ kind: "tool", text: "Executing actions..." });
    try {
      const actions = JSON.parse(actionMatch[1].trim());
      if (Array.isArray(actions)) {
        for (const act of actions) {
          if (act.type === "createTask") {
            await getDb().tasks.add({
              id: crypto.randomUUID(),
              projectId,
              title: act.title,
              description: act.description || "",
              status: "todo",
              priority: act.priority || "medium",
              specId: targetSpec?.id || null,
              parentTaskId: null,
              sprintId: null,
              assignee: act.assignee || "programmer",
              dependencies: [],
              progress: 0,
              tags: [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
            await onStep({ kind: "write", text: `Created task: ${act.title}` });
          } else if (act.type === "updateTask" && act.id) {
            await getDb().tasks.update(act.id, {
              status: act.status || "in_progress",
              progress: act.progress || 50,
              updatedAt: Date.now()
            });
            await onStep({ kind: "write", text: `Updated task ${act.id.slice(0,6)}...` });
          } else if (act.type === "createMemory") {
            await getDb().memories.add({
              id: crypto.randomUUID(),
              projectId,
              kind: act.kind || "lesson",
              content: act.content,
              tags: ["auto-generated", agent.role],
              weight: act.weight || 0.5,
              createdAt: Date.now(),
              lastRecallAt: null,
            });
            await onStep({ kind: "write", text: `Saved memory.` });
          }
        }
      }
    } catch {
      await onStep({ kind: "error", text: "Failed to parse or execute actions JSON." });
    }
  }

  await getDb().agents.update(agent.id, { status: "idle", lastRunAt: Date.now() });
  await onStep({ kind: "done", text: `Task complete. Standing by.` });
}
