/**
 * SSE subscription manager for the OpenCode server.
 *
 * A single GET /global/event connection is shared by every active turn and
 * fanned out to per-session subscribers. This keeps the server load minimal
 * and lets a reconnecting browser re-attach to a still-running turn: as long
 * as the OpenCode session is busy, a new subscription receives its live
 * events with no duplicate request.
 *
 * Reliability: automatic reconnect with capped exponential backoff; a dropped
 * stream sets `disconnected` (subscribers get a synthetic event) and the turn
 * controller decides whether to fail or keep waiting for the POST result.
 */

import { createOpencodeLogger } from "./logger";
import type { OpenCodeEvent, OpenCodeGlobalEvent } from "./types";

const MAX_RETRY_MS = 30_000;
const LINGER_MS = 5_000;

type Subscriber = (event: OpenCodeEvent) => void;

/** Parsed SSE frame parser — returns [events, leftover buffer]. */
export function parseSseFrames(
  buffer: string,
): [OpenCodeGlobalEvent[], string] {
  const frames: OpenCodeGlobalEvent[] = [];
  let rest = buffer;
  for (;;) {
    const idx = rest.indexOf("\n\n");
    if (idx === -1) break;
    const raw = rest.slice(0, idx);
    rest = rest.slice(idx + 2);
    let data = "";
    for (const line of raw.split("\n")) {
      if (line.startsWith("data:")) {
        const value = line.slice(5);
        data += data ? "\n" + value.trim() : value.trim();
      }
      // `event:` / `id:` / `retry:` lines are ignored — the payload carries the type.
    }
    if (!data) continue; // keepalive comment / empty frame
    try {
      frames.push(JSON.parse(data) as OpenCodeGlobalEvent);
    } catch {
      // Malformed frame — skip rather than kill the stream.
    }
  }
  return [frames, rest];
}

class EventBus {
  private readonly log = createOpencodeLogger();
  private readonly subscribers = new Map<string, Set<Subscriber>>();
  private controller: AbortController | null = null;
  private readerPromise: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private lingerTimer: ReturnType<typeof setTimeout> | null = null;
  private retryMs = 1_000;
  private _connected = false;
  /** Delivered to subscribers when the stream drops (turn controller reacts). */
  private readonly disconnectedEvent: OpenCodeEvent = {
    type: "stream.disconnected",
    properties: {},
  };

  get connected(): boolean {
    return this._connected;
  }

  /**
   * Subscribe to events for one session. Returns an unsubscribe function.
   * The shared connection starts on first subscriber and lingers briefly
   * after the last one leaves.
   */
  subscribe(sessionId: string, handler: Subscriber): () => void {
    let set = this.subscribers.get(sessionId);
    if (!set) {
      set = new Set();
      this.subscribers.set(sessionId, set);
    }
    set.add(handler);
    this.ensureConnected();
    return () => {
      const s = this.subscribers.get(sessionId);
      if (s) {
        s.delete(handler);
        if (s.size === 0) this.subscribers.delete(sessionId);
      }
      if (this.subscribers.size === 0) this.scheduleLinger();
    };
  }

  /** True when at least one session is subscribed. */
  get hasSubscribers(): boolean {
    return this.subscribers.size > 0;
  }

  /**
   * Test hook: tear the shared connection down completely so the next test
   * starts from a clean slate. Production code never calls this.
   */
  resetForTests(): void {
    this.disconnect();
    this.subscribers.clear();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.lingerTimer) clearTimeout(this.lingerTimer);
    this.retryTimer = null;
    this.lingerTimer = null;
    this.retryMs = 1_000;
    this.readerPromise = null;
  }

  private scheduleLinger(): void {
    if (this.lingerTimer) clearTimeout(this.lingerTimer);
    this.lingerTimer = setTimeout(() => {
      if (this.subscribers.size === 0) this.disconnect();
    }, LINGER_MS);
  }

  private disconnect(): void {
    this._connected = false;
    this.controller?.abort();
    this.controller = null;
    this.readerPromise = null;
  }

  private ensureConnected(): void {
    if (this.readerPromise) return;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    void this.connectLoop();
  }

  private async connectLoop(): Promise<void> {
    try {
      const res = await fetch(this.baseUrl() + "/global/event");
      if (!res.ok || !res.body) throw new Error(`SSE HTTP ${res.status}`);
      this._connected = true;
      this.retryMs = 1_000;
      this.controller = new AbortController();
      this.readerPromise = this.pump(res.body.getReader());
      await this.readerPromise;
    } catch (e) {
      this._connected = false;
      if (this.subscribers.size === 0) {
        this.readerPromise = null;
        return;
      }
      this.log.warn("Event stream disconnected — reconnecting", {
        error: (e as Error).message,
        retryMs: this.retryMs,
      });
      this.fanOut(this.disconnectedEvent);
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.readerPromise = null;
      this.ensureConnected();
    }, this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
  }

  private async pump(
    reader: ReadableStreamDefaultReader<Uint8Array>,
  ): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const [frames, rest] = parseSseFrames(buffer);
        buffer = rest;
        for (const frame of frames) {
          const payload = frame.payload;
          if (!payload?.type) continue;
          if (payload.type === "server.connected") {
            // Backoff reset after a clean (re)connect.
            this.retryMs = 1_000;
            this._connected = true;
            continue;
          }
          this.fanOut(payload);
        }
      }
    } finally {
      this._connected = false;
    }
    // Clean EOF (server closed the stream) → reconnect if still needed.
    if (this.subscribers.size > 0) {
      this.readerPromise = null;
      this.log.warn("Event stream ended — reconnecting");
      this.fanOut(this.disconnectedEvent);
      this.scheduleRetry();
    }
  }

  private fanOut(event: OpenCodeEvent): void {
    const props = event.properties ?? {};
    // message.part.updated carries the session id inside properties.part;
    // other events carry it as properties.sessionID.
    const part = props.part as { sessionID?: string } | undefined;
    const sessionId =
      (props.sessionID as string | undefined) ?? part?.sessionID ?? "";
    const listeners = sessionId ? this.subscribers.get(sessionId) : undefined;
    if (!listeners?.size) return;
    for (const handler of [...listeners]) {
      try {
        handler(event);
      } catch {
        // A subscriber must never kill the shared stream.
      }
    }
  }

  private baseUrl(): string {
    return (process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4096")
      .trim()
      .replace(/\/+$/, "");
  }
}

/** Process-wide singleton — one shared SSE connection. */
export const eventBus = new EventBus();
