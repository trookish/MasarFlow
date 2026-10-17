/**
 * One-shot "create" intents carried in the URL as `?new=<nonce>`.
 *
 * The dashboard's "New task"/"New spec" buttons deep-link to the target view
 * with a fresh nonce per click. The view creates an item only when it wins
 * the claim for that nonce. Claims live in a module-level set, so they
 * survive a remount, a dock panel replaying its stale URL snapshot, and the
 * window before `router.replace` lands. Under load the old boolean
 * `?new=1` flag re-fired on every true → false → true transition and one
 * click created three tasks.
 *
 * Pure module (no React): unit-tested under the node vitest environment.
 */

const CONSUMED = new Set<string>();

/** Bound on remembered nonces; each is one user click, so this is generous. */
const MAX_REMEMBERED = 500;

/**
 * The create-intent nonce for `route`, or null. Route-scoped: `/specs?new=x`
 * is not an intent for `/tasks`.
 */
export function readCreateIntent(
  route: string,
  pathname: string,
  params: { get(name: string): string | null },
): string | null {
  if (pathname !== route) return null;
  const nonce = params.get("new");
  return nonce ? nonce : null;
}

/**
 * Claims the intent synchronously. True only for the first caller per
 * (route, nonce); call it BEFORE starting the async create.
 */
export function claimCreateIntent(route: string, nonce: string): boolean {
  const key = `${route}\u0000${nonce}`;
  if (CONSUMED.has(key)) return false;
  CONSUMED.add(key);
  if (CONSUMED.size > MAX_REMEMBERED) {
    // Sets iterate in insertion order: drop the oldest claim.
    const oldest = CONSUMED.values().next().value;
    if (oldest !== undefined) CONSUMED.delete(oldest);
  }
  return true;
}

function newNonce(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A link that asks `route` to create one item. Fresh nonce per call. */
export function createIntentHref(route: string): string {
  return `${route}?new=${newNonce()}`;
}

/** Test seam: forget every claim. */
export function resetCreateIntentsForTests(): void {
  CONSUMED.clear();
}
