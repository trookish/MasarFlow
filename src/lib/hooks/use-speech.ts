"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Voice input via the browser's Web Speech API (SpeechRecognition). Fully
 * local to the browser — no key, no server. Chromium-based browsers support
 * it; elsewhere `supported` is false and the mic button should hide.
 */

interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
}

interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
}

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseSpeechInput {
  /** Whether this browser can do speech recognition at all. */
  supported: boolean;
  /** Actively listening right now. */
  listening: boolean;
  /** Last recognition error, user-readable. */
  error: string | null;
  start: () => void;
  stop: () => void;
}

/**
 * Dictation hook: while listening, final transcript chunks are delivered via
 * `onTranscript` (append them to the composer); interim text via `onInterim`.
 */
export function useSpeechInput(opts: {
  lang?: string;
  onTranscript: (text: string) => void;
  onInterim?: (text: string) => void;
}): UseSpeechInput {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const supported = getRecognitionCtor() !== null;

  const stop = useCallback(() => {
    recRef.current?.stop();
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }
    setError(null);
    const rec = new Ctor();
    rec.lang = optsRef.current.lang ?? "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          optsRef.current.onTranscript(r[0].transcript);
        } else {
          interim += r[0].transcript;
        }
      }
      optsRef.current.onInterim?.(interim);
    };
    rec.onend = () => {
      setListening(false);
      optsRef.current.onInterim?.("");
    };
    rec.onerror = (e) => {
      setListening(false);
      setError(
        e.error === "not-allowed"
          ? "Microphone access was denied. Allow it in the browser's site settings."
          : e.error === "no-speech"
            ? null // Silence timeout — not really an error.
            : `Voice input error: ${e.error ?? "unknown"}`,
      );
    };
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("Could not start the microphone.");
    }
  }, []);

  // Stop listening when the component unmounts.
  useEffect(() => () => recRef.current?.abort(), []);

  return { supported, listening, error, start, stop };
}
