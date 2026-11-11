import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ wallet: null as string | null, database: true, values: [] as unknown[], eventValues: [] as unknown[], sql: undefined as any }));

vi.mock("../src/lib/auth", () => ({ walletSession: async () => h.wallet }));
vi.mock("../src/lib/db", () => ({ hasDatabase: () => h.database, database: () => h.sql }));
vi.mock("../src/lib/chain", () => ({ configuredPoolAddress: () => "0xd8619d3948c08c8364fd3a7a35dc8a65b254a8e4" }));
vi.mock("../src/lib/indexer-stream", () => ({ indexerStream: () => "base-84532:0xd8619d3948c08c8364fd3a7a35dc8a65b254a8e4" }));

import { GET } from "../src/app/api/activity/route";

const wallet = "0x1111111111111111111111111111111111111111";
const tx = `0x${"a".repeat(64)}`;

beforeEach(() => {
  h.wallet = wallet;
  h.database = true;
  h.values = [];
  h.eventValues = [];
  h.sql = async (parts: TemplateStringsArray, ...values: unknown[]) => {
    h.values = values;
    const text = parts.join("?");
    if (text.includes("from claim_chain_events")) {
      h.eventValues = values;
      return [{
      chain_id: 84532, tx_hash: tx, log_index: 0, event_type: "CapitalDeposited", block_number: 10,
      block_timestamp: "2026-11-11T12:00:00.000Z", created_at: "2026-11-11T12:00:01.000Z",
      payload: { coverageClass: "0", underwriter: wallet, usdcAmount: "1000000", shares: "1000000" },
      }];
    }
    return [{ last_block: "10", last_block_hash: `0x${"b".repeat(64)}`, updated_at: "2026-11-11T12:00:02.000Z" }];
  };
});

afterEach(() => { h.wallet = null; });

describe("authenticated capital activity route", () => {
  it("rejects unauthenticated access", async () => {
    h.wallet = null;
    expect((await GET(new NextRequest("https://covra.example/api/activity"))).status).toBe(401);
  });

  it("filters the indexed event query by the authenticated wallet and returns confirmed history", async () => {
    const response = await GET(new NextRequest("https://covra.example/api/activity"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items[0]).toMatchObject({ eventType: "CapitalDeposited", confirmation: "CONFIRMED", className: "Service failure" });
    expect(h.eventValues).toContain(wallet);
  });
});
