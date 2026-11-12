/**
 * Browser-only Bradbury GenLayer client.
 *
 * The public Conduit EVM RPC is NOT a GenLayer node RPC. Fail closed without
 * an explicitly configured, non-secret gen_* endpoint. Never embed an API key
 * or a privileged node URL in NEXT_PUBLIC_ variables.
 */
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import type { EIP1193Provider } from "viem";
import { assertExactBradburyReceipt } from "./bradbury-receipt";
import { BRADBURY_PHASE_2_GENESIS, readFinalizedBradburyView } from "./bradbury-final-state";

type BradburySubmission = { txHash: string; feeDeposit: string };

export function publicBradburyEndpoint(): string | null {
  const configured = process.env.NEXT_PUBLIC_BRADBURY_NODE_RPC_URL;
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.username || url.password || url.search) return null;
    if (url.hostname === "rpc.testnet-chain.genlayer.com") return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function writeBradburyAction(
  provider: EIP1193Provider, wallet: `0x${string}`, adjudicator: `0x${string}`,
  functionName: string, args: (string|number|boolean)[],
  onSubmitted?: (submission: BradburySubmission) => void,
) {
  const endpoint = publicBradburyEndpoint();
  if (!endpoint) throw new Error("A public Bradbury Phase 2 GenLayer node RPC is not configured.");
  const client = createClient({
    chain: testnetBradbury, endpoint, provider, account: wallet,
  });
  // This switch is an explicit user-wallet action; it does not alter Base.
  await client.connect("testnetBradbury");
  const current = await provider.request({ method: "eth_chainId" });
  if (Number(BigInt(String(current))) !== 4221) throw new Error("Wallet did not switch to Bradbury 4221.");
  const genesis = await provider.request({ method: "eth_getBlockByNumber", params: ["0x0", false] });
  if (genesis?.hash?.toLowerCase() !== BRADBURY_PHASE_2_GENESIS) {
    throw new Error("The wallet RPC genesis does not match Bradbury Phase 2.");
  }

  // Phase 2 fees must accompany every write. Missing price data must fail.
  const estimate = await client.estimateTransactionFeesForWrite({
    address: adjudicator, functionName, args,
  });
  if (estimate.feeValue <= 0n) throw new Error("Bradbury returned a zero fee allocation; verify node compatibility.");
  const txHash = await client.writeContract({
    address: adjudicator, functionName, args,
    fees: {
      distribution: estimate.distribution,
      feeValue: estimate.feeValue,
      ...(estimate.messageAllocations ? { messageAllocations: estimate.messageAllocations } : {}),
    },
  });
  const submission = { txHash: String(txHash), feeDeposit: estimate.feeValue.toString() };
  try {
    onSubmitted?.(submission);
    const receipt = await client.waitForFinalization({ hash: txHash, fullTransaction: true });
    assertExactBradburyReceipt({
      receipt, transactionHash: submission.txHash, recipient: adjudicator, functionName, args,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Receipt unavailable";
    throw new Error(`Bradbury transaction ${submission.txHash} was submitted. Verify its receipt before trying again. ${reason}`, { cause: error });
  }
  return submission;
}

export function writeBradburyCase(
  provider: EIP1193Provider, wallet: `0x${string}`, adjudicator: `0x${string}`,
  args: (string|number|boolean)[],
  onSubmitted?: (submission: BradburySubmission) => void,
) {
  return writeBradburyAction(provider,wallet,adjudicator,"submit_case",args,onSubmitted);
}

export async function readBradburyCase(adjudicator: `0x${string}`, caseId: string) {
  const endpoint=publicBradburyEndpoint();
  if (!endpoint) throw new Error("Public Bradbury GenLayer node RPC required");
  const raw=await readFinalizedBradburyView(endpoint,adjudicator,"get_case",[caseId]);
  if (typeof raw!=="string"||!raw) throw new Error("Bradbury case does not exist");
  return JSON.parse(raw) as {
    id:string;state:string;verdict:string;revision:number;reason:string;citations:string;finalized_at:number;
    insured_wallet:string;risk_spec_hash:string;claim_id:string;evidence_hash:string;
    decided_at:number;appeal_used:boolean;risk_spec:{evidenceIssuerHost:string};
  };
}

export function configuredAdjudicator(): `0x${string}` | null {
  const value = process.env.NEXT_PUBLIC_BRADBURY_ADJUDICATOR_ADDRESS;
  return value && /^0x[a-fA-F0-9]{40}$/.test(value) ? value as `0x${string}` : null;
}
