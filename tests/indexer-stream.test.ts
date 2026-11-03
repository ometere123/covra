import { describe, expect, it } from "vitest";
import { indexerStream } from "../src/lib/indexer-stream";
describe("deployment-bound indexer checkpoints", () => {
  it("keeps a replacement deployment separate from a superseded pool and normalizes case", () => {
    const prior = "0xab4436b8ff15b7fa209e2018300d1741db0dfad1";
    const current = "0xd8619d3948c08c8364fd3a7a35dc8a65b254a8e4";
    expect(indexerStream(prior)).not.toBe(indexerStream(current));
    expect(indexerStream(current)).toBe(indexerStream("0x" + current.slice(2).toUpperCase()));
    expect(() => indexerStream("missing")).toThrow();
  });
});
