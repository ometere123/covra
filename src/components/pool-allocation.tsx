"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createWalletClient, custom, formatUnits, parseUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { ArrowUpRight, CircleDollarSign, Info, CheckCircle2 } from "lucide-react";
import { baseClient, BASE_USDC, configuredPoolAddress, poolsAbi, usdcAbi } from "@/lib/chain";
import { coverages, formatUsdc } from "@/lib/catalog";
import {
  calculateWithdrawalMetrics,
  formatUsdcInput,
  parseUsdcAmount,
  quoteWithdrawal,
  withdrawalErrorMessage,
  type PoolWithdrawalPosition,
} from "@/lib/pool-withdrawal";
import { transactionPhaseLabel, transactionPhaseTone, type TransactionPhase } from "@/lib/transaction-state";
import { useWallet } from "./wallet-provider";
import { EmptyState, SyncNotice } from "./ui";

export type PoolRow = {
  classId: number;
  name: string;
  assetsMicroUsdc: string;
  reservedMicroUsdc: string;
  totalShares: string;
  paidMicroUsdc: string;
  premiumsWrittenMicroUsdc: string;
};

type OnChainPool = {
  assets: bigint;
  reserved: bigint;
  premiumsWritten: bigint;
  paid: bigint;
  totalShares: bigint;
};

function displayUsdc(microUsdc: bigint) {
  return formatUsdc(Number(formatUnits(microUsdc, 6)));
}

function displayShares(shares: bigint) {
  return shares.toLocaleString("en-US");
}

export function PoolAllocation({ showIntro = true }: { showIntro?: boolean }) {
  const wallet = useWallet();
  const poolAddress = configuredPoolAddress();
  const [items, setItems] = useState<PoolRow[]>([]);
  const [state, setState] = useState("LOADING");
  const [message, setMessage] = useState("");
  const [risk, setRisk] = useState(0);
  const [amount, setAmount] = useState(250);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tx, setTx] = useState("");
  const [withdrawRisk, setWithdrawRisk] = useState(0);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawalPosition, setWithdrawalPosition] = useState<PoolWithdrawalPosition | null>(null);
  const [withdrawalState, setWithdrawalState] = useState<"IDLE" | "LOADING" | "CONFIRMED" | "ERROR">("IDLE");
  const [withdrawalError, setWithdrawalError] = useState("");
  const [transactionPhase, setTransactionPhase] = useState<TransactionPhase>("IDLE");
  const [transactionLabel, setTransactionLabel] = useState("Pool transaction");
  const [transactionHash, setTransactionHash] = useState("");
  const [transactionError, setTransactionError] = useState("");

  const beginTransaction = (label: string) => {
    setTransactionLabel(label);
    setTransactionHash("");
    setTransactionError("");
    setTransactionPhase("AWAITING_SIGNATURE");
  };

  const refresh = () => {
    void fetch("/api/pools", { cache: "no-store" }).then(r => r.json()).then(r => {
      setItems(Array.isArray(r.items) ? r.items : []);
      setState(String(r.state || "SYNCHRONIZATION_ERROR"));
      setMessage(String(r.message || r.error || ""));
    }).catch(() => {
      setItems([]);
      setState("SYNCHRONIZATION_ERROR");
      setMessage("Base Sepolia pool state could not be read.");
    });
  };

  useEffect(refresh, []);

  const refreshWithdrawal = useCallback(async () => {
    if (!poolAddress || !wallet.address || wallet.chainId !== 84532) {
      setWithdrawalPosition(null);
      setWithdrawalState("IDLE");
      setWithdrawalError("");
      return;
    }

    setWithdrawalState("LOADING");
    setWithdrawalError("");
    try {
      const [pool, availableCapital, ownedShares] = await Promise.all([
        baseClient.readContract({ address: poolAddress, abi: poolsAbi, functionName: "pool", args: [withdrawRisk] }),
        baseClient.readContract({ address: poolAddress, abi: poolsAbi, functionName: "availableCapital", args: [withdrawRisk] }),
        baseClient.readContract({ address: poolAddress, abi: poolsAbi, functionName: "sharesOf", args: [withdrawRisk, wallet.address] }),
      ]);
      const onChainPool = pool as OnChainPool;
      setWithdrawalPosition({
        assets: onChainPool.assets,
        reserved: onChainPool.reserved,
        availableCapital,
        totalShares: onChainPool.totalShares,
        ownedShares,
      });
      setWithdrawalState("CONFIRMED");
    } catch (e) {
      setWithdrawalPosition(null);
      setWithdrawalState("ERROR");
      setWithdrawalError(e instanceof Error ? e.message : "The selected on-chain position could not be read.");
    }
  }, [poolAddress, wallet.address, wallet.chainId, withdrawRisk]);

  useEffect(() => {
    void refreshWithdrawal();
  }, [refreshWithdrawal]);

  const deposit = async () => {
    setError("");
    setTx("");
    setTransactionPhase("IDLE");
    setTransactionError("");
    setBusy(true);
    try {
      const contract = poolAddress;
      if (!contract || !wallet.address || !window.ethereum) throw new Error("Connect a wallet and configure the deployed Base pool contract.");
      if (amount <= 0 || amount > 100000) throw new Error("Deposit amount must be between 1 and 100,000 test USDC.");
      if (wallet.chainId !== 84532) await wallet.switchToBase();
      const client = createWalletClient({ account: wallet.address, chain: baseSepolia, transport: custom(window.ethereum) });
      const micro = parseUnits(amount.toFixed(2), 6);
      const balance = await baseClient.readContract({ address: BASE_USDC, abi: usdcAbi, functionName: "balanceOf", args: [wallet.address] });
      if (balance < micro) throw new Error("Insufficient Base Sepolia test USDC.");
      const allowance = await baseClient.readContract({ address: BASE_USDC, abi: usdcAbi, functionName: "allowance", args: [wallet.address, contract] });
      if (allowance < micro) {
        beginTransaction("USDC approval");
        const approve = await client.writeContract({ account: wallet.address, chain: baseSepolia, address: BASE_USDC, abi: usdcAbi, functionName: "approve", args: [contract, micro] });
        setTransactionHash(approve);
        setTransactionPhase("SUBMITTED");
        setTransactionPhase("CONFIRMING");
        const receipt = await baseClient.waitForTransactionReceipt({ hash: approve });
        if (receipt.status !== "success") throw new Error("USDC approval reverted");
      }
      beginTransaction("Pool deposit");
      const hash = await client.writeContract({ account: wallet.address, chain: baseSepolia, address: contract, abi: poolsAbi, functionName: "deposit", args: [risk, micro] });
      setTransactionHash(hash);
      setTransactionPhase("SUBMITTED");
      setTransactionPhase("CONFIRMING");
      const receipt = await baseClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Pool deposit reverted");
      setTx(hash);
      setTransactionPhase("CONFIRMED");
      refresh();
      void refreshWithdrawal();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Deposit failed";
      setTransactionError(message);
      setTransactionPhase(/revert/i.test(message) ? "REVERTED" : "RECOVERABLE_ERROR");
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const withdrawalMetrics = useMemo(
    () => withdrawalPosition ? calculateWithdrawalMetrics(withdrawalPosition) : null,
    [withdrawalPosition],
  );
  const requestedWithdrawal = withdrawAmount ? parseUsdcAmount(withdrawAmount) : null;
  const withdrawalQuote = useMemo(
    () => withdrawalPosition && requestedWithdrawal !== null ? quoteWithdrawal(withdrawalPosition, requestedWithdrawal) : null,
    [requestedWithdrawal, withdrawalPosition],
  );
  const withdrawalInputError = withdrawAmount && requestedWithdrawal === null
    ? "Enter a USDC amount with no more than 6 decimal places."
    : "";

  const withdraw = async () => {
    setError("");
    setTx("");
    setTransactionPhase("IDLE");
    setTransactionError("");
    setBusy(true);
    try {
      const contract = poolAddress;
      if (!contract || !wallet.address || !window.ethereum) throw new Error("Connect your wallet and configure the deployed Base pool contract.");
      if (requestedWithdrawal === null || requestedWithdrawal <= 0n) throw new Error("Enter a positive USDC withdrawal amount.");
      if (wallet.chainId !== 84532) await wallet.switchToBase();

      // Refresh the quote immediately before signing. Pool assets, reserves,
      // and share ownership can change after the preview was rendered.
      const [pool, availableCapital, ownedShares] = await Promise.all([
        baseClient.readContract({ address: contract, abi: poolsAbi, functionName: "pool", args: [withdrawRisk] }),
        baseClient.readContract({ address: contract, abi: poolsAbi, functionName: "availableCapital", args: [withdrawRisk] }),
        baseClient.readContract({ address: contract, abi: poolsAbi, functionName: "sharesOf", args: [withdrawRisk, wallet.address] }),
      ]);
      const onChainPool = pool as OnChainPool;
      const freshPosition: PoolWithdrawalPosition = {
        assets: onChainPool.assets,
        reserved: onChainPool.reserved,
        availableCapital,
        totalShares: onChainPool.totalShares,
        ownedShares,
      };
      const freshQuote = quoteWithdrawal(freshPosition, requestedWithdrawal);
      if (!freshQuote.ok) throw new Error(freshQuote.error || "The withdrawal is no longer available.");
      if (withdrawalQuote?.ok && (freshQuote.shares !== withdrawalQuote.shares || freshQuote.redemptionAmount !== withdrawalQuote.redemptionAmount)) {
        throw new Error("The pool position changed. Review the updated withdrawal preview and try again.");
      }

      const client = createWalletClient({ account: wallet.address, chain: baseSepolia, transport: custom(window.ethereum) });
      beginTransaction("Pool withdrawal");
      const hash = await client.writeContract({
        account: wallet.address,
        chain: baseSepolia,
        address: contract,
        abi: poolsAbi,
        functionName: "withdraw",
        args: [withdrawRisk, freshQuote.shares],
      });
      setTransactionHash(hash);
      setTransactionPhase("SUBMITTED");
      setTransactionPhase("CONFIRMING");
      const receipt = await baseClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Withdrawal reverted; active reserves may have changed.");
      setTx(hash);
      setTransactionPhase("CONFIRMED");
      refresh();
      void refreshWithdrawal();
    } catch (e) {
      const message = withdrawalErrorMessage(e);
      setTransactionError(message);
      setTransactionPhase(/revert/i.test(message) ? "REVERTED" : "RECOVERABLE_ERROR");
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const ready = state === "CONFIRMED" && items.length === 5;
  const synchronizationNotice = state === "LOADING"
    ? "Verifying the Base Sepolia pool and its chain bindings… no balances are shown until the read completes."
    : (message || state === "AWAITING_DEPLOYMENT")
      ? message || "The Base Sepolia pool is not configured; no balances are shown."
      : "Base Sepolia pool state could not be verified; no balances are shown.";
  const emptyPoolMessage = state === "LOADING"
    ? "Waiting for a verified Base Sepolia pool read."
    : state === "AWAITING_DEPLOYMENT"
      ? "The Base Sepolia pool contract is not configured yet."
      : "The Base Sepolia pool could not be verified or synchronized.";
  const withdrawalDisabled = busy || !ready || !wallet.address || wallet.chainId !== 84532 || withdrawalState !== "CONFIRMED" || !withdrawalQuote?.ok;
  const withdrawalStatus = !poolAddress
    ? "Withdrawal data will appear after the Base Sepolia pool is configured."
    : !wallet.address
      ? "Connect your wallet to read owned shares from Base Sepolia."
      : wallet.chainId !== 84532
        ? "Switch to Base Sepolia to read this position."
        : withdrawalState === "LOADING"
          ? "Reading this position from Base Sepolia…"
          : withdrawalState === "ERROR"
            ? withdrawalError || "The selected on-chain position could not be read."
            : withdrawalPosition?.ownedShares === 0n
              ? "No shares are recorded for this wallet in the selected risk pool."
              : "Values are read directly from the deployed Base Sepolia pool.";

  return (
    <>
      {state !== "CONFIRMED" && <SyncNotice text={synchronizationNotice} />}
      {showIntro && <div className="panel pool-intro"><div className="detail-label">Capital accounting</div><h3>A reserve for every risk</h3><p>Five independent underwriting ledgers; active policy limits reduce freely withdrawable capital until claims settle or the claim window expires.</p></div>}
      <div className="pool-grid">{items.length ? items.map(p => {
        const assets = Number(p.assetsMicroUsdc) / 1e6;
        const reserved = Number(p.reservedMicroUsdc) / 1e6;
        const ratio = assets > 0 ? Math.min(100, Math.round(reserved / assets * 100)) : 0;
        return <div className="pool-card" key={p.classId}><span className="pool-card-number">POOL / 0{p.classId + 1}</span><h3>{p.name}</h3><strong>{formatUsdc(assets)}</strong><div className="pool-utilization"><span style={{ width: ratio + "%" }} /></div><small><span>{ratio}% reserved</span><span>{formatUsdc(assets - reserved)} free</span></small></div>;
      }) : <div className="pool-empty"><EmptyState title="No verified pool balances" text={emptyPoolMessage} /></div>}</div>
      <div className="form-layout pool-form-layout">
        <div className="panel form-panel">
          <div className="form-block-title"><span>01</span> Capital allocation</div>
          <div className="field"><label htmlFor="pool-risk">RISK POOL</label><select id="pool-risk" value={risk} onChange={e => setRisk(Number(e.target.value))}>{coverages.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div className="field"><label htmlFor="pool-amount">TEST USDC TO DEPOSIT</label><input id="pool-amount" type="number" inputMode="decimal" step="0.01" className="input" min={1} max={100000} value={amount} onChange={e => setAmount(Number(e.target.value))} aria-describedby="pool-deposit-hint" /></div>
          <div id="pool-deposit-hint" className="field-hint">Deposits mint non-transferable pro-rata accounting shares. Withdrawals cannot exceed unreserved capital. This product does not promise principal protection or guaranteed returns.</div>
          {!wallet.address && <button type="button" className="secondary-action pool-wallet-action" disabled={busy || wallet.busy} onClick={() => void wallet.connect().catch(() => undefined)}><CircleDollarSign size={15} />{wallet.busy ? "Opening wallet…" : "Connect wallet to continue"}</button>}
          {wallet.address && wallet.chainId !== 84532 && <button type="button" className="secondary-action pool-wallet-action" disabled={busy || wallet.busy} onClick={() => void wallet.switchToBase().catch(() => undefined)}>Switch to Base Sepolia <ArrowUpRight size={14} /></button>}
          {!ready && <div className="field-hint pool-readiness">Pool balances are not confirmed yet; deposits remain disabled until Base Sepolia synchronization is healthy.</div>}
          <button type="button" className="primary-action pool-action" disabled={busy || !ready || !wallet.address || wallet.chainId !== 84532} onClick={deposit}><CircleDollarSign size={15} />{busy ? "Waiting for wallet…" : "Approve & deposit test USDC"}<ArrowUpRight size={14} /></button>
        </div>
        <aside className="panel form-panel withdrawal-panel">
          <div className="form-block-title"><span>02</span> Exit position</div>
          <div className="field"><label htmlFor="withdraw-risk">WITHDRAWAL RISK POOL</label><select id="withdraw-risk" value={withdrawRisk} onChange={e => { setWithdrawRisk(Number(e.target.value)); setWithdrawAmount(""); }} aria-describedby="withdraw-risk-hint">{coverages.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><span id="withdraw-risk-hint" className="field-hint">Withdrawal is independent from the allocation risk pool selected above.</span></div>
          <div className="withdrawal-metrics" aria-live="polite">
            <div className="withdrawal-metric"><span>Owned shares</span><strong>{withdrawalPosition ? displayShares(withdrawalPosition.ownedShares) : "—"}</strong></div>
            <div className="withdrawal-metric"><span>Estimated USDC redemption value</span><strong>{withdrawalMetrics ? displayUsdc(withdrawalMetrics.ownedValue) : "—"}</strong></div>
            <div className="withdrawal-metric"><span>Available unreserved capital</span><strong>{withdrawalMetrics ? displayUsdc(withdrawalMetrics.availableCapital) : "—"}</strong></div>
            <div className="withdrawal-metric withdrawal-metric-emphasis"><span>Maximum withdrawable</span><strong>{withdrawalMetrics ? displayUsdc(withdrawalMetrics.maxWithdrawableAmount) : "—"}</strong></div>
          </div>
          <div className="field"><label htmlFor="withdraw-amount">USDC TO WITHDRAW</label><div className="amount-action-row"><input className="input" id="withdraw-amount" type="number" inputMode="decimal" min="0" step="0.000001" placeholder="0.00" value={withdrawAmount} onChange={e => setWithdrawAmount(e.target.value)} aria-describedby="withdraw-amount-hint" /><button type="button" className="secondary-action max-action" disabled={!withdrawalMetrics || withdrawalMetrics.maxWithdrawableAmount <= 0n || busy} onClick={() => withdrawalMetrics && setWithdrawAmount(formatUsdcInput(withdrawalMetrics.maxWithdrawableAmount))}>Max</button></div><span id="withdraw-amount-hint" className="field-hint">Enter a USDC amount. COVRA converts it into whole pool shares using the current on-chain price.</span></div>
          {withdrawalInputError && <div className="field-hint withdrawal-validation" role="alert">{withdrawalInputError}</div>}
          {withdrawalQuote?.error && <div className="field-hint withdrawal-validation" role="alert">{withdrawalQuote.error}</div>}
          {withdrawalMetrics?.reserveLimited && <div className="feedback withdrawal-reserve-note"><Info size={15} /> Active policy reserves limit this position to {displayUsdc(withdrawalMetrics.maxWithdrawableAmount)}. The estimated position value includes reserved capital that cannot be withdrawn yet.</div>}
          <div className="field-hint withdrawal-status">{withdrawalStatus}</div>
          {withdrawalQuote?.ok && <div className="withdrawal-preview" aria-live="polite"><div className="detail-label">TRANSACTION PREVIEW</div><p>Redeem approximately <strong>{displayUsdc(withdrawalQuote.redemptionAmount)}</strong> by returning <strong>{displayShares(withdrawalQuote.shares)} shares</strong> from {coverages[withdrawRisk].name}.</p><div className="withdrawal-preview-grid"><span>Requested</span><strong>{displayUsdc(withdrawalQuote.requestedAmount)}</strong><span>Contract payout</span><strong>{displayUsdc(withdrawalQuote.redemptionAmount)}</strong></div><span className="field-hint">The contract floors pro-rata redemption to USDC precision. The preview is refreshed before your wallet signs.</span></div>}
          {!wallet.address && <button type="button" className="secondary-action withdrawal-wallet-action" disabled={busy || wallet.busy} onClick={() => void wallet.connect().catch(() => undefined)}><CircleDollarSign size={15} />Connect wallet to view shares</button>}
          {wallet.address && wallet.chainId !== 84532 && <button type="button" className="secondary-action withdrawal-wallet-action" disabled={busy || wallet.busy} onClick={() => void wallet.switchToBase().catch(() => undefined)}>Switch to Base Sepolia <ArrowUpRight size={14} /></button>}
          <button type="button" className="secondary-action withdrawal-submit" disabled={withdrawalDisabled} onClick={withdraw}>Confirm & request withdrawal <ArrowUpRight size={14} /></button>
          <div className="feedback pool-withdraw-note"><Info size={15} /> Withdrawing while policies are active may be limited by reserved liabilities. Pool losses can reduce the redemption value of every share.</div>
        </aside>
      </div>
      {error && <div className="feedback feedback-error" role="alert">{error}</div>}
      {wallet.error && <div className="feedback feedback-error" role="alert">{wallet.error}</div>}
      {transactionPhase !== "IDLE" && <div className={`feedback ${transactionPhaseTone(transactionPhase) === "error" ? "feedback-error" : ""}`} role={transactionPhaseTone(transactionPhase) === "error" ? "alert" : "status"} aria-live="polite">
        {transactionPhase === "CONFIRMED" ? <CheckCircle2 size={15} /> : <Info size={15} />}
        <strong>{transactionLabel}: {transactionPhaseLabel[transactionPhase]}.</strong>{" "}
        {transactionError && <span>{transactionError}{" "}</span>}
        {transactionHash && <a href={"https://sepolia.basescan.org/tx/" + transactionHash} target="_blank" rel="noreferrer">Inspect on Base Sepolia ↗</a>}
        {transactionPhase === "CONFIRMED" && tx && <span> The receipt is confirmed; pool state is being re-read from Base Sepolia.</span>}
      </div>}
    </>
  );
}
