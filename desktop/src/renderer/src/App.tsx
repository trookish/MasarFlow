import { useEffect } from "react";
import { useApp } from "@/lib/store";
import { applyAppearance } from "@/lib/theme";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { TerminalPanel } from "@/components/terminal/terminal-panel";
import { RunPage } from "@/components/run/run-page";
import { SetupPage } from "@/components/setup/setup-page";
import { ConfigPage } from "@/components/config/config-page";
import { TestingPage } from "@/components/testing/testing-page";

export default function App() {
  const page = useApp((s) => s.page);
  const setPage = useApp((s) => s.setPage);
  const setSettings = useApp((s) => s.setSettings);
  const setSetup = useApp((s) => s.setSetup);
  const setServer = useApp((s) => s.setServer);
  const setSessions = useApp((s) => s.setSessions);
  const upsertSession = useApp((s) => s.upsertSession);
  const setEnv = useApp((s) => s.setEnv);
  const setMaximized = useApp((s) => s.setMaximized);

  useEffect(() => {
    void (async () => {
      const [settings, setup, status, sessions, env] = await Promise.all([
        window.masarFlow.settings.get(),
        window.masarFlow.setup.check(),
        window.masarFlow.server.getStatus(),
        window.masarFlow.session.list(),
        window.masarFlow.env.read(),
      ]);
      applyAppearance(settings);
      setSettings(settings);
      setSetup(setup);
      setServer(status);
      setSessions(sessions);
      setEnv(env.fields);
      // If nothing is set up yet, land on the setup page.
      if (!setup.initialized && sessions.length === 0) setPage("setup");
      const maximized = await window.masarFlow.window.isMaximized();
      setMaximized(maximized);
    })();

    const offSetup = window.masarFlow.setup.onState(setSetup);
    const offStatus = window.masarFlow.server.onStatus(setServer);
    const offList = window.masarFlow.session.onList(setSessions);
    const offChanged = window.masarFlow.session.onChanged(upsertSession);
    const offMax = window.masarFlow.window.onMaximized(setMaximized);

    const onKey = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "`")) {
        e.preventDefault();
        useApp.getState().setTerminalOpen(!useApp.getState().terminalOpen);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      offSetup();
      offStatus();
      offList();
      offChanged();
      offMax();
      window.removeEventListener("keydown", onKey);
    };
  }, [setEnv, setMaximized, setPage, setServer, setSessions, setSetup, setSettings, upsertSession]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="min-h-0 flex-1 overflow-hidden">
          {page === "run" && <RunPage />}
          {page === "setup" && <SetupPage />}
          {page === "config" && <ConfigPage />}
          {page === "testing" && <TestingPage />}
        </main>
        <TerminalPanel />
      </div>
    </div>
  );
}
