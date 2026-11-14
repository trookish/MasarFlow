import { test, expect, writeEvidence, navigateTo, surfacePanel } from "./_harness";

/**
 * F7 / P9.T13: speech input in the packaged shell is HIDDEN, not disabled.
 *
 * The probe below still runs INSIDE the packaged renderer and records what
 * webkitSpeechRecognition actually does in Electron 43 — evidence:
 * reports/p9/voice-probe.json (decision recorded in reports/p9/voice-probe.md).
 * The probe has never produced a usable session (Electron ships no speech
 * service; the app's permission policy denies the microphone), so the shipped
 * invariant is unconditional after the P9.T13 decision ("hide"):
 *
 *   the packaged app must render NO dictation control, ever.
 *
 * Implemented by src/lib/hooks/use-speech.ts (speechAvailability() is false
 * whenever the desktop bridge is present) and
 * src/components/chat/chat-view.tsx (`{speech.supported && …}`). This spec
 * pins the outcome; the probe result explains WHY the runtime can't support
 * it, but the assertion does not depend on the probe — a future Electron that
 * ships speech keeps this spec red until the P9.T13 decision is revisited
 * deliberately.
 */
test("voice: the packaged shell renders no dictation control", async ({ desktop }) => {
  const { page } = desktop;

  const probe = await page.evaluate(async () => {
    // Local shape: this tsconfig's DOM lib has no SpeechRecognition types
    // (src/lib/hooks/use-speech.ts declares its own for the same reason).
    interface ProbeRecognition {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      start(): void;
      abort(): void;
      onstart: (() => void) | null;
      onend: (() => void) | null;
      onerror: ((e: { error?: string }) => void) | null;
    }
    const w = window as unknown as {
      SpeechRecognition?: new () => ProbeRecognition;
      webkitSpeechRecognition?: new () => ProbeRecognition;
    };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    const out: { ctor: boolean; events: string[] } = { ctor: Boolean(Ctor), events: [] };
    if (!Ctor) return out;
    const rec = new Ctor();
    rec.continuous = false;
    rec.interimResults = false;
    rec.lang = "en-US";
    await new Promise<void>((resolve) => {
      const done = (): void => resolve();
      rec.onstart = () => out.events.push("start");
      rec.onerror = (e) => {
        out.events.push(`error:${e.error ?? "unknown"}`);
        done();
      };
      rec.onend = () => {
        out.events.push("end");
        done();
      };
      try {
        rec.start();
      } catch (e) {
        out.events.push(`throw:${String(e)}`);
        done();
      }
      setTimeout(() => {
        try {
          rec.abort();
        } catch {
          /* ignore */
        }
        done();
      }, 8000);
    });
    return out;
  });

  writeEvidence("voice-probe.json", probe);

  // The AI surface hosts /chat (legacy /chat redirects to /ai), so
  // navigation goes through the harness rather than a bare link click.
  await navigateTo(page, "Chat");
  await expect(surfacePanel(page, "Chat")).toHaveCount(1);
  // Open the thread the demo fixture seeds for Pulse ("Backpressure design
  // review", demo-seed.ts seedPulseChat): the mic only exists inside the
  // composer, and the empty state renders no composer — asserting "no mic"
  // there would pass vacuously.
  await page.getByRole("button", { name: "Backpressure design review", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: /Ask about|Message the model/ }).first(),
  ).toBeVisible();
  // The control's accessible name would be "Start dictation" / "Stop dictation"
  // (src/components/chat/chat-view.tsx:1548 gates it on speech.supported).
  // P9.T13: absent — not greyed out, not disabled. The probe above only
  // explains why the runtime can't support it; this assertion is the contract.
  await expect(page.getByRole("button", { name: /dictation/i })).toHaveCount(0);
});
