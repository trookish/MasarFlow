/**
 * The diagnostics redaction contract (master Q6: no telemetry — "Copy
 * diagnostics" is the whole support story). Pure: same input, same output,
 * no IO. The main-process collector (desktop/src/main/diagnostics.ts) is the
 * only producer; the rules below are what the unit tests pin down.
 */

/** The redaction contract, printed at the top of every diagnostics report. */
export const REDACTION_RULES = [
  "No API keys, tokens, PATs, bridge secrets or launch tokens are included.",
  "The user home directory is replaced with %USERPROFILE%.",
  "Paths outside your linked project folders are replaced with <redacted-path>.",
  "What you copy may still name folders you linked on purpose; read it before pasting it anywhere.",
] as const;

export interface RedactionOptions {
  /** Absolute paths allowed to appear verbatim (the roots.json allow-list). */
  allowedPaths: string[];
  /** Home directory to collapse to %USERPROFILE%. */
  userHome: string;
}

const winPath = /[A-Za-z]:[\\/][^\s"'`)\]]+/g;
const posixHomePath = /\/(?:home|Users|root)\/[^\s"'`)\]]+/g;
const urls = /https?:\/\/[^\s"'`)\]]+/g;

/**
 * URLs are lifted out before the path rules run (a release link must survive)
 * and put back at the end. The placeholder carries an index because a single
 * constant placeholder cannot restore the original text.
 */
function protectUrls(text: string, store: string[]): string {
  return text.replace(urls, (match) => {
    store.push(match);
    return `\u0000URL${store.length - 1}\u0000`;
  });
}

function restoreUrls(text: string, store: string[]): string {
  return text.replace(/\u0000URL(\d+)\u0000/g, (_match, index: string) => store[Number(index)] ?? "");
}

function normalize(p: string): string {
  return p.trim().replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
}

/** True when `path` is a registered root or inside one (boundary-correct). */
export function isAllowedPath(path: string, allowedPaths: string[]): boolean {
  const target = normalize(path);
  return allowedPaths.some((root) => {
    const r = normalize(root);
    return r.length > 0 && (target === r || target.startsWith(`${r}/`));
  });
}

/** Apply every REDACTION_RULES entry. Pure: same input, same output, no IO. */
export function redactText(text: string, opts: RedactionOptions): string {
  const captured: string[] = [];
  // 0. Protect URLs so the path rule cannot eat a release link.
  let out = protectUrls(text, captured);
  // 1. Explicit secret shapes.
  out = out.replace(/\b(?:gh[pousr]_[A-Za-z0-9]{8,}|sk-[A-Za-z0-9_-]{8,}|msf_[A-Za-z0-9_-]{8,})\b/g, "<redacted-token>");
  // 2. Generic opaque blobs (launch tokens, base64 blobs).
  out = out.replace(/\b[A-Za-z0-9_-]{40,}\b/g, "<redacted>");
  // 3. Home directory.
  if (opts.userHome) {
    out = out.split(opts.userHome).join("%USERPROFILE%");
    out = out.split(opts.userHome.replaceAll("\\", "/")).join("%USERPROFILE%");
  }
  // 4. Foreign paths.
  const mask = (m: string): string => (isAllowedPath(m, opts.allowedPaths) ? m : "<redacted-path>");
  out = out.replace(winPath, mask).replace(posixHomePath, mask);
  // 5. Restore URLs.
  return restoreUrls(out, captured);
}

export interface DiagnosticsSection {
  title: string;
  lines: string[];
}

/** Render the report the Copy-diagnostics button puts on the clipboard. */
export function buildDiagnosticsReport(sections: DiagnosticsSection[]): string {
  const head = [
    "# MasarFlow diagnostics",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Redaction:",
    ...REDACTION_RULES.map((r) => `- ${r}`),
    "",
  ];
  const body = sections.flatMap((s) => [`## ${s.title}`, "", ...s.lines.map((l) => `- ${l}`), ""]);
  return [...head, ...body].join("\n");
}
