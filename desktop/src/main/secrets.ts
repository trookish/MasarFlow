import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface SecretCodec {
  available(): boolean;
  encrypt(plain: string): string;
  decrypt(cipher: string): string;
}

export function isValidSecretKey(key: string): boolean {
  return /^[A-Za-z0-9:_-]{1,80}$/.test(key);
}

/** Adapts Electron's safeStorage (DPAPI / Keychain / libsecret) to SecretCodec. */
export function createSafeStorageCodec(ss: {
  isEncryptionAvailable(): boolean;
  encryptString(s: string): Buffer;
  decryptString(b: Buffer): string;
}): SecretCodec {
  return {
    available: () => ss.isEncryptionAvailable(),
    encrypt: (s) => ss.encryptString(s).toString("base64"),
    decrypt: (c) => ss.decryptString(Buffer.from(c, "base64")),
  };
}

export class SecretStore {
  constructor(
    private readonly file: string,
    private readonly codec: SecretCodec,
  ) {}

  available(): boolean {
    return this.codec.available();
  }

  private read(): Record<string, string> {
    try {
      const data = JSON.parse(readFileSync(this.file, "utf8")) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(data).filter(([, v]) => typeof v === "string")) as Record<string, string>;
    } catch {
      return {};
    }
  }

  private write(map: Record<string, string>): void {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(map), "utf8");
    renameSync(tmp, this.file);
  }

  get(key: string): string {
    const cipher = this.read()[key];
    if (!cipher) return "";
    try {
      return this.codec.decrypt(cipher);
    } catch {
      return "";
    }
  }

  /** Presence only. Main process answers; the value never crosses IPC (P10 B5). */
  has(key: string): boolean {
    return this.get(key) !== "";
  }

  set(key: string, value: string): void {
    if (!this.codec.available()) throw new Error("Secret storage is unavailable on this system");
    const map = this.read();
    map[key] = this.codec.encrypt(value);
    this.write(map);
  }

  delete(key: string): void {
    const map = this.read();
    if (key in map) {
      delete map[key];
      this.write(map);
    }
  }
}
