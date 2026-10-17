import type { Note, Spec, Task } from "@/lib/db/schema";

export const specRow = (over: Partial<Spec> = {}): Spec => ({
  id: "s1", projectId: "p1", number: "RFC-001", title: "Auth flow", status: "approved",
  purpose: "Authenticate users.",
  goals: ["No plaintext passwords", "SSO ready"],
  features: ["Login form"], constraints: ["No third-party auth"], dependencies: ["Postgres"],
  acceptance: ["A user can log in"], risks: ["Token theft"], futureImprovements: ["Passkeys"],
  technicalNotes: "JWT with rotating keys.", implementationProgress: 40,
  linkedNoteIds: [], linkedTaskIds: [], createdAt: 0, updatedAt: 0, ...over,
});

export const taskRow = (over: Partial<Task> = {}): Task => ({
  id: "t1", projectId: "p1", title: "Fix login", description: "Redirect loops on expiry.",
  status: "in_progress", priority: "high", specId: null, sprintId: null, parentTaskId: null,
  assignee: "human", dependencies: [], progress: 20, tags: ["auth"], createdAt: 0, updatedAt: 0, ...over,
});

export const noteRow = (over: Partial<Note> = {}): Note => ({
  id: "n1", projectId: "p1", type: "idea", title: "Auth design", body: "JWT everywhere",
  excerpt: "", tags: ["auth"], folderId: null, createdAt: 0, updatedAt: 0, ...over,
});
