/**
 * "Send to" builders: turn a chat message (or any free text) into the input
 * shapes of a task or a note. Pure — no DB, no React.
 */

const MAX_TITLE = 80;

function split(text: string): { first: string; rest: string } {
  const lines = text.split("\n");
  const idx = lines.findIndex((l) => l.trim() !== "");
  if (idx === -1) return { first: "", rest: "" };
  const first = lines[idx]
    .replace(/^\s*(#{1,6}\s+|>\s*|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/, "")
    .trim()
    .slice(0, MAX_TITLE);
  return { first, rest: lines.slice(idx + 1).join("\n").trim() };
}

export function taskFromText(text: string): { title: string; description: string } {
  const { first, rest } = split(text);
  return { title: first || "Untitled task", description: rest };
}

export function noteFromText(text: string): { title: string; body: string } {
  const { first } = split(text);
  return { title: first || "Untitled note", body: text.trim() };
}
