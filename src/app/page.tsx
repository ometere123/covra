import Link from "next/link";
import {
  ArrowRight, ArrowUpRight, ShieldCheck, Activity, Bot, ArrowDownRight,
  FileCheck2, Landmark, Network, Blocks, Radar, LockKeyhole, Globe2
} from "lucide-react";
import { Brand } from "@/components/brand";
import { WalletButton } from "@/components/wallet-button";
import { ProtocolStateVisual } from "@/components/protocol-state-visual";
import { coverages } from "@/lib/catalog";

const symbols = [Bot, Activity, ShieldCheck, Blocks, Radar];

export default function Home() {
  return (
    <div className="marketing-page">
      <div className="marketing-announcement">
        <span className="announcement-dot" /> BUILT FOR THE AGENT ECONOMY
        <span className="announcement-line"/> LIVE PRODUCT DEVELOPMENT ON BRADBURY PHASE 2
      </div>
      <header className="marketing-nav container">
        <Brand/>
        <nav aria-label="Site navigation">
          <a href="#coverage">Coverage</a><Link href="/demo">Live demo</Link><a href="#how-it-works">How it works</a>
          <Link href="/underwrite">Underwriters</Link><Link href="/developers">Developers</Link>
        </nav>
        <div className="marketing-nav-actions"><WalletButton/><Link className="nav-cta" href="/app">Open app <ArrowUpRight size={15}/></Link></div>
      </header>
      <main>
        <section className="hero container">
          <div className="hero-main">
            <div className="eyebrow"><span className="eyebrow-cross">✳</span> THE INFRASTRUCTURE OF ASSURANCE <span className="eyebrow-index">/ 001</span></div>
            <h1>Autonomy,<br/>with a <em>backstop.</em></h1>
            <p className="hero-description">AI agents move at machine speed. Trust shouldn’t be left behind. COVRA brings evidence-based coverage, intelligent adjudication and transparent USDC reserves to autonomous commerce.</p>
            <div className="hero-actions"><Link className="button-primary" href="/app/quote">Explore coverage <ArrowUpRight size={18}/></Link><Link className="button-text" href="/developers">Read the protocol <ArrowRight size={17}/></Link></div>
            <div className="hero-trust"><span><ShieldCheck size={15}/> Five risk classes</span><span><Network size={15}/> GenLayer consensus</span><span><Landmark size={15}/> Base USDC reserves</span></div>
          </div>
          <div className="hero-visual" aria-label="Protocol state schematic">
            <ProtocolStateVisual />
          </div>
          <div className="hero-caption">THE NEW RISK STACK <ArrowDownRight size={24}/></div>
        </section>
        <section className="metric-band"><div className="container metric-band-inner"><div><span>OUR PRINCIPLE</span><strong>More autonomy. Less uncertainty.</strong></div><p>Capital is transparent. Evidence is independently reviewed. Every settlement has a traceable reason.</p><span className="metric-band-index">CV / 26</span></div></section>
        <section id="coverage" className="coverage-section container">
          <div className="section-topline"><span>01 / WHAT WE COVER</span><span>FIVE DISTINCT RISK CLASSES</span></div>
          <div className="section-heading-row"><h2>Built for things<br/><em>that can go wrong.</em></h2><p>From a missed delivery to a DeFi incident, every risk has its own terms, evidence requirements, capital reserve and claim logic.</p></div>
          <div className="coverage-grid">
            {coverages.map((coverage, index) => {
              const Icon = symbols[index];
              return (
                <Link href={"/app/coverage?risk=" + coverage.slug} className={"coverage-tile coverage-tone-" + coverage.tone} key={coverage.id}>
                  <div className="tile-top"><span>0{index + 1} / 05</span><ArrowUpRight size={20}/></div>
                  <div className="tile-icon"><Icon size={31} strokeWidth={1.5}/></div>
                  <h3>{coverage.name}</h3><p>{coverage.short}</p>
                  <div className="tile-bottom"><span>{coverage.signal}</span><span>EXPLORE <ArrowRight size={13}/></span></div>
                </Link>
              );
            })}
          </div>
        </section>
        <section id="how-it-works" className="process-section"><div className="container">
          <div className="section-topline section-topline-inverse"><span>02 / THE MECHANISM</span><span>NOT ANOTHER INSURANCE CHATBOT</span></div>
          <div className="process-heading"><h2>Designed for<br/><em>decision integrity.</em></h2><p>People set limits. Agents operate within them. Validators examine evidence. Capital moves only when the settlement conditions are met.</p></div>
          <div className="process-steps">
            {[
              { n: "01", title: "Define the mandate", text: "Owners authorize agents with explicit coverage and spending boundaries.", icon: LockKeyhole },
              { n: "02", title: "Reserve the capital", text: "USDC underwriters fund separated pools. Policies cannot exceed usable reserves.", icon: Landmark },
              { n: "03", title: "Examine the facts", text: "GenLayer evaluates a covered event against verifiable external evidence.", icon: FileCheck2 },
              { n: "04", title: "Settle with a record", text: "Independent finality attestations authorize a bounded Base USDC payout.", icon: Globe2 },
            ].map((step) => <div className="process-step" key={step.n}>
              <div className="process-step-top"><span>{step.n}</span><step.icon size={28} strokeWidth={1.3}/></div>
              <h3>{step.title}</h3><p>{step.text}</p>
            </div>)}
          </div>
        </div></section>
        <section className="audience-section container">
          <div className="audience-title"><span>03 / WHO COVRA IS FOR</span><h2>One system.<br/><em>Three perspectives.</em></h2></div>
          <div className="audience-grid">
            <Link href="/app/agents" className="audience-card"><span>AGENT OPERATORS</span><Bot size={33}/><h3>Operate with guardrails.</h3><p>Register agents, manage their spending authority and bring coverage into every workflow.</p><strong>Manage agents <ArrowUpRight size={17}/></strong></Link>
            <Link href="/app/claims" className="audience-card"><span>POLICY HOLDERS</span><ShieldCheck size={33}/><h3>Know where you stand.</h3><p>Track terms, monitor covered incidents, submit evidence and see the reason behind decisions.</p><strong>Explore claims <ArrowUpRight size={17}/></strong></Link>
            <Link href="/underwrite" className="audience-card"><span>CAPITAL PROVIDERS</span><Landmark size={33}/><h3>Underwrite transparently.</h3><p>See ring-fenced exposure, utilization, premiums and payout history before allocating capital.</p><strong>Explore underwriting <ArrowUpRight size={17}/></strong></Link>
          </div>
        </section>
        <section className="cta-section container"><div><span>IT'S TIME TO BUILD TRUST INTO THE STACK.</span><h2>The agent economy<br/>needs <em>accountability.</em></h2><p>Explore the COVRA testnet experience. Real-money coverage is not yet available.</p><Link href="/app" className="button-light">Enter the workspace <ArrowUpRight size={18}/></Link></div><div className="cta-symbol" aria-hidden="true"><span className="cta-symbol-ring"><span className="cta-symbol-center">C</span></span></div></section>
      </main>
      <footer className="marketing-footer container"><Brand/><p>Agent-native coverage infrastructure.<br/>Built for accountable autonomy.</p><div><Link href="/developers">Developers</Link><Link href="/demo">Public demo</Link><Link href="/case-study/first-pilot">First pilot</Link><Link href="/underwrite">Underwriters</Link><Link href="/app">Workspace</Link></div><span>© 2026 COVRA. TESTNET / NO REAL-MONEY INSURANCE.</span></footer>
    </div>
  );
}
