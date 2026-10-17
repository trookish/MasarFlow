import { describe, it, expect } from "vitest";
import { markdownUrlTransform } from "@/lib/utils/markdown-url";

describe("markdownUrlTransform", () => {
  it("keeps app schemes that react-markdown would blank", () => {
    expect(markdownUrlTransform("wikilink:Foo")).toBe("wikilink:Foo");
    expect(markdownUrlTransform("entity:task/abc")).toBe("entity:task/abc");
  });
  it("still sanitizes dangerous schemes", () => {
    expect(markdownUrlTransform("javascript:alert(1)")).toBe("");
    expect(markdownUrlTransform("data:text/html;base64,AAAA")).toBe("");
  });
  it("passes normal links through", () => {
    expect(markdownUrlTransform("https://masarflow.dev")).toBe("https://masarflow.dev");
    expect(markdownUrlTransform("/tasks?task=1")).toBe("/tasks?task=1");
  });
});
