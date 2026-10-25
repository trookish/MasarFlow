import { describe, it, expect } from "vitest";
import { EMBED_FRAME_PROPS, videoEmbedUrl } from "@/components/canvas/nodes/types";
import { FRAME_HOSTS } from "@shared/embed-hosts";

describe("videoEmbedUrl", () => {
  it.each([
    ["https://vimeo.com/76979871", "https://player.vimeo.com/video/76979871"],
    ["https://player.vimeo.com/video/76979871?h=1", "https://player.vimeo.com/video/76979871"],
    ["https://www.dailymotion.com/video/x8abc", "https://www.dailymotion.com/embed/video/x8abc"],
    ["https://www.loom.com/share/abc123", "https://www.loom.com/embed/abc123"],
  ])("maps %s to its player", (input, out) => {
    expect(videoEmbedUrl(input)).toBe(out);
  });
  it.each([
    "https://twitch.tv/somebody",
    "https://evil.test/video/1",
    "javascript:alert(1)",
    "https://vimeo.com/channels/staff",
    "not a url",
  ])("refuses to frame %s", (input) => {
    expect(videoEmbedUrl(input)).toBeNull();
  });
  it("only produces origins the CSP frame-src allows", () => {
    for (const u of ["https://vimeo.com/1", "https://dailymotion.com/video/x", "https://loom.com/share/a"]) {
      expect(FRAME_HOSTS).toContain(new URL(videoEmbedUrl(u)!).origin);
    }
  });
  it("sandboxes every frame and strips the referrer", () => {
    expect(EMBED_FRAME_PROPS.sandbox).not.toMatch(/allow-top-navigation|allow-popups|allow-forms/);
    expect(EMBED_FRAME_PROPS.referrerPolicy).toBe("no-referrer");
  });
});
