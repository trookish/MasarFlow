export function formatModelRef(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

/** Split on the FIRST colon only — model ids such as `llama-3:free` contain colons. */
export function parseModelRef(ref: string): { providerId: string; modelId: string } {
  const i = ref.indexOf(":");
  if (i < 0) return { providerId: "", modelId: ref.trim() };
  return { providerId: ref.slice(0, i).trim(), modelId: ref.slice(i + 1).trim() };
}

export function parseSlashModel(input: string): { ref: string } | null {
  const m = /^\/model(?:\s+(.*))?$/.exec(input.trim());
  return m ? { ref: (m[1] ?? "").trim() } : null;
}

/** Match `<provider id or connection label>:<model>` to a saved connection (first match wins). */
export function resolveModelRef(
  ref: string,
  connections: { id: string; providerId: string; label: string }[],
): { connectionId: string; modelId: string } | null {
  const { providerId, modelId } = parseModelRef(ref);
  if (!providerId || !modelId) return null;
  const want = providerId.toLowerCase();
  const conn =
    connections.find((c) => c.label.toLowerCase() === want) ??
    connections.find((c) => c.providerId.toLowerCase() === want);
  return conn ? { connectionId: conn.id, modelId } : null;
}
