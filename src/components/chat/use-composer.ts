import { useRef, useState, type ChangeEvent, type ClipboardEvent } from "react";
import {
  prepareAttachment,
  type PreparedAttachment,
} from "@/lib/ai/attachments";
import { useSpeechInput } from "@/lib/hooks/use-speech";
import { getCaretCoordinates, type MentionMenuHandle } from "./mention-menu";
import {
  detectTrigger,
  pageToken,
  recordToken,
  stripMentionToken,
  firstPlaceholderRange,
  newMentionUid,
  type Mention,
  type TriggerState,
  type MenuResult,
} from "@/lib/chat/mentions";

/**
 * Composer state: the draft text, attachments, `/ @ #` mention menu and
 * dictation. Owned here so the transcript and turn hooks never reach into it
 * except through the returned handle.
 */
export function useComposer({ canUseImages }: { canUseImages: boolean }) {
  const [input, setInput] = useState("");
  const [interim, setInterim] = useState("");
  const [pending, setPending] = useState<PreparedAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<MentionMenuHandle>(null);

  // Composer mention state: `/ @ #` trigger menu + selected mention chips.
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [trigger, setTrigger] = useState<TriggerState | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(
    null,
  );

  const speech = useSpeechInput({
    onTranscript: (text) =>
      setInput((v) => (v ? `${v.trimEnd()} ${text.trim()}` : text.trim())),
    onInterim: setInterim,
  });

  /* ── Attachments ──────────────────────────────────────────────────── */

  async function addFiles(files: FileList | File[]) {
    setAttachError(null);
    for (const file of Array.from(files)) {
      try {
        const prepared = await prepareAttachment(file);
        if (prepared.image && !canUseImages) {
          setAttachError(
            `${file.name}: the selected model can't see images — pick a vision-capable model or attach text files.`,
          );
          continue;
        }
        setPending((p) => [...p, prepared]);
      } catch (e) {
        setAttachError((e as Error).message);
      }
    }
  }

  function onFilePick(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) void addFiles(e.target.files);
    e.target.value = "";
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(e.clipboardData.files ?? []);
    if (files.length) {
      e.preventDefault();
      void addFiles(files);
    }
  }

  /* ── Mention menu (/ @ #) ─────────────────────────────────────────── */

  /** Recompute the active trigger + popover anchor from the live textarea. */
  function updateTrigger() {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart;
    const trig = detectTrigger(ta.value, pos);
    if (trig) {
      const coords = getCaretCoordinates(ta, pos);
      setTrigger(trig);
      setAnchor(coords);
    } else {
      setTrigger(null);
    }
  }

  function onMentionSelect(result: MenuResult) {
    const ta = textareaRef.current;
    if (!ta || !trigger) return;
    const before = ta.value.slice(0, trigger.start);
    const after = ta.value.slice(trigger.end);
    setTrigger(null);
    setAnchor(null);

    if (result.type === "command") {
      const insert = result.command.insert;
      const next = before + insert + after;
      setInput(next);
      requestAnimationFrame(() => {
        const t = textareaRef.current;
        if (!t) return;
        const range = firstPlaceholderRange(insert);
        if (range) {
          t.setSelectionRange(
            before.length + range.start,
            before.length + range.end,
          );
        } else {
          const p = (before + insert).length;
          t.setSelectionRange(p, p);
        }
        t.focus();
      });
      return;
    }

    if (result.type === "page") {
      const token = pageToken(result.item.label);
      setInput(`${before}${token} ${after}`);
      setMentions((ms) => [
        ...ms,
        {
          uid: newMentionUid(),
          kind: "page",
          token,
          label: result.item.label,
          href: result.item.href,
        },
      ]);
      focusAfter(before.length + token.length + 1);
      return;
    }

    const token = recordToken(result.item.kind, result.item.title);
    setInput(`${before}${token} ${after}`);
    setMentions((ms) => [
      ...ms,
      {
        uid: newMentionUid(),
        kind: "record",
        token,
        recordKind: result.item.kind,
        recordId: result.item.id,
        title: result.item.title,
      },
    ]);
    focusAfter(before.length + token.length + 1);
  }

  /** Move the caret to `pos` and refocus the textarea on the next frame. */
  function focusAfter(pos: number) {
    requestAnimationFrame(() => {
      const t = textareaRef.current;
      if (!t) return;
      t.focus();
      t.setSelectionRange(pos, pos);
    });
  }

  function removeMention(uid: string) {
    const m = mentions.find((x) => x.uid === uid);
    if (!m) return;
    setInput((v) => stripMentionToken(v, m.token));
    setMentions((ms) => ms.filter((x) => x.uid !== uid));
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  return {
    input,
    setInput,
    interim,
    pending,
    setPending,
    attachError,
    setAttachError,
    mentions,
    setMentions,
    trigger,
    setTrigger,
    anchor,
    setAnchor,
    fileInputRef,
    textareaRef,
    menuRef,
    speech,
    onFilePick,
    onPaste,
    updateTrigger,
    onMentionSelect,
    removeMention,
  };
}

export type ComposerHandle = ReturnType<typeof useComposer>;
