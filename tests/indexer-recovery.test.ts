import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters } from "viem";
import { poolsAbi } from "../src/lib/chain";
import { claimIdFromUuid } from "../src/lib/claim-protocol";

const h = vi.hoisted(() => ({ sql: undefined as any, log: undefined as any, leaseLost: false,
  failProjection: false, candidates: [] as any[], state: { event: false, projected: false, cursor: null as string | null, linkedClaim: null as string | null } }));
vi.mock("../src/lib/db", () => ({ database: () => h.sql }));
vi.mock("../src/lib/chain", async importOriginal => {
  const actual = await importOriginal<typeof import("../src/lib/chain")>();
  return { ...actual, configuredPoolAddress: () => "0xd8619d3948c08c8364fd3a7a35dc8a65b254a8e4",
    baseClient: { getBlockNumber: async () => 112n, getBlock: async () => ({ hash: "0x" + "b".repeat(64) }), getLogs: async () => [h.log] } };
});
import { POST } from "../src/app/api/indexer/sync/route";
const hash = (digit: string) => ("0x" + digit.repeat(64)) as `0x${string}`;
const wallet = "0x1111111111111111111111111111111111111111";
function request(body = {}) {
  return new NextRequest("https://covra.example/api/indexer/sync", { method: "POST",
    headers: { authorization: "Bearer test-only-cron", "content-type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.stubEnv("INDEXER_CRON_SECRET", "test-only-cron"); vi.stubEnv("DATABASE_URL", "postgres://unused-test-host");
  vi.stubEnv("BASE_DEPLOYMENT_START_BLOCK", "100");
  h.leaseLost = false; h.failProjection = false; h.candidates = [];
  h.state = { event: false, projected: false, cursor: null, linkedClaim: null };
  const query: any = async (parts: TemplateStringsArray, ...values: any[]) => {
    const text = parts.join(" ? ").replace(/\s+/g, " ").trim();
    if (text.startsWith("insert into indexer_leases")) return [{ stream: "test" }];
    if (text.startsWith("update indexer_leases") && text.includes("returning stream")) return h.leaseLost ? [] : [{ stream: "test" }];
    if (text.startsWith("insert into indexer_runs")) return [{ id: "run-test" }];
    if (text.startsWith("select last_block")) return h.state.cursor ? [{ last_block: h.state.cursor, last_block_hash: hash("b") }] : [];
    if (text.startsWith("select id,claimant_wallet")) return h.candidates;
    if (text.startsWith("select id from claims")) return [];
    if (text.startsWith("insert into claim_chain_events")) {
      if (h.state.event) return [];
      h.state.event = true; h.state.linkedClaim = values[2]; return [{ tx_hash: hash("a") }];
    }
    if (text.startsWith("insert into policies")) {
      if (h.failProjection) { h.failProjection = false; throw new Error("Injected projection failure"); }
      h.state.projected = true;
    }
    if (text.startsWith("insert into indexer_cursors")) h.state.cursor = values[1];
    return [];
  };
  query.json = (value: unknown) => value;
  query.begin = async (fn: (sql: any) => Promise<void>) => {
    const before = { ...h.state };
    try { await fn(query); } catch (error) { h.state = before; throw error; }
  };
  h.sql = query;
  h.log = { transactionHash: hash("a"), blockNumber: 100n, logIndex: 0, blockHash: hash("b"),
    topics: encodeEventTopics({ abi: poolsAbi, eventName: "PolicyPurchased", args: { policyId: hash("1"), insured: wallet, beneficiary: wallet } }),
    data: encodeAbiParameters(parseAbiParameters("uint8,uint96,uint96,uint64,uint64,uint64,bytes32,bytes32"), [0, 1n, 100n, 1000n, 2000n, 3000n, hash("2"), hash("3")]) };
});
afterEach(() => vi.unstubAllEnvs());

it("rolls back deduplication on projection failure and recovers the same event on retry", async () => {
  h.failProjection = true;
  expect((await POST(request())).status).toBe(503);
  expect(h.state).toMatchObject({ event: false, projected: false, cursor: null });
  expect((await POST(request())).status).toBe(200);
  expect(h.state).toMatchObject({ event: true, projected: true, cursor: "100" });
  const replay = await POST(request({ fromBlock: "100" }));
  expect((await replay.json()).indexed).toBe(0);
  expect(h.state.projected).toBe(true);
});

it("refuses an expired worker before writing events or advancing its cursor", async () => {
  h.leaseLost = true;
  expect((await POST(request())).status).toBe(409);
  expect(h.state).toMatchObject({ event: false, projected: false, cursor: null });
});

it.each([false, true])("links claim events only by the exact owner-bound digest (matching=%s)", async matches => {
  const id = "8cfa78d0-7001-4322-899b-2d53993ee5a2";
  h.candidates = [{ id, claimant_wallet: wallet }];
  const claimId = matches ? claimIdFromUuid(id, wallet) : hash("f");
  h.log.topics = encodeEventTopics({ abi: poolsAbi, eventName: "ClaimLocked", args: { policyId: hash("1"), claimId } });
  h.log.data = encodeAbiParameters(parseAbiParameters("bytes32,uint64"), [hash("4"), 1000n]);
  expect((await POST(request())).status).toBe(200);
  expect(h.state.linkedClaim).toBe(matches ? id : null);
});
