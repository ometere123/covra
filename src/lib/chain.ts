import { createPublicClient, defineChain, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";

export const BASE_CHAIN_ID = 84532;
export const BRADBURY_CHAIN_ID = 4221;
export const BASE_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
export const bradbury = defineChain({
  id: 4221,
  name: "GenLayer Bradbury Phase 2",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet-chain.genlayer.com"] } },
  blockExplorers: { default: { name: "GenLayer", url: "https://scan.testnet-chain.genlayer.com" } },
  testnet: true,
});

export const baseClient = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.BASE_RPC_URL || "https://sepolia.base.org", { retryCount: 2 }),
});

export const usdcAbi = parseAbi([
  "function approve(address spender,uint256 value) returns (bool)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

export const poolsAbi = parseAbi([
  "event CapitalDeposited(uint8 indexed coverageClass,address indexed underwriter,uint256 usdcAmount,uint256 shares)",
  "event CapitalWithdrawn(uint8 indexed coverageClass,address indexed underwriter,uint256 usdcAmount,uint256 shares)",
  "event PoolRecapitalized(uint8 indexed coverageClass,uint64 newEpoch,uint256 writtenOffShares)",
  "event AgentAuthorized(address indexed owner,address indexed agent,uint96 maximumPremium,uint64 expiresAt)",
  "event AgentRevoked(address indexed owner,address indexed agent)",
  "event ClaimAgentAuthorized(address indexed owner,address indexed agent,uint64 expiresAt)",
  "event PolicyPurchased(bytes32 indexed policyId,address indexed insured,address indexed beneficiary,uint8 coverageClass,uint96 premium,uint96 limit,uint64 startsAt,uint64 endsAt,uint64 claimDeadline,bytes32 termsHash,bytes32 riskSpecHash)",
  "event PolicyExpired(bytes32 indexed policyId,uint96 releasedReserve)",
  "event ClaimLocked(bytes32 indexed policyId,bytes32 indexed claimId,bytes32 evidenceDigest,uint64 openedAt)",
  "event ClaimEvidenceRevised(bytes32 indexed policyId,bytes32 indexed claimId,bytes32 evidenceDigest,uint8 revision)",
  "event ClaimResolutionExtended(bytes32 indexed policyId,bytes32 indexed claimId,uint64 previousDeadline,uint64 newDeadline)",
  "event ClaimDenied(bytes32 indexed policyId,bytes32 indexed claimId,bytes32 indexed bradburyDecisionId,bytes32 resultDigest)",
  "event ClaimSettled(bytes32 indexed policyId,bytes32 indexed claimId,bytes32 indexed bradburyDecisionId,address beneficiary,uint96 amount,bytes32 genlayerTxId)",
  "event QuoteSignerChanged(address indexed previous,address indexed current)",
  "event PausedStateChanged(bool isPaused)",
  "event AttestorChangeScheduled(address indexed signer,bool enabled,uint256 effectiveAt)",
  "event AttestorChanged(address indexed signer,bool enabled)",
  "event AttestorReplacementScheduled(address indexed previousSigner,address indexed replacementSigner,uint256 effectiveAt)",
  "event AttestorRosterVersionChanged(uint256 indexed version,address indexed removedSigner,address indexed addedSigner)",
  "event OwnershipTransferStarted(address indexed previousOwner,address indexed pendingOwner)",
  "event OwnershipTransferred(address indexed previousOwner,address indexed newOwner)",
  "function deposit(uint8 classId,uint128 amount)",
  "function withdraw(uint8 classId,uint256 shares)",
  "function availableCapital(uint8 classId) view returns (uint256)",
  "function pool(uint8 classId) view returns ((uint128 assets,uint128 reserved,uint128 premiumsWritten,uint128 paid,uint256 totalShares))",
  "function sharesOf(uint8,address) view returns (uint256)",
  "function quoteSigner() view returns (address)",
  "function evidenceIssuer() view returns (address)",
  "function authorizeAgent(address agent,uint96 maxPremium,uint64 expiresAt)",
  "function revokeAgent(address agent)",
  "function authorizeClaimAgent(address agent,uint64 expiresAt)",
  "function claimAgents(address owner,address agent) view returns (uint64)",
  "function openClaim(bytes32 policyId,bytes32 claimId,bytes32 evidenceDigest)",
  "function reviseClaimEvidence(bytes32 policyId,bytes32 replacementDigest)",
  "function claimLockOf(bytes32 policyId) view returns (bytes32 claimId,bytes32 evidenceDigest,uint64 openedAt,uint8 revision,uint256 attestorRosterVersion)",
  "function claimPolicyOf(bytes32 claimId) view returns (bytes32 policyId)",
  "function usedClaims(bytes32 claimId) view returns (bool)",
  "function attestorForClaim(bytes32 claimId,address signer) view returns (bool)",
  "function claimResolutionDeadline(bytes32 policyId) view returns (uint256)",
  "function extendClaimResolution(bytes32 policyId,uint64 newDeadline,bytes[] signatures)",
  "function policies(bytes32 policyId) view returns (address insured,address beneficiary,uint8 coverageClass,uint8 state,uint96 limit,uint64 startsAt,uint64 endsAt,uint64 claimDeadline,bytes32 termsHash,bytes32 riskSpecHash)",
  "error InvalidInput()",
  "error InvalidAttestation()",
  "error InvalidSignature()",
  "error AlreadyUsed()",
  "error NotEnoughAvailableLiquidity()",
  "error TransferFailed()",
  "function settle((bytes32 policyId,bytes32 claimId,bytes32 bradburyDecisionId,bytes32 genlayerTxId,bytes32 evidenceDigest,bytes32 resultDigest,bytes32 termsHash,bytes32 riskSpecHash,address recipient,uint96 amount,uint8 coverageClass,uint8 verdict,uint8 revision,uint64 finalizedAt,uint64 deadline,uint256 sourceChainId,address adjudicator) d,bytes[] signatures)",
  "function agentPermissions(address owner,address agent) view returns (uint96 maxPremium,uint96 usedPremium,uint64 expiresAt,bool enabled)",
  "function purchase((bytes32 policyId,address insured,address beneficiary,uint8 coverageClass,uint96 premium,uint96 limit,uint64 startsAt,uint64 endsAt,uint64 claimDeadline,bytes32 termsHash,bytes32 riskSpecHash,uint256 nonce,uint64 quoteDeadline) q, bytes signature)",
]);

export const quoteTypes = {
  Quote: [
    { name: "policyId", type: "bytes32" },
    { name: "insured", type: "address" },
    { name: "beneficiary", type: "address" },
    { name: "coverageClass", type: "uint8" },
    { name: "premium", type: "uint96" },
    { name: "limit", type: "uint96" },
    { name: "startsAt", type: "uint64" },
    { name: "endsAt", type: "uint64" },
    { name: "claimDeadline", type: "uint64" },
    { name: "termsHash", type: "bytes32" },
    { name: "riskSpecHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
    { name: "quoteDeadline", type: "uint64" },
  ],
} as const;

export type SignedQuote = {
  policyId: `0x${string}`;
  insured: `0x${string}`;
  beneficiary: `0x${string}`;
  coverageClass: number;
  premium: string;
  limit: string;
  startsAt: string;
  endsAt: string;
  claimDeadline: string;
  termsHash: `0x${string}`;
  riskSpecHash: `0x${string}`;
  nonce: string;
  quoteDeadline: string;
};

export function quoteToAbi(q: SignedQuote) {
  return {
    ...q, premium: BigInt(q.premium), limit: BigInt(q.limit),
    startsAt: BigInt(q.startsAt), endsAt: BigInt(q.endsAt),
    claimDeadline: BigInt(q.claimDeadline), nonce: BigInt(q.nonce),
    quoteDeadline: BigInt(q.quoteDeadline),
  };
}

export function configuredPoolAddress(): `0x${string}` | null {
  const addr = process.env.NEXT_PUBLIC_COVRA_POOLS_ADDRESS;
  return addr && /^0x[0-9a-fA-F]{40}$/.test(addr) ? addr as `0x${string}` : null;
}
