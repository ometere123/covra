import { describe, expect, it } from "vitest";
import { isPrivateNetworkAddress } from "../src/lib/evidence-source";

describe("evidence source network boundary", () => {
  it("blocks hexadecimal mapped IPv4, shared-address and transition bypasses", () => {
    for (const address of ["::ffff:c0a8:101", "::ffff:7f00:1", "100.64.0.1", "224.0.0.1", "2002:7f00:1::", "2001:db8::1"]) {
      expect(isPrivateNetworkAddress(address)).toBe(true);
    }
    expect(isPrivateNetworkAddress("2606:4700:4700::1111")).toBe(false);
  });
  it("does not classify ordinary DNS hostnames as private targets", () => {
    expect(isPrivateNetworkAddress("status.example.org")).toBe(false);
    expect(isPrivateNetworkAddress("8.8.8.8")).toBe(false);
  });

  it("rejects local, metadata and private IPv4 ranges", () => {
    for (const address of ["0.0.0.0", "10.1.2.3", "127.0.0.1", "169.254.169.254", "172.16.0.1", "192.168.1.1"]) {
      expect(isPrivateNetworkAddress(address)).toBe(true);
    }
  });

  it("rejects local IPv6 and IPv4-mapped private addresses", () => {
    expect(isPrivateNetworkAddress("::1")).toBe(true);
    expect(isPrivateNetworkAddress("fd00::1")).toBe(true);
    expect(isPrivateNetworkAddress("fe80::1")).toBe(true);
    expect(isPrivateNetworkAddress("::ffff:192.168.1.1")).toBe(true);
  });
});
