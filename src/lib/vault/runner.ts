/**
 * One replica run per project at a time (v0.3 P3 T5). A second request while a run is in flight
 * joins that run instead of starting another, so a timer, a focus event and a click can never race
 * on the same index.
 */
const inFlight = new Map<string, Promise<unknown>>();

export function runExclusive<T>(projectId: string, run: () => Promise<T>): Promise<T> {
  const current = inFlight.get(projectId);
  if (current) return current as Promise<T>;
  const p = run().finally(() => {
    if (inFlight.get(projectId) === p) inFlight.delete(projectId);
  });
  inFlight.set(projectId, p);
  return p;
}

export function isRunning(projectId: string): boolean {
  return inFlight.has(projectId);
}
