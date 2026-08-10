/**
 * Message assembly: turns a chat request (text + attachments) into the
 * OpenCode prompt body. Attachments are materialized server-side into the
 * session directory (never read from the browser), so the agent can access
 * them with its file tools while the browser keeps zero access to the server.
 */

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { OpenCodePartInput, OpenCodePromptBody } from "./types";

/** Attachment as sent by the frontend. */
export interface ChatAttachmentInput {
  name: string;
  mimeType: string;
  kind: "image" | "file";
  /** Images: data URL (data:…;base64,…). */
  dataUrl?: string;
  /** Text files: extracted content (inlined when materialization fails). */
  textContent?: string;
}

export interface BuildPromptInput {
  text: string;
  attachments?: ChatAttachmentInput[];
  system?: string;
  model?: { providerID: string; modelID: string };
  agent?: string;
  /** tool name → enabled (omitted = OpenCode defaults). */
  tools?: Record<string, boolean>;
  /** Absolute path of the session directory (attachment target). */
  sessionDir: string;
}

/** Sanitize a filename for the attachment staging folder. */
function safeFileName(name: string): string {
  const base = path
    .basename(name)
    .replace(/[^\w.\- ]/g, "_")
    .slice(0, 80);
  return base || "attachment";
}

function dataUrlToBytes(
  dataUrl: string,
): { mime: string; bytes: Buffer } | null {
  const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl.trim());
  if (!m) return null;
  try {
    return { mime: m[1], bytes: Buffer.from(m[2], "base64") };
  } catch {
    return null;
  }
}

/**
 * Materialize attachments as files under `<sessionDir>/.masarflow/attachments/`
 * and return FilePartInputs. Text attachments fall back to inlining their
 * content into a single combined part when the session dir is unwritable.
 */
export async function buildPromptParts(
  input: BuildPromptInput,
  log?: (message: string, extra?: Record<string, unknown>) => void,
): Promise<OpenCodePartInput[]> {
  const parts: OpenCodePartInput[] = [];
  const inlineTexts: string[] = [];

  for (const att of input.attachments ?? []) {
    const fileName = safeFileName(att.name);
    if (att.kind === "image" && att.dataUrl) {
      const decoded = dataUrlToBytes(att.dataUrl);
      if (decoded) {
        try {
          const rel = path.join(
            ".masarflow",
            "attachments",
            `${randomUUID().slice(0, 8)}-${fileName}`,
          );
          const abs = path.join(input.sessionDir, rel);
          await mkdir(path.dirname(abs), { recursive: true });
          await writeFile(abs, decoded.bytes);
          parts.push({
            type: "file",
            mime: decoded.mime || att.mimeType || "image/png",
            filename: fileName,
            url: abs,
          });
          log?.("Attachment materialized", {
            name: fileName,
            kind: "image",
            bytes: decoded.bytes.length,
          });
          continue;
        } catch {
          // Fall through to inline.
        }
      }
      inlineTexts.push(`[Image attachment: ${fileName}]`);
      continue;
    }
    if (att.textContent) {
      // Text files: inline directly — the model reads them without extra
      // tool calls, and it survives unwritable session directories.
      const body =
        att.textContent.length > 24_000
          ? `${att.textContent.slice(0, 24_000)}\n…`
          : att.textContent;
      inlineTexts.push(
        `[File attachment: ${fileName}]\n\`\`\`\n${body}\n\`\`\``,
      );
      continue;
    }
    inlineTexts.push(`[Attachment: ${fileName}]`);
  }

  const text = inlineTexts.length
    ? `${inlineTexts.join("\n\n")}\n\n${input.text}`
    : input.text;
  parts.unshift({ type: "text", text });
  return parts;
}

export function buildPromptBody(
  input: BuildPromptInput,
  parts?: OpenCodePartInput[],
): OpenCodePromptBody {
  const body: OpenCodePromptBody = {
    parts: parts ?? [{ type: "text", text: input.text }],
  };
  if (input.system?.trim()) body.system = input.system.trim();
  if (input.model) body.model = input.model;
  if (input.agent) body.agent = input.agent;
  if (input.tools) body.tools = input.tools;
  return body;
}
