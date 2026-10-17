import { EventEmitter } from "node:events";
import { describe, it, expect, vi } from "vitest";
import { streamFromIncoming } from "@desktop/backend/protocol-url";

/** Stands in for Electron's IncomingMessage: emits data/end/error on demand. */
function fakeResponse() {
  return new EventEmitter();
}

describe("streamFromIncoming", () => {
  it("passes the body through and closes at the end", async () => {
    const resp = fakeResponse();
    const stream = streamFromIncoming(resp, () => {});
    resp.emit("data", Buffer.from("hel"));
    resp.emit("data", Buffer.from("lo"));
    resp.emit("end");
    expect(await new Response(stream).text()).toBe("hello");
  });

  // The main-process crash: the renderer cancels a response (reload, navigation,
  // an aborted fetch) while the loopback server is still sending. Enqueueing into
  // the closed controller threw "Invalid state: Controller is already closed" as an
  // uncaught exception in the main process.
  it("ignores chunks that arrive after the reader cancelled, and aborts the request", async () => {
    const resp = fakeResponse();
    const abort = vi.fn();
    const stream = streamFromIncoming(resp, abort);
    resp.emit("data", Buffer.from("first"));
    await stream.cancel("renderer navigated away");
    expect(abort).toHaveBeenCalledTimes(1);
    expect(() => resp.emit("data", Buffer.from("late"))).not.toThrow();
    expect(() => resp.emit("end")).not.toThrow();
    expect(() => resp.emit("error", new Error("socket closed"))).not.toThrow();
  });

  it("ignores events after the stream already ended or errored", () => {
    const ended = fakeResponse();
    streamFromIncoming(ended, () => {});
    ended.emit("end");
    expect(() => ended.emit("data", Buffer.from("x"))).not.toThrow();
    expect(() => ended.emit("end")).not.toThrow();

    const failed = fakeResponse();
    const s = streamFromIncoming(failed, () => {});
    s.getReader().closed.catch(() => {}); // the errored stream is expected
    failed.emit("error", new Error("boom"));
    expect(() => failed.emit("data", Buffer.from("x"))).not.toThrow();
    expect(() => failed.emit("end")).not.toThrow();
  });
});
