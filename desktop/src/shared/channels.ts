/** Every IPC channel name. New phases append here — never inline strings. */
export const CH = {
  appInfo: "app:info",
  appOpenLogs: "app:open-logs",
  appRelaunch: "app:relaunch",
  dialogChooseFolder: "dialog:choose-folder",
  shellOpenExternal: "shell:open-external",
  shellShowItem: "shell:show-item",
  clipboardWrite: "clipboard:write-text",
  clipboardRead: "clipboard:read-text",
  winMinimize: "window:minimize",
  winToggleMax: "window:toggle-maximize",
  winClose: "window:close",
  winIsMax: "window:is-maximized",
  winMaximized: "window:maximized",
} as const;
