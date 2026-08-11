import { describe, it, expect } from "vitest";
import {
  WORKSPACE_TOOLS,
  WORKSPACE_TOOL_NAMES,
} from "@/lib/ai/workspace-tool-defs";
import {
  allWorkspaceToolFiles,
  workspaceToolToOpencodeFile,
} from "@/lib/opencode/toolgen";

const OPTS = { bridgeUrl: "http://127.0.0.1:3000/", secret: "msf_test" };

describe("workspaceToolToOpencodeFile", () => {
  it("generates one file per workspace function with the tool id = filename", () => {
    const files = allWorkspaceToolFiles(OPTS);
    expect(files).toHaveLength(WORKSPACE_TOOLS.length);
    expect(files.map((f) => f.name).sort()).toEqual(
      [...WORKSPACE_TOOL_NAMES].sort(),
    );
  });

  it("renders a valid opencode tool with zod args from the JSON schema", () => {
    const def = WORKSPACE_TOOLS.find((t) => t.name === "create_note")!;
    const file = workspaceToolToOpencodeFile(def, OPTS);
    expect(file.content).toContain(
      'import { tool } from "@opencode-ai/plugin"',
    );
    expect(file.content).toContain("export default tool({");
    // Required args are NOT marked optional; optional ones are.
    expect(file.content).toContain(
      '"title": tool.schema.string().describe("Note title."),',
    );
    expect(file.content).toContain('"type": tool.schema.enum([');
    expect(file.content).toContain(
      '"tags": tool.schema.array(tool.schema.string()).describe("Tags without #.").optional(),',
    );
  });

  it("renders number and boolean schemas for list/create tools", () => {
    const search = workspaceToolToOpencodeFile(
      WORKSPACE_TOOLS.find((t) => t.name === "search_workspace")!,
      OPTS,
    );
    expect(search.content).toContain(
      '"limit": tool.schema.number().describe("Max results (default 10).").optional(),',
    );

    const standard = workspaceToolToOpencodeFile(
      WORKSPACE_TOOLS.find((t) => t.name === "create_standard")!,
      OPTS,
    );
    expect(standard.content).toContain(
      '"enforced": tool.schema.boolean().describe("Machine-enforced (default true).").optional(),',
    );
  });

  it("renders empty args objects for parameter-less tools", () => {
    const file = workspaceToolToOpencodeFile(
      WORKSPACE_TOOLS.find((t) => t.name === "list_canvases")!,
      OPTS,
    );
    expect(file.content).toContain("args: {},");
  });

  it("bakes the bridge URL, secret, tool name, and a call timeout", () => {
    const file = workspaceToolToOpencodeFile(
      WORKSPACE_TOOLS.find((t) => t.name === "read_spec")!,
      OPTS,
    );
    expect(file.content).toContain('"http://127.0.0.1:3000"');
    expect(file.content).toContain('"msf_test"');
    expect(file.content).toContain('name: "read_spec"');
    expect(file.content).toContain("/api/opencode/ws-call");
    expect(file.content).toContain("AbortSignal.timeout(100000)");
    // Runtime env overrides keep manually-started servers working.
    expect(file.content).toContain("process.env.MASARFLOW_BRIDGE_URL");
    expect(file.content).toContain("process.env.MASARFLOW_BRIDGE_SECRET");
  });

  it("escapes descriptions safely inside generated strings", () => {
    const def = {
      name: "odd_tool",
      description: 'Say "hi" with \\ backslashes and a newline\ninside',
      parameters: { type: "object", properties: {} },
    };
    const file = workspaceToolToOpencodeFile(def, OPTS);
    // JSON.stringify escapes quotes/backslashes/newlines for the generated
    // string literal — the file must contain the escaped form, and the
    // raw description must never appear unescaped inside a string.
    expect(file.content).toContain('Say \\"hi\\"');
    expect(file.content).toContain("\\\\ backslashes");
    expect(file.content).toContain("newline\\ninside");
  });
});
