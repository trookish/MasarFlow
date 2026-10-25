import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** IPv4 ranges that must never be reached from a server-side fetch: [base, prefix bits]. */
const V4_BLOCK: Array<[number, number]> = [
  [0x00000000, 8], // 0.0.0.0/8 "this network"
  [0x0a000000, 8], // 10.0.0.0/8 private
  [0x64400000, 10], // 100.64.0.0/10 carrier-grade NAT
  [0x7f000000, 8], // 127.0.0.0/8 loopback
  [0xa9fe0000, 16], // 169.254.0.0/16 link-local (cloud metadata)
  [0xac100000, 12], // 172.16.0.0/12 private
  [0xc0000000, 24], // 192.0.0.0/24 IETF protocol assignments
  [0xc0a80000, 16], // 192.168.0.0/16 private
  [0xc6120000, 15], // 198.18.0.0/15 benchmarking
  [0xe0000000, 4], // 224.0.0.0/4 multicast
  [0xf0000000, 4], // 240.0.0.0/4 reserved + broadcast
];

const v4ToInt = (ip: string) => ip.split(".").reduce((n, o) => n * 256 + Number(o), 0) >>> 0;

/** True only for a globally routable unicast address. Anything unparseable is not public. */
export function isPublicAddress(ip: string): boolean {
  const fam = isIP(ip);
  if (fam === 4) {
    const n = v4ToInt(ip);
    return !V4_BLOCK.some(([base, bits]) => n >>> (32 - bits) === base >>> (32 - bits));
  }
  if (fam === 6) {
    const v = ip.toLowerCase();
    const mapped = /^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v) ?? /^::(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPublicAddress(mapped[1]);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(v)) return false; // mapped, hex form: refuse
    return !(
      v === "::" ||
      v === "::1" ||
      /^f[cd]/.test(v) || // fc00::/7 unique local
      /^fe[89ab]/.test(v) || // fe80::/10 link-local
      v.startsWith("ff") || // multicast
      v.startsWith("64:ff9b:") || // NAT64 can reach IPv4 private space
      v.startsWith("2001:db8") // documentation
    );
  }
  return false;
}

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

export type HostResolver = (host: string) => Promise<Array<{ address: string; family?: number }>>;

const defaultResolver: HostResolver = (host) => lookup(host, { all: true, verbatim: true });

/**
 * Resolve `url` and require every address to be public. Returns the address the connection must be
 * pinned to, so DNS cannot change between this check and the connect (rebinding).
 */
export async function assertPublicUrl(url: URL, resolve: HostResolver = defaultResolver): Promise<string> {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new BlockedUrlError("Blocked: scheme");
  if (url.username || url.password) throw new BlockedUrlError("Blocked: credentials in URL");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host.toLowerCase() === "localhost" || host.toLowerCase().endsWith(".localhost")) {
    throw new BlockedUrlError("Blocked: private address");
  }
  const addrs = isIP(host) ? [{ address: host }] : await resolve(host);
  if (!addrs.length || !addrs.every((a) => isPublicAddress(a.address))) {
    throw new BlockedUrlError("Blocked: private address");
  }
  return addrs[0].address;
}
