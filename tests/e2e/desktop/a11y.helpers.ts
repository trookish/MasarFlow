import type { Page } from "@playwright/test";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);

export interface AxeNode {
  /** CSS selector axe used for the node. */
  target: string;
  html: string;
}

export interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: AxeNode[];
}

export interface AxeScanResult {
  engine: "injected" | "playwright";
  tags: string[];
  violations: AxeViolation[];
}

export const DEFAULT_TAGS = ["wcag2a", "wcag2aa"];
export const FAILING_IMPACTS = ["serious", "critical"];

interface RawAxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: { target: unknown[]; html: string }[];
}

/**
 * Runs axe-core inside the packaged renderer (P9.T19).
 *
 * The injected `axe-core` UMD bundle is the *primary* engine: @axe-core/playwright's
 * `analyze()` calls `browserContext.newPage()`, and Electron's CDP rejects that
 * with `Protocol error (Target.createTarget): Not supported`, so on this runtime
 * it can never be the one that runs. It stays as the fallback for browsers that
 * do support it. Note also that `axe.run(undefined, …)` throws
 * "axe.run arguments are invalid" on axe-core 4.x — the context must be a real
 * node, so an unscoped scan passes `document`.
 */
export async function axeScan(
  page: Page,
  opts: { include?: string[]; tags?: string[] } = {},
): Promise<AxeScanResult> {
  const tags = opts.tags ?? DEFAULT_TAGS;
  const include = opts.include ?? [];
  let injectedError: unknown = null;

  try {
    const axePath = require_.resolve("axe-core/axe.min.js");
    await page.addScriptTag({ path: axePath });
    const raw = await page.evaluate(
      async ({ tags: t, include: inc }) => {
        const axe = (
          window as unknown as {
            axe: { run: (ctx: unknown, o: unknown) => Promise<{ violations: unknown[] }> };
          }
        ).axe;
        const ctx = inc.length ? { include: inc } : document;
        const out = await axe.run(ctx, { runOnly: { type: "tag", values: t } });
        return JSON.parse(JSON.stringify(out.violations)) as unknown;
      },
      { tags, include },
    );
    return { engine: "injected", tags, violations: normalize(raw as RawAxeViolation[]) };
  } catch (error) {
    injectedError = error;
  }

  try {
    const { AxeBuilder } = require_("@axe-core/playwright") as typeof import("@axe-core/playwright");
    const builder = new AxeBuilder({ page }).withTags(tags);
    for (const sel of include) builder.include(sel);
    const res = await builder.analyze();
    return { engine: "playwright", tags, violations: normalize(res.violations as RawAxeViolation[]) };
  } catch (error) {
    throw new Error(
      `axe scan failed on both engines. injected: ${String(injectedError)}; playwright: ${String(error)}`,
    );
  }
}

function normalize(violations: RawAxeViolation[]): AxeViolation[] {
  return violations.map((v) => ({
    id: v.id,
    impact: v.impact ?? null,
    help: v.help,
    nodes: v.nodes.map((n) => ({
      target: n.target.map(String).join(" "),
      html: n.html.slice(0, 200),
    })),
  }));
}

/**
 * Every interactive control that exposes no accessible name (T19's pass bar).
 * Returned in axe shape under the rule id `custom:nameless-control` so the same
 * allow-list logic and evidence format apply.
 */
export async function namelessControls(page: Page): Promise<AxeViolation[]> {
  const found = await page.evaluate(() => {
    const accessibleName = (el: Element): string => {
      const aria = el.getAttribute("aria-label");
      if (aria && aria.trim()) return aria;
      if (el.getAttribute("aria-labelledby")) return "labelledby";
      if (el.id) {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label?.textContent?.trim()) return label.textContent;
      }
      const wrapping = el.closest("label");
      if (wrapping?.textContent?.trim()) return wrapping.textContent;
      const title = el.getAttribute("title");
      if (title && title.trim()) return title;
      return (el.textContent ?? "").trim();
    };
    const selector = (el: Element): string => {
      const tag = el.tagName.toLowerCase();
      const placeholder = el.getAttribute("placeholder");
      if (placeholder) return `${tag}[placeholder="${placeholder}"]`;
      const classes = (el.className || "").toString().split(/\s+/).filter(Boolean).slice(0, 2);
      return classes.length ? `${tag}.${classes.join(".")}` : tag;
    };

    const nodes: { target: string; html: string }[] = [];
    const controls = document.querySelectorAll(
      "button, [role=button], a[href], input, select, textarea",
    );
    for (const el of Array.from(controls)) {
      if (el.closest("[aria-hidden=true]")) continue;
      // Only controls a user can actually reach: display:none / detached
      // elements are not exposed to assistive tech, so they need no name.
      if (!(el instanceof HTMLElement) || el.offsetParent === null) continue;
      if (!accessibleName(el)) {
        nodes.push({ target: selector(el), html: el.outerHTML.slice(0, 200) });
      }
    }
    return nodes;
  });

  if (found.length === 0) return [];
  return [
    {
      id: "custom:nameless-control",
      impact: "critical",
      help: "Every interactive element must expose an accessible name",
      nodes: found,
    },
  ];
}

export interface AllowEntry {
  /** axe rule id, or `custom:nameless-control`. */
  rule: string;
  /** Substring of a node's CSS target or its outerHTML. */
  selector: string;
  /** Who owns the fix (stream + file). */
  owner: string;
  reason: string;
}

/**
 * T19's allow-list: serious/critical findings in sibling-owned components, kept
 * to an exact rule id + selector + owner. It is not a rule switch-off — an entry
 * only forgives the matching nodes, it is written to
 * `reports/p9/a11y/summary.json` as evidence, and the spec fails when an entry
 * matches nothing, so stale entries cannot rot silently.
 */
export const ALLOW_LIST: AllowEntry[] = [
  {
    rule: "color-contrast",
    selector: "bg-node-system",
    owner: "A — src/components/dashboard/** and src/components/tasks/**",
    reason:
      "node-status badges: text-node-system on a 15%-tinted background at 10-12px is under 4.5:1 (dashboard task list and board cards).",
  },
  {
    rule: "color-contrast",
    selector: "bg-node-research",
    owner: "A — src/components/dashboard/** (task status badges)",
    reason: "Same badge pattern as bg-node-system, on the dashboard task list.",
  },
  {
    rule: "color-contrast",
    selector: "text-muted-foreground/70",
    owner: "A — src/components/brain/folder-tree.tsx",
    reason: "The 'Folders' section label (10px, muted-foreground at 70%) is under 4.5:1.",
  },
  {
    rule: "color-contrast",
    selector: "tracking-wider text-muted-foreground/60",
    owner: "C — src/components/settings/settings-view.tsx",
    reason:
      "The settings nav-section headings ('Global', 'Capture', …) are muted-foreground at 60%, under 4.5:1.",
  },
  {
    rule: "label",
    selector: "h-1.5 w-40",
    owner: "C — src/components/settings/settings-view.tsx",
    reason: "axe's label rule on the same unlabelled range slider (add an aria-label or a <label>).",
  },
  {
    rule: "custom:nameless-control",
    selector: 'placeholder="Owner (user or org)"',
    owner: "A — src/components/dashboard/commits-panel.tsx",
    reason:
      "The repository-connect form labels its inputs with placeholders only. Fix: an aria-label on each input.",
  },
  {
    rule: "custom:nameless-control",
    selector: 'placeholder="Repository name"',
    owner: "A — src/components/dashboard/commits-panel.tsx",
    reason: "Same form, same fix.",
  },
  {
    rule: "custom:nameless-control",
    selector: 'placeholder="Branch (default)"',
    owner: "A — src/components/dashboard/commits-panel.tsx",
    reason: "Same form, same fix.",
  },
  {
    rule: "custom:nameless-control",
    selector: 'placeholder="Personal access token"',
    owner: "A — src/components/dashboard/commits-panel.tsx",
    reason: "Same form, same fix (an unlabelled password field is read as a nameless edit box).",
  },
  {
    rule: "custom:nameless-control",
    selector: 'placeholder="Search notes…"',
    owner: "A — src/components/brain/notes-view.tsx",
    reason: "The notes-list filter has only a placeholder; the panel is visible in the default dock layout.",
  },
  {
    rule: "custom:nameless-control",
    selector: 'placeholder="#dedede"',
    owner: "C — src/components/settings/settings-view.tsx",
    reason: "The theme hex-colour field has no label (aria-label on the Input would fix it).",
  },
  {
    rule: "custom:nameless-control",
    selector: "h-1.5 w-40",
    owner: "C — src/components/settings/settings-view.tsx",
    reason: "The theme opacity/amount range slider has no label (it is the RangeField above the hex field).",
  },
  {
    rule: "custom:nameless-control",
    selector: 'placeholder="Search plugins…"',
    owner: "unowned this wave — src/components/plugins/plugins-view.tsx",
    reason: "The plugin search has only a placeholder, same pattern as the other list filters.",
  },
];

export interface AllowListResult {
  /** Nodes that survive the allow-list — these fail the test. */
  failing: AxeViolation[];
  /** Nodes the allow-list forgave, as rule/selector/owner/target records. */
  allowed: { rule: string; selector: string; owner: string; target: string }[];
  /** Allow entries that matched nothing in this scan set. */
  unmatched: AllowEntry[];
}

function nodeMatches(entry: AllowEntry, node: AxeNode): boolean {
  return `${node.target} ${node.html}`.includes(entry.selector);
}

/** Splits violations into failing and allow-listed nodes, per rule id. */
export function applyAllowList(
  violations: AxeViolation[],
  entries: AllowEntry[],
): AllowListResult {
  const failing: AxeViolation[] = [];
  const allowed: AllowListResult["allowed"] = [];
  const usedEntries = new Set<AllowEntry>();

  for (const violation of violations) {
    const kept: AxeNode[] = [];
    for (const node of violation.nodes) {
      const entry = entries.find((e) => e.rule === violation.id && nodeMatches(e, node));
      if (entry) {
        usedEntries.add(entry);
        allowed.push({
          rule: violation.id,
          selector: entry.selector,
          owner: entry.owner,
          target: node.target,
        });
      } else {
        kept.push(node);
      }
    }
    if (kept.length) failing.push({ ...violation, nodes: kept });
  }

  return {
    failing: failing.filter((v) => v.impact !== null && FAILING_IMPACTS.includes(v.impact)),
    allowed,
    unmatched: entries.filter((e) => !usedEntries.has(e)),
  };
}
