import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";
import { GET } from "../src/app/api/indexer/reconciliation/route";
import { matchesBearerSecret } from "../src/lib/bearer-secret";

const fixture = vi.hoisted(() => ({
  pool: `0x${"12".repeat(20)}`,
  sql: vi.fn(),
  readContract: vi.fn(),
}));
vi.mock("@/lib/chain", () => ({
  configuredPoolAddress: () => fixture.pool,
  baseClient: { getBlockNumber: async () => 100n, readContract: fixture.readContract },
  poolsAbi: [],
}));
vi.mock("@/lib/db", () => ({ database: () => fixture.sql }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

it("rejects unprefixed credentials and mismatched UTF-8 lengths without throwing", () => {
  expect(matchesBearerSecret("Bearer éx", "abc")).toBe(false);
  expect(matchesBearerSecret("abc", "abc")).toBe(false);
  expect(matchesBearerSecret("bEaReR abc", "abc")).toBe(true);
});

it("reports a wrong terminal verdict and serializes the mismatched lock at the confirmed block", async () => {
  vi.stubEnv("INDEXER_CRON_SECRET", "isolated-token");
  vi.stubEnv("DATABASE_URL", "fixture");
  const policyId = `0x${"ab".repeat(32)}`;
  const claimId = `0x${"bc".repeat(32)}`;
  const digest = `0x${"cd".repeat(32)}`;
  fixture.sql.mockResolvedValueOnce([{ policy_id: policyId, onchain_state: 4 }]).mockResolvedValueOnce([{
    id: "fixture-claim", policy_id: policyId, onchain_claim_id: claimId, status: "PAID", evidence_manifest_hash: digest,
    evidence_revision: 0, claim_resolution_extended_until: null,
  }]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  fixture.readContract.mockImplementation(async ({ functionName, blockNumber }) => {
    expect(blockNumber).toBe(88n);
    const values = { policies: [null, null, 0, 4], claimLockOf: [claimId, digest, 100n, 1, 2n], usedClaims: true,
      claimPolicyOf: policyId, claimResolutionDeadline: 200n };
    return values[functionName as keyof typeof values];
  });
  const response = await GET(new NextRequest("https://covra.example/api/indexer/reconciliation", { headers: { authorization: "Bearer isolated-token" } }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ mismatchCount: 2, mismatches: [
    { type: "CLAIM_LOCK", chainLock: { openedAt: "100", revision: 1, rosterVersion: "2" } },
    { type: "CLAIM_STATE", local: "PAID", chain: "DENIED", used: true },
  ] });
  expect(fixture.readContract).toHaveBeenCalledTimes(5);
});
