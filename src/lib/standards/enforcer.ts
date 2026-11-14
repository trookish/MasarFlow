import { z } from "zod";
import type { Spec, Note, Standard } from "@/lib/db/schema";

export const violationSchema = z.object({
  standardId: z.string(),
  severity: z.enum(["warning", "error"]),
  message: z.string(),
  snippet: z.string(),
});

export type Violation = z.infer<typeof violationSchema>;

const UNITY_TERMS = [
  "unity",
  "monobehaviour",
  "scriptableobject",
  "gameobject",
  "prefab",
  "scene",
  "fixedupdate",
];

const PERFORMANCE_TERMS = ["perf", "allocation", "update"];

function severityFor(standard: Standard): "warning" | "error" {
  return standard.enforced ? "error" : "warning";
}

function extractRegex(rule: string): RegExp | null {
  const match = rule.match(/\/(.+?)\/([gimuy]*)/);
  if (!match) return null;
  try {
    return new RegExp(match[1], match[2]);
  } catch {
    return null;
  }
}

function hasAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((n) => lower.includes(n.toLowerCase()));
}

function specText(spec: Spec): string {
  return [
    spec.title,
    spec.purpose,
    ...spec.goals,
    ...spec.features,
    ...spec.constraints,
    ...spec.dependencies,
    spec.technicalNotes,
    ...spec.risks,
    ...spec.futureImprovements,
  ].join(" ");
}

export function checkSpecAgainstStandards(spec: Spec, standards: Standard[]): Violation[] {
  const violations: Violation[] = [];
  for (const standard of standards) {
    switch (standard.category) {
      case "naming": {
        const re = extractRegex(standard.rule);
        if (re && !re.test(spec.title)) {
          violations.push({
            standardId: standard.id,
            severity: severityFor(standard),
            message: `Spec title does not match naming standard "${standard.title}"`,
            snippet: spec.title,
          });
        }
        break;
      }
      case "performance": {
        const text = [...spec.constraints, spec.technicalNotes].join(" ");
        if (!hasAny(text, PERFORMANCE_TERMS)) {
          violations.push({
            standardId: standard.id,
            severity: severityFor(standard),
            message: `Spec constraints or technical notes should mention performance terms (${PERFORMANCE_TERMS.join(", ")})`,
            snippet: spec.constraints[0] || spec.technicalNotes || spec.title,
          });
        }
        break;
      }
      case "unity": {
        const depsText = spec.dependencies.join(" ");
        const hasUnityDeps = hasAny(depsText, UNITY_TERMS);
        if (hasUnityDeps && !hasAny(specText(spec), UNITY_TERMS)) {
          violations.push({
            standardId: standard.id,
            severity: severityFor(standard),
            message: `Spec with Unity-related dependencies should mention Unity terms`,
            snippet: spec.title,
          });
        }
        break;
      }
    }
  }
  return violations;
}

export function checkNoteAgainstStandards(note: Note, standards: Standard[]): Violation[] {
  const violations: Violation[] = [];
  for (const standard of standards) {
    switch (standard.category) {
      case "naming": {
        const re = extractRegex(standard.rule);
        if (re && !re.test(note.title)) {
          violations.push({
            standardId: standard.id,
            severity: severityFor(standard),
            message: `Note title does not match naming standard "${standard.title}"`,
            snippet: note.title,
          });
        }
        break;
      }
      case "comments": {
        const requiresXml = /xml|\/\/\/|docs/i.test(standard.title + " " + standard.rule);
        if (
          requiresXml &&
          !note.body.includes("## Overview") &&
          !note.body.includes("## Context")
        ) {
          violations.push({
            standardId: standard.id,
            severity: severityFor(standard),
            message: `Note body should contain "## Overview" or "## Context"`,
            snippet: note.body.slice(0, 120),
          });
        }
        break;
      }
      case "performance": {
        if (!hasAny(note.body, PERFORMANCE_TERMS)) {
          violations.push({
            standardId: standard.id,
            severity: severityFor(standard),
            message: `Note body should mention performance terms (${PERFORMANCE_TERMS.join(", ")})`,
            snippet: note.body.slice(0, 120),
          });
        }
        break;
      }
      case "structure": {
        if (!/^#{1,6}\s/m.test(note.body)) {
          violations.push({
            standardId: standard.id,
            severity: severityFor(standard),
            message: `Note body should contain at least one heading`,
            snippet: note.body.slice(0, 120),
          });
        }
        break;
      }
    }
  }
  return violations;
}

export function computeProjectViolations(
  specs: Spec[],
  notes: Note[],
  standards: Standard[],
): {
  total: number;
  errors: number;
  warnings: number;
  bySpec: Map<string, Violation[]>;
  byNote: Map<string, Violation[]>;
} {
  const bySpec = new Map<string, Violation[]>();
  const byNote = new Map<string, Violation[]>();
  let errors = 0;
  let warnings = 0;

  for (const spec of specs) {
    const list = checkSpecAgainstStandards(spec, standards);
    bySpec.set(spec.id, list);
    for (const v of list) {
      if (v.severity === "error") errors++;
      else warnings++;
    }
  }

  for (const note of notes) {
    const list = checkNoteAgainstStandards(note, standards);
    byNote.set(note.id, list);
    for (const v of list) {
      if (v.severity === "error") errors++;
      else warnings++;
    }
  }

  return { total: errors + warnings, errors, warnings, bySpec, byNote };
}
