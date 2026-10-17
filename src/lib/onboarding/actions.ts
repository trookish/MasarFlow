/**
 * First-run wizard actions (P10.T4/T5). The pure helpers live here so the
 * wizard's decision logic is testable in the node-only vitest environment;
 * the two IO entry points are thin wrappers over existing surfaces
 * (POST /api/fs/list + the P4 backup import), not new machinery.
 */

/** Last non-empty segment of a Windows or POSIX path; "" for a drive/root itself. */
export function basenameOf(input: string): string {
  const clean = input.trim().replace(/[/\\]+$/, "");
  if (!clean) return "";
  const parts = clean.split(/[/\\]+/).filter(Boolean);
  return parts.length <= 1 ? "" : parts[parts.length - 1];
}
