import { describe, it, expect } from "vitest";
import { parseGithubRemote } from "@/lib/github/remote";

describe("parseGithubRemote", () => {
  it("reads https, ssh and git@ forms of a GitHub remote", () => {
    expect(parseGithubRemote("https://github.com/trookish/MasarFlow.git")).toEqual({
      owner: "trookish", repo: "MasarFlow", htmlUrl: "https://github.com/trookish/MasarFlow",
    });
    expect(parseGithubRemote("https://github.com/trookish/MasarFlow")).toEqual({
      owner: "trookish", repo: "MasarFlow", htmlUrl: "https://github.com/trookish/MasarFlow",
    });
    expect(parseGithubRemote("git@github.com:trookish/MasarFlow.git")).toEqual({
      owner: "trookish", repo: "MasarFlow", htmlUrl: "https://github.com/trookish/MasarFlow",
    });
    expect(parseGithubRemote("ssh://git@github.com/trookish/MasarFlow.git")?.repo).toBe("MasarFlow");
  });
  it("returns null for other hosts and junk", () => {
    for (const bad of ["https://gitlab.com/o/r.git", "git@bitbucket.org:o/r.git", "", "not a url"]) {
      expect(parseGithubRemote(bad), bad).toBeNull();
    }
  });
});
