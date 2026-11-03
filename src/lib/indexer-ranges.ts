/** Inclusive RPC pages; preserve a bounded durable backfill across provider limits. */
export function logRanges(start: bigint, end: bigint, maximum = 200n) {
  if (start < 0n || maximum < 1n) throw new Error("Invalid log range");
  const ranges: { fromBlock: bigint; toBlock: bigint }[] = [];
  for (let fromBlock = start; fromBlock <= end; fromBlock += maximum) {
    ranges.push({ fromBlock, toBlock: fromBlock + maximum - 1n > end ? end : fromBlock + maximum - 1n });
  }
  return ranges;
}
