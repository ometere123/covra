import { expect, it } from "vitest";
import { logRanges } from "../src/lib/indexer-ranges";
it("backfills without gaps, overlaps or a provider-overlimit request", () => {
  const ranges = logRanges(53729517n, 53731516n);
  expect(ranges).toHaveLength(10);
  expect(ranges[0].fromBlock).toBe(53729517n);
  expect(ranges.at(-1)?.toBlock).toBe(53731516n);
  ranges.forEach((range, index) => {
    expect(range.toBlock - range.fromBlock + 1n).toBeLessThanOrEqual(200n);
    if (index) expect(range.fromBlock).toBe(ranges[index - 1].toBlock + 1n);
  });
  expect(logRanges(5n, 4n)).toEqual([]);
  expect(logRanges(5n, 5n)).toEqual([{ fromBlock: 5n, toBlock: 5n }]);
});
