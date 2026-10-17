import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SecretStore, isValidSecretKey, type SecretCodec } from "@desktop/secrets";

const codec: SecretCodec = {
  available: () => true,
  encrypt: (s) => Buffer.from(s.split("").reverse().join("")).toString("base64"),
  decrypt: (c) => Buffer.from(c, "base64").toString().split("").reverse().join(""),
};
const file = () => join(mkdtempSync(join(tmpdir(), "msf-sec-")), "secrets.json");

describe("SecretStore", () => {
  it("round-trips and never writes plaintext to disk", () => {
    const f = file();
    const s = new SecretStore(f, codec);
    s.set("github:pat", "ghp_PLAINTEXT");
    expect(s.get("github:pat")).toBe("ghp_PLAINTEXT");
    expect(readFileSync(f, "utf8")).not.toContain("ghp_PLAINTEXT");
    expect(new SecretStore(f, codec).get("github:pat")).toBe("ghp_PLAINTEXT");
  });
  it("returns '' for unknown keys and deletes", () => {
    const s = new SecretStore(file(), codec);
    expect(s.get("nope")).toBe("");
    s.set("a", "1");
    s.delete("a");
    expect(s.get("a")).toBe("");
  });
  it("refuses to store when encryption is unavailable", () => {
    const s = new SecretStore(file(), { ...codec, available: () => false });
    expect(s.available()).toBe(false);
    expect(() => s.set("a", "1")).toThrow(/unavailable/i);
  });
  it("survives a corrupt file", () => {
    const f = file();
    new SecretStore(f, codec).set("a", "1");
    writeFileSync(f, "{broken");
    expect(new SecretStore(f, codec).get("a")).toBe("");
  });
  it("reports presence without returning the value", () => {
    const s = new SecretStore(file(), codec);
    s.set("github:pat", "ghp_x");
    expect(s.has("github:pat")).toBe(true);
    expect(s.has("ai-connection:missing")).toBe(false);
  });
});

describe("isValidSecretKey", () => {
  it("accepts namespaced ids and rejects odd keys", () => {
    expect(isValidSecretKey("ai-connection:0a1b-2c")).toBe(true);
    expect(isValidSecretKey("github:pat")).toBe(true);
    for (const k of ["", " x", "a/b", "a".repeat(81), "__proto__x y"]) expect(isValidSecretKey(k)).toBe(false);
  });
});
