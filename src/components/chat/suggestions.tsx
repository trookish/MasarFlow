"use client";

const AGENTIC_SUGGESTIONS = [
  "Summarize the current state of my workspace",
  "What should I work on next? Check my open tasks and specs",
  "Create a task for everything unresolved in my latest notes",
  "Review my specs and flag anything without acceptance criteria",
];
const CHAT_SUGGESTIONS = [
  "Explain the trade-offs between REST and GraphQL",
  "Help me name this feature — I'll describe it",
  "Write a concise standup update from bullet points",
  "Brainstorm 10 ideas for improving developer onboarding",
];

/* ── Empty-thread suggestions ─────────────────────────────────────────── */

export function Suggestions({
  mode,
  onPick,
}: {
  mode: "agentic" | "chat";
  onPick: (text: string) => void;
}) {
  const list = mode === "agentic" ? AGENTIC_SUGGESTIONS : CHAT_SUGGESTIONS;
  return (
    <div className="py-8">
      <p className="mb-3 text-center text-sm text-muted-foreground">
        {mode === "agentic"
          ? "The assistant sees your whole workspace and can act on it. Try:"
          : "Direct chat with the model. Try:"}
      </p>
      <div className="mx-auto grid max-w-xl gap-2 sm:grid-cols-2">
        {list.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-left text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent/40 hover:text-foreground"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
