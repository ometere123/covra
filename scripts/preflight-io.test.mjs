import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { encodePreflightOutput, parsePreflightOutput } from "./preflight-io.mjs";

describe("preflight wire protocol", () => {
  const candidate = {status:"SOURCE_CHECKS_PASSED_NOT_SIGNABLE",decision:{policyId:"0xabc",amount:"1200000"}};

  it("emits newline-delimited JSON consumable by the signer", () => {
    const wire=encodePreflightOutput(candidate);
    assert.equal(wire.endsWith("\n"),true);
    assert.deepEqual(parsePreflightOutput(wire),candidate);
    assert.deepEqual(JSON.parse(wire),candidate);
  });

  it("rejects fake and malformed preflight results", () => {
    assert.throws(()=>parsePreflightOutput(JSON.stringify({status:"FAIL"})),/usable candidate/);
    assert.throws(()=>parsePreflightOutput(encodePreflightOutput(candidate)+"\\n"),SyntaxError);
  });
});
