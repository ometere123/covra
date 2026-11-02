# COVRA security model, threat register and responsible use

## This is not an audit

The Solidity contract compiles; that does **not** demonstrate that its cryptography, economics, bridging assumptions, liquidity invariants or adversarial behavior have been audited. This code must not receive real money or insurance premiums before independent smart-contract audit, economic analysis and applicable regulatory permission.

## Present safeguards

- Five separate USDC reserve/share accounts; a complete loss retires old shares on first recapitalization to avoid unearned legacy claims on fresh capital.
- Maximum policy limit reserved before accepting premium.
- EIP-712 quote domain includes Base chain ID and verifying contract.
- EIP-712 threshold decision domain includes source chain 4221, registered Bradbury adjudicator, claim and policy IDs, beneficiary and expiry.
- Insured-wallet-bound claim identifiers, frozen per-exposure SHA-256 policy digest, SHA-256 public evidence, signed issuer provenance checked by independent attestors, one appeal revision and distinct final negative settlements. An appeal requires the insured wallet or a currently authorized delegated agent; a former submitter and the contract administrator have no appeal override.
- Lower-half ECDSA signature validation, sorted distinct attestors, an exactly five-member active roster, delayed replacement only, and a claim-time roster-version snapshot so later rotation cannot retroactively change a claim's required signers.
- Quote signer separate from the owner/deployer role. Emergency pause blocks new purchases/claim intake but **does not block independently certified settlement** of existing claims.
- Safe ERC20 low-level call handling, token balance-difference checks on deposits and purchases, reentrancy lock.
- Session signed with server HMAC, short random nonce login challenge, httpOnly cookie, wallet signature verification.
- API keys stored only as a peppered SHA-256 digest, issued once, revocable, scoped, expiring and request-capped.
- Server-only Supabase secret and private bucket for claim evidence; 5MB maximum file payload; SHA-256 evidence hash.
- API routes check wallet ownership against policy read model for claims.
- An agent-issued quote and an on-chain delegated purchase both require the insured wallet to remain the payout beneficiary. An insured owner can choose another beneficiary only through direct purchase.
- One active intake per policy is enforced by PostgreSQL uniqueness, including under concurrent requests. A scoped claim agent cannot cancel the owner's intake; the owner may withdraw an unanchored draft only after verifying an unlocked Base state and acknowledging that a pending transaction cannot be cancelled by the API.
- GenLayer public-source allowlist, prompt treats retrieved evidence as untrusted, no LLM-generated payout command.
- Fee-aware Bradbury browser writes for claim submission, adjudication, appeal and finalization; exact receipt verification compares transaction ID, finalized status, execution result, recipient, method and every decoded argument. Independent attestor preflight verifies exact risk, issuer EIP-191 signature, Base claim lock and final Bradbury digest before any settlement authority is granted.
- The evidence issuer accepts only an operator-authorized public HTTPS source workflow; it never signs caller-supplied facts or assertions. It rejects credentials, non-HTTPS URLs, redirects, private-network destinations, oversized/non-JSON responses and source-host self-fetches. Public observations are canonical, signed, expiring and revocable. Shared Vercel hosting is an explicit non-independence limitation.
- The Base indexer has a lease, durable cursor, bounded range, replay mode, event idempotency, reorganization halt, run history and an administrator reconciliation report against 12-confirmed chain state.

## Threat scenarios and outstanding work

| Risk | What must be demonstrated before launch |
| --- | --- |
| Three verifier keys collude or are stolen | Three independent entities, hardware-backed isolated keys, rotation/drills, public accountability, insurance for operators |
| A false GenLayer verdict is attested | Each signer verifies actual finalized chain state, evidence source, appeal expiry, policy terms, severity/entitlement and amount independently |
| False but correctly hashed incident report | Every signer must verify approved issuer signatures/provenance and independently corroborate facts; hostname and hash **are not proof of truth** |
| Bradbury forks, reset or reorg | Pin correct chain genesis, define finality and checkpoint policy, support rollback, never sign unfinalized or invalidated cases |
| Base reorg causes false policy read model | Lifecycle indexer waits 12 blocks, checkpoints canonical block hash, serializes runs, records all relevant events and fails closed on detected reorg; deep-reorg rollback/reindex remains operator-approved work |
| GenLayer evidence private or unverifiable | Trustworthy public attestations, authenticated evidence providers, privacy-preserving proof design, claimant challenge |
| API origin/cookie or bearer-key attack | Production origin enforcement, CSP, CSRF testing, secret rotation, request rate limiting, credential abuse monitoring |
| Policy scope substitution or stale signed quote | Bind class terms hash and policy-specific risk digest in Base quote, policy and attestor decision; set short quote expiry; revoke compromised quote signer |
| LP insolvency and correlated incidents | Independent stress/capital reserve modeling, aggregate exposure ceilings, stop-loss/reinsurance, verified loss calculations |
| Token contract replaced/depegged | Pin official USDC per environment, verify on-chain code and token semantics, protocol/issuer disruption playbook |
| Gas griefing/transaction replacement | Fee-aware Bradbury v0.6 flows, bounded persistent checkpoints, retry/idempotence, exact receipt matching and robust mempool/finality tracking |
| Policyholder fraud/claim duplication | Cross-policy deduplication and causal audits, fraud detection with appeal and human review |
| Compromised delegated agent creates a nuisance claim | Revoke its API credential and both chain grants; insured owner can withdraw an unanchored draft after a verified unlocked Base state. Existing Base claim locks cannot be undone via this API. |
| Appeal succeeds on one network only | Bradbury-first appeal, persist finalized appeal receipt and pending digest, then revise Base; preflight both chain states on retry. A receipt must be recovered rather than a consumed revision repeated. Cross-chain atomicity is not provided. |
| File exfiltration/PII leakage | Explicit retention schedule, minimal PII, encryption at rest and optionally client-side, signed URLs, incident response |

## Owner / agent permissions

There are **three separate grants**: scoped REST/MCP API credentials, a Base onchain delegated purchase grant funded by the agent wallet (cumulative limit and expiry), and time-bounded independent claim-agent grants on Base/Bradbury for owner-authorized submission and evidence revision. None allows an agent to withdraw third-party LP capital. Revocation must be checked on both chains.

## Financial limitation

Underwriters receive nontransferable accounting shares, subject to full policy-reserve lock. No collateralization oracle, risk-weighted limit, catastrophe model, deductible calculation, legal claims adjuster, multi-chain bridge proof or insurer balance-sheet guarantee exists. Multiple correlated events can consume all of a coverage pool.

## Handling vulnerabilities

Do not share private keys, API secrets, session tokens or claimants' personally identifiable documents in an issue. Reproduce on a testnet and provide affected component, expected/actual behavior and a minimal non-sensitive report to the repository maintainer privately. Freeze live funds and pause the contract on confirmed critical issues.

## Claim operations and residual risk

- Payment can never be inferred merely from API status: the chain-proof endpoint checks 12-confirmed Base receipts, exact contract events and beneficiary, or finalized Bradbury case state. Bradbury receipt checks are structural rather than substring heuristics. Deep reorg rollback and correlation of a GenLayer transaction to its individual state mutation require additional live-node verification and integration tests.
- A hostname alone does not prove who published a report; the EIP-191 issuer wallet must be independently registered and its actual observation validated. Validators check syntax/identity, attestors check provenance/causation. A signer quorum can collude and is not a trustless bridge.
- The GenLayer adjudicator enforces the frozen evidence-issuer hostname on both submission and appeal. Independent attestor preflight also checks the incident timestamp against the Base policy's inception and expiration using a 12-confirmed block.
- Each claim preserves reserved funds for a bounded 45-day grace; independent 3-of-5 signatures can extend that grace to 105 days after the original deadline. During prolonged outages, deadline expiry remains a **known financial risk**.
- The `APPEAL_SYNC_PENDING` database state is an incomplete cross-chain update, not an appealed or settled claim. Database receipt replays preserve terminal `PAID`/`DENIED`/`EXPIRED` and finalized states; chain logs and paid USDC remain final authorities.
- Smart-contract audit, independent economic audit, external issuer SLA, secret custody drills, insurance underwriting authority and monitored operational controls remain prerequisites for any real-money exposure.
