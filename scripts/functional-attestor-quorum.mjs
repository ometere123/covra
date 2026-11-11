/**
 * Local-only functional attestor harness.
 *
 * This module is deliberately not imported by the application or hosted
 * routes. It maps one ATTESTORn_PRIVATE_KEY to a viem account only for the
 * duration of one signing callback, then releases the account reference.
 * Production signing remains scripts/attestor-sign.mjs and still requires an
 * independently produced, manually approved preflight result.
 *
 * The five keys may be held by one operator for functional testing. This file
 * must never be used as evidence of independent operator custody.
 */
import nextEnv from "@next/env";
import { createPublicClient, getAddress, http, recoverTypedDataAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { aggregateAttestations } from "./aggregate-attestations.mjs";
import { messageForSigning, types } from "./attestor-sign.mjs";

const { loadEnvConfig } = nextEnv;

export const FUNCTIONAL_ATTESTOR_ENV_NAMES = Object.freeze([
  "ATTESTOR1_PRIVATE_KEY",
  "ATTESTOR2_PRIVATE_KEY",
  "ATTESTOR3_PRIVATE_KEY",
  "ATTESTOR4_PRIVATE_KEY",
  "ATTESTOR5_PRIVATE_KEY",
]);

let activeSigningOperation = false;

function assertLocalFunctionalContext(env) {
  if (env.VERCEL === "1" || env.VERCEL_ENV === "production" || env.NODE_ENV === "production") {
    throw new Error("Functional attestor signing is disabled in hosted or production contexts");
  }
  if (env.COVRA_ENV && env.COVRA_ENV !== "testnet") {
    throw new Error("Functional attestor signing requires COVRA_ENV=testnet");
  }
}

function slotIndex(slot) {
  if (!Number.isInteger(slot) || slot < 1 || slot > FUNCTIONAL_ATTESTOR_ENV_NAMES.length) {
    throw new Error("Attestor slot must be an integer from 1 through 5");
  }
  return slot - 1;
}

function privateKeyForSlot(slot, env) {
  const name = FUNCTIONAL_ATTESTOR_ENV_NAMES[slotIndex(slot)];
  const value = env[name];
  if (!/^0x[0-9a-fA-F]{64}$/.test(value || "")) {
    throw new Error(`${name} is not configured as a 32-byte private key`);
  }
  return value;
}

const sameAddress = (left, right) => String(left).toLowerCase() === String(right).toLowerCase();

/**
 * Run exactly one operation with one configured signer in memory.
 * Concurrent signing is rejected so keys cannot be accidentally mixed across
 * records by a batch caller.
 */
export async function withConfiguredAttestorSigner(slot, operation, { env = process.env } = {}) {
  assertLocalFunctionalContext(env);
  if (activeSigningOperation) throw new Error("Only one functional attestor signing operation may run at a time");
  if (typeof operation !== "function") throw new Error("A signing callback is required");

  activeSigningOperation = true;
  try {
    const account = privateKeyToAccount(privateKeyForSlot(slot, env));
    return await operation(account, { slot });
  } finally {
    activeSigningOperation = false;
  }
}

export async function signWithConfiguredAttestor(slot, typedData, options = {}) {
  return withConfiguredAttestorSigner(slot, (account) => account.signTypedData(typedData), options);
}

export function deriveConfiguredAttestorAddresses(env = process.env) {
  assertLocalFunctionalContext(env);
  return FUNCTIONAL_ATTESTOR_ENV_NAMES.map((name, index) => {
    const key = privateKeyForSlot(index + 1, env);
    return { slot: index + 1, variable: name, address: getAddress(privateKeyToAccount(key).address) };
  });
}

function syntheticDecision(adjudicator, recipient) {
  const hash = (digit) => `0x${digit.repeat(64)}`;
  return {
    policyId: hash("1"), claimId: hash("2"), bradburyDecisionId: hash("3"),
    genlayerTxId: hash("4"), evidenceDigest: hash("5"), resultDigest: hash("6"),
    termsHash: hash("7"), riskSpecHash: hash("8"), recipient, amount: "1",
    coverageClass: 1, verdict: 1, revision: 0, finalizedAt: "1900000000",
    deadline: "1900003600", sourceChainId: "4221", adjudicator,
  };
}

async function expectRejected(label, action) {
  try {
    await action();
  } catch {
    return { label, passed: true };
  }
  return { label, passed: false };
}

/**
 * Derives all five configured identities, verifies their deployed roster
 * membership, and signs one synthetic typed decision per key sequentially.
 * No Base or Bradbury write is submitted by this command.
 */
export async function runFunctionalAttestorCheck({ env = process.env, pool, roster, adjudicator } = {}) {
  assertLocalFunctionalContext(env);
  const derived = deriveConfiguredAttestorAddresses(env);
  const expectedRoster = (roster || []).map(getAddress);
  if (expectedRoster.length !== 5 || new Set(expectedRoster).size !== 5) {
    throw new Error("The deployed five-member roster is required");
  }
  const matches = derived.map((entry) => ({
    ...entry,
    registered: expectedRoster.some((address) => sameAddress(address, entry.address)),
    configuredAddressMatches: !env[`ATTESTOR_ADDRESS_${entry.slot}`] ||
      sameAddress(getAddress(env[`ATTESTOR_ADDRESS_${entry.slot}`]), entry.address),
  }));
  if (matches.some((entry) => !entry.registered || !entry.configuredAddressMatches)) {
    throw new Error("A configured functional key does not match its registered attestor address");
  }

  const actualPool = getAddress(pool);
  const decision = syntheticDecision(getAddress(adjudicator), getAddress(env.BASE_DEPLOYER_ADDRESS || "0x1111111111111111111111111111111111111111"));
  const typedData = {
    domain: { name: "COVRA", version: "1", chainId: 84532, verifyingContract: actualPool },
    types,
    primaryType: "Decision",
    message: messageForSigning(decision),
  };
  const records = [];
  for (const entry of derived) {
    const signature = await signWithConfiguredAttestor(entry.slot, typedData, { env });
    const recovered = getAddress(await recoverTypedDataAddress({ ...typedData, signature }));
    if (recovered !== entry.address) throw new Error(`Functional signature recovery failed for slot ${entry.slot}`);
    records.push({ signer: entry.address, signature, decision });
  }

  const noWriteBase = {
    getChainId: async () => 84532,
    simulateContract: async () => undefined,
  };
  const validBundle = await aggregateAttestations(records.slice(0, 3), actualPool, noWriteBase);
  const negative = await Promise.all([
    expectRejected("insufficient quorum", () => aggregateAttestations(records.slice(0, 2), actualPool, noWriteBase)),
    expectRejected("duplicate signer", () => aggregateAttestations([records[0], records[0], records[1]], actualPool, noWriteBase)),
    expectRejected("modified decision", () => aggregateAttestations([
      records[0], { ...records[1], decision: { ...decision, amount: "2" } }, records[2],
    ], actualPool, noWriteBase)),
    expectRejected("wrong chain", () => aggregateAttestations(records.slice(0, 3), actualPool, {
      getChainId: async () => 4221, simulateContract: async () => undefined,
    })),
    expectRejected("forged signature", () => aggregateAttestations([
      { ...records[0], signature: `0x${"00".repeat(65)}` }, records[1], records[2],
    ], actualPool, noWriteBase)),
  ]);

  return {
    status: "FUNCTIONAL_QUORUM_VERIFIED",
    operatorIndependence: "NOT_VERIFIED",
    network: { chainId: 84532, pool: actualPool },
    keysPresent: derived.length,
    derived,
    roster: expectedRoster,
    matches,
    uniqueSigners: new Set(records.map((record) => record.signer)).size,
    validQuorumSigners: validBundle.signers,
    negative,
    writesSubmitted: 0,
  };
}

async function main() {
  loadEnvConfig(process.cwd(), false);
  const deployment = JSON.parse(readFileSync(
    "docs/deployments/base-84532-0xfe01a9b68ac5a54df1173231c49838a0d67ba37be35e85624cd7d912461f93f2.json",
    "utf8",
  ));
  const pool = process.env.NEXT_PUBLIC_COVRA_POOLS_ADDRESS || deployment.contractAddress;
  const adjudicator = process.env.BRADBURY_ADJUDICATOR_ADDRESS || deployment.adjudicator;
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(process.env.BASE_RPC_URL || "https://sepolia.base.org"),
  });
  if (await client.getChainId() !== 84532) throw new Error("Configured Base endpoint is not Base Sepolia");
  const deploymentRoster = deployment.attestors || [];
  const attestorAbi = [{
    type: "function", name: "attestor", stateMutability: "view",
    inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "bool" }],
  }, {
    type: "function", name: "attestorCount", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint8" }],
  }];
  if (await client.readContract({ address: getAddress(pool), abi: attestorAbi, functionName: "attestorCount" }) !== 5) {
    throw new Error("The deployed Base roster is not exactly five members");
  }
  for (const address of deploymentRoster) {
    const enabled = await client.readContract({
      address: getAddress(pool), abi: attestorAbi, functionName: "attestor", args: [getAddress(address)],
    });
    if (!enabled) throw new Error(`Configured deployment roster member is not enabled: ${getAddress(address)}`);
  }
  const report = await runFunctionalAttestorCheck({
    env: process.env, pool, roster: deploymentRoster, adjudicator,
  });
  if (report.negative.some((result) => !result.passed)) throw new Error("A functional quorum negative control failed");
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error.message || String(error)); process.exitCode = 1; });
}
