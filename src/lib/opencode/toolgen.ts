/**
 * opencode custom-tool generator.
 *
 * Turns the workspace function definitions (workspace-tool-defs.ts) into
 * real opencode custom tools (`.opencode/tools/*.ts`). opencode's runtime
 * executes each tool's `execute()` in the `opencode serve` process; the
 * generated code calls back into MasarFlow's server (`/api/opencode/ws-call`),
 * which relays the call to the open browser over SSE — the browser executes
 * the function against IndexedDB (with undo/dev-log/wikilink support) and
 * posts the result back, which flows to opencode and on to the model.
 *
 * Everything here is pure and unit-testable; the files are materialized by
 * scripts/start.mjs (or scripts/install-opencode-tools.mjs) at server start.
 */

import {
  WORKSPACE_TOOLS,
  type WorkspaceToolDef,
} from "../ai/workspace-tool-defs.ts";

export interface OpenCodeToolFile {
  /** Filename without the .ts extension — this becomes the tool id. */
  name: string;
  content: string;
}

export interface ToolgenOptions {
  /** Base URL of the MasarFlow Next server, e.g. http://127.0.0.1:3000. */
  bridgeUrl: string;
  /** Shared secret sent by the generated tools (MASARFLOW_BRIDGE_SECRET). */
  secret: string;
  /** Per-call timeout baked into the generated tools (default 100s). */
  timeoutMs?: number;
}

interface ParamSpec {
  type?: string;
  enum?: string[];
  items?: { type?: string };
  description?: string;
}

/** JSON Schema property → zod expression used by the opencode tool's args. */
function zodType(spec: ParamSpec): string {
  const base: string = (() => {
    switch (spec.type) {
      case "string":
        if (spec.enum?.length) {
          const values = spec.enum.map((v) => JSON.stringify(v)).join(", ");
          return `tool.schema.enum([${values}])`;
        }
        return "tool.schema.string()";
      case "number":
        return "tool.schema.number()";
      case "boolean":
        return "tool.schema.boolean()";
      case "array":
        return "tool.schema.array(tool.schema.string())";
      case "object":
        return "tool.schema.object({})";
      default:
        return "tool.schema.string()";
    }
  })();
  return spec.description
    ? `${base}.describe(${JSON.stringify(spec.description)})`
    : base;
}

/** Generate the zod `args` shape for one tool definition. */
function zodArgs(def: WorkspaceToolDef): string {
  const parameters = def.parameters as {
    properties?: Record<string, ParamSpec>;
    required?: string[];
  };
  const props = parameters?.properties ?? {};
  const required = new Set(parameters?.required ?? []);
  const lines = Object.entries(props).map(([key, spec]) => {
    let z = zodType(spec);
    if (!required.has(key)) z += ".optional()";
    return `    ${JSON.stringify(key)}: ${z},`;
  });
  if (!lines.length) return "{}";
  return `{\n${lines.join("\n")}\n  }`;
}

/** Render one workspace function as a self-contained opencode tool file. */
export function workspaceToolToOpencodeFile(
  def: WorkspaceToolDef,
  opts: ToolgenOptions,
): OpenCodeToolFile {
  const timeoutMs = opts.timeoutMs ?? 100_000;
  const bridgeUrl = opts.bridgeUrl.replace(/\/+$/, "");
  const secret = opts.secret;

  const content = `import { tool } from "@opencode-ai/plugin"

export default tool({
  description: ${JSON.stringify(def.description)},
  args: ${zodArgs(def)},
  async execute(args, context) {
    const bridgeUrl = process.env.MASARFLOW_BRIDGE_URL ?? ${JSON.stringify(bridgeUrl)}
    const secret = process.env.MASARFLOW_BRIDGE_SECRET ?? ${JSON.stringify(secret)}
    const res = await fetch(\`\${bridgeUrl}/api/opencode/ws-call\`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-masarflow-bridge-secret": secret,
      },
      body: JSON.stringify({
        sessionId: context.sessionID,
        name: ${JSON.stringify(def.name)},
        args,
      }),
      signal: AbortSignal.timeout(${timeoutMs}),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => "")
      let message = \`MasarFlow bridge error (\${res.status})\`
      try {
        const parsed = JSON.parse(text)
        if (parsed && typeof parsed.error === "string") message = parsed.error
      } catch {}
      throw new Error(message)
    }
    const data = (await res.json()) as { result?: string }
    return data.result ?? "{}"
  },
})
`;

  return { name: def.name, content };
}

/** Every workspace function as an opencode tool file. */
export function allWorkspaceToolFiles(
  opts: ToolgenOptions,
): OpenCodeToolFile[] {
  return WORKSPACE_TOOLS.map((def) => workspaceToolToOpencodeFile(def, opts));
}
