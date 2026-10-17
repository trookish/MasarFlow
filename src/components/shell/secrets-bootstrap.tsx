"use client";

import { useEffect } from "react";
import { migrateAiConnectionSecrets } from "@/lib/db/repos/chat-secrets";
import { bindSecretField } from "@/lib/secrets-binding";
import { useGithub } from "@/lib/stores/github";
import { useObsidianStore } from "@/lib/stores/obsidian";

/** Mount once: moves v0.1 plaintext credentials into the OS keychain and keeps them there. */
export function SecretsBootstrap() {
  useEffect(() => {
    let cancelled = false;
    const offs: Array<() => void> = [];
    void (async () => {
      await migrateAiConnectionSecrets();
      const gh = await bindSecretField(useGithub, "pat", "github:pat");
      const ob = await bindSecretField(useObsidianStore, "apiKey", "obsidian:api-key");
      if (cancelled) {
        gh();
        ob();
      } else offs.push(gh, ob);
    })();
    return () => {
      cancelled = true;
      offs.forEach((f) => f());
    };
  }, []);
  return null;
}
