import { readFileSync } from "node:fs";
import { hashTypedData } from "viem";
import { expect, it } from "vitest";
import { v3DecisionTypes, v3SettlementDomain } from "../src/lib/v3-settlement";

it("matches the Solidity V3 EIP-712 field order and separates versions and pools", () => {
  const solidity = readFileSync("contracts/base/src/CovraPoolsV3.sol", "utf8");
  const fields = v3DecisionTypes.Decision.map(({ name, type }) => type + " " + name);
  expect(solidity).toContain('"Decision(' + fields.join(",") + ')"');
  const domain = v3SettlementDomain("0x1000000000000000000000000000000000000000");
  const digest = (value: typeof domain) =>
    hashTypedData({ domain: value, types: {}, primaryType: "EIP712Domain", message: {} });
  expect(digest(domain)).not.toBe(hashTypedData({
    domain: { ...domain, version: "1" }, types: {}, primaryType: "EIP712Domain", message: {},
  }));
  expect(digest(domain)).not.toBe(digest({ ...domain, verifyingContract: "0x2000000000000000000000000000000000000000" }));
});
