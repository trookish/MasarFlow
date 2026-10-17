import { describe, it, expect, beforeEach } from "vitest";
import {
  claimCreateIntent,
  createIntentHref,
  readCreateIntent,
  resetCreateIntentsForTests,
} from "@/lib/navigation/create-intent";

/**
 * Simulates one render of a view that consumes `?new=<nonce>`: the view reads
 * the intent from the URL and creates only if it wins the claim. Returns
 * whether this render would have created an item.
 */
function render(route: string, pathname: string, search: string): boolean {
  const nonce = readCreateIntent(route, pathname, new URLSearchParams(search));
  return nonce !== null && claimCreateIntent(route, nonce);
}

describe("create intent", () => {
  beforeEach(() => resetCreateIntentsForTests());

  it("creates once when the same nonce is rendered or remounted three times", () => {
    const results = [
      render("/tasks", "/tasks", "?new=abc"),
      // the dock replays the panel's stale URL snapshot
      render("/tasks", "/tasks", "?new=abc"),
      // the view remounts before router.replace has landed
      render("/tasks", "/tasks", "?new=abc"),
    ];
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("creates again for a new nonce (a second real click)", () => {
    expect(render("/tasks", "/tasks", "?new=one")).toBe(true);
    expect(render("/tasks", "/tasks", "?new=two")).toBe(true);
  });

  it("is route-scoped: /specs?new=x never creates a task", () => {
    expect(render("/tasks", "/specs", "?new=x")).toBe(false);
    // and the spec view can still consume it
    expect(render("/specs", "/specs", "?new=x")).toBe(true);
  });

  it("scopes claims per route, so the same nonce on two routes is two intents", () => {
    expect(render("/tasks", "/tasks", "?new=n")).toBe(true);
    expect(render("/specs", "/specs", "?new=n")).toBe(true);
  });

  it("ignores a missing or empty value", () => {
    expect(render("/tasks", "/tasks", "")).toBe(false);
    expect(render("/tasks", "/tasks", "?new=")).toBe(false);
  });

  it("builds a fresh nonce per href", () => {
    const a = createIntentHref("/tasks");
    const b = createIntentHref("/tasks");
    expect(a).toMatch(/^\/tasks\?new=[\w-]+$/);
    expect(a).not.toBe(b);
  });
});
