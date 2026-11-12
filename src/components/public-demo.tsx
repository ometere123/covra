import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, CircleAlert, ExternalLink, LockKeyhole, Radio, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { publicCoverageClasses, publicPilot } from "@/lib/public-demo";
import type { ProtocolStatus } from "@/lib/protocol-status";

const baseExplorer = "https://sepolia.basescan.org";
const bradburyExplorer = "https://scan.testnet-chain.genlayer.com";

function shortHash(value: string) {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function dateLabel(value: string) {
  return `${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value))} UTC`;
}

function moneyFromMicro(value: string) {
  return `$${(Number(value) / 1_000_000).toFixed(2)}`;
}

function deploymentLabel(status: ProtocolStatus | null, kind: "pool" | "adjudicator") {
  if (!status) return "UNAVAILABLE";
  const state = status[kind].state;
  if (state === "DEPLOYED_UNFUNDED") return "DEPLOYED / UNFUNDED";
  if (state === "DEPLOYED") return "DEPLOYED";
  if (state === "LOADING") return "VERIFYING";
  return "UNAVAILABLE";
}

function DemoHeader({ current }: { current: "demo" | "case-study" }) {
  return (
    <header className="public-demo-header container">
      <Brand />
      <nav aria-label="Public demonstration navigation">
        <Link className={current === "demo" ? "public-demo-nav-active" : ""} href="/demo">Protocol tour</Link>
        <Link className={current === "case-study" ? "public-demo-nav-active" : ""} href="/case-study/first-pilot">First pilot</Link>
        <Link href="/developers">Developers</Link>
      </nav>
      <Link className="public-demo-workspace" href="/app">Open workspace <ArrowUpRight size={14} /></Link>
    </header>
  );
}
function DemoFooter() {
  return (
    <footer className="public-demo-footer container">
      <Brand />
      <p>Read-only public record. Testnet infrastructure, not a regulated insurance offer.</p>
      <Link href="/">COVRA home <ArrowRight size={13} /></Link>
    </footer>
  );
}

function LiveStatus({ status }: { status: ProtocolStatus | null }) {
  const statusMessage = status?.settlement.message ?? "Live protocol verification could not complete for this request.";
  return (
    <section className="public-demo-live" aria-label="Live protocol verification">
      <div className="public-demo-live-heading"><Radio size={16} /> LIVE READ-ONLY VERIFICATION</div>
      <div className="public-demo-live-grid">
        <div><span>BASE SEPOLIA / 84532</span><strong>{deploymentLabel(status, "pool")}</strong><small>{status?.pool.message ?? "Chain read unavailable."}</small></div>
        <div><span>BRADBURY PHASE 2 / 4221</span><strong>{deploymentLabel(status, "adjudicator")}</strong><small>{status?.adjudicator.message ?? "Node read unavailable."}</small></div>
        <div><span>SETTLEMENT READINESS</span><strong>{status?.settlement.state.replaceAll("_", " ") ?? "UNAVAILABLE"}</strong><small>{statusMessage}</small></div>
      </div>
      <p className="public-demo-source-note">The deployment labels above come from fresh RPC checks, not environment-variable presence. If a chain read fails, COVRA shows unavailable.</p>
    </section>
  );
}

function RecordLink({ hash, chain }: { hash: string; chain: "base" | "bradbury" }) {
  const href = chain === "base" ? `${baseExplorer}/tx/${hash}` : bradburyExplorer;
  return <a className="public-record-link" href={href} target="_blank" rel="noreferrer"><code>{shortHash(hash)}</code><ExternalLink size={12} /></a>;
}

function AddressRecord({ label, value, href }: { label: string; value: string; href?: string }) {
  return <div className="public-address-record"><span>{label}</span>{href ? <a href={href} target="_blank" rel="noreferrer"><code>{shortHash(value)}</code><ExternalLink size={12} /></a> : <code>{shortHash(value)}</code>}</div>;
}

const pilotReceiptRows = [
  { label: "Base pool deposit", hash: publicPilot.receipts.poolDeposit, chain: "base" as const },
  { label: "Policy purchase", hash: publicPilot.receipts.policyPurchase, chain: "base" as const },
  { label: "Base claim lock", hash: publicPilot.receipts.baseClaimLock, chain: "base" as const },
  { label: "Bradbury submit_case", hash: publicPilot.receipts.bradburySubmit, chain: "bradbury" as const },
  { label: "Bradbury adjudicate", hash: publicPilot.receipts.bradburyAdjudicate, chain: "bradbury" as const },
] as const;

export function PublicDemo({ status }: { status: ProtocolStatus | null }) {
  return (
    <div className="public-demo-page">
      <DemoHeader current="demo" />
      <main>
        <section className="public-demo-hero container">
          <div>
            <div className="eyebrow"><span className="eyebrow-cross">✳</span> COVRA / READ-ONLY PROTOCOL TOUR <span className="eyebrow-index">/ LIVE TESTNET</span></div>
            <h1>See the record<br /><em>before the promise.</em></h1>
            <p>Explore the five risk classes, the two-chain trust boundary and the first real COVRA pilot. This page is wallet-optional: every transaction shown is a verified testnet record, and every unavailable state stays visible.</p>
            <div className="public-demo-hero-actions"><Link className="button-primary" href="/case-study/first-pilot">Read the first pilot <ArrowUpRight size={17} /></Link><Link className="button-text" href="/app/coverage">Explore coverage <ArrowRight size={16} /></Link></div>
          </div>
          <div className="public-demo-hero-aside">
            <span>THE HONEST STATE</span>
            <strong>{publicPilot.decision.replaceAll("_", " ")}</strong>
            <p>The first policy reached Bradbury adjudication. No payout was authorized because the source was controlled and operator independence was not verified.</p>
            <div className="public-demo-aside-rule"><span>Wallet required</span><b>NO</b></div>
            <div className="public-demo-aside-rule"><span>Testnet assets</span><b>USDC / GEN</b></div>
          </div>
        </section>

        <div className="container"><LiveStatus status={status} /></div>

        <section className="public-demo-section container">
          <div className="public-demo-section-label"><span>01 / THE RISK MAP</span><span>FIVE FROZEN CLASSES</span></div>
          <div className="public-demo-section-heading"><h2>Each exposure<br /><em>has its own proof.</em></h2><p>Coverage is not a generic “AI claim.” Each class freezes a subject, objective facts, exclusions, payout rule and evidence boundary before a policy can be purchased.</p></div>
          <div className="public-risk-list">
            {publicCoverageClasses.map((risk) => <article className="public-risk-row" key={risk.id}>
              <span className="public-risk-number">0{risk.id + 1}</span>
              <div><h3>{risk.name}</h3><p>{risk.short}</p></div>
              <div><span>TRIGGER</span><p>{risk.objectiveRule}</p></div>
              <div><span>EVIDENCE</span><p>{risk.evidence.join(" · ")}</p></div>
              <div><span>PAYOUT</span><p>{risk.payoutRule}</p></div>
            </article>)}
          </div>
        </section>

        <section className="public-demo-dark-section">
          <div className="container">
            <div className="public-demo-section-label public-demo-section-label-dark"><span>02 / HOW THE RECORD MOVES</span><span>FAIL CLOSED</span></div>
            <div className="public-demo-section-heading public-demo-section-heading-dark"><h2>Capital, evidence,<br /><em>decision, restraint.</em></h2><p>Base holds the asset. Bradbury evaluates the evidence. A trusted 3-of-5 quorum is the explicit bridge. No single API response or GenLayer status can transfer USDC.</p></div>
            <ol className="public-flow">
              {[
                ["01", "Fund the class", "Circle test USDC enters the selected Base pool and reserve capacity is visible."],
                ["02", "Freeze the terms", "The quote binds policy, risk specification, evidence host, beneficiary and deadlines."],
                ["03", "Review the facts", "Bradbury validators retrieve the exact public bytes and return a bounded decision."],
                ["04", "Require finality", "The appeal window and finalization are separate from transaction acceptance."],
                ["05", "Authorize settlement", "Only exact 3-of-5 signatures can authorize a covered payment or denial release."],
              ].map(([number, title, text]) => <li key={number}><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></li>)}
            </ol>
          </div>
        </section>

        <section className="public-demo-section container">
          <div className="public-demo-section-label"><span>03 / VERIFIED DEPLOYMENTS</span><span>NO WALLET NEEDED</span></div>
          <div className="public-record-layout">
            <div><h2>Two chains.<br /><em>One boundary.</em></h2><p className="public-demo-copy">These addresses are from finalized deployment records and are checked again by the live status panel above.</p></div>
            <div className="public-address-list">
              <AddressRecord label="Base pool / 84532" value={publicPilot.basePool} href={`${baseExplorer}/address/${publicPilot.basePool}`} />
              <AddressRecord label="Circle test USDC" value={publicPilot.usdc} href={`${baseExplorer}/address/${publicPilot.usdc}`} />
              <AddressRecord label="Bradbury adjudicator / 4221" value={publicPilot.adjudicator} />
              <AddressRecord label="Evidence issuer wallet" value={publicPilot.evidenceIssuerWallet} />
            </div>
          </div>
          <div className="public-deployment-proof">
            <span>BASE CREATION</span><code>{shortHash(publicPilot.deployment.baseTransaction)}</code><span>BLOCK {publicPilot.deployment.baseBlock}</span><a href="https://repo.sourcify.dev/84532/0xD8619d3948c08c8364fD3a7a35Dc8a65B254A8e4" target="_blank" rel="noreferrer">Exact source match <ExternalLink size={12} /></a>
            <span>BRADBURY CREATION</span><code>{shortHash(publicPilot.deployment.bradburyTransaction)}</code><span>FINALIZED / FINISHED WITH RETURN</span><a href={bradburyExplorer} target="_blank" rel="noreferrer">Open explorer <ExternalLink size={12} /></a>
          </div>
        </section>

        <section className="public-demo-callout container">
          <ShieldCheck size={23} /><div><strong>First pilot: a real negative decision.</strong><p>The public case study records the actual policy, lock, evidence digest, Bradbury transactions and reconciliation result. It does not turn a controlled testbed into independent evidence or a payout.</p></div><Link href="/case-study/first-pilot">Open case study <ArrowRight size={15} /></Link>
        </section>
      </main>
      <DemoFooter />
    </div>
  );
}
export function FirstPilotCaseStudy({ status }: { status: ProtocolStatus | null }) {
  const steps = [
    { label: "Task frozen", detail: `The signed task agreement committed ${shortHash(publicPilot.taskHash)} before the ${dateLabel(publicPilot.taskDeadline)} deadline.`, state: "VERIFIED RECORD" },
    { label: "Policy purchased", detail: `${moneyFromMicro(publicPilot.poolDepositUsd)} entered the class-0 pool for $${publicPilot.coverageUsd.toFixed(2)} coverage and a $${publicPilot.premiumUsd.toFixed(2)} premium.`, state: "BASE / CONFIRMED" },
    { label: "Claim locked", detail: `Claim ${shortHash(publicPilot.claimId)} locked the evidence digest on Base before adjudication.`, state: "BASE / CONFIRMED" },
    { label: "Evidence published", detail: `The ${publicPilot.evidenceMode} envelope is retrievable over HTTPS and recovers to the dedicated issuer wallet.`, state: "SIGNATURE VERIFIED" },
    { label: "Bradbury decided", detail: `Both writes finalized with FinishedWithReturn. The result was ${publicPilot.decision.replaceAll("_", " ")}.`, state: "BRADBURY / FINALIZED" },
    { label: "Settlement withheld", detail: "No eligible COVERED or NOT_COVERED decision exists. Base correctly rejected unsupported settlement paths.", state: "NO PAYOUT" },
  ];

  return (
    <div className="public-demo-page public-case-study-page">
      <DemoHeader current="case-study" />
      <main>
        <section className="public-case-hero container">
          <Link className="public-back-link" href="/demo"><ArrowLeft size={14} /> Back to protocol tour</Link>
          <div className="eyebrow">COVRA / CASE STUDY 001 <span className="eyebrow-index">/ 11 NOV 2026</span></div>
          <h1>The first pilot<br /><em>said not yet.</em></h1>
          <p>A complete testnet policy and claim reached GenLayer adjudication. The system accepted the evidence envelope, inspected its provenance and withheld settlement when independence could not be established.</p>
          <div className="public-case-status"><CircleAlert size={17} /><span><strong>INSUFFICIENT EVIDENCE</strong> · No payout authorized</span></div>
        </section>

        <div className="container"><LiveStatus status={status} /></div>

        <section className="public-demo-section container">
          <div className="public-demo-section-label"><span>01 / THE PILOT IN ONE VIEW</span><span>CLASS 0 / SERVICE FAILURE</span></div>
          <div className="public-case-summary">
            <div><span>POLICY ID</span><code>{shortHash(publicPilot.policyId)}</code><small>{publicPilot.coverageUsd} USDC limit · {publicPilot.premiumUsd} USDC premium · one day</small></div>
            <div><span>CLAIM ID</span><code>{shortHash(publicPilot.claimId)}</code><small>Roster version 1 · revision 0</small></div>
            <div><span>DECISION</span><strong>{publicPilot.decision.replaceAll("_", " ")}</strong><small>{publicPilot.decisionReason}</small></div>
          </div>
          <div className="public-case-terms"><span>FROZEN SUBJECT</span><code>{publicPilot.taskId}</code><span>TASK HASH</span><code>{shortHash(publicPilot.taskHash)}</code><span>TERMS HASH</span><code>{shortHash(publicPilot.termsHash)}</code><span>RISK HASH</span><code>{shortHash(publicPilot.riskSpecHash)}</code></div>
        </section>

        <section className="public-demo-dark-section">
          <div className="container">
            <div className="public-demo-section-label public-demo-section-label-dark"><span>02 / RECEIPT-LEVEL TIMELINE</span><span>NOT A SIMULATION</span></div>
            <ol className="case-timeline">
              {steps.map((step, index) => <li key={step.label}><span className="case-timeline-index">0{index + 1}</span><div className="case-timeline-copy"><span>{step.state}</span><h3>{step.label}</h3><p>{step.detail}</p></div></li>)}
            </ol>
          </div>
        </section>

        <section className="public-demo-section container">
          <div className="public-demo-section-label"><span>03 / THE ACTUAL RECORD</span><span>OPEN RECEIPTS</span></div>
          <div className="public-record-table" role="table" aria-label="First pilot transaction receipts">
            {pilotReceiptRows.map(({ label, hash, chain }) => {
              return <div className="public-record-row" role="row" key={label}><span role="cell">{label}</span><span role="cell"><RecordLink hash={hash} chain={chain} /></span><span role="cell">{chain === "base" ? "BASE SEPOLIA" : "BRADBURY PHASE 2"}</span></div>;
            })}
          </div>
          <div className="public-evidence-grid">
            <div><span>EVIDENCE ENVELOPE</span><a href={publicPilot.evidenceUrl} target="_blank" rel="noreferrer"><code>{shortHash(publicPilot.evidenceDigest)}</code><ExternalLink size={12} /></a><p>Issuer signature and raw origin digest verified. The issuer and origin workflow are COVRA-controlled.</p></div>
            <div><span>OBSERVER COMMIT</span><a href={publicPilot.evidenceOriginUrl} target="_blank" rel="noreferrer"><code>{shortHash(publicPilot.evidenceCommit)}</code><ExternalLink size={12} /></a><p>Immutable public observation bytes used by the evidence envelope.</p></div>
          </div>
        </section>

        <section className="public-reserve-section container">
          <div><div className="public-demo-section-label"><span>04 / RESERVED CAPITAL</span><span>LIVE BASE READBACK</span></div><h2>The reserve is<br /><em>still locked.</em></h2><p>At the latest read, class 0 holds 100 USDC assets and 100 USDC reserved against this active policy. The lock remains visible on Base; no payout or release transaction has been made.</p></div>
          <div className="public-reserve-panel"><div><span>POLICY STATE</span><strong>ACTIVE / 1</strong></div><div><span>RESERVED</span><strong>$100.00</strong></div><div><span>PAID</span><strong>$0.00</strong></div><div><span>EARLIEST RELEASE</span><strong>{dateLabel(publicPilot.claimResolutionDeadline)}</strong></div><p><LockKeyhole size={15} /> The contract’s permissionless <code>releaseExpired(policyId)</code> path becomes eligible only after the claim-resolution deadline, unless a valid settlement occurs first. It releases reserve accounting; it is not a payout.</p></div>
        </section>

        <section className="public-demo-section container">
          <div className="public-demo-section-label"><span>05 / WHAT THE RESULT MEANS</span><span>BOUNDARIES MATTER</span></div>
          <div className="public-two-column">
            <div><h2>Proven by the record.</h2><ul className="public-check-list"><li><Check size={16} /> Base USDC entered the correct ring-fenced pool.</li><li><Check size={16} /> The policy and claim were bound to exact hashes.</li><li><Check size={16} /> The issuer envelope was signed and independently recovered.</li><li><Check size={16} /> Bradbury submitted and adjudicated with finalized execution results.</li><li><Check size={16} /> Supabase reconciliation found zero policy/claim mismatches.</li></ul></div>
            <div><h2>Not proven by it.</h2><ul className="public-limit-list"><li>It is not independent real-world evidence: the source workflow was controlled by COVRA.</li><li>It is not independently operated attestation: functional test keys share custody.</li><li>It is not a payout: <code>INSUFFICIENT_EVIDENCE</code> is fail-closed and not settleable.</li><li>It is not commercial insurance or underwriting approval.</li></ul></div>
          </div>
        </section>

        <section className="public-demo-callout container"><ShieldCheck size={23} /><div><strong>Read the protocol, then inspect the app.</strong><p>The workspace remains wallet-enabled for authorized testnet operations. This case study intentionally requires no wallet and makes no claim about a connected account.</p></div><Link href="/app">Open workspace <ArrowRight size={15} /></Link></section>
      </main>
      <DemoFooter />
    </div>
  );
}

