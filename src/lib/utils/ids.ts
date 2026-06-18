/**
 * Generate a RFC4122 v4 UUID. Uses the platform crypto implementation,
 * which is available in modern browsers and Node 19+.
 */
export function uuid(): string {
  return crypto.randomUUID();
}

/** Current epoch milliseconds — the canonical timestamp for all records. */
export function now(): number {
  return Date.now();
}

/**
 * Build a URL-safe slug from arbitrary text.
 * Falls back to a short random suffix when the input has no usable characters.
 */
export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || `item-${crypto.randomUUID().slice(0, 8)}`;
}
