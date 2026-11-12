import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BRADBURY_DEFAULT_DISTRIBUTION,
  BRADBURY_FEE_DEPOSIT,
  makeDeploymentEnvelope,
} from "./bradbury-deployment-envelope.mjs";

const V1_SENDER = "0x0d5540e0ad4b92aa0ad4e5f1b8cd645ee1e363e7";
const V1_SOURCE_SHA256 = "4f424277b2aa1c23d599f8936452c7d16989ab7bd4e4265fbb28aab57092d0f2";
const HISTORICAL_OUTER_INPUT_SHA256 = "172ff2c53593d77a72d8cc3f3ccd4e4379659789b26157d837afdad703818c0c";
const HISTORICAL_TX_CALLDATA_SHA256 = "7ef3a881c53f5c6577a64bfb984997eed6797b27c6f601d1c0b309ca547edfe3";

const sha256Hex = (value) => createHash("sha256").update(value).digest("hex");

test("reproduces the successful V1 deployment envelope exactly", () => {
  const sourceBytes = readFileSync("contracts/genlayer/CovraAdjudicatorV1.py");
  const envelope = makeDeploymentEnvelope({
    source: sourceBytes.toString("utf8"),
    sender: V1_SENDER,
    feeValue: BRADBURY_FEE_DEPOSIT,
    distribution: BRADBURY_DEFAULT_DISTRIBUTION,
    validUntil: 1793671244n,
    maxRotations: 3n,
    numOfInitialValidators: 5n,
  });

  assert.equal(sha256Hex(sourceBytes), V1_SOURCE_SHA256);
  assert.equal(envelope.serializedDeploymentHexChars, 51424);
  assert.equal(envelope.serializedDeploymentBytes, 25711);
  assert.equal(envelope.outerCalldataBytes, 26532);
  assert.equal(sha256Hex(Buffer.from(envelope.serializedDeployment.slice(2), "hex")), HISTORICAL_TX_CALLDATA_SHA256);
  assert.equal(sha256Hex(Buffer.from(envelope.outerCalldata.slice(2), "hex")), HISTORICAL_OUTER_INPUT_SHA256);
});

test("reports hex-character and byte lengths separately", () => {
  const envelope = makeDeploymentEnvelope({ source: "x", sender: V1_SENDER });
  assert.equal(envelope.serializedDeploymentHexChars, envelope.serializedDeploymentBytes * 2 + 2);
  assert.equal(envelope.outerCalldataBytes * 2 + 2, envelope.outerCalldata.length);
});
