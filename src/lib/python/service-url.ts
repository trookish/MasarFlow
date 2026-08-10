import { getManagedServiceUrl } from "@/lib/python/startup";

const DEFAULT_URL = "http://127.0.0.1:8000";

/**
 * The URL /api/python/* proxies should use right now: the app-managed
 * service's live URL when the app spawned it (it may run on a dynamically
 * shifted port when the configured one is squatted), otherwise the configured
 * PYTHON_SERVICE_URL / default.
 */
export function getPythonServiceUrl(): string {
  return (
    (getManagedServiceUrl() ?? process.env.PYTHON_SERVICE_URL?.trim()) ||
    DEFAULT_URL
  );
}
