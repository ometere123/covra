import { isIP } from "node:net";

/** Reject loopback, link-local, metadata, private and otherwise local targets. */
export function isPrivateNetworkAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  const family = isIP(normalized);
  if (family === 0) return false;
  if (family === 4) {
    const octets = normalized.split(".").map(Number);
    const [a, b] = octets;
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0);
  }
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice(7);
    if (isIP(mapped) === 4) return isPrivateNetworkAddress(mapped);
    const parts = mapped.split(":");
    if (parts.length !== 2) return true;
    const value = Number.parseInt(parts[0], 16) * 65536 + Number.parseInt(parts[1], 16);
    return isPrivateNetworkAddress([value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join("."));
  }
  // Accept globally routed IPv6 only; exclude documentation and transition
  // ranges which can hide an IPv4 destination from this boundary.
  const first = Number.parseInt(normalized.split(":")[0], 16);
  return !Number.isFinite(first) || first < 0x2000 || first > 0x3fff || normalized.startsWith("2001:db8:") ||
    normalized.startsWith("2001:0:") || normalized.startsWith("2002:");
}
