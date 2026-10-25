import { describe, expect, it } from "vitest";
import { isRunning, runExclusive } from "@/lib/vault/runner";

describe("runExclusive", () => {
  it("joins concurrent requests for one project into one run", async () => {
    let runs = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const job = async () => {
      runs += 1;
      await gate;
      return runs;
    };
    const a = runExclusive("p1", job);
    const b = runExclusive("p1", job);
    expect(isRunning("p1")).toBe(true);
    release();
    expect(await Promise.all([a, b])).toEqual([1, 1]);
    expect(runs).toBe(1);
    expect(isRunning("p1")).toBe(false);
  });

  it("runs different projects independently and frees the slot after a failure", async () => {
    const out = await Promise.all([runExclusive("a", async () => "a"), runExclusive("b", async () => "b")]);
    expect(out).toEqual(["a", "b"]);
    await expect(runExclusive("a", async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await runExclusive("a", async () => 2)).toBe(2);
  });
});
