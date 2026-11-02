"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutGrid, ShieldCheck, FileText, ClipboardCheck, Landmark, Bot, Waves,
  Settings2, ArrowUpRight, PanelLeftClose, ArrowRight, Radar, Menu, X, FlaskConical
} from "lucide-react";
import { useState } from "react";
import { Brand } from "./brand";
import { WalletButton } from "./wallet-button";

const nav = [
  { href: "/app", label: "Overview", icon: LayoutGrid },
  { href: "/app/coverage", label: "Coverage", icon: ShieldCheck },
  { href: "/app/quote", label: "Get covered", icon: Radar },
  { href: "/app/policies", label: "My policies", icon: FileText },
  { href: "/app/claims", label: "Claims desk", icon: ClipboardCheck },
  { href: "/app/pools", label: "Capital pools", icon: Landmark },
  { href: "/app/agents", label: "My agents", icon: Bot },
  { href: "/app/activity", label: "Activity", icon: Waves },
];
const utility = [{ href: "/app/settings", label: "Settings", icon: Settings2 }];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const current = [...nav, ...utility].find(item => item.href === pathname)?.label || "Overview";
  return (
    <div className="app-layout">
      {mobileOpen && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMobileOpen(false)} />}
      <aside className={"app-sidebar " + (mobileOpen ? "sidebar-mobile-open" : "")}>
        <div className="sidebar-header"><Brand light /><button className="sidebar-close" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={18}/></button></div>
        <div className="sidebar-workspace"><span className="sidebar-workspace-icon">C</span><span><strong>Covra Workspace</strong><small>Testnet environment</small></span><PanelLeftClose size={15}/></div>
        <nav className="sidebar-nav" aria-label="Primary navigation">
          <div className="sidebar-label">WORKSPACE</div>
          {nav.map(item => {
            const Icon = item.icon;
            const selected = item.href === pathname;
            return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={"nav-item " + (selected ? "nav-item-active" : "")}>
              <Icon size={17} strokeWidth={1.7}/><span>{item.label}</span>{selected && <span className="nav-active-dot"/>}
            </Link>;
          })}
          <div className="sidebar-label sidebar-label-spaced">MANAGE</div>
          {utility.map(item => {
            const Icon = item.icon;
            return <Link key={item.href} href={item.href} onClick={() => setMobileOpen(false)} className={"nav-item " + (pathname === item.href ? "nav-item-active" : "")}>
              <Icon size={17}/>{item.label}
            </Link>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-callout"><FlaskConical size={19}/><strong>Built for the frontier.</strong><span>Evidence-led coverage for an autonomous world.</span><Link href="/developers">Explore the protocol <ArrowUpRight size={13}/></Link></div>
          <div className="sidebar-network"><span className="network-pulse"/> BRADBURY PHASE 2 <span className="network-sep"/> BASE SEPOLIA</div>
        </div>
      </aside>
      <div className="app-main">
        <header className="app-topbar">
          <div className="topbar-left">
            <button className="mobile-menu-button" aria-label="Open navigation" onClick={() => setMobileOpen(true)}><Menu size={21}/></button>
            <span className="breadcrumb-home">WORKSPACE</span><span className="breadcrumb-slash">/</span><span className="breadcrumb-current">{current.toUpperCase()}</span>
          </div>
          <div className="topbar-right"><span className="testnet-pill"><span/> TESTNET</span><WalletButton/></div>
        </header>
        <div className="app-canvas">{children}</div>
        <footer className="app-footer"><span>© COVRA 2026 · Testnet infrastructure, not a regulated insurance offer.</span><Link href="/developers">Developer documentation <ArrowRight size={13}/></Link></footer>
      </div>
    </div>
  );
}
