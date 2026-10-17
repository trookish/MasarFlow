export const EFFORT_LEVELS = ["off", "low", "medium", "high"] as const;
export type Effort = (typeof EFFORT_LEVELS)[number];

const BUDGETS = { low: 2000, medium: 8000, high: 24000 } as const;

export function effortToReasoning(
  effort: Effort,
  modelCanReason: boolean,
): { enabled: boolean; budget?: number } | undefined {
  if (effort === "off" || !modelCanReason) return undefined;
  return { enabled: true, budget: BUDGETS[effort] };
}
