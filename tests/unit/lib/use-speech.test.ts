import { describe, it, expect } from "vitest";
import { speechAvailability, type SpeechWindowLike } from "@/lib/hooks/use-speech";

const ctor = function SpeechRecognition() {};
const win = { SpeechRecognition: ctor } as unknown as SpeechWindowLike;
const legacy = { webkitSpeechRecognition: ctor } as unknown as SpeechWindowLike;

describe("speechAvailability", () => {
  it("is false without a window (SSR / node)", () => {
    expect(speechAvailability(null, false)).toBe(false);
  });
  it("is false in a browser without the API", () => {
    expect(speechAvailability({} as SpeechWindowLike, false)).toBe(false);
  });
  it("is true in a browser that exposes either constructor", () => {
    expect(speechAvailability(win, false)).toBe(true);
    expect(speechAvailability(legacy, false)).toBe(true);
  });
  it("is false in the desktop shell even when the constructor exists", () => {
    // Electron ships the constructor without a speech backend, so the button
    // would appear and fail on the first click (F7).
    expect(speechAvailability(win, true)).toBe(false);
  });
});
