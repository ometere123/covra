# COVRA — coverage for an autonomous world

**Agent-native risk coverage infrastructure · GenLayer Bradbury Phase 2 × USDC on Base Sepolia**

COVRA is a unified source repository for an agentic insurance experience: a branded website, owner and underwriter workspaces, agent credential management, wallet authentication, five coverage classes, signed policy quotes, USDC purchases, evidence-based claims intake, private storage, segregated underwriting pools, and GenLayer Intelligent Contract adjudication logic.

> **TESTNET / RESEARCH ONLY.** Provides no real insurance coverage. Not audited, licensed, actuarially validated or a promise of payout. The first funded Bradbury-to-Base pilot reached a finalized `INSUFFICIENT_EVIDENCE` **decision**, but its three-day appealable case remains `DECIDED` until the separately verified finalization window opens; no payout occurred. A genuine positive payout remains unverified. Do not collect customer premiums or advertise commercial coverage.

Current hosted product: [covra-lyart.vercel.app](https://covra-lyart.vercel.app). The wallet-optional [public protocol tour](https://covra-lyart.vercel.app/demo) and [first-pilot case study](https://covra-lyart.vercel.app/case-study/first-pilot) show only receipt-backed testnet state. Full Bradbury adjudicator: `0xaefc8672272392310a2ea102787e28bb1f34e1d3`, independently Finalized / FinishedWithReturn. Current Base Sepolia five-class pool: `0xd8619d3948c08c8364fd3a7a35dc8a65b254a8e4`, source exact-matched on Sourcify. The first class-0 pilot has 100 USDC reserved, 0 USDC paid, and an appealable `DECIDED` case whose finalized decision is `INSUFFICIENT_EVIDENCE`; no payout is claimed. Supabase Cron job 1 runs every five minutes and has verified HTTP 200 scheduled executions. See [current checkpoint](docs/EXECUTION_CHECKPOINT.md), [public operations runbook](docs/PUBLIC_DEMO_OPERATIONS.md) and [test report](docs/TEST_REPORT.md).

## All five coverages in one build

| Risk class | What is covered in the testnet model |
| --- | --- |
| Service failure | Objective delivery or task deadline breach |
| Dependency outage | Externally verifiable named provider/API outage |
| Execution error | Agent action outside a signed owner mandate |
| DeFi protection | Predeclared exploit, bridge, or threshold depeg event |
| Business interruption | Documented and attributable disruption to an agent-dependent operation |

Each class has distinct exclusions, required evidence, duration bounds and explicitly disclosed deterministic testnet rate settings, plus its **own** on-chain USDC capital/reserve account. See [coverage terms](docs/COVERAGE_TERMS.md).

## Implemented surfaces

- Editorial porcelain/oxide/ultramarine responsive landing page, five-coverage catalogue and developer page.
- Wallet-authenticated dashboard, quote configurator, owner policies, claim intake, private evidence uploads, scoped agent keys, capital pool console, activity and settings.
- Solidity CovraPools: five separate USDC collateral/reserve accounts, LP epoch write-off after total loss, exposure-bound signed policies, bounded claim-agent delegation, one evidence revision, 3-of-5 settlement and signed claim-reserve extensions. Pausing sales cannot block an accrued claim payout.
- Python `CovraAdjudicator`: pinned GenVM dependency, exact-source SHA-256 verification, class-specific mandatory facts, independent leader/validator assessment, case decisions, **three-day appeal window**, explicit finalization and canonical digest; **no token custody**.
- Bradbury Phase 2 fee-aware SDK integration: explicit wallet actions for submission, adjudication, one appeal and finalization. Real GenLayer execution-node compatibility is required; submitting is not adjudicating.
- Hosted evidence issuer for all five classes with signed canonical observations sourced from operator-authorized public HTTPS observations, stable public retrieval, expiry, revocation and supersession; read-only attestor preflight, isolated signer that rechecks live state, 3-of-5 certificate aggregation and a bounded claim-extension tool. Genuine signer independence still requires external operators.
- Next.js APIs for executable quotes, wallet sessions, indexed policies, private claims, signed issuer provenance, exact chain-receipt reconciliation and nine scoped MCP agent tools.
- PostgreSQL RLS, private Supabase storage, triggered durable claim-follow-up jobs with fenced leases/retry checkpoints, resumable lifecycle indexing/reconciliation and a verified five-minute Supabase Cron schedule. Jobs monitor required actions; wallet and settlement authority remain separate.

## Chain design

| Function | Environment | Chain ID | Asset |
| --- | --- | --- | --- |
| Claim evidence consensus | **GenLayer Bradbury Phase 2** | 4221 | Native gas; no premiums |
| Premiums, pools, payouts | **Base Sepolia** | 84532 | Circle testnet USDC |
| Read model / private files | Supabase | N/A | Does not own settlement |

Bradbury GenLayer execution RPC: `https://rpc-bradbury.genlayer.com` (verified with `gen_getTransactionReceipt`). Bradbury GenLayer Chain/EVM RPC: `https://rpc.testnet-chain.genlayer.com/`. These are separate layers; **this repository deliberately never targets StudioNet 61999.**

Circle Base Sepolia USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`. The bridge between a Bradbury verdict and a Base payout is an explicit **independent 3-of-5 attestation trust model**, not an automatic trustless cross-chain bridge.

## Run locally

Requires Node.js 22+ (24 recommended), npm and Git.

```bash
npm ci
copy .env.example .env.local   # only when .env.local does not already exist
npm run dev
```

On Windows PowerShell: `Copy-Item .env.example .env.local`.

Visit `http://localhost:3000`. Public pages and read-only workspace configuration states work before credentials are added. The application does not populate empty workspaces with fixture policies, claims, activity or balances: unavailable data is shown as unavailable. **Signing in, issuing executable quotes, saving claims and transferring testnet funds need the corresponding external services.**

## Configure the full testnet environment

Read [environment setup](docs/ENV_SETUP.md) for all variable names, acquisition instructions, security warnings and deployment sequence.

1. Create a Supabase project, a *private* `covra-evidence-private` bucket, and a dedicated Postgres connection; set `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
2. Generate independent long random `AUTH_SECRET` and `AGENT_API_KEY_PEPPER`. Run `npm run db:migrate`.
3. Configure a Base Sepolia RPC, separate disposable deployer and quote-signer wallets, and five **independently controlled** attestor addresses.
4. Verify Phase 2 GenLayer node RPC, CLI/SDK and contract APIs. Run `npm run genlayer:preflight` and require a returned constructor/method schema before deploying `contracts/genlayer/CovraAdjudicator.py` **on Bradbury**. Record its actual address only after a finalized receipt also reports `FinishedWithReturn`. The browser requires an independent **public, unkeyed** `NEXT_PUBLIC_BRADBURY_NODE_RPC_URL`; do not expose credentials in this field.
5. Set `BRADBURY_ADJUDICATOR_ADDRESS`, all Base deployment settings and explicit `COVRA_DEPLOY_CONFIRM=TESTNET_ONLY`; run `npm run deploy:base` using testnet funds only.
6. Record `NEXT_PUBLIC_COVRA_POOLS_ADDRESS` and `BASE_DEPLOYMENT_START_BLOCK`; restart the app. Fund appropriate pools with Base Sepolia USDC.
7. Run the authenticated Base event indexer, verify policy visibility, and independently test adjudication, appeal and 3-of-5 signed Base settlement. No production use until all [release gates](docs/LIVE_GATES.md) pass.

Read the [claim and settlement protocol](docs/CLAIM_PROTOCOL.md) and [reviewer readiness matrix](docs/REVIEWER_READINESS.md). Independent preflight requires both identifiers: `npm run attestor:preflight -- 0x<case-id> 0x<finalization-tx>`. It cannot authorize payment.

## Application routes

- `/` — marketing; `/developers` — agent documentation; `/underwrite` — LP entry.
- `/demo` — wallet-optional protocol tour backed by verified deployment records and fresh chain status; `/case-study/first-pilot` — first pilot receipt timeline and reserve-release analysis.
- `/app`, `/app/coverage`, `/app/quote`, `/app/policies`, `/app/claims`, `/app/agents`, `/app/pools`, `/app/activity`, `/app/settings` — workspace.
- `GET /api/catalog`, `GET /api/pools`, `GET /api/health` — public.
- `POST /api/auth/nonce`, `POST /api/auth/verify` — wallet sign-in.
- `POST /api/quotes` — preview or executable EIP-712 signed quote, depending on credentials.
- `GET /api/policies`, `GET /api/claims` — private owner/scoped agent reads.
- `POST /api/claims`, `POST /api/evidence` — scoped agent or owner claim intake and private evidence handling. `DELETE /api/claims` is owner-only withdrawal of an unanchored intake; it does not cancel chain transactions.
- Claims UI: verified Base lock, Bradbury submission/adjudication/appeal/finalization, independently issued certificate submission, and verified Base payout or denial. These are explicit wallet actions, not unattended automation.
- `GET/POST/DELETE /api/agents` — issue, list, revoke scoped keys.
- `POST /api/indexer/sync` — authenticated, leased Base lifecycle ingestion; `GET /api/indexer/reconciliation` compares Supabase with 12-confirmed chain state.
- `POST /api/evidence-issuer/issue`, `GET /api/evidence-issuer/observations/:id`, and `POST /api/evidence-issuer/revoke` — operator-controlled evidence sourced from a public HTTPS observation; no arbitrary caller-supplied facts are signed.
- `POST /api/claims/chain-proof` reconciles exact proven chain events, then `POST /mcp` exposes nine tools, including `issue_policy_quote`, `create_claim_intake`, and read-only lifecycle inspection under separate Bearer scopes.

**Agent keys authorize API requests, not movement of owner funds.** An on-chain Base `authorizeAgent` grants a separate agent wallet permission to spend *its own funded USDC* for a policy within a ceiling and expiry. Delegated purchases can only nominate the insured wallet as payout beneficiary; the insured must purchase directly to name somebody else. See [architecture](docs/ARCHITECTURE.md).

## Validation

```bash
npm run typecheck
npm run test
npm run test:solidity
npm run test:genlayer-logic
npm run test:genlayer-direct
npm run build
npm run test:e2e
npm run genlayer:smoke
npm run genlayer:preflight
```

The production build script uses the verified Next.js Webpack compiler. A reused Turbopack cache in the build environment failed with `Failed to open database`; the browser and chain lifecycles still require their own live verification. The Python logic checks use an isolated GenLayer shim; they are **not** GenVM consensus tests. `test:genlayer-direct` uses the installed `gltest` Direct Mode runner against the actual contract; it is a local execution check, not a live Bradbury validator run. The full adjudicator has a finalized Bradbury deployment and a recorded negative pilot result; see the [Bradbury deployment record](docs/BRADBURY_DEPLOYMENT.md) and [public operations runbook](docs/PUBLIC_DEMO_OPERATIONS.md).

Playwright requires an installed Chromium and a running local server; use `npx playwright install chromium` if needed. The Bradbury script checks the EVM chain ID but cannot certify GenLayer-specific execution unless a working node RPC is supplied. See the [evidence issuer protocol](docs/EVIDENCE_ISSUER.md), [indexer operations](docs/INDEXER_OPERATIONS.md), [Bradbury deployment record](docs/BRADBURY_DEPLOYMENT.md), [Vercel deployment record](docs/VERCEL_DEPLOYMENT.md), and [Head of Growth demo script](docs/DEMO_SCRIPT.md). [Test record](docs/TEST_REPORT.md).

## Directory guide

```text
src/app/                 Next pages, REST APIs, MCP endpoint
src/components/screens/  Owner and underwriter workspace
src/lib/                 Auth, quote, terms, chain ABI, database and protocol helpers
src/workflows/           Durable claim follow-up workflow definition
contracts/base/          Solidity five-pool USDC contract
contracts/genlayer/      Python GenLayer Intelligent Contract
supabase/migrations/     PostgreSQL read model and security
scripts/                 Compile, deploy, migrate and smoke check
tests/                   Vitest, Playwright and Python host-logic checks
docs/                    Architecture, security, terms, setup, release gates
```

**Status: cohesive implementation supplied as source, not deployed insurance.** External RPC compatibility, validator behavior, attestor independence, funded capital, secure payout finality, security audit and legal authorization are still independent release gates. © COVRA 2026.
