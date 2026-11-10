export type PoolWithdrawalPosition = {
  assets: bigint;
  reserved: bigint;
  availableCapital: bigint;
  totalShares: bigint;
  ownedShares: bigint;
};

export type PoolWithdrawalMetrics = {
  availableCapital: bigint;
  ownedValue: bigint;
  maxWithdrawableShares: bigint;
  maxWithdrawableAmount: bigint;
  reserveLimited: boolean;
};

export type PoolWithdrawalQuote = PoolWithdrawalMetrics & {
  ok: boolean;
  requestedAmount: bigint;
  shares: bigint;
  redemptionAmount: bigint;
  error?: string;
};

const USDC_SCALE = 1_000_000n;

function min(a: bigint, b: bigint) {
  return a < b ? a : b;
}

function amountForShares(shares: bigint, assets: bigint, totalShares: bigint) {
  if (shares <= 0n || assets <= 0n || totalShares <= 0n) return 0n;
  return (shares * assets) / totalShares;
}

function maxSharesForLiquidity(availableCapital: bigint, assets: bigint, totalShares: bigint) {
  if (availableCapital <= 0n || assets <= 0n || totalShares <= 0n) return 0n;

  // The contract pays floor(shares * assets / totalShares) and rejects a
  // payout above availableCapital. This is the largest share count whose
  // floored payout remains within that liquidity boundary.
  return (((availableCapital + 1n) * totalShares) - 1n) / assets;
}

export function parseUsdcAmount(value: string): bigint | null {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{0,6})?$/.test(normalized)) return null;

  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * USDC_SCALE + BigInt((fraction + "000000").slice(0, 6));
}

export function formatUsdcInput(amount: bigint): string {
  const whole = amount / USDC_SCALE;
  const fraction = (amount % USDC_SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function withdrawalErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Withdrawal failed.";
  if (/user (rejected|denied)|rejected the request/i.test(message)) {
    return "Withdrawal cancelled in wallet. No shares were changed.";
  }
  return message;
}

export function calculateWithdrawalMetrics(position: PoolWithdrawalPosition): PoolWithdrawalMetrics {
  const availableCapital = position.availableCapital > 0n
    ? min(position.availableCapital, position.assets)
    : 0n;
  const ownedValue = amountForShares(position.ownedShares, position.assets, position.totalShares);
  const liquidityShares = maxSharesForLiquidity(availableCapital, position.assets, position.totalShares);
  const maxWithdrawableShares = min(position.ownedShares, liquidityShares);
  const maxWithdrawableAmount = amountForShares(maxWithdrawableShares, position.assets, position.totalShares);

  return {
    availableCapital,
    ownedValue,
    maxWithdrawableShares,
    maxWithdrawableAmount,
    reserveLimited: maxWithdrawableAmount < ownedValue,
  };
}

export function quoteWithdrawal(position: PoolWithdrawalPosition, requestedAmount: bigint): PoolWithdrawalQuote {
  const metrics = calculateWithdrawalMetrics(position);
  const base = { ...metrics, requestedAmount, shares: 0n, redemptionAmount: 0n };

  if (requestedAmount <= 0n) return { ...base, ok: false, error: "Enter a positive USDC amount." };
  if (position.ownedShares <= 0n) return { ...base, ok: false, error: "This wallet does not own shares in the selected risk pool." };
  if (position.assets <= 0n || position.totalShares <= 0n) return { ...base, ok: false, error: "The selected pool has no redeemable share price yet." };
  if (metrics.maxWithdrawableAmount <= 0n) {
    return { ...base, ok: false, error: "No capital is currently available for withdrawal." };
  }
  if (requestedAmount > metrics.maxWithdrawableAmount) {
    return {
      ...base,
      ok: false,
      error: `The maximum withdrawable amount is ${formatUsdcInput(metrics.maxWithdrawableAmount)} USDC.`,
    };
  }

  // Round shares up so the contract's floor division redeems at least the
  // requested amount. The liquidity-derived max share count prevents this
  // round-up from crossing an active reserve boundary.
  const shares = ((requestedAmount * position.totalShares) + position.assets - 1n) / position.assets;
  if (shares <= 0n || shares > metrics.maxWithdrawableShares) {
    return { ...base, ok: false, error: "The requested amount cannot be represented safely by whole shares." };
  }

  const redemptionAmount = amountForShares(shares, position.assets, position.totalShares);
  if (redemptionAmount <= 0n || redemptionAmount > metrics.availableCapital) {
    return { ...base, ok: false, error: "The requested amount would exceed available unreserved capital." };
  }

  return { ...metrics, ok: true, requestedAmount, shares, redemptionAmount };
}
