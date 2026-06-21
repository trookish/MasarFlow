import { describe, it, expect } from "vitest";
import {
  WORKFLOW_STEPS,
  buildStepPrompt,
  stepSystemPrompt,
} from "./workflow";
import { assigneeSchema } from "@/lib/db/schema";

describe("WORKFLOW_STEPS", () => {
  it("is a 16-step pipeline with unique keys and valid roles", () => {
    expect(WORKFLOW_STEPS).toHaveLength(16);
    const keys = WORKFLOW_STEPS.map((s) => s.key);
    expect(new Set(keys).size).toBe(16);
    for (const s of WORKFLOW_STEPS) {
      expect(() => assigneeSchema.parse(s.role)).not.toThrow();
    }
  });

  it("maps every step to a non-empty agent system prompt", () => {
    expect(
      WORKFLOW_STEPS.every((s) => stepSystemPrompt(s).trim().length > 20),
    ).toBe(true);
  });
});

describe("buildStepPrompt", () => {
  const step = WORKFLOW_STEPS[0];

  it("includes the idea and the step instruction", () => {
    const out = buildStepPrompt("A todo app", [], step);
    expect(out).toContain("A todo app");
    expect(out).toContain(step.instruction);
    expect(out).toContain(step.title);
  });

  it("includes earlier non-empty outputs as context", () => {
    const out = buildStepPrompt("A todo app", [
      { title: "Clarify the idea", output: "It's a CLI todo." },
      { title: "Empty", output: "   " },
    ], step);
    expect(out).toContain("Context from earlier steps");
    expect(out).toContain("It's a CLI todo.");
    expect(out).not.toContain("## Empty");
  });

  it("omits the context section when there are no prior outputs", () => {
    const out = buildStepPrompt("A todo app", [], step);
    expect(out).not.toContain("Context from earlier steps");
  });
});
