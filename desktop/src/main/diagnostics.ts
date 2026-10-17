import { app, safeStorage } from "electron";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildDiagnosticsReport, redactText, type DiagnosticsSection } from "@shared/diagnostics";
import { APP_DISPLAY_VERSION } from "@shared/version";
import { readRootsFile } from "./security/roots";
import { listBackups } from "./backups";
import { logTail } from "./logging";
import { SecretStore, createSafeStorageCodec, isValidSecretKey } from "./secrets";

export interface DiagnosticsInput {
  /** Keys to report as present/absent — never their values. */
  secretKeys: string[];
  /** Update phase, supplied by the IPC handler (desktop/src/main/updater.ts, wired in T9). */
  updatePhase?: string;
}

/** Everything the Control Center shows, as redacted markdown. */
export function collectDiagnostics(input: DiagnosticsInput): { markdown: string; generatedAt: string } {
  const userData = app.getPath("userData");
  const rootsFile = join(userData, "roots.json");
  const roots = readRootsFile(rootsFile);
  const secrets = new SecretStore(join(userData, "secrets.json"), createSafeStorageCodec(safeStorage));
  const backups = listBackups(join(userData, "backups"));
  const logs = ["server.log", "main.log"];

  const sections: DiagnosticsSection[] = [
    {
      title: "App",
      lines: [
        `version ${app.getVersion()}`,
        `display version ${APP_DISPLAY_VERSION}`,
        `packaged ${app.isPackaged}`,
        `portable ${process.env.PORTABLE_EXECUTABLE_DIR ? "yes" : "no"}`,
        `platform ${process.platform} ${process.arch}`,
        `electron ${process.versions.electron} / chrome ${process.versions.chrome} / node ${process.versions.node}`,
        `userData ${userData}`,
      ],
    },
    {
      title: "Security",
      lines: [
        `secret storage available ${secrets.available()}`,
        `registered roots ${roots.length}`,
        ...input.secretKeys.filter(isValidSecretKey).map((k) => `secret ${k} ${secrets.has(k) ? "present" : "absent"}`),
      ],
    },
    { title: "Backups", lines: backups.slice(0, 10).map((b) => `${b.name} (${new Date(b.mtimeMs).toISOString()})`) },
    { title: "Updates", lines: [input.updatePhase ?? "not checked"] },
    {
      title: "Logs",
      lines: logs.flatMap((name) => {
        const file = join(userData, "logs", name);
        if (!existsSync(file)) return [`${name}: missing`];
        const mb = (statSync(file).size / 1_048_576).toFixed(1);
        return [`${name}: ${mb} MB`];
      }),
    },
    { title: "Main log tail (last 40 lines)", lines: logTail(40) },
  ];

  const markdown = redactText(buildDiagnosticsReport(sections), { allowedPaths: roots, userHome: app.getPath("home") });
  return { markdown, generatedAt: new Date().toISOString() };
}

/** Raw (unredacted) file contents are never returned — only the redacted report above. */
export function readChangelog(maxBytes = 512 * 1024): string {
  const file = app.isPackaged ? join(process.resourcesPath, "CHANGELOG.md") : join(app.getAppPath(), "..", "CHANGELOG.md");
  try {
    return readFileSync(file, "utf8").slice(0, maxBytes);
  } catch {
    return "";
  }
}
