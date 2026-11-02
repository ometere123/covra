# Five risk classes — research terms register

> All figures and scenarios are illustrative. This is **not** an insurance policy, legally binding wording, commercial quote, risk certification or actuarial rate. Each risk class needs professional legal definitions, external evidence sources and an accredited underwriting partner before public use.

## 01 / Service failure

**Trigger concept**: An agent fails an objectively specified, signed service obligation by a declared deadline, with independently verifiable delivery logs and artifact criteria.

- Evidence: signed task specification, immutable task receipt, deadline/execution attestations.
- Excluded: no signed service agreement; owner-initiated cancellation or intervention outside the cover.
- Testnet max duration: **90 days**; simulated annual premium rate: **250 basis points**.
- Claim standard: not mere dissatisfaction; independent verification of the contractual result.

## 02 / Dependency outage

**Trigger concept**: A specifically listed upstream inference, tool, hosted API or infrastructure provider fails a declared availability threshold during a policy period.

- Evidence: eligible-provider registry, independent probes, corroborating public status reports.
- Excluded: self-induced downtime; unlisted or unverifiable providers.
- Testnet max duration: **180 days**; simulated annual premium rate: **180 bps**.
- Claim standard: measured provider unavailability beyond agreed measurement window.

## 03 / Execution error

**Trigger concept**: An agent demonstrably exceeds a signed mandate or executes a forbidden parameter/action, directly causing a defined, evidenced loss.

- Evidence: signed owner mandate and limits, durable tool-call/transaction trace, resulting-state proof.
- Excluded: actions within authorization; unverifiable subjective intent; owner-agent collusion.
- Testnet max duration: **90 days**; simulated annual premium rate: **420 bps**.
- Claim standard: causation, independent authorization proof and anti-collusion review.

## 04 / DeFi protection

**Trigger concept**: A prespecified named protocol suffers a covered exploit, bridge compromise or measured sustained depeg; the autonomous agent's authorized position is affected.

- Evidence: chain receipts and on-chain event logs, approved oracle measures, independent incident classification.
- Excluded: routine market losses, liquidation from authorized leverage, excluded protocols.
- Testnet max duration: **45 days**; simulated annual premium rate: **600 bps**.
- Claim standard: covered event plus policy-specific exposure and measured direct loss.

## 05 / Business interruption

**Trigger concept**: A listed agent-dependent operation experiences a defined interruption attributable to a covered event, with evidenced operational and baseline metrics.

- Evidence: baseline business records, independent outage timeline, causation and attributable-loss proof.
- Excluded: hypothetical/speculative revenues, unrelated demand shifts, duplicate compensation.
- Testnet max duration: **120 days**; simulated annual premium rate: **360 bps**.
- Claim standard: documented measurable process interruption; no presumption of revenue.

## Shared frozen terms and insured exposure

Class ID maps to one of five immutable-at-purchase pool indices `0..4`. An executable quote binds both a class terms hash and a specific insured-risk SHA-256 digest (named subject, reference digest, scope statement, independently approved issuer host), owner, beneficiary, coverage class, premium, maximum limit, start/end and claim deadline. A claim must fall in the active term; one settlement per policy; payout cannot exceed limit. Evidence must be independently confirmed and final GenLayer decision additionally attested by 3 of 5 separate Base signer identities.

**Warning:** The current hash is an implementation-specific compact *testnet term schema* containing class and exclusions; it is not a complete legally binding coverage wording or proof that a customer read the full contract. Expanded insurer-approved wording requires a different terms digest and explicitly renewed customer acceptance. Existing signed policies must never be silently reinterpreted.

## Pricing (deterministic testnet protocol configuration)

`premium = max($1.00, ceil(coverageUsd in cents × classRateBps × termDays / (365 × 10000)) cents)`.

Limits: **$100 to $250,000**, class-specific maximum term; quote validity 10 minutes; 6-decimal USDC contract units. These prices are for protocol demonstration and **must not** be marketed as viable underwriting rates.
