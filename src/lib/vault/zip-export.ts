"use client";
import { zip, unzip, strToU8, strFromU8 } from "fflate";

export interface ZipEntry {
  path: string;
  content: string;
  mtime: number;
}

export async function exportVaultZip(files: ZipEntry[]): Promise<Blob> {
  const entries: Record<string, [Uint8Array, { mtime: Date }]> = {};
  for (const f of files) {
    entries[f.path] = [strToU8(f.content), { mtime: new Date(f.mtime) }];
  }
  const data = await new Promise<Uint8Array>((resolve, reject) => {
    zip(entries, { level: 0 }, (err, buf) => {
      if (err) reject(err);
      else resolve(buf);
    });
  });
  return new Blob([data.buffer as ArrayBuffer], { type: "application/zip" });
}

export async function importVaultZip(blob: Blob): Promise<ZipEntry[]> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  const entries: Record<string, Uint8Array> = await new Promise((resolve, reject) => {
    unzip(buf, (err, data) => {
      if (err) reject(err);
      else resolve(data as Record<string, Uint8Array>);
    });
  });
  const out: ZipEntry[] = [];
  for (const [path, content] of Object.entries(entries)) {
    if (path.endsWith("/") || !/\.(md|markdown)$/i.test(path)) continue;
    const c = content instanceof Uint8Array ? content : new Uint8Array(content);
    out.push({ path, content: strFromU8(c), mtime: Date.now() });
  }
  return out;
}

export function downloadZip(blob: Blob, name: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    if (a.parentNode) a.parentNode.removeChild(a);
  }, 100);
}
