import type { Assignee } from "@/lib/db/schema";
import { AGENT_ROSTER } from "./agents";

export interface WorkflowStepDef {
  key: string;
  title: string;
  role: Assignee;
  /** What this step should produce. */
  instruction: string;
  /**
   * When set, the step runs with the workspace tool belt and this extra
   * instruction telling it which real artifacts to create/update (specs,
   * tasks, docs, dev logs, memories) — the step's output is not just text.
   */
  materialize?: string;
}

/**
 * The 16-step idea → implementation pipeline. Each step is performed by a
 * roster agent (its `role` selects the agent's system prompt) and receives the
 * idea plus the outputs of all earlier steps as context.
 */
export const WORKFLOW_STEPS: WorkflowStepDef[] = [
  { key: "clarify", title: "Clarify the idea", role: "architect", instruction: "Restate the idea crisply, list the assumptions, and ask the 3 most important open questions (then answer them with reasonable defaults)." },
  { key: "research", title: "Research & prior art", role: "architect", instruction: "Summarize relevant prior art, common approaches, and pitfalls for this kind of feature. Recommend a direction." },
  { key: "requirements", title: "Requirements", role: "architect", instruction: "Write the functional and non-functional requirements as a concise, numbered list.", materialize: "Then persist this as a real specification: call create_spec with the feature's title, purpose, goals, features, constraints, and acceptance criteria (or update_spec if a spec for this feature already exists in the workspace)." },
  { key: "stories", title: "User stories", role: "designer", instruction: "Write the key user stories in the form 'As a …, I want …, so that …', ordered by importance." },
  { key: "criteria", title: "Success criteria", role: "reviewer", instruction: "Define measurable acceptance criteria and what 'done' means for this feature." },
  { key: "design", title: "System design", role: "architect", instruction: "Propose the system design: components, responsibilities, data flow, and key trade-offs." },
  { key: "data", title: "Data model", role: "architect", instruction: "Define the data model: entities, fields, relationships, and indexes." },
  { key: "api", title: "Interfaces / API", role: "architect", instruction: "Specify the interfaces or API surface: operations, inputs/outputs, and errors." },
  { key: "ux", title: "UX flow", role: "designer", instruction: "Describe the UX flow, the key screens/states, and empty/loading/error handling." },
  { key: "breakdown", title: "Task breakdown", role: "programmer", instruction: "Break the work into a sequenced list of implementation tasks with rough effort.", materialize: "Then create each task for real with create_task (status: backlog), linking each to the feature's spec via specNumber when a spec exists." },
  { key: "plan", title: "Implementation plan", role: "programmer", instruction: "Lay out the implementation plan and the order of work, calling out dependencies." },
  { key: "scaffold", title: "Code scaffold", role: "programmer", instruction: "Provide a code scaffold for the core pieces (files, signatures, key functions) in fenced blocks." },
  { key: "tests", title: "Test plan", role: "tester", instruction: "Produce a focused test plan and concrete high-signal test cases." },
  { key: "review", title: "Review & risks", role: "reviewer", instruction: "Review the plan so far for correctness, security, and risk. List concrete issues by severity." },
  { key: "docs", title: "Documentation", role: "documenter", instruction: "Write the user- and developer-facing documentation for the feature in Markdown.", materialize: "Then save it for real with create_doc (category: guides)." },
  { key: "rollout", title: "Rollout & next steps", role: "optimizer", instruction: "Define the rollout plan, what to measure, and the highest-value next steps.", materialize: "Then record the workflow's completion with create_devlog and save the 2-3 most important decisions from this workflow with create_memory." },
];

/** The agent system prompt backing a step's role. */
export function stepSystemPrompt(step: WorkflowStepDef): string {
  return (
    AGENT_ROSTER.find((a) => a.role === step.role)?.systemPrompt ??
    "You are a helpful expert."
  );
}

export interface PriorOutput {
  title: string;
  output: string;
}

/**
 * Build the user message for a step: the idea, a digest of earlier outputs, and
 * the step's specific ask. Pure and deterministic.
 */
export function buildStepPrompt(
  idea: string,
  prior: PriorOutput[],
  step: WorkflowStepDef,
): string {
  const parts: string[] = [`# Idea\n${idea.trim()}`];
  const done = prior.filter((p) => p.output.trim().length > 0);
  if (done.length > 0) {
    parts.push(
      "# Context from earlier steps\n" +
        done.map((p) => `## ${p.title}\n${p.output.trim()}`).join("\n\n"),
    );
  }
  parts.push(
    `# Your task: ${step.title}\n${step.instruction}${step.materialize ? `\n\n${step.materialize}` : ""}`,
  );
  return parts.join("\n\n");
}
