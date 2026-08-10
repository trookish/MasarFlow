import type { ServerStatus } from "@shared/types";

async function reachable(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}`, {
      signal: AbortSignal.timeout(700),
      headers: { "User-Agent": "masarflow-launcher" },
    });
    return true;
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
      const [app, python] = await Promise.all([reachable(appPort), reachable(pythonPort)]);
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
