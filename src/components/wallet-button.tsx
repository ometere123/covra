"use client";
import { useState } from "react";
import { ChevronDown, Wallet, Check, LogOut, ShieldCheck } from "lucide-react";
import { compactAddress, useWallet } from "./wallet-provider";

export function WalletButton({ dark = false }: { dark?: boolean }) {
  const wallet = useWallet();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const action = async (run: () => Promise<void>) => {
    try { setFeedback(""); await run(); setOpen(false); } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Wallet action failed");
    }
  };
  return (
    <div className={"wallet-wrap " + (dark ? "wallet-on-dark" : "")}>
      <button type="button" className="wallet-main" onClick={() => wallet.address ? setOpen(!open) : action(wallet.connect)}>
        <Wallet size={16} strokeWidth={1.8}/>
        <span>{wallet.address ? compactAddress(wallet.address) : wallet.busy ? "Connecting" : "Connect wallet"}</span>
        {wallet.address && <ChevronDown size={14}/>}
      </button>
      {open && wallet.address && (
        <div className="wallet-popover">
          <div className="wallet-popover-header">WALLET SESSION</div>
          <div className="wallet-ident">{compactAddress(wallet.address)}</div>
          <div className="wallet-status"><span className={wallet.chainId === 84532 ? "dot-network" : "dot-orange"}/>
            {wallet.chainId === 84532 ? "Base Sepolia" : wallet.chainId === 4221 ? "Bradbury Phase 2" : "Switch to Base Sepolia"}
          </div>
          {wallet.chainId !== 84532 && <button onClick={() => action(wallet.switchToBase)}>Switch to Base Sepolia</button>}
          {!wallet.authenticated ? (
            <button onClick={() => action(wallet.signIn)}><ShieldCheck size={15}/> Sign in to COVRA</button>
          ) : <div className="wallet-confirmed"><Check size={15}/> Verified session</div>}
          <button onClick={() => action(wallet.disconnect)}><LogOut size={15}/> End app session</button>
          {feedback && <p className="wallet-feedback">{feedback}</p>}
        </div>
      )}
      {feedback && !open && <div className="wallet-flash">{feedback}</div>}
    </div>
  );
}
