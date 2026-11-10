"use client";

import React, { createContext, useContext, useCallback, useEffect, useState } from "react";
import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { baseSepolia } from "viem/chains";
import { BRADBURY_CHAIN_ID } from "@/lib/chain";

type WalletState = {
  address: `0x${string}` | null;
  chainId: number | null;
  authenticated: boolean;
  busy: boolean;
  error: string;
  connect: () => Promise<void>;
  signIn: () => Promise<void>;
  switchToBase: () => Promise<void>;
  disconnect: () => Promise<void>;
};
const WalletContext = createContext<WalletState | null>(null);

declare global {
  interface Window { ethereum?: EIP1193Provider & { on?: (name: string, cb: (...args: any[]) => void) => void; removeListener?: (name: string, cb: (...args: any[]) => void) => void } }
}

function injected() {
  if (typeof window === "undefined" || !window.ethereum) throw new Error("No injected EIP-1193 wallet was detected. On mobile, open COVRA in your wallet's in-app browser or enable an injected wallet browser extension.");
  return window.ethereum;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const clearAuth = useCallback(async () => {
    setAuthenticated(false);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  }, []);

  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;
    const onAccounts = (accounts: unknown) => {
      const next = Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] as `0x${string}` : null;
      setAddress(previous => {
        if (previous && next?.toLowerCase() !== previous.toLowerCase()) void clearAuth();
        return next;
      });
    };
    const onChain = (hex: unknown) => setChainId(typeof hex === "string" ? Number(BigInt(hex)) : null);
    provider.on?.("accountsChanged", onAccounts);
    provider.on?.("chainChanged", onChain);
    void provider.request({ method: "eth_accounts" }).then(onAccounts).catch(() => undefined);
    void provider.request({ method: "eth_chainId" }).then(onChain).catch(() => undefined);
    return () => {
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, [clearAuth]);

  useEffect(() => {
    if (!address) { setAuthenticated(false); return; }
    void fetch("/api/auth/me", { cache: "no-store" })
      .then(r => r.json())
      .then(v => setAuthenticated(Boolean(v.authenticated && v.wallet?.toLowerCase() === address.toLowerCase())))
      .catch(() => setAuthenticated(false));
  }, [address]);

  const connect = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const provider = injected();
      const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
      if (!accounts?.length) throw new Error("No wallet account was granted.");
      setAddress(accounts[0] as `0x${string}`);
      const id = await provider.request({ method: "eth_chainId" });
      setChainId(Number(BigInt(String(id))));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet connection failed");
      throw e;
    } finally { setBusy(false); }
  }, []);

  const signIn = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const provider = injected();
      const accounts = await provider.request({ method: "eth_requestAccounts" }) as string[];
      const wallet = accounts[0] as `0x${string}`;
      if (!wallet) throw new Error("Connect a wallet first.");
      const challenge = await fetch("/api/auth/nonce", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: wallet }),
      }).then(r => r.json());
      if (!challenge.message) throw new Error(challenge.error || "Challenge creation failed");
      const client = createWalletClient({ chain: baseSepolia, transport: custom(provider) });
      const signature = await client.signMessage({ account: wallet, message: challenge.message });
      const verified = await fetch("/api/auth/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: wallet, signature, message: challenge.message }),
      });
      const result = await verified.json();
      if (!verified.ok) throw new Error(result.error || "Signature verification failed");
      setAddress(wallet); setAuthenticated(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet authentication failed");
      throw e;
    } finally { setBusy(false); }
  }, []);

  const switchToBase = useCallback(async () => {
    setBusy(true); setError("");
    try {
      const provider = injected();
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x14a34" }] });
    } catch (e: unknown) {
      try {
        const provider = injected();
        if ((e as { code?: number }).code !== 4902) throw e;
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: "0x14a34", chainName: "Base Sepolia",
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: ["https://sepolia.base.org"],
            blockExplorerUrls: ["https://sepolia.basescan.org"],
          }],
        });
      } catch (nested) {
        setError(nested instanceof Error ? nested.message : "Unable to switch the wallet to Base Sepolia.");
        throw nested;
      }
    } finally {
      setBusy(false);
    }
    setChainId(84532);
  }, []);

  const disconnect = useCallback(async () => {
    await clearAuth();
    setAddress(null);
    // Wallet providers control their own connection state. COVRA cannot forcibly
    // revoke MetaMask permissions; this explicitly ends the app session.
  }, [clearAuth]);

  return (
    <WalletContext.Provider value={{
      address, chainId, authenticated, busy, error, connect, signIn,
      switchToBase, disconnect,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be rendered inside WalletProvider");
  return value;
}
export const compactAddress = (address: string) => address.slice(0, 6) + "…" + address.slice(-4);
