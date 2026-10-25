import { describe, it, expect } from "vitest";
import {
  WORKFLOW_STEPS,
  EARLIER_DIGEST_CHARS,
  PREVIOUS_STEP_CHARS,
  buildStepPrompt,
  interruptedSteps,
  stepSystemPrompt,
} from "@/lib/ai/workflow";
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
    expect(out).toContain("Previous step: Clarify the idea");
    expect(out).toContain("It's a CLI todo.");
    expect(out).not.toContain("Empty");
  });

  it("omits the context section when there are no prior outputs", () => {
    const out = buildStepPrompt("A todo app", [], step);
    expect(out).not.toContain("Summary of earlier steps");
    expect(out).not.toContain("Previous step");
  });

  it("stays under budget across a 10-step run and keeps the previous step whole", () => {
    const long = (n: number) =>
      Array.from({ length: 40 }, (_, i) => `## Part ${i}\n${`Step ${n} detail line. `.repeat(30)}\nsecond line\nthird line`).join("\n");
    const prior = Array.from({ length: 9 }, (_, i) => ({ title: `Step ${i + 1}`, output: i === 8 ? "Final design: three services." : long(i + 1) }));
    const out = buildStepPrompt("A todo app", prior, WORKFLOW_STEPS[9]);
    const unbounded = prior.reduce((a, p) => a + p.output.length, 0);
    expect(unbounded).toBeGreaterThan(200_000);
    expect(out.length).toBeLessThan(EARLIER_DIGEST_CHARS + PREVIOUS_STEP_CHARS + 4_000);
    expect(out).toContain("Previous step: Step 9\nFinal design: three services.");
    expect(out).toContain("## Step 1");
    expect(out).not.toContain("third line");
  });
});

describe("interruptedSteps", () => {
  it("returns steps left running by a closed window, never the live one", () => {
    const steps = [
      { id: "a", status: "done" }, { id: "b", status: "running" }, { id: "c", status: "running" }, { id: "d", status: "pending" },
    ];
    expect(interruptedSteps(steps, "c").map((s) => s.id)).toEqual(["b"]);
    expect(interruptedSteps(steps, null).map((s) => s.id)).toEqual(["b", "c"]);
  });
});
