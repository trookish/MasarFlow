/**
 * Canvas collaboration architecture.
 *
 * Real-time multi-user editing is not implemented yet, but this module
 * defines the seams so a future collaboration backend (WebRTC, WebSocket,
 * or CRDT-based) can plug in without changing the canvas board.
 *
 * ## Architecture
 *
 * 1. **Presence** — who is online, where is their cursor, what are they
 *    selecting. The board renders presence indicators from a
 *    `CanvasPresenceState`.
 *
 * 2. **Operations** — every mutation (add/move/resize/edit/delete) is
 *    described as a `CanvasOp`. A collaboration backend would serialize
 *    these and broadcast them to peers. The board already persists to
 *    IndexedDB; a collab layer would *also* emit ops.
 *
 * 3. **Conflict resolution** — when two users edit the same node, the
 *    `ConflictResolver` decides which version wins. The default is
 *    last-write-wins (LWW) by timestamp; a CRDT layer would replace this.
 *
 * None of these are wired to a real backend — they're the interface
 * contracts that a future implementation would fulfill.
 */

/* ── Presence ─────────────────────────────────────────────────────────────── */

export interface Collaborator {
  id: string;
  name: string;
  /** CSS color for their cursor / selection highlight. */
  color: string;
}

export interface PresenceCursor {
  userId: string;
  /** Canvas-space position (flow coordinates), not screen coordinates. */
  x: number;
  y: number;
  /** Optional node id the user is hovering over / editing. */
  nodeId?: string;
}

export interface PresenceSelection {
  userId: string;
  nodeIds: string[];
}

export interface CanvasPresenceState {
  collaborators: Collaborator[];
  cursors: PresenceCursor[];
  selections: PresenceSelection[];
}

export const EMPTY_PRESENCE: CanvasPresenceState = {
  collaborators: [],
  cursors: [],
  selections: [],
};

/* ── Operations (the mutation log a collab backend would broadcast) ───────── */

export type CanvasOp =
  | { kind: "addNode"; nodeId: string; type: string; x: number; y: number; width: number; height: number; data: Record<string, unknown>; ts: number }
  | { kind: "moveNode"; nodeId: string; x: number; y: number; ts: number }
  | { kind: "resizeNode"; nodeId: string; width: number; height: number; ts: number }
  | { kind: "updateNodeData"; nodeId: string; data: Record<string, unknown>; ts: number }
  | { kind: "deleteNode"; nodeId: string; ts: number }
  | { kind: "addEdge"; edgeId: string; source: string; target: string; ts: number }
  | { kind: "deleteEdge"; edgeId: string; ts: number };

/* ── Conflict resolution ──────────────────────────────────────────────────── */

/**
 * Default: last-write-wins by timestamp. A future CRDT layer would provide
 * a richer resolver (e.g. merging text edits rather than overwriting).
 */
export function resolveConflict(
  local: { ts: number; data: Record<string, unknown> },
  remote: { ts: number; data: Record<string, unknown> },
): Record<string, unknown> {
  return remote.ts > local.ts ? remote.data : local.data;
}

/* ── Transport interface (what a collab backend must implement) ───────────── */

/**
 * The transport contract for a real-time collaboration backend.
 * The canvas board calls `emit` to broadcast local ops; the transport
 * calls `onRemoteOp` (registered by the board) to deliver remote ops.
 *
 * A no-op `LocalOnlyTransport` is provided so the board can code against
 * this interface today without a real backend.
 */
export interface CanvasTransport {
  /** Broadcast a local operation to all peers. */
  emit(op: CanvasOp): void;
  /** Register a handler for operations received from peers. */
  onRemoteOp(handler: (op: CanvasOp) => void): () => void;
  /** Update presence (cursor position, selection) for the local user. */
  updatePresence(cursor?: PresenceCursor, selection?: PresenceSelection): void;
  /** Register a handler for presence updates from peers. */
  onPresenceUpdate(handler: (state: CanvasPresenceState) => void): () => void;
  /** Connect / disconnect. */
  connect(): void;
  disconnect(): void;
}

/** A no-op transport for local-only mode (no collaboration backend). */
export class LocalOnlyTransport implements CanvasTransport {
  emit(): void {}
  onRemoteOp(): () => void {
    return () => {};
  }
  updatePresence(): void {}
  onPresenceUpdate(): () => void {
    return () => {};
  }
  connect(): void {}
  disconnect(): void {}
}

/**
 * Module-level transport singleton. The board uses this; a future collab
 * plugin would swap it for a real WebSocket/WebRTC transport.
 */
let activeTransport: CanvasTransport = new LocalOnlyTransport();

export function getCanvasTransport(): CanvasTransport {
  return activeTransport;
}

export function setCanvasTransport(transport: CanvasTransport): void {
  activeTransport = transport;
}
