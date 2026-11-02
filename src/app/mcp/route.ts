import { NextRequest } from "next/server";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { coverages } from "@/lib/catalog";
import { calculateTestnetQuote } from "@/lib/quote";
import { canonicalTermsHash } from "@/lib/terms";
import { baseClient, configuredPoolAddress, poolsAbi } from "@/lib/chain";
import { authenticateAgent } from "@/lib/agent-auth";
import { database } from "@/lib/db";
import { quoteRequestSchema,claimInputSchema } from "@/lib/quote";
import { POST as issueQuote } from "@/app/api/quotes/route";
import { POST as createClaim } from "@/app/api/claims/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const asText = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, (_k, v) => typeof v === "bigint" ? v.toString() : v) }],
});
const forbidden = () => ({
  isError: true,
  content: [{ type: "text" as const, text: "Valid scoped COVRA agent API key required. Create a key in /app/agents." }],
});

function makeHandler(request: NextRequest) {
  return createMcpHandler(() => {
    const server = new McpServer({ name: "COVRA", version: "1.0.0" });
    server.registerTool("list_coverages", {
      description: "Read all five testnet agent-risk classes, their exclusions, coverage terms and evidence requirements.",
      inputSchema: z.object({}),
    }, async () => asText({ environment: "TESTNET_ONLY", networks: { genlayer: 4221, base: 84532 }, classes: coverages.map((risk) => ({
      classId: risk.id, slug: risk.slug, name: risk.name, description: risk.description,
      exclusions: risk.exclusions, evidence: risk.evidence, maxDurationDays: risk.maxDurationDays,
      termsHash: canonicalTermsHash(risk.id),
    })) }));
    server.registerTool("preview_quote", {
      description: "Deterministic, non-binding Base Sepolia testnet pricing configuration. Does not issue coverage or transfer funds.",
      inputSchema: z.object({
        classId: z.number().int().min(0).max(4),
        coverageUsd: z.number().min(100).max(250000),
        durationDays: z.number().int().min(1).max(365),
      }),
    }, async ({ classId, coverageUsd, durationDays }) => {
      try {
        const quote = calculateTestnetQuote({
          coverageClass: classId, coverageUsd, durationDays,
        });
        return asText({ executable: false, network: "Base Sepolia",
          ...quote, termsHash: canonicalTermsHash(classId) });
      } catch (error) {
        return { isError: true, content: [{ type: "text" as const, text: String(error) }] };
      }
    });
    server.registerTool("read_pool_capacity", {
      description: "Read the configured Base Sepolia USDC pool or return its unconfigured state.",
      inputSchema: z.object({ classId: z.number().int().min(0).max(4) }),
    }, async ({ classId }) => {
      const address = configuredPoolAddress();
      if (!address) return asText({ classId, state: "AWAITING_DEPLOYMENT", live: false, reason: "Base Sepolia pool contract is not configured." });
      try {
        const [pool, available] = await Promise.all([
          baseClient.readContract({ address, abi: poolsAbi, functionName: "pool", args: [classId] }),
          baseClient.readContract({ address, abi: poolsAbi, functionName: "availableCapital", args: [classId] }),
        ]);
        return asText({ classId, state: "CONFIRMED", live: true, network: "Base Sepolia", pool, availableMicroUsdc: available });
      } catch (error) {
        return { isError: true, content: [{ type: "text" as const, text: "Unable to read pool: " + String(error) }] };
      }
    });
    server.registerTool("my_policies", {
      description: "Read API-key owner's indexed policies; policy:read scope required.",
      inputSchema: z.object({}),
    }, async () => {
      const agent = await authenticateAgent(request, "policy:read");
      if (!agent) return forbidden();
      const sql = database();
      const rows = await sql`select * from policies where lower(owner_wallet)=${agent.ownerWallet.toLowerCase()}
        order by created_at desc limit 100`;
      return asText({ owner: agent.ownerWallet, items: rows });
    });
    server.registerTool("my_claims", {
      description: "Read API-key owner's claims; claim:read scope required.",
      inputSchema: z.object({}),
    }, async () => {
      const agent = await authenticateAgent(request, "claim:read");
      if (!agent) return forbidden();
      const sql = database();
      const rows = await sql`select * from claims where lower(claimant_wallet)=${agent.ownerWallet.toLowerCase()}
        order by created_at desc limit 100`;
      return asText({ owner: agent.ownerWallet, items: rows });
    });
    server.registerTool("inspect_claim_lifecycle", {
      description: "Read one owner-bound claim and its immutable Base/Bradbury receipt history; claim:read scope required. This tool never signs or submits a transaction.",
      inputSchema: z.object({ claimId: z.string().uuid() }),
    }, async ({ claimId }) => {
      const agent = await authenticateAgent(request, "claim:read");
      if (!agent) return forbidden();
      const sql = database();
      const claims = await sql`select * from claims where id=${claimId} and lower(claimant_wallet)=${agent.ownerWallet.toLowerCase()} limit 1`;
      if (!claims.length) return { isError: true, content: [{ type: "text" as const, text: "Claim not found for this owner" }] };
      const events = await sql`select chain_id,tx_hash,log_index,event_type,block_number,block_hash,payload,created_at
        from claim_chain_events where claim_id=${claimId} order by created_at asc`;
      return asText({ claim: claims[0], events, sourceOfTruth: "Base receipts and finalized Bradbury provenance must be independently verified; Supabase is a read model" });
    });
    server.registerTool("read_policy_chain_state", {
      description: "Read the confirmed Base Sepolia policy and claim-lock state for an owned policy; policy:read scope required.",
      inputSchema: z.object({ policyId: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }),
    }, async ({ policyId }) => {
      const agent = await authenticateAgent(request, "policy:read");
      if (!agent) return forbidden();
      const sql = database();
      const local = await sql`select policy_id from policies where lower(policy_id)=${policyId.toLowerCase()} and lower(owner_wallet)=${agent.ownerWallet.toLowerCase()} limit 1`;
      if (!local.length) return { isError: true, content: [{ type: "text" as const, text: "Policy not found for this owner" }] };
      const pool = configuredPoolAddress();
      if (!pool) return asText({ policyId, live: false, reason: "Base pool contract is not configured" });
      const [policy, lock] = await Promise.all([
        baseClient.readContract({ address: pool, abi: poolsAbi, functionName: "policies", args: [policyId as `0x${string}`] }),
        baseClient.readContract({ address: pool, abi: poolsAbi, functionName: "claimLockOf", args: [policyId as `0x${string}`] }),
      ]);
      return asText({ policyId, live: true, network: "Base Sepolia", policy, claimLock: lock, sourceOfTruth: "on-chain" });
    });
    server.registerTool("issue_policy_quote", {
      description: "Obtain a server-signed, precisely scoped testnet quote on behalf of the approved owner. Requires quote:issue. Purchase still requires onchain owner/agent wallet approval, USDC and an authorized spending limit.",
      inputSchema:quoteRequestSchema,
    }, async (quote) => {
      // The API route alone validates and counts the scoped key once.
      const forwarded=new NextRequest(request.url,{method:"POST",headers:{
        "Content-Type":"application/json",authorization:request.headers.get("authorization")||"",
      },body:JSON.stringify(quote)});
      const result=await issueQuote(forwarded);
      const body=await result.json();
      return result.ok?asText(body):{isError:true,content:[{type:"text" as const,text:JSON.stringify(body)}]};
    });
    server.registerTool("create_claim_intake", {
      description: "Register one owner-bound testnet claim; requires claim:issue. No payout, Base lock or GenLayer judgment occurs from this tool alone.",
      inputSchema:claimInputSchema.extend({idempotencyKey:z.string().min(12).max(100)}),
    },async ({idempotencyKey,...claim})=>{
      // The API route alone validates and counts the scoped key once.
      const forwarded=new NextRequest(request.url,{method:"POST",headers:{
        "Content-Type":"application/json",authorization:request.headers.get("authorization")||"",
        "Idempotency-Key":idempotencyKey,
      },body:JSON.stringify(claim)});
      const result=await createClaim(forwarded);
      const body=await result.json();
      return result.ok?asText(body):{isError:true,content:[{type:"text" as const,text:JSON.stringify(body)}]};
    });
    return server;
  });
}

async function handle(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== request.nextUrl.host)
        return new Response("Cross-origin MCP access denied", { status: 403 });
    } catch { return new Response("Invalid origin", { status: 403 }); }
  }
  if (Number(request.headers.get("content-length") || "0") > 100_000)
    return new Response("MCP request is too large", { status: 413 });
  return makeHandler(request).fetch(request);
}
export const POST = handle;
export const GET = handle;
export const DELETE = handle;
