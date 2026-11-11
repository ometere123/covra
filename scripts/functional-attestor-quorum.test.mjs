import assert from "node:assert/strict";
import test from "node:test";
import { getAddress } from "viem";
import {
  deriveConfiguredAttestorAddresses,
  runFunctionalAttestorCheck,
  signWithConfiguredAttestor,
} from "./functional-attestor-quorum.mjs";
import { messageForSigning, types } from "./attestor-sign.mjs";

const env = {
  COVRA_ENV: "testnet",
  ATTESTOR1_PRIVATE_KEY: `0x${"11".repeat(32)}`,
  ATTESTOR2_PRIVATE_KEY: `0x${"22".repeat(32)}`,
  ATTESTOR3_PRIVATE_KEY: `0x${"33".repeat(32)}`,
  ATTESTOR4_PRIVATE_KEY: `0x${"44".repeat(32)}`,
  ATTESTOR5_PRIVATE_KEY: `0x${"55".repeat(32)}`,
  BRADBURY_ADJUDICATOR_ADDRESS: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  BASE_DEPLOYER_ADDRESS: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
};
const pool = "0xcccccccccccccccccccccccccccccccccccccccc";
const derived = deriveConfiguredAttestorAddresses(env);

test("maps configured keys to registered functional signers without key batching", async () => {
  const roster = derived.map(({ address }) => address);
  const report = await runFunctionalAttestorCheck({
    env, pool, roster, adjudicator: env.BRADBURY_ADJUDICATOR_ADDRESS,
  });
  assert.equal(report.status, "FUNCTIONAL_QUORUM_VERIFIED");
  assert.equal(report.operatorIndependence, "NOT_VERIFIED");
  assert.equal(report.uniqueSigners, 5);
  assert.equal(report.validQuorumSigners.length, 3);
  assert.equal(report.writesSubmitted, 0);
  assert.ok(report.negative.every(({ passed }) => passed));
});

test("rejects concurrent functional signing operations", async () => {
  const typedData = {
    domain: { name: "COVRA", version: "1", chainId: 84532, verifyingContract: pool },
    types,
    primaryType: "Decision",
    message: messageForSigning({
      policyId: `0x${"1".repeat(64)}`, claimId: `0x${"2".repeat(64)}`,
      bradburyDecisionId: `0x${"3".repeat(64)}`, genlayerTxId: `0x${"4".repeat(64)}`,
      evidenceDigest: `0x${"5".repeat(64)}`, resultDigest: `0x${"6".repeat(64)}`,
      termsHash: `0x${"7".repeat(64)}`, riskSpecHash: `0x${"8".repeat(64)}`,
      recipient: getAddress(env.BASE_DEPLOYER_ADDRESS), amount: "1", coverageClass: 1,
      verdict: 1, revision: 0, finalizedAt: "1900000000", deadline: "1900003600",
      sourceChainId: "4221", adjudicator: getAddress(env.BRADBURY_ADJUDICATOR_ADDRESS),
    }),
  };
  const results = await Promise.allSettled([
    signWithConfiguredAttestor(1, typedData, { env }),
    signWithConfiguredAttestor(2, typedData, { env }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.match(results.find((result) => result.status === "rejected").reason.message,
    /one functional attestor signing operation/i);
});
