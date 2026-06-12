import type { VaultCapabilities } from "./types";

function detectBrave(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as unknown as { brave?: { isBrave?: () => Promise<boolean> | boolean } };
  if (nav.brave && typeof nav.brave.isBrave === "function") {
    const res = nav.brave.isBrave();
    if (res && typeof (res as Promise<boolean>).then === "function") {
      return false;
    }
    return res === true;
  }
  return false;
}

export function detectCapabilities(): VaultCapabilities {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { fsa: false, webkit: false, webkitdirectory: false, opfs: false, showDirectoryPicker: false, browserName: "server" };
  }
  const ua = navigator.userAgent;
  const isFirefox = /Firefox/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR/i.test(ua);
  const isBrave = detectBrave();
  const isArc = /\bArc\b/i.test(ua);
  const isEdge = /Edg/i.test(ua);
  const isOpera = /OPR/i.test(ua);
  const isChrome = /Chrome|Chromium/i.test(ua) && !isFirefox && !isSafari && !isEdge && !isOpera;
  const fsa = "showDirectoryPicker" in window;
  const webkit = "webkitShowDirectoryPicker" in window;
  const showDirectoryPicker = fsa || webkit;
  let name = "Unknown";
  if (isBrave) name = "Brave";
  else if (isEdge) name = "Edge";
  else if (isOpera) name = "Opera";
  else if (isArc) name = "Arc";
  else if (isChrome) name = "Chrome";
  else if (isFirefox) name = "Firefox";
  else if (isSafari) name = "Safari";
  const webkitdirectory = "webkitdirectory" in document.createElement("input");
  const opfs =
    typeof navigator !== "undefined" &&
    "storage" in navigator &&
    typeof (navigator as unknown as { storage?: { getDirectory?: () => Promise<unknown> } }).storage?.getDirectory === "function";
  return {
    fsa,
    webkit: isSafari && webkit,
    showDirectoryPicker,
    webkitdirectory,
    opfs,
    browserName: name,
  };
}
