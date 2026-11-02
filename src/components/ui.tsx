import type { ReactNode } from "react";
import { ArrowUpRight, Info, Plus, Radio } from "lucide-react";
import Link from "next/link";

export function PageHeading({ eyebrow, title, subtitle, action }: {
  eyebrow: string; title: string; subtitle: string; action?: { label: string; href: string };
}) {
  return (
    <div className="page-header">
      <div><div className="page-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>
      {action && <Link className="header-action" href={action.href}>{action.label}<ArrowUpRight size={15}/></Link>}
    </div>
  );
}
export function TestnetNotice({ text }: { text: string }) {
  return <div className="testnet-notice" role="status"><Radio size={17}/><span><strong>Testnet only</strong> · {text}</span></div>;
}
export function SyncNotice({ text }: { text: string }) {
  return <div className="sync-notice" role="status"><Info size={17}/><span>{text}</span></div>;
}
export function Panel({ title, sub, action, children }: {
  title: string; sub?: string; action?: { label: string; href: string }; children: ReactNode;
}) {
  return <div className="panel"><div className="panel-header"><strong>{title}</strong>{action ? <Link href={action.href}>{action.label}<ArrowUpRight size={13}/></Link> : <span>{sub}</span>}</div>{children}</div>;
}
export function EmptyState({ title, text, action }: { title: string; text: string; action?: { label: string; href: string } }) {
  return <div className="empty-state"><Info size={26}/><strong>{title}</strong><p>{text}</p>{action && <Link className="secondary-action" href={action.href}><Plus size={14}/>{action.label}</Link>}</div>;
}
export function StatusTag({ children, variant = "verified" }: { children: ReactNode; variant?: "verified" | "pending" | "decision" }) {
  return <span className={"status-tag " + (variant === "pending" ? "status-tag-pending" : variant === "decision" ? "status-tag-decision" : "")}>{children}</span>;
}
