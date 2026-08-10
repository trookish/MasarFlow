/**
 * Session helpers: directory resolution (linked project root → configured
 * workspace dir → project root), permission rulesets, and create/get with
 * automatic repair (a session that no longer exists is recreated once).
 */

import { OpenCodeClient } from "./client";
import { permissionRules, type OpenCodeConfig } from "./config";
import { OpenCodeError } from "./errors";
import type { OpenCodeSession } from "./types";

/** Resolve the working directory for a chat's OpenCode session. */
export function resolveSessionDirectory(linkedProjectRoot?: string): string {
  if (linkedProjectRoot?.trim()) return linkedProjectRoot.trim();
  const env = process.env.OPENCODE_WORKSPACE_DIR?.trim();
  if (env) return env;
  return process.cwd();
}

export interface EnsureSessionOptions {
  directory: string;
  title?: string;
  model?: { providerID: string; modelID: string };
  config: OpenCodeConfig;
}

export interface EnsureSessionResult {
  session: OpenCodeSession;
  created: boolean;
}

/**
 * Get the session for a chat, creating it when missing (or recreating it when
 * the stored id no longer exists on the server). Returns null only when the
 * server itself is unreachable.
 */
export async function ensureSession(
  client: OpenCodeClient,
  sessionId: string | undefined,
  opts: EnsureSessionOptions,
): Promise<EnsureSessionResult | null> {
  if (sessionId) {
    const existing = await client.getSession(sessionId);
    if (existing) return { session: existing, created: false };
  }
  let created: OpenCodeSession;
  try {
    created = await client.createSession(opts.directory, {
      title: opts.title,
      model: opts.model,
      permission: permissionRules(opts.config),
    });
  } catch (e) {
    if (e instanceof OpenCodeError && e.kind === "unavailable") return null;
    throw e;
  }
  return { session: created, created: true };
}

/** Human-safe prefix for chat sessions so they are identifiable in OpenCode. */
export function sessionTitleFor(chatId: string): string {
  return `MasarFlow · ${chatId}`;
}
