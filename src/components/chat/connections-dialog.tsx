"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Plus,
  Trash2,
  KeyRound,
  Search,
  ChevronDown,
  Loader2,
  CircleCheck,
  CircleAlert,
} from "lucide-react";
import { aiConnectionsRepo } from "@/lib/db/repos";
import type { AiConnection } from "@/lib/db/schema";
import {
  flattenProviders,
  providerBaseUrl,
  defaultModelId,
  type Catalog,
  type AiProvider,
} from "@/lib/ai/catalog";
import { probeConnection, type ProbeResult } from "@/lib/ai/probe";
import { CUSTOM_PROVIDER_ID, customProvider } from "@/lib/ai/providers/custom";
import { testConnection } from "@/lib/ai/providers/test-connection";
import { cn } from "@/lib/utils/cn";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

/** Pseudo-provider entry: any OpenAI-compatible endpoint the user points at. */
const CUSTOM_ENTRY: AiProvider = {
  id: CUSTOM_PROVIDER_ID,
  name: "Custom (OpenAI-compatible)",
  models: {},
};

const HTTP_URL_RE = /^https?:\/\/\S+$/i;

/** POST {baseUrl, apiKey} to the discover proxy → the endpoint's model ids. */
async function discoverModels(opts: {
  baseUrl: string;
  apiKey: string;
}): Promise<{ ok: true; models: string[] } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/models/discover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(opts),
    });
    const data = (await res.json()) as { models?: string[]; error?: string };
    if (!res.ok) {
      return {
        ok: false,
        error: data.error ?? `Request failed (${res.status})`,
      };
    }
    return { ok: true, models: data.models ?? [] };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function ConnectionsDialog({
  catalog,
  onClose,
}: {
  catalog: Catalog;
  onClose: () => void;
}) {
  const connections = useLiveQuery(() => aiConnectionsRepo.list(), []) ?? [];
  const providers = useMemo(
    () => [CUSTOM_ENTRY, ...flattenProviders(catalog)],
    [catalog],
  );
  const providerName = (id: string) =>
    id === CUSTOM_PROVIDER_ID ? "Custom endpoint" : (catalog[id]?.name ?? id);

  const [adding, setAdding] = useState(false);

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      ariaLabel="AI connections"
      className="w-[460px] p-0"
    >
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h2 className="text-sm font-semibold">AI connections</h2>
          <p className="text-xs text-muted-foreground">
            Keys are stored locally in your browser.
          </p>
        </div>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> Add
          </Button>
        )}
      </div>

      {adding ? (
        <AddConnection
          providers={providers}
          defaultBaseUrl={providerBaseUrl}
          onDone={() => setAdding(false)}
        />
      ) : (
        <ScrollArea className="max-h-80">
          <div className="p-3">
            {connections.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">
                No connections yet. Add a provider to start chatting.
              </p>
            ) : (
              <ul className="space-y-1">
                {connections.map((c) => (
                  <ConnectionRow
                    key={c.id}
                    connection={c}
                    catalog={catalog}
                    providerName={providerName(c.providerId)}
                  />
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>
      )}
    </Dialog>
  );
}

function AddConnection({
  providers,
  defaultBaseUrl,
  onDone,
}: {
  providers: ReturnType<typeof flattenProviders>;
  defaultBaseUrl: (p: (typeof providers)[number]) => string;
  onDone: () => void;
}) {
  const [providerId, setProviderId] = useState<string>("");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [modelId, setModelId] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    detail: string;
  } | null>(null);

  const selected = providers.find((p) => p.id === providerId) ?? null;
  const isCustom = providerId === CUSTOM_PROVIDER_ID;
  const baseUrlOk = HTTP_URL_RE.test(baseUrl.trim());
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return providers.slice(0, 50);
    return providers
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 50);
  }, [providers, search]);

  function choose(id: string, name: string) {
    setProviderId(id);
    if (!label) setLabel(name);
    setPickerOpen(false);
    setSearch("");
  }

  async function save() {
    if (!providerId) return;
    if (isCustom && !baseUrlOk) return;
    await aiConnectionsRepo.create({
      providerId,
      label:
        label.trim() ||
        (isCustom ? "Custom endpoint" : selected?.name || providerId),
      apiKey: apiKey.trim(),
      baseUrl: baseUrl.trim(),
    });
    onDone();
  }

  async function test() {
    setTesting(true);
    setTestResult(null);
    try {
      const provider = customProvider(
        { id: "custom-draft", label, baseUrl: baseUrl.trim() },
        [modelId.trim()],
      );
      const res = await testConnection({
        provider,
        apiKey,
        baseUrl: baseUrl.trim(),
        model: modelId.trim(),
      });
      setTestResult(
        res.ok
          ? { ok: true, detail: "Connected — the endpoint answered." }
          : { ok: false, detail: res.error },
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="space-y-3 p-5">
      {/* Provider picker */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Provider
        </label>
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between"
            onClick={() => setPickerOpen((v) => !v)}
          >
            <span className={cn(!selected && "text-muted-foreground")}>
              {selected ? selected.name : "Select a provider…"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
          {pickerOpen && (
            <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
              <div className="relative border-b border-border p-1.5">
                <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search providers…"
                  className="h-8 pl-8 text-sm"
                />
              </div>
              <ScrollArea className="max-h-56">
                <ul className="p-1">
                  {filtered.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => choose(p.id, p.name)}
                        className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-sm hover:bg-accent"
                      >
                        <span>{p.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {Object.keys(p.models).length}
                        </span>
                      </button>
                    </li>
                  ))}
                  {filtered.length === 0 && (
                    <li className="px-2.5 py-3 text-center text-xs text-muted-foreground">
                      No providers found.
                    </li>
                  )}
                </ul>
              </ScrollArea>
            </div>
          )}
        </div>
      </div>

      <Field label="Label">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={isCustom ? "LM Studio (local)" : "My OpenAI key"}
          className="h-9 text-sm"
        />
      </Field>

      <Field
        label={
          selected?.noAuth || isCustom
            ? "API key (only if the endpoint requires one)"
            : "API key"
        }
      >
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={selected?.noAuth || isCustom ? "(none)" : "sk-…"}
          className="h-9 font-mono text-sm"
        />
      </Field>

      <Field
        label={isCustom ? "Base URL (required)" : "Base URL (optional override)"}
      >
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder={
            isCustom
              ? "http://127.0.0.1:1234/v1"
              : selected
                ? defaultBaseUrl(selected)
                : "https://…"
          }
          className="h-9 font-mono text-sm"
        />
      </Field>
      {isCustom && baseUrl.trim() && !baseUrlOk && (
        <p className="flex items-center gap-1.5 text-[11px] text-destructive">
          <CircleAlert className="h-3 w-3 shrink-0" />
          Only http: and https: base URLs are accepted (e.g.
          http://127.0.0.1:1234/v1).
        </p>
      )}

      {isCustom && (
        <>
          <ModelIdField
            value={modelId}
            onChange={(v) => setModelId(v)}
            baseUrl={baseUrl.trim()}
            apiKey={apiKey}
            onFirst={(first) => setModelId(first)}
          />
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void test()}
              disabled={testing || !baseUrlOk || !modelId.trim()}
              title={
                !baseUrlOk
                  ? "Enter an http(s) base URL first."
                  : !modelId.trim()
                    ? "Type or discover a model id first."
                    : undefined
              }
            >
              {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Test
            </Button>
            {testResult && (
              <span
                className={cn(
                  "flex min-w-0 items-start gap-1.5 text-[11px]",
                  testResult.ok ? "text-muted-foreground" : "text-destructive",
                )}
              >
                {testResult.ok ? (
                  <CircleCheck className="mt-0.5 h-3 w-3 shrink-0" />
                ) : (
                  <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                )}
                <span className="break-all">{testResult.detail}</span>
              </span>
            )}
          </div>
        </>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!providerId || (isCustom && !baseUrlOk)}
          onClick={save}
        >
          Add connection
        </Button>
      </div>
    </div>
  );
}

/* ── Model id + discovery (custom endpoints) ──────────────────────────── */

function ModelIdField({
  value,
  onChange,
  baseUrl,
  apiKey,
  onFirst,
}: {
  value: string;
  onChange: (value: string) => void;
  baseUrl: string;
  apiKey: string;
  /** Called with the first discovered id when the field is still empty. */
  onFirst?: (first: string) => void;
}) {
  const [discovering, setDiscovering] = useState(false);
  const [models, setModels] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function discover() {
    setDiscovering(true);
    setError(null);
    setModels(null);
    try {
      const res = await discoverModels({ baseUrl, apiKey });
      if (res.ok) {
        setModels(res.models);
        if (!value.trim() && res.models.length > 0) onFirst?.(res.models[0]);
      } else {
        setError(res.error);
      }
    } finally {
      setDiscovering(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        Model id
      </label>
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="qwen3-coder"
          className="h-9 font-mono text-sm"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => void discover()}
          disabled={discovering || !HTTP_URL_RE.test(baseUrl)}
          title={
            HTTP_URL_RE.test(baseUrl)
              ? undefined
              : "Enter an http(s) base URL first."
          }
        >
          {discovering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Discover
        </Button>
      </div>
      {models && (
        <div className="flex flex-wrap gap-1">
          {models.length === 0 && (
            <span className="text-[11px] text-muted-foreground">
              The endpoint listed no models — type the model id directly.
            </span>
          )}
          {models.slice(0, 40).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange(m)}
              className={cn(
                "rounded border border-border px-1.5 py-0.5 font-mono text-[11px] hover:bg-accent",
                m === value && "border-primary bg-primary/10",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="flex items-start gap-1.5 text-[11px] text-destructive">
          <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="break-all">{error}</span>
        </p>
      )}
    </div>
  );
}

/* ── One saved connection with a live capability probe ────────────────── */

function ConnectionRow({
  connection: c,
  catalog,
  providerName,
}: {
  connection: AiConnection;
  catalog: Catalog;
  providerName: string;
}) {
  const isCustom = c.providerId === CUSTOM_PROVIDER_ID;
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<ProbeResult | null>(null);
  const [modelId, setModelId] = useState("");
  const [customResult, setCustomResult] = useState<{
    ok: boolean;
    detail: string;
  } | null>(null);

  async function test() {
    setTesting(true);
    setResult(null);
    setCustomResult(null);
    try {
      if (isCustom) {
        const model = modelId.trim();
        if (!model) {
          setCustomResult({
            ok: false,
            detail: "Type or discover a model id to test this endpoint.",
          });
          return;
        }
        const res = await testConnection({
          provider: customProvider(c, [model]),
          apiKey: c.apiKey,
          baseUrl: c.baseUrl || undefined,
          model,
        });
        setCustomResult(
          res.ok
            ? { ok: true, detail: "Connected — the endpoint answered." }
            : { ok: false, detail: res.error },
        );
        return;
      }
      const provider: AiProvider = catalog[c.providerId] ?? {
        id: c.providerId,
        name: c.providerId,
        models: {},
      };
      const model = defaultModelId(provider);
      if (!model) {
        setResult({
          ok: false,
          latencyMs: 0,
          streaming: false,
          tools: null,
          error: "No model in the catalog to test with.",
        });
        return;
      }
      setResult(
        await probeConnection({
          provider,
          apiKey: c.apiKey,
          baseUrl: c.baseUrl || undefined,
          model,
        }),
      );
    } finally {
      setTesting(false);
    }
  }

  return (
    <li className="rounded-md border border-border px-3 py-2">
      <div className="flex items-center gap-3">
        <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{c.label}</div>
          <div className="truncate text-xs text-muted-foreground">
            {providerName} · {c.apiKey ? "key set" : "no key"}
            {isCustom && c.baseUrl ? ` · ${c.baseUrl}` : ""}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={test}
          disabled={testing}
          aria-label="Test connection"
        >
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Test
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Remove connection"
          onClick={() => aiConnectionsRepo.remove(c.id)}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {isCustom && (
        <div className="mt-2 space-y-2">
          <ModelIdField
            value={modelId}
            onChange={setModelId}
            baseUrl={c.baseUrl}
            apiKey={c.apiKey}
          />
          {customResult && (
            <div
              className={cn(
                "flex items-start gap-1.5 text-[11px]",
                customResult.ok ? "text-muted-foreground" : "text-destructive",
              )}
            >
              {customResult.ok ? (
                <CircleCheck className="mt-0.5 h-3 w-3 shrink-0" />
              ) : (
                <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              )}
              <span>{customResult.detail}</span>
            </div>
          )}
        </div>
      )}
      {result && (
        <div
          className={cn(
            "mt-2 flex items-start gap-1.5 text-[11px]",
            result.ok && result.tools !== false
              ? "text-muted-foreground"
              : "text-destructive",
          )}
        >
          {result.ok && result.tools !== false ? (
            <CircleCheck className="mt-0.5 h-3 w-3 shrink-0" />
          ) : (
            <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
          )}
          <span>
            {result.ok ? (
              <>
                Connected in {result.latencyMs}ms · streaming{" "}
                {result.streaming ? "✓" : "✗"} · function calling{" "}
                {result.tools ? "✓" : "✗"}
                {result.tools === false && (
                  <span className="mt-0.5 block text-muted-foreground">
                    The model/gateway ignored a forced tool call — agentic
                    workspace tools will not work with this model. Pick a
                    tool-capable model.
                  </span>
                )}
              </>
            ) : (
              (result.error ?? "Connection failed.")
            )}
          </span>
        </div>
      )}
    </li>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
