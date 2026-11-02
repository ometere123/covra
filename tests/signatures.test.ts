import { describe, expect, it } from "vitest";
import { recoverTypedDataAddress, hashTypedData, hexToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { quoteTypes, quoteToAbi, BASE_CHAIN_ID, BRADBURY_CHAIN_ID, BASE_USDC } from "../src/lib/chain";
import { canonicalTermsHash } from "../src/lib/terms";

const account = privateKeyToAccount(("0x" + "11".repeat(32)) as `0x${string}`);
const verifyingContract = "0x3333333333333333333333333333333333333333" as const;
const quote = {
  policyId: ("0x" + "a".repeat(64)) as `0x${string}`,
  insured: "0x1111111111111111111111111111111111111111" as const,
  beneficiary: "0x2222222222222222222222222222222222222222" as const,
  coverageClass: 2, premium: 10000000n, limit: 1000000000n,
  startsAt: 2000000000n, endsAt: 2000200000n, claimDeadline: 2000300000n,
  termsHash: canonicalTermsHash(2), nonce: 99n, quoteDeadline: 1999999990n,
  riskSpecHash: ("0x"+"f".repeat(64)) as `0x${string}`,
};
const domain = { name: "COVRA", version: "1", chainId: BASE_CHAIN_ID, verifyingContract } as const;
describe("EIP-712 authority and identity boundaries", () => {
  it("uses explicit Bradbury/Base separation", () => {
    expect(BRADBURY_CHAIN_ID).toBe(4221);
    expect(BASE_CHAIN_ID).toBe(84532);
    expect(BASE_USDC).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
  });
  it("signs a quote recoverable under the original typed payload", async () => {
    const signature = await account.signTypedData({ domain, types: quoteTypes, primaryType: "Quote", message: quote });
    const recovered = await recoverTypedDataAddress({ domain, types: quoteTypes, primaryType: "Quote", message: quote, signature });
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
    expect(hexToBytes(signature).length).toBe(65);
  });
  it("changes digest when chain, beneficiary or nonce is altered", () => {
    const digest = hashTypedData({ domain, types: quoteTypes, primaryType: "Quote", message: quote });
    expect(hashTypedData({ domain: { ...domain, chainId: 4221 }, types: quoteTypes, primaryType: "Quote", message: quote })).not.toBe(digest);
    expect(hashTypedData({ domain, types: quoteTypes, primaryType: "Quote", message: { ...quote, beneficiary: account.address } })).not.toBe(digest);
    expect(hashTypedData({ domain, types: quoteTypes, primaryType: "Quote", message: { ...quote, nonce: 100n } })).not.toBe(digest);
    expect(hashTypedData({ domain, types: quoteTypes, primaryType: "Quote", message: { ...quote, riskSpecHash:("0x"+"a".repeat(64)) as `0x${string}` } })).not.toBe(digest);
  });
  it("parses signed ABI quote units into exact bigint amounts", () => {
    const encoded = quoteToAbi({
      ...Object.fromEntries(Object.entries(quote).map(([key, value]) => [key, typeof value === "bigint" ? value.toString() : value])),
    } as Parameters<typeof quoteToAbi>[0]);
    expect(encoded.premium).toBe(10000000n);
    expect(encoded.limit).toBe(1000000000n);
    expect(encoded.nonce).toBe(99n);
  });
});
