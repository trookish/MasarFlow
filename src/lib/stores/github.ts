"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface GithubState {
  pat: string;
  repoOwner: string;
  repoName: string;
  setPat: (pat: string) => void;
  setRepoOwner: (owner: string) => void;
  setRepoName: (name: string) => void;
}

export const useGithub = create<GithubState>()(
  persist(
    (set) => ({
      pat: "",
      repoOwner: "",
      repoName: "",
      setPat: (pat) => set({ pat }),
      setRepoOwner: (repoOwner) => set({ repoOwner }),
      setRepoName: (repoName) => set({ repoName }),
    }),
    { name: "masarflow.github" }
  )
);
