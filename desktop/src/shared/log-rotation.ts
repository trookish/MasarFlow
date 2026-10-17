/** Pure rules for log rotation; the IO lives in desktop/src/main/logging.ts (T7). */
export const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB
export const KEEP_ROTATED_DAYS = 7;

export function isRotatable(sizeBytes: number): boolean {
  return sizeBytes > MAX_LOG_BYTES;
}

export function isPrunable(ageMs: number): boolean {
  return ageMs > KEEP_ROTATED_DAYS * 24 * 60 * 60 * 1000;
}

/** `server.log.2` yes, `server.log` no, `latest.yml` no. */
export function isRotatedFileName(name: string): boolean {
  return /\.log\.\d+$/.test(name);
}
