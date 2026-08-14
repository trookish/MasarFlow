import type { ServerStatus } from "@shared/types";

/**
 * Probe a local URL. `requireOk` is used for the Python service, whose real
 * liveness signal is a 200 from /health — any other response (or a foreign
 * process squatting the port) must not light the chip green.
 */
async function reachable(url: string, requireOk = false): Promise<boolean> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(700),
      headers: { "User-Agent": "masarflow-launcher" },
    });
    return requireOk ? res.ok : true;
  } catch {
    return false;
  }
}

export function startStatusPolling(
  getPorts: () => { appPort: number; pythonPort: number },
  emit: (status: ServerStatus) => void,
): () => void {
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      const { appPort, pythonPort } = getPorts();
      const [app, python] = await Promise.all([
        reachable(`http://127.0.0.1:${appPort}`),
        // The Python service has no root route — hitting "/" just produces a
        // 404 in its access log. Its health endpoint is the intended probe.
        reachable(`http://127.0.0.1:${pythonPort}/health`, true),
      ]);
      emit({ app, python, appPort, pythonPort });
    } catch {
      // ignore transient failures
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), 1500);
  return () => clearInterval(timer);
}
