import { db } from "@/lib/db";
import type { AiConnection } from "@/lib/db/schema";
import { deleteSecret, getSecret, secretsAvailable, setSecret } from "@/lib/secrets";

export const aiKeySecret = (id: string): string => `ai-connection:${id}`;

/** Fill `apiKey` from the secret store when the row holds a blank. */
export async function hydrateConnection(c: AiConnection): Promise<AiConnection> {
  if (!secretsAvailable() || c.apiKey) return c;
  const key = await getSecret(aiKeySecret(c.id));
  return key ? { ...c, apiKey: key } : c;
}

/** Persist the key as a secret and return the row to write (blank key). */
export async function stripConnectionSecret(c: AiConnection): Promise<AiConnection> {
  if (!secretsAvailable()) return c;
  if (c.apiKey) await setSecret(aiKeySecret(c.id), c.apiKey);
  return { ...c, apiKey: "" };
}

/** One-time move of plaintext keys written by v0.1 into the secret store. Idempotent. */
export async function migrateAiConnectionSecrets(): Promise<number> {
  if (!secretsAvailable()) return 0;
  let moved = 0;
  for (const row of await db.aiConnections.toArray()) {
    if (!row.apiKey) continue;
    await setSecret(aiKeySecret(row.id), row.apiKey);
    await db.aiConnections.update(row.id, { apiKey: "" });
    moved++;
  }
  return moved;
}

export async function removeConnectionSecret(id: string): Promise<void> {
  if (secretsAvailable()) await deleteSecret(aiKeySecret(id));
}
