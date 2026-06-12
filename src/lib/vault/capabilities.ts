import type { VaultCapabilities } from "./types";

export function detectCapabilities(): VaultCapabilities {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { fsa: false, webkit: false, webkitdirectory: false, opfs: false, showDirectoryPicker: false, browserName: "server" };
  }
  const ua = navigator.userAgent;
  const isChromium = /Chrome|Chromium|Edg|Arc|Brave|OPR/i.test(ua) && !/Firefox/i.test(ua);
  const isFirefox = /Firefox/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|Edg/i.test(ua);
  const fsa = "showDirectoryPicker" in window;
  const webkit = "webkitShowDirectoryPicker" in window;
  const showDirectoryPicker = fsa || webkit;
  let name = "Unknown";
  if (/Edg/i.test(ua)) name = "Edge";
  else if (/OPR/i.test(ua)) name = "Opera";
  else if (/Brave/i.test(ua)) name = "Brave";
  else if (/Arc/i.test(ua)) name = "Arc";
  else if (/Chrome/i.test(ua)) name = "Chrome";
  else if (isFirefox) name = "Firefox";
  else if (isSafari) name = "Safari";
  const webkitdirectory = "webkitdirectory" in document.createElement("input");
  const opfs =
    typeof navigator !== "undefined" &&
    "storage" in navigator &&
    typeof (navigator as unknown as { storage?: { getDirectory?: () => Promise<unknown> } }).storage?.getDirectory === "function";
  return {
    fsa: isChromium && fsa,
    webkit: isSafari && webkit,
    showDirectoryPicker,
    webkitdirectory,
    opfs,
    browserName: name,
  };
}
