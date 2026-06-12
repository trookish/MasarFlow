import type { VaultCapabilities } from "./types";

export function detectCapabilities(): VaultCapabilities {
  if (typeof window === "undefined") {
    return { fsa: false, webkit: false, showDirectoryPicker: false, browserName: "server" };
  }
  const ua = navigator.userAgent;
  const isChromium = /Chrome|Chromium|Edg|Arc|Brave|OPR/i.test(ua) && !/Firefox/i.test(ua);
  const isFirefox = /Firefox/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome|Chromium|Edg/i.test(ua);
  const fsa = "showDirectoryPicker" in window;
  const webkit = "webkitShowDirectoryPicker" in window;
  let name = "Unknown";
  if (/Edg/i.test(ua)) name = "Edge";
  else if (/OPR/i.test(ua)) name = "Opera";
  else if (/Brave/i.test(ua)) name = "Brave";
  else if (/Arc/i.test(ua)) name = "Arc";
  else if (/Chrome/i.test(ua)) name = "Chrome";
  else if (isFirefox) name = "Firefox";
  else if (isSafari) name = "Safari";
  return { fsa: isChromium && fsa, webkit: isSafari && webkit, showDirectoryPicker: fsa || webkit, browserName: name };
}
