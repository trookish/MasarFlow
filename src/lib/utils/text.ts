/** First non-empty line of a message, trimmed — titles for logs and chips. */
export function firstLine(text: string): string {
  return text.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? "";
}
