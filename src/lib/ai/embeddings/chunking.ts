export const DEFAULT_CHUNK_SIZE = 1000;
export const DEFAULT_OVERLAP = 150;

/**
 * Paragraph-aware chunking with overlap (TypeScript port of python-service/app/chunking.py).
 * Paragraphs are packed greedily up to `chunkSize`; a single longer paragraph is hard-split by
 * character offset; consecutive chunks share the last `overlap` characters of their predecessor.
 */
export function chunkText(text: string, chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_OVERLAP): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const paragraphs = trimmed.split("\n\n").map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length === 0) paragraphs.push(trimmed);

  const packed: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    if (para.length > chunkSize) {
      if (current) {
        packed.push(current);
        current = "";
      }
      packed.push(...hardSplit(para, chunkSize, overlap));
      continue;
    }
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length > chunkSize) {
      packed.push(current);
      current = para;
    } else {
      current = candidate;
    }
  }
  if (current) packed.push(current);
  if (packed.length <= 1) return packed;

  const overlapped = [packed[0]];
  for (const chunk of packed.slice(1)) {
    const prev = overlapped[overlapped.length - 1];
    const tail = overlap && prev.length > overlap ? prev.slice(-overlap) : prev;
    overlapped.push(tail ? `${tail}\n\n${chunk}` : chunk);
  }
  return overlapped;
}

function hardSplit(text: string, chunkSize: number, overlap: number): string[] {
  const pieces: string[] = [];
  const step = Math.max(chunkSize - overlap, 1);
  for (let start = 0; start < text.length; start += step) pieces.push(text.slice(start, start + chunkSize));
  return pieces;
}
