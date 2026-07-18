"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Plug,
  Plus,
  Trash2,
  Send,
  Square,
  ChevronDown,
  ChevronRight,
  Search,
  MessageSquare,
  Bot,
  AlertCircle,
  Wrench,
  Check,
  X,
  Sparkles,
  Paperclip,
  Mic,
  MicOff,
  Copy,
  RotateCw,
  Pencil,
  BrainCircuit,
  FileText,
  Info,
  ImageIcon,
  AtSign,
  Hash,
  FolderGit2,
  ShieldAlert,
  Terminal,
} from "lucide-react";
import {
  aiConnectionsRepo,
  chatThreadsRepo,
  chatMessagesRepo,
  notesRepo,
  linkedProjectsRepo,
} from "@/lib/db/repos";
import type {
  AiConnection,
  ChatMessage,
  ChatThread,
  ChatAttachment,
  ToolActivity,
} from "@/lib/db/schema";
import {
  fetchCatalog,
  defaultModelId,
  searchModels,
  modelSupportsTools,
  modelSupportsImages,
  modelSupportsReasoning,
  modelMeta,
  type Catalog,
  type AiProvider,
} from "@/lib/ai/catalog";
import { friendlyChatError } from "@/lib/ai/errors";
import {
  runWorkspaceChat,
  type WireMessage,
  type WireImage,
} from "@/lib/ai/chat-client";
import { WORKSPACE_TOOLS, executeWorkspaceTool } from "@/lib/ai/tools";
import {
  FS_TOOLS,
  FS_TOOL_NAMES,
  executeFsTool,
  type ApprovalRequest,
} from "@/lib/ai/fs-tools";
import {
  assembleWorkspaceContext,
  buildAssistantSystemPrompt,
} from "@/lib/ai/context";
import {
  prepareAttachment,
  formatFileBlock,
  splitDataUrl,
  type PreparedAttachment,
} from "@/lib/ai/attachments";
import { useSpeechInput } from "@/lib/hooks/use-speech";
import { useActiveProjectId } from "@/lib/hooks/use-project";
import { usePageSettings } from "@/lib/stores/page-settings";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/ui/empty-state";
import { Tooltip } from "@/components/ui/tooltip";
import { MarkdownPreview } from "@/components/brain/markdown-preview";
import { ConnectionsDialog } from "./connections-dialog";
import { LinkedProjectsDialog } from "./linked-projects-dialog";
import {
  MentionMenu,
  getCaretCoordinates,
  type MentionMenuHandle,
} from "./mention-menu";
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
import { resolveRecordMention } from "@/lib/chat/mention-resolve";

/* ── Suggestions shown on an empty thread ─────────────────────────────── */

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

interface LiveStream {
  id: string;
  text: string;
  reasoning: string;
  tools: ToolActivity[];
  notices: string[];
}

/** Convert a snake_case tool name (`read_note`) to camelCase (`readNote`). */
function prettyToolName(name: string): string {
  return name
    .split("_")
    .map((p, i) => (i === 0 ? p : p[0]?.toUpperCase() + p.slice(1)))
    .join("");
}

export function ChatView() {
  const projectId = useActiveProjectId();
  const router = useRouter();
  const searchParams = useSearchParams();
  const threadId = searchParams.get("thread");
  const { density, showTimestamps } = usePageSettings((s) => s.chat);

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [connDialog, setConnDialog] = useState(false);
  const [input, setInput] = useState("");
  const [interim, setInterim] = useState("");
  const [threadQuery, setThreadQuery] = useState("");
  const [pending, setPending] = useState<PreparedAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [stream, setStream] = useState<LiveStream | null>(null);
  const [linkDialog, setLinkDialog] = useState(false);
  const [pendingApproval, setPendingApproval] = useState<{
    req: ApprovalRequest;
    resolve: (allowed: boolean) => void;
  } | null>(null);
  /** Session-scoped "always allow" signatures (never persisted). */
  const alwaysAllowRef = useRef(new Set<string>());
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<MentionMenuHandle>(null);

  // Composer mention state: `/ @ #` trigger menu + selected mention chips.
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [trigger, setTrigger] = useState<TriggerState | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(
    null,
  );

  useEffect(() => {
    fetchCatalog().then(setCatalog);
  }, []);

  const connections = useLiveQuery(() => aiConnectionsRepo.list(), []) ?? [];
  const threadsRaw = useLiveQuery(
    () => chatThreadsRepo.listByProject(projectId),
    [projectId],
  );
  const threads = useMemo(() => threadsRaw ?? [], [threadsRaw]);
  const messages =
    useLiveQuery(() => chatMessagesRepo.listByThread(threadId), [threadId]) ??
    [];
  const linkedRoots = useLiveQuery(
    () =>
      projectId
        ? linkedProjectsRepo.listByProject(projectId)
        : Promise.resolve([]),
    [projectId],
  );

  const thread = threads.find((t) => t.id === threadId) ?? null;
  const connection =
    connections.find((c) => c.id === thread?.connectionId) ?? null;
  const provider: AiProvider | null =
    (catalog && connection && catalog[connection.providerId]) || null;

  const mode = thread?.mode ?? "agentic";
  const canUseTools =
    provider && thread ? modelSupportsTools(provider, thread.modelId) : true;
  const canUseImages =
    provider && thread ? modelSupportsImages(provider, thread.modelId) : false;
  const canReason =
    provider && thread
      ? modelSupportsReasoning(provider, thread.modelId)
      : false;

  const speech = useSpeechInput({
    onTranscript: (text) =>
      setInput((v) => (v ? `${v.trimEnd()} ${text.trim()}` : text.trim())),
    onInterim: setInterim,
  });

  // Keep the view pinned to the latest message while streaming.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, stream?.text, stream?.reasoning]);

  const visibleThreads = useMemo(() => {
    const q = threadQuery.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => t.title.toLowerCase().includes(q));
  }, [threads, threadQuery]);

  function select(id: string | null) {
    router.replace(id ? `/chat?thread=${id}` : "/chat", { scroll: false });
  }

  async function newChat() {
    if (!projectId) return;
    if (connections.length === 0) {
      setConnDialog(true);
      return;
    }
    const conn = connections[0];
    const prov = catalog?.[conn.providerId];
    const firstModel = prov ? defaultModelId(prov) : "";
    const t = await chatThreadsRepo.create({
      projectId,
      connectionId: conn.id,
      modelId: firstModel ?? "",
    });
    select(t.id);
  }

  async function deleteThread(id: string) {
    await chatThreadsRepo.remove(id);
    if (id === threadId) select(null);
  }

  /** Save a fenced code block from an assistant reply as a brain note. */
  async function saveCodeAsNote(code: string, language: string) {
    if (!projectId) return;
    const firstLine = code.split("\n").find((l) => l.trim()) ?? "snippet";
    const title =
      firstLine.replace(/^[#/\s*-]+/, "").slice(0, 60) || "Code snippet";
    await notesRepo.create({
      projectId,
      title,
      body: `\`\`\`${language}\n${code}\n\`\`\``,
      type: "note",
    });
  }

  /* ── Approval flow for sensitive fs/shell tools (opencode-style) ────── */

  function approvalSignature(req: ApprovalRequest): string {
    if (req.name === "shell_run") {
      // "Always allow" remembers the command's first token (e.g. `npm`).
      const first = String(req.arguments.command ?? "")
        .trim()
        .split(/\s+/)[0];
      return `shell_run:${first}`;
    }
    return `${req.name}:${String(req.arguments.path ?? "")}`;
  }

  function requestApproval(req: ApprovalRequest): Promise<boolean> {
    if (alwaysAllowRef.current.has(approvalSignature(req))) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      setPendingApproval({ req, resolve });
    });
  }

  function settleApproval(allowed: boolean, remember: boolean) {
    if (!pendingApproval) return;
    if (allowed && remember) {
      alwaysAllowRef.current.add(approvalSignature(pendingApproval.req));
    }
    pendingApproval.resolve(allowed);
    setPendingApproval(null);
  }

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

  /* ── Sending ──────────────────────────────────────────────────────── */

  /** Compose the outgoing content: typed text + inlined text-file blocks. */
  function composeContent(text: string, attachments: ChatAttachment[]): string {
    const blocks = attachments
      .filter((a) => a.kind === "file" && a.textContent)
      .map((a) => formatFileBlock(a.name, a.textContent));
    return [text, ...blocks].filter(Boolean).join("\n\n");
  }

  function imagesOf(attachments: ChatAttachment[]): WireImage[] {
    const out: WireImage[] = [];
    for (const a of attachments) {
      if (a.kind !== "image" || !a.dataUrl) continue;
      const parts = splitDataUrl(a.dataUrl);
      if (parts) out.push({ mimeType: parts.mimeType, data: parts.data });
    }
    return out;
  }

  /** Rebuild the wire history from persisted messages (attachments included). */
  function buildHistory(upTo?: string): WireMessage[] {
    const out: WireMessage[] = [];
    for (const m of messages) {
      if (upTo && m.id === upTo) break;
      if (m.role === "system" || m.error) continue;
      if (m.role === "user") {
        const attachments = m.attachments ?? [];
        const images = canUseImages ? imagesOf(attachments) : [];
        out.push({
          role: "user",
          content: composeContent(m.content, attachments),
          images: images.length ? images : undefined,
        });
      } else if (m.content) {
        out.push({ role: "assistant", content: m.content });
      }
    }
    return out;
  }

  /** Run one assistant turn against the given history. */
  async function runTurn(history: WireMessage[], userText: string) {
    if (!thread || !connection || !provider) return;
    const assistant = await chatMessagesRepo.create({
      threadId: thread.id,
      role: "assistant",
      content: "",
    });
    setStream({
      id: assistant.id,
      text: "",
      reasoning: "",
      tools: [],
      notices: [],
    });
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const agentic = mode === "agentic";
      const withTools = agentic && canUseTools;
      const roots = agentic ? (linkedRoots ?? []) : [];
      // Context-window guard: cap the workspace briefing at ~half the model's
      // context so history + answer always fit; tell the user when trimmed.
      const contextLimit =
        provider && thread
          ? modelMeta(provider, thread.modelId)?.limit?.context
          : undefined;
      const briefingBudget = contextLimit
        ? Math.min(28_000, Math.floor(contextLimit * 4 * 0.5))
        : 28_000;
      const trimmed = briefingBudget < 28_000;
      // Agentic turns are grounded in the live workspace; chat turns talk to
      // the model directly.
      const system = agentic
        ? buildAssistantSystemPrompt(
            await assembleWorkspaceContext(projectId!, {
              query: userText,
              budget: briefingBudget,
            }),
            {
              withTools,
              linkedRoots: roots.map((r) => ({
                name: r.name,
                rootPath: r.rootPath,
              })),
            },
          )
        : undefined;

      let acc = "";
      let reasoningAcc = "";
      const tools: ToolActivity[] = [];
      const notices: string[] = [];
      if (agentic && trimmed) {
        notices.push(
          "Workspace briefing trimmed to fit this model's small context window.",
        );
      }
      const toolIndexById = new Map<string, number>();
      const summarize = (args: Record<string, unknown>): string => {
        const s = (k: string): string | undefined => {
          const v = args[k];
          return typeof v === "string" && v.trim() ? v : undefined;
        };
        // Prefer the most descriptive field for the tool kind, so a chip reads
        // like "createNote hello" or "readNote North Star: A Fading Sun".
        const title = s("title") ?? s("name");
        if (title) return title.slice(0, 80);
        if (s("command")) return s("command")!.slice(0, 80);
        if (s("path")) return s("path")!.slice(0, 80);
        if (s("number")) return s("number")!.slice(0, 80);
        if (s("query")) return `"${s("query")!.slice(0, 60)}"`;
        if (s("content")) return s("content")!.slice(0, 80);
        const filter = s("status") ?? s("category") ?? s("linkType");
        if (filter) return filter.slice(0, 40);
        if (s("id")) return s("id")!.slice(0, 12);
        return "";
      };
      const push = () =>
        setStream({
          id: assistant.id,
          text: acc,
          reasoning: reasoningAcc,
          tools: [...tools],
          notices: [...notices],
        });

      // Workspace tools are always on in agentic mode; filesystem/shell tools
      // join when an external project is linked.
      const turnTools = withTools
        ? [...WORKSPACE_TOOLS, ...(roots.length ? FS_TOOLS : [])]
        : undefined;
      const result = await runWorkspaceChat({
        provider,
        apiKey: connection.apiKey,
        baseUrl: connection.baseUrl,
        model: thread.modelId,
        system,
        messages: history,
        tools: turnTools,
        executeTool: withTools
          ? (call) =>
              FS_TOOL_NAMES.has(call.name)
                ? executeFsTool({ roots, requestApproval }, call)
                : executeWorkspaceTool(projectId!, call)
          : undefined,
        reasoning:
          thread.reasoningEnabled && canReason
            ? { enabled: true, budget: 8000 }
            : undefined,
        signal: controller.signal,
        onEvent: (e) => {
          if (e.type === "text") acc += e.text;
          else if (e.type === "reasoning") reasoningAcc += e.text;
          else if (e.type === "round" && e.round > 0 && acc) acc += "\n\n";
          else if (e.type === "notice") notices.push(e.message);
          else if (e.type === "tool_call") {
            toolIndexById.set(e.id, tools.length);
            tools.push({
              name: e.name,
              summary: summarize(e.arguments),
              ok: true,
            });
          } else if (e.type === "tool_result") {
            const i = toolIndexById.get(e.id);
            if (i !== undefined) tools[i] = { ...tools[i], ok: e.ok };
          }
          push();
        },
      });
      const finalText = result.text || acc;
      const finalReasoning = result.reasoning || reasoningAcc;
      // Silent tool-ignoring: the user asked for an action, the turn had
      // tools available, and the model answered with plain text and zero
      // tool calls. Aggregator gateways often swallow tools without an
      // error — say so instead of looking broken.
      const actionIntent =
        /\b(create|add|make|update|edit|delete|remove|fix|implement|write|rename|move|scaffold|generate|build|set up)\b/i.test(
          userText,
        );
      if (
        agentic &&
        withTools &&
        actionIntent &&
        result.executed.length === 0 &&
        finalText.trim()
      ) {
        notices.push(
          "The model answered without calling workspace tools — this model/gateway may not support function calling. Use Connections → Test to verify, or pick a tool-capable model.",
        );
      }
      // Never leave a silent blank bubble: if the model produced no answer
      // and did no work, surface it as a retryable error (thinking, tool
      // chips, and notices stay visible either way).
      const didWork = Boolean(finalText.trim()) || tools.length > 0;
      await chatMessagesRepo.update(assistant.id, {
        content: finalText,
        reasoning: finalReasoning,
        toolActivity: tools,
        notices,
        error: didWork
          ? null
          : finalReasoning.trim()
            ? "The model spent its output on thinking and returned no answer — Retry, or turn off extended thinking for this model."
            : "The model returned an empty response — Retry, or use Connections → Test to check what this model/gateway supports.",
      });
    } catch (e) {
      const message = controller.signal.aborted
        ? "Stopped."
        : friendlyChatError((e as Error).message);
      await chatMessagesRepo.update(assistant.id, { error: message });
    } finally {
      setStream(null);
      abortRef.current = null;
    }
  }

  async function send() {
    if (!thread || !connection || !provider || stream) return;
    const text = input.trim();
    if (!text && pending.length === 0) return;
    if (!connection.apiKey && !provider.noAuth) {
      setConnDialog(true);
      return;
    }
    const attachments = pending.map((p) => p.attachment);
    // Resolve `#` record mentions into file attachments so their full bodies
    // are inlined as context (works in any chat mode). Persisting them as
    // attachments means buildHistory re-inlines them on regenerate too.
    const mentionAttachments: ChatAttachment[] = [];
    for (const m of mentions) {
      if (m.kind !== "record") continue;
      const r = await resolveRecordMention(projectId!, m);
      if (r && r.body.trim()) {
        mentionAttachments.push({
          name: `${m.recordKind}: ${r.title}`,
          kind: "file",
          mimeType: "text/markdown",
          dataUrl: "",
          textContent: r.body,
        });
      }
    }
    const allAttachments = [...attachments, ...mentionAttachments];
    setInput("");
    setPending([]);
    setMentions([]);
    setTrigger(null);
    setAnchor(null);
    setAttachError(null);

    await chatMessagesRepo.create({
      threadId: thread.id,
      role: "user",
      content: text,
      attachments: allAttachments,
    });
    if (thread.title === "New chat") {
      const title = text || attachments[0]?.name || "New chat";
      await chatThreadsRepo.update(thread.id, {
        title: title.slice(0, 48) + (title.length > 48 ? "…" : ""),
      });
    } else {
      await chatThreadsRepo.update(thread.id, {});
    }

    const images = canUseImages ? imagesOf(allAttachments) : [];
    const history: WireMessage[] = [
      ...buildHistory(),
      {
        role: "user" as const,
        content: composeContent(text, allAttachments),
        images: images.length ? images : undefined,
      },
    ];
    await runTurn(history, text);
  }

  /** Re-run the assistant reply that follows the last user message. */
  async function regenerate(assistantId: string) {
    if (!thread || stream) return;
    const idx = messages.findIndex((m) => m.id === assistantId);
    if (idx === -1) return;
    // Find the user turn this reply answered.
    let userIdx = idx - 1;
    while (userIdx >= 0 && messages[userIdx].role !== "user") userIdx--;
    if (userIdx < 0) return;
    const userMsg = messages[userIdx];
    await chatMessagesRepo.remove(assistantId);
    const history = buildHistory(userMsg.id);
    const attachments = userMsg.attachments ?? [];
    const images = canUseImages ? imagesOf(attachments) : [];
    history.push({
      role: "user",
      content: composeContent(userMsg.content, attachments),
      images: images.length ? images : undefined,
    });
    await runTurn(history, userMsg.content);
  }

  function stop() {
    abortRef.current?.abort();
  }

  const sendDisabled =
    (!input.trim() && pending.length === 0) || Boolean(stream);

  return (
    <div className="flex h-full min-h-0">
      {/* Threads sidebar */}
      <div className="flex w-64 shrink-0 flex-col border-r border-border">
        <div className="flex items-center gap-2 border-b border-border p-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={newChat}
            disabled={!projectId}
          >
            <Plus className="h-4 w-4" /> New chat
          </Button>
          <Tooltip label="AI connections" side="bottom">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="AI connections"
              onClick={() => setConnDialog(true)}
            >
              <Plug className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
        {threads.length > 3 && (
          <div className="relative border-b border-border p-2">
            <Search className="absolute top-1/2 left-4 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={threadQuery}
              onChange={(e) => setThreadQuery(e.target.value)}
              placeholder="Search chats…"
              className="h-8 pl-8 text-sm"
            />
          </div>
        )}
        <ScrollArea className="flex-1 p-2">
          {visibleThreads.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">
              {threads.length === 0 ? "No chats yet." : "No matches."}
            </p>
          ) : (
            visibleThreads.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                active={t.id === threadId}
                onSelect={() => select(t.id)}
                onDelete={() => deleteThread(t.id)}
              />
            ))
          )}
        </ScrollArea>
      </div>

      {/* Conversation */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!thread ? (
          <EmptyState
            icon={MessageSquare}
            title={
              connections.length === 0 ? "Connect a provider" : "Start a chat"
            }
            description={
              connections.length === 0
                ? "Add an AI provider (Claude, OpenAI, Google, OpenRouter, Groq, and more) with your API key to begin. Keys stay in your browser."
                : "Create a new chat and pick any model from the connected provider."
            }
            action={
              <Button onClick={newChat} disabled={!projectId}>
                <Plus className="h-4 w-4" />{" "}
                {connections.length === 0 ? "Add connection" : "New chat"}
              </Button>
            }
          />
        ) : (
          <>
            {/* Header: connection + model + mode + reasoning.
               No overflow here — an overflow container would clip the open
               connection/model dropdowns (they anchor with position:absolute). */}
            <div className="relative z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
              <ConnectionMenu
                connections={connections}
                value={connection}
                onChange={(c) => {
                  const prov = catalog?.[c.providerId];
                  chatThreadsRepo.update(thread.id, {
                    connectionId: c.id,
                    modelId: prov ? defaultModelId(prov) : "",
                  });
                }}
                onManage={() => setConnDialog(true)}
              />
              {provider && (
                <ModelMenu
                  provider={provider}
                  value={thread.modelId}
                  onChange={(m) =>
                    chatThreadsRepo.update(thread.id, { modelId: m })
                  }
                />
              )}

              <ModeToggle
                mode={mode}
                onChange={(m) => chatThreadsRepo.update(thread.id, { mode: m })}
              />

              {mode === "agentic" && (
                <Tooltip
                  label={
                    linkedRoots?.length
                      ? `Linked projects: ${linkedRoots.map((r) => r.name).join(", ")} — the AI can read them freely and asks before writes/commands`
                      : "Link an external project folder (e.g. a Unity project) so the AI can read files, write code, and run commands in it"
                  }
                  side="bottom"
                >
                  <Button
                    variant={linkedRoots?.length ? "default" : "outline"}
                    size="icon-sm"
                    aria-label="Linked projects"
                    onClick={() => setLinkDialog(true)}
                  >
                    <FolderGit2 className="h-4 w-4" />
                  </Button>
                </Tooltip>
              )}

              {canReason && (
                <Tooltip
                  label={
                    thread.reasoningEnabled
                      ? "Extended thinking on — the model reasons before answering"
                      : "Enable extended thinking"
                  }
                  side="bottom"
                >
                  <Button
                    variant={thread.reasoningEnabled ? "default" : "outline"}
                    size="icon-sm"
                    aria-label="Toggle extended thinking"
                    onClick={() =>
                      chatThreadsRepo.update(thread.id, {
                        reasoningEnabled: !thread.reasoningEnabled,
                      })
                    }
                  >
                    <BrainCircuit className="h-4 w-4" />
                  </Button>
                </Tooltip>
              )}

              <span
                className="ml-auto hidden shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground lg:inline-flex"
                title={
                  mode === "agentic"
                    ? "Every turn is grounded in your live workspace and the assistant can create or update entities via tools."
                    : "Direct conversation with the model — no workspace context is sent."
                }
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {mode === "agentic"
                  ? canUseTools
                    ? `Workspace-aware · can act${linkedRoots?.length ? ` · +${linkedRoots.length} linked` : ""}`
                    : "Workspace-aware · read-only (model lacks tools)"
                  : "Direct chat"}
              </span>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1">
              <div
                className={cn(
                  "mx-auto max-w-3xl px-5 py-5",
                  density === "compact" ? "space-y-2.5" : "space-y-5",
                )}
              >
                {messages.length === 0 && (
                  <Suggestions
                    mode={mode}
                    onPick={(s) => {
                      setInput(s);
                    }}
                  />
                )}
                {messages.map((m) => (
                  <MessageRow
                    key={m.id}
                    message={m}
                    live={stream?.id === m.id ? stream : null}
                    showTimestamps={showTimestamps}
                    busy={Boolean(stream)}
                    onCopy={() => navigator.clipboard.writeText(m.content)}
                    onDelete={() => chatMessagesRepo.remove(m.id)}
                    onRegenerate={() => void regenerate(m.id)}
                    onSaveCodeAsNote={saveCodeAsNote}
                  />
                ))}
                <div ref={bottomRef} />
              </div>
            </ScrollArea>

            {/* Composer */}
            <div className="shrink-0 border-t border-border p-3">
              <div className="mx-auto max-w-3xl">
                {pendingApproval && (
                  <ApprovalCard
                    req={pendingApproval.req}
                    onSettle={settleApproval}
                  />
                )}
                {attachError && (
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />{" "}
                    {attachError}
                  </p>
                )}
                {pending.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {pending.map((p, i) => (
                      <span
                        key={`${p.attachment.name}-${i}`}
                        className="group relative inline-flex items-center gap-1.5 rounded-md border border-border bg-accent/40 px-2 py-1 text-xs"
                      >
                        {p.attachment.kind === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={p.attachment.dataUrl}
                            alt={p.attachment.name}
                            className="h-8 w-8 rounded object-cover"
                          />
                        ) : (
                          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <span className="max-w-36 truncate">
                          {p.attachment.name}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${p.attachment.name}`}
                          onClick={() =>
                            setPending((prev) => prev.filter((_, j) => j !== i))
                          }
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {mentions.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2">
                    {mentions.map((m) => (
                      <span
                        key={m.uid}
                        className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-xs"
                      >
                        {m.kind === "page" ? (
                          <AtSign className="h-3.5 w-3.5 text-primary" />
                        ) : (
                          <Hash className="h-3.5 w-3.5 text-primary" />
                        )}
                        <span className="max-w-40 truncate">
                          {m.kind === "page" ? m.label : `#${m.title}`}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${m.token}`}
                          onClick={() => removeMention(m.uid)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="relative flex items-end gap-2 rounded-lg border border-border bg-card p-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={
                      canUseImages
                        ? "image/png,image/jpeg,image/webp,image/gif,.txt,.md,.json,.csv,.yaml,.yml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.c,.h,.cpp,.cs,.sql,.sh,.toml,.log"
                        : ".txt,.md,.json,.csv,.yaml,.yml,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.c,.h,.cpp,.cs,.sql,.sh,.toml,.log"
                    }
                    onChange={onFilePick}
                    className="hidden"
                  />
                  <Tooltip
                    label={
                      canUseImages
                        ? "Attach images or text files"
                        : "Attach text files (this model can't see images)"
                    }
                    side="top"
                  >
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Attach files"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={Boolean(stream)}
                    >
                      {canUseImages ? (
                        <ImageIcon className="h-4 w-4" />
                      ) : (
                        <Paperclip className="h-4 w-4" />
                      )}
                    </Button>
                  </Tooltip>
                  {speech.supported && (
                    <Tooltip
                      label={
                        speech.listening
                          ? "Stop dictation"
                          : "Dictate with your voice"
                      }
                      side="top"
                    >
                      <Button
                        variant={speech.listening ? "default" : "ghost"}
                        size="icon-sm"
                        aria-label={
                          speech.listening
                            ? "Stop dictation"
                            : "Start dictation"
                        }
                        onClick={() =>
                          speech.listening ? speech.stop() : speech.start()
                        }
                        className={cn(speech.listening && "animate-pulse")}
                      >
                        {speech.listening ? (
                          <MicOff className="h-4 w-4" />
                        ) : (
                          <Mic className="h-4 w-4" />
                        )}
                      </Button>
                    </Tooltip>
                  )}
                  <div className="relative min-w-0 flex-1">
                    <Textarea
                      ref={textareaRef}
                      value={
                        interim
                          ? `${input}${input ? " " : ""}${interim}`
                          : input
                      }
                      onChange={(e) => {
                        setInput(e.target.value);
                        updateTrigger();
                      }}
                      onPaste={onPaste}
                      onSelect={updateTrigger}
                      onKeyUp={updateTrigger}
                      onClick={updateTrigger}
                      onKeyDown={(e) => {
                        if (trigger && menuRef.current?.handleKeyDown(e))
                          return;
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                      placeholder={
                        !connection?.apiKey && !provider?.noAuth
                          ? "Add an API key for this connection to send."
                          : speech.listening
                            ? "Listening… speak now"
                            : mode === "agentic"
                              ? "Ask about — or change — anything in your workspace…"
                              : "Message the model directly…"
                      }
                      rows={1}
                      className="max-h-40 min-h-[38px] w-full resize-none border-0 bg-transparent p-1.5 text-sm shadow-none focus-visible:ring-0"
                    />
                    {trigger && (
                      <MentionMenu
                        ref={menuRef}
                        kind={trigger.kind}
                        query={trigger.query}
                        projectId={projectId}
                        anchor={anchor}
                        onSelect={onMentionSelect}
                        onClose={() => {
                          setTrigger(null);
                          setAnchor(null);
                        }}
                      />
                    )}
                  </div>
                  {stream ? (
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Stop"
                      onClick={stop}
                    >
                      <Square className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      aria-label="Send"
                      onClick={() => void send()}
                      disabled={sendDisabled}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Type{" "}
                  <kbd className="rounded border border-border bg-muted px-1">
                    /
                  </kbd>{" "}
                  commands ·{" "}
                  <kbd className="rounded border border-border bg-muted px-1">
                    @
                  </kbd>{" "}
                  pages ·{" "}
                  <kbd className="rounded border border-border bg-muted px-1">
                    #
                  </kbd>{" "}
                  records
                </p>
                {speech.error && (
                  <p className="mt-1 text-xs text-destructive">
                    {speech.error}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {connDialog && catalog && (
        <ConnectionsDialog
          catalog={catalog}
          onClose={() => setConnDialog(false)}
        />
      )}
      {linkDialog && projectId && (
        <LinkedProjectsDialog
          projectId={projectId}
          roots={linkedRoots ?? []}
          onClose={() => setLinkDialog(false)}
        />
      )}
    </div>
  );
}

/* ── Approval card for sensitive fs/shell actions ─────────────────────── */

function ApprovalCard({
  req,
  onSettle,
}: {
  req: ApprovalRequest;
  onSettle: (allowed: boolean, remember: boolean) => void;
}) {
  const isShell = req.name === "shell_run";
  const detail = isShell
    ? String(req.arguments.command ?? "")
    : String(req.arguments.path ?? "");
  const content = !isShell ? String(req.arguments.content ?? "") : "";
  const previewLines = content.split("\n");
  const PREVIEW_CAP = 24;

  return (
    <div className="mb-2 overflow-hidden rounded-md border border-warning/50 bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <ShieldAlert className="h-4 w-4 shrink-0 text-warning" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium">
            {isShell ? "Run this command?" : "Write this file?"}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {req.rootLabel}
          </div>
        </div>
      </div>
      <div className="px-3 py-2">
        <div
          className={cn(
            "flex items-start gap-1.5 rounded bg-muted px-2.5 py-1.5 font-mono text-xs",
            isShell && "items-center",
          )}
        >
          {isShell && (
            <Terminal className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          )}
          {isShell ? (
            <span className="break-all">{detail}</span>
          ) : (
            <span className="break-all font-sans font-medium">{detail}</span>
          )}
        </div>
        {!isShell && content && (
          <pre className="mt-1.5 max-h-56 overflow-auto rounded bg-muted px-2.5 py-1.5 text-[11px] leading-relaxed">
            {previewLines.slice(0, PREVIEW_CAP).join("\n")}
            {previewLines.length > PREVIEW_CAP &&
              `\n… (${previewLines.length - PREVIEW_CAP} more lines)`}
          </pre>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSettle(false, false)}
        >
          Deny
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onSettle(true, true)}
        >
          Always allow{isShell ? ` "${detail.split(/\s+/)[0]}"` : " this file"}
        </Button>
        <Button size="sm" onClick={() => onSettle(true, false)}>
          Approve
        </Button>
      </div>
    </div>
  );
}

/* ── Thread row with inline rename ────────────────────────────────────── */

function ThreadRow({
  thread,
  active,
  onSelect,
  onDelete,
}: {
  thread: ChatThread;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(thread.title);

  async function commit() {
    setEditing(false);
    const next = title.trim();
    if (next && next !== thread.title) {
      await chatThreadsRepo.update(thread.id, { title: next });
    } else {
      setTitle(thread.title);
    }
  }

  if (editing) {
    return (
      <div className="mb-0.5 px-1">
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") void commit();
            if (e.key === "Escape") {
              setTitle(thread.title);
              setEditing(false);
            }
          }}
          className="h-8 text-sm"
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm",
        active
          ? "bg-accent font-medium text-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        onDoubleClick={() => setEditing(true)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-70" />
        <span className="flex-1 truncate">{thread.title}</span>
      </button>
      <button
        type="button"
        aria-label="Rename chat"
        onClick={() => setEditing(true)}
        className="shrink-0 opacity-0 hover:text-foreground group-hover:opacity-60"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        type="button"
        aria-label="Delete chat"
        onClick={onDelete}
        className="shrink-0 opacity-0 hover:text-destructive group-hover:opacity-60"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ── Mode toggle ──────────────────────────────────────────────────────── */

function ModeToggle({
  mode,
  onChange,
}: {
  mode: "agentic" | "chat";
  onChange: (mode: "agentic" | "chat") => void;
}) {
  return (
    <div className="flex shrink-0 items-center rounded-md border border-border p-0.5">
      {(
        [
          {
            value: "agentic",
            label: "Agentic",
            hint: "Grounded in your workspace; can create and update entities via tools.",
          },
          {
            value: "chat",
            label: "Chat",
            hint: "Direct conversation with the model — nothing from the workspace is sent.",
          },
        ] as const
      ).map((opt) => (
        <button
          key={opt.value}
          type="button"
          title={opt.hint}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded px-2.5 py-1 text-xs font-medium transition-colors",
            mode === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ── Empty-thread suggestions ─────────────────────────────────────────── */

function Suggestions({
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

/* ── One message row ──────────────────────────────────────────────────── */

function MessageRow({
  message: m,
  live,
  showTimestamps,
  busy,
  onCopy,
  onDelete,
  onRegenerate,
  onSaveCodeAsNote,
}: {
  message: ChatMessage;
  live: LiveStream | null;
  showTimestamps: boolean;
  busy: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onRegenerate: () => void;
  onSaveCodeAsNote: (code: string, language: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const content = live ? live.text : m.content;
  const reasoning = live ? live.reasoning : (m.reasoning ?? "");
  const toolActivity = live ? live.tools : (m.toolActivity ?? []);
  const notices = live ? live.notices : (m.notices ?? []);
  const attachments = m.attachments ?? [];
  const isUser = m.role === "user";

  return (
    <div className={cn("group flex gap-3", isUser && "flex-row-reverse")}>
      {!isUser && (
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Bot className="h-4 w-4" />
        </span>
      )}
      <div className={cn("min-w-0 pt-0.5", isUser ? "max-w-[85%]" : "flex-1")}>
        {showTimestamps && (
          <div
            className={cn(
              "mb-0.5 text-[10px] text-muted-foreground",
              isUser && "text-right",
            )}
          >
            {new Date(m.createdAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}

        {attachments.length > 0 && (
          <div
            className={cn(
              "mb-1.5 flex flex-wrap gap-2",
              isUser && "justify-end",
            )}
          >
            {attachments.map((a, i) => (
              <AttachmentChip key={`${a.name}-${i}`} attachment={a} />
            ))}
          </div>
        )}

        {notices.map((n, i) => (
          <p
            key={i}
            className="mb-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <Info className="h-3 w-3 shrink-0" /> {n}
          </p>
        ))}

        {toolActivity.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {toolActivity.map((t, i) => (
              <span
                key={`${t.name}-${i}`}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border border-border bg-accent/40 px-2 py-0.5 text-[11px]",
                  t.ok ? "text-muted-foreground" : "text-destructive",
                )}
                title={t.summary}
              >
                <Wrench className="h-3 w-3" />
                {prettyToolName(t.name)}
                {t.summary && (
                  <span className="max-w-36 truncate opacity-70">
                    {t.summary}
                  </span>
                )}
                {t.ok ? (
                  <Check className="h-3 w-3 text-node-lore" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </span>
            ))}
          </div>
        )}

        {reasoning && (
          <ThinkingBlock
            text={reasoning}
            streaming={Boolean(live) && !content}
          />
        )}

        {m.error ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {m.error}
            {m.error !== "Stopped." && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRegenerate}
                disabled={busy}
              >
                <RotateCw className="h-3 w-3" /> Retry
              </Button>
            )}
          </div>
        ) : isUser ? (
          <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm whitespace-pre-wrap">
            {content}
          </div>
        ) : (
          // Assistant replies render as markdown both persisted and live —
          // partial markdown while streaming degrades gracefully.
          <div className="text-sm">
            <MarkdownPreview
              content={content}
              onSaveCodeAsNote={onSaveCodeAsNote}
            />
            {live && (
              <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary align-text-bottom" />
            )}
          </div>
        )}

        {/* Hover actions */}
        {!live && (m.content || m.error) && (
          <div
            className={cn(
              "mt-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100",
              isUser && "justify-end",
            )}
          >
            {m.content && (
              <Tooltip label={copied ? "Copied!" : "Copy"} side="bottom">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Copy message"
                  onClick={() => {
                    onCopy();
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1200);
                  }}
                  className="h-6 w-6 text-muted-foreground"
                >
                  {copied ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </Tooltip>
            )}
            {m.role === "assistant" && (
              <Tooltip label="Regenerate" side="bottom">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Regenerate reply"
                  onClick={onRegenerate}
                  disabled={busy}
                  className="h-6 w-6 text-muted-foreground"
                >
                  <RotateCw className="h-3 w-3" />
                </Button>
              </Tooltip>
            )}
            <Tooltip label="Delete" side="bottom">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Delete message"
                onClick={onDelete}
                disabled={busy}
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}

function AttachmentChip({ attachment: a }: { attachment: ChatAttachment }) {
  if (a.kind === "image" && a.dataUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={a.dataUrl}
        alt={a.name}
        title={a.name}
        className="h-24 max-w-48 rounded-md border border-border object-cover"
      />
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-accent/40 px-2 py-1 text-xs">
      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
      <span className="max-w-40 truncate">{a.name}</span>
    </span>
  );
}

/** Collapsible extended-thinking block. */
function ThinkingBlock({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) {
  const [open, setOpen] = useState(false);
  const show = open || streaming;
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        {show ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        <BrainCircuit className="h-3 w-3" />
        Thinking{streaming ? "…" : ""}
      </button>
      {show && (
        <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs whitespace-pre-wrap text-muted-foreground">
          {text}
        </div>
      )}
    </div>
  );
}

/* ── Connection / model pickers ───────────────────────────────────────── */

function ConnectionMenu({
  connections,
  value,
  onChange,
  onManage,
}: {
  connections: AiConnection[];
  value: AiConnection | null;
  onChange: (c: AiConnection) => void;
  onManage: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <Plug className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="max-w-32 truncate">
          {value?.label ?? "Connection"}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
      {open && (
        <div className="absolute z-50 mt-1 w-56 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          <ul className="p-1">
            {connections.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(c);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full truncate rounded px-2.5 py-1.5 text-left text-sm hover:bg-accent",
                    c.id === value?.id && "bg-accent/60",
                  )}
                >
                  {c.label}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              onManage();
              setOpen(false);
            }}
            className="w-full border-t border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent"
          >
            Manage connections…
          </button>
        </div>
      )}
    </div>
  );
}

function ModelMenu({
  provider,
  value,
  onChange,
}: {
  provider: AiProvider;
  value: string;
  onChange: (modelId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const results = useMemo(
    () => searchModels(provider, query),
    [provider, query],
  );
  const current = provider.models[value]?.name ?? value ?? "Select model";

  return (
    <div className="relative shrink-0">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <span className="max-w-44 truncate">{current}</span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </Button>
      {open && (
        <div className="absolute z-50 mt-1 w-80 overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          <div className="relative border-b border-border p-1.5">
            <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models…"
              className="h-8 pl-8 text-sm"
            />
          </div>
          <ScrollArea className="max-h-64">
            <ul className="p-1">
              {results.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(m.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm hover:bg-accent",
                      m.id === value && "bg-accent/60",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    <span className="flex shrink-0 gap-1">
                      {m.tool_call && (
                        <span title="Supports tools — full agentic mode">
                          <Wrench className="h-3 w-3 text-muted-foreground" />
                        </span>
                      )}
                      {m.attachment && (
                        <span title="Accepts images">
                          <ImageIcon className="h-3 w-3 text-muted-foreground" />
                        </span>
                      )}
                      {m.reasoning && (
                        <span title="Supports extended thinking">
                          <BrainCircuit className="h-3 w-3 text-muted-foreground" />
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              ))}
              {results.length === 0 && (
                <li className="px-2.5 py-3 text-center text-xs text-muted-foreground">
                  No models found.
                </li>
              )}
            </ul>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
