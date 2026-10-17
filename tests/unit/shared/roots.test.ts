import { describe, it, expect } from "vitest";
import { isRootAllowed, normalizeRoot, parseRoots } from "@desktop-shared/roots";

describe("normalizeRoot", () => {
  it("lower-cases and drops trailing separators on win32", () => {
    expect(normalizeRoot("C:\\Users\\A\\Proj\\", "win32")).toBe("c:\\users\\a\\proj");
  });
  it("keeps case on linux", () => {
    expect(normalizeRoot("/home/A/Proj/", "linux")).toBe("/home/A/Proj");
  });
});

describe("isRootAllowed", () => {
  const roots = ["C:\\Users\\a\\proj"];
  it("allows the root itself, case-insensitively, and its sub-folders", () => {
    expect(isRootAllowed("c:\\users\\A\\PROJ", roots, "win32")).toBe(true);
    expect(isRootAllowed("C:\\Users\\a\\proj\\src", roots, "win32")).toBe(true);
  });
  it("rejects siblings with a shared prefix, parents and traversal", () => {
    expect(isRootAllowed("C:\\Users\\a\\proj-evil", roots, "win32")).toBe(false);
    expect(isRootAllowed("C:\\Users\\a", roots, "win32")).toBe(false);
    expect(isRootAllowed("C:\\Users\\a\\proj\\..\\other", roots, "win32")).toBe(false);
    expect(isRootAllowed("D:\\Users\\a\\proj", roots, "win32")).toBe(false);
  });
  it("rejects everything when nothing is registered", () => {
    expect(isRootAllowed("C:\\x", [], "win32")).toBe(false);
  });
});

describe("parseRoots", () => {
  it("tolerates garbage", () => {
    expect(parseRoots("not json")).toEqual([]);
    expect(parseRoots('{"roots":[1,"C:\\\\a"]}')).toEqual(["C:\\a"]);
    expect(parseRoots('{"roots":"x"}')).toEqual([]);
  });
});
