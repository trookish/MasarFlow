import { test, expect, writeEvidence, navigateTo } from "./_harness";

/**
 * F7: does webkitSpeechRecognition work in Electron 43?
 *
 * The probe runs INSIDE the packaged renderer, starts a real recognition
 * session and records what happens. The invariant we ship is asserted on top
 * of it: either the microphone control is absent, or starting it must not
 * error. Evidence: reports/p9/voice-probe.json (decision in voice-probe.md).
 */
test("voice: the shipped control matches what the runtime can do", async ({ desktop }) => {
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

  // Decision rule (record both the probe and the decision in the same file):
  //  - probe.events contains "start" and no "error:*" → recognition works: the
  //    mic button may stay, and it must then actually start listening.
  //  - probe.events contains an "error:*" (expected: network / service-not-allowed
  //    / not-allowed) → the button must not be rendered in the desktop shell.
  const usable = probe.events.includes("start") && !probe.events.some((e) => e.startsWith("error:"));

  // The dock's AI group holds the /chat destination (the plan's plain
  // `getByRole("link", { name: /Chat/i })` assumes a sidebar rail; the packaged
  // shell defaults to the bottom floating dock — see reports/p9/00-baseline.md).
  await navigateTo(page, "Chat");
  await expect(page.locator('[data-testid="dock-panel"][data-dock-url="/chat"]')).toHaveCount(1);
  // Open the thread the demo fixture seeds for Pulse ("Backpressure design
  // review", demo-seed.ts seedPulseChat): the mic only exists inside the
  // composer, and the empty state renders no composer — asserting "no mic"
  // there would pass vacuously.
  await page.getByRole("button", { name: "Backpressure design review", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: /Ask about|Message the model/ }).first(),
  ).toBeVisible();
  // The control's accessible name is "Start dictation" / "Stop dictation"
  // (src/components/chat/chat-view.tsx:1548 gates it on speech.supported).
  const mic = page.getByRole("button", { name: /dictation/i });
  if (usable) {
    await expect(mic.first()).toBeVisible();
  } else {
    await expect(mic).toHaveCount(0);
  }
});
