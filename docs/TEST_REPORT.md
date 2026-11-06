# COVRA verification report

## 2026-11-06 regression and hosted checks

`npm run typecheck` and `npm test` passed with 95 Vitest and 7 TAP checks. New regressions exercise atomic first issuance and replay with controlled database and HTTPS interfaces, receipt recovery, exact finalized Bradbury RPC parameters, terminal-outcome reconciliation and malformed authorization. The live adjudicator returned an empty case register via explicit finalized reads. Hosted checks covered 24 desktop/mobile route combinations, signed wallet login, a prospective signed quote, agent and MCP scope boundaries, issuer HTTPS retrieval and schema rejection, and denial of a claim intake without a policy. See the [execution checkpoint](EXECUTION_CHECKPOINT.md) for CI, production deployment, and scheduled indexing evidence.

## Current verified results — 2026-11-03

These supersede historical results below. Full funded cross-chain acceptance remains **incomplete**.

Latest expansion: **81 Vitest +7 TAP**, **24 Direct Mode**, TypeScript passed. `npm run genlayer:validate` passes actual target-SDK semantic/schema reflection plus AST lint; legacy native semantic CLI remains incompatible, clearly distinguished. CI41560062537 passed for9984983. Current hosted deployment: dpl_287EDyXTGwavwGV5a9Rvtr4g57xp. `scripts/verify-live-security.mjs` passes actual HTTPS authorization, SSRF, streamed-body and RLS controls plus read-only deployed-contract reverts. Ten issuer matrix tests cover all five classes. Indexer failure injection verifies retry atomicity, stale-worker fencing and exact claim association using an isolated transactional test double; actual empty-chain sync/reconciliation also pass. No test double is used by production.

Dependency hardening: pinned Zod4.6.7 across compatible v4 transitive callers, Undici7.30.1, tmp0.2.7 and Vitest5.1.0 (Node22.12+). No forced SDK upgrade: genlayer-js remains2.0.0-rc.2 and patch-package reapplied successfully. All81+7 tests, TypeScript and Webpack production build passed after these changes. Production audit now reports29 moderate, zero high/critical (previously23 high); remaining moderate reports flow from the older minimatch build/tooling dependency graph. Full audit and hosted redeployment are still being finalized. Existing ox dynamic-import build warning persists.

After completing follow-ups using existing Supabase Cron instead of the unused Workflow SDK dependency, npm removed347 unused packages. Full audit now reports **7 moderate, zero high/critical**. Both hosted/production and development audit high/critical findings are resolved; no force upgrade of the pinned GenLayer SDK was applied. Five durable follow-up tests cover checkpointing, appeal recovery requirements, terminal state, failure retry and lease loss. Migration011 was actually applied remotely. Live follow-up processing is pending the next deployment; there are no real claims/jobs yet.

Follow-through: **86 Vitest +7 TAP**, TypeScript and production build passed. READY dpl_8KwrLSbCt7mhXhL5LURLv4Cefiow includes the worker. Hosted sync returns200 and followups.checked=0; owner follow-up read returns0jobs, policy-only agent access401. No populated claim-job lifecycle is claimed. Actual target Bradbury VM rejects unauthorized allowlist mutation at simulation with decoded UserError / [EXPECTED] only owner (RPC-32000); no transaction broadcast was needed. Public diagnostic and native testGEN funding receipts are preserved in docs/deployments.

| Check | Actual result |
| --- | --- |
| `npm run typecheck` | Passed after authentication and deployment-bound cursor changes. |
| `npm test` | 64 Vitest tests and 7 Node TAP tests passed. |
| `forge test --root contracts/base -vv` | 20 passed; zero failures, including role rotation and historical roster separation. |
| `npm run test:solidity` | Passed, 60 ABI functions, 16,312-byte creation bytecode; test harness size warning only. |
| `npm run test:genlayer-direct` | 15 passed with exact Manager rc10 SDK, actual storage and cloudpickle serialization. External HTTP/LLM inputs are controlled test doubles; this does not prove live validator consensus. |
| GenVM AST lint | Three checks passed. Legacy linter semantic command still E101: expects TAR runner, official Manager provides ZIP; exact target-SDK schema extraction/storage tests pass separately. |
| `node --env-file=.env.local scripts/verify-live-agent.mjs` | Hosted signed login; restored-cookie replay 401; concurrent nonce 200/401; real scoped credential, policy read 200; MCP policy allowed, claims rejected; revoked key 401. Temporary credential revoked. |
| `node --env-file=.env.local scripts/verify-production-browser.mjs` | 24 real HTTPS route/device combinations passed, screenshots and no horizontal overflow; real wallet signature login and prospective server-signed quote. No transaction or fabricated incident. |
| Solidity source verification | Sourcify creation/runtime exact_match for current deployed contract. |
| Hosted indexer/reconciliation | HTTP 200 against actual replacement pool; cursor 53735455; zero mismatches across zero policies/claims. This is empty-ledger consistency. |
| GitHub CI | Last checked run 41558206596 passed for 47990a0; subsequent changes require a new run. |

Adversarial Direct Mode scenarios include HTTP 400/404/500/503; empty, replaced, tampered and oversized evidence; malformed leader schema; different verdict; unacceptable severity disagreement. Both serialized leader and validator retrieve evidence independently in the in-process harness. None persists a failed decision.

Migration 010 adds durable one-use authentication challenges. Live replay was reproduced as HTTP 200 before repair and rejected after deployment, including concurrent requests. Original cookies and keys were never logged.

Current live deployments, evidence identity and Cron execution are recorded in BASE_DEPLOYMENT.md, BRADBURY_DEPLOYMENT.md and EXECUTION_CHECKPOINT.md. Pool funding, policy purchase, policy-bound public issuance, live adjudication/appeal and authorized payout remain unverified. These need genuine test USDC, authentic attributable observations and participation by three configured attestors.

## Historical verification — retained for investigation

Run date: 2026-10-31. These are actual local executions against the current workspace. No live Base/Bradbury deployment is claimed.

| Command | Result |
| --- | --- |
| `npm ci` | PASS; 688 packages installed. npm reported 42 advisories (15 moderate, 25 high, 2 critical); no automatic force-fix was applied. |
| `npm run typecheck` | PASS. |
| `npm test` | PASS: 11 Vitest files, 60 tests; Node TAP suites, 7 tests passed. Includes the full CovraPools lifecycle-event ABI guard, Bradbury endpoint-boundary tests and SSRF address-boundary regression tests. |
| `npm run test:genlayer-logic` | PASS: 8 Python host-logic tests, including observation identity/source binding, strict GenVM `Response.status` handling, and deterministic transaction-datetime checks; an obsolete `status_code`-only mock fails closed. These use an isolated shim and are not GenVM consensus tests. |
| `npm run test:genlayer-direct` | PASS: 2 Direct Mode tests against the actual v0.3 `CovraAdjudicator.py` using the installed `gltest` runner, including positive and insufficient-evidence adjudication. The test bridge encodes v0.3 calldata and adapts only deterministic external web/LLM inputs; it does not claim Bradbury consensus. This caught and fixed the unsupported `TreeMap[str, int]`, missing-map handling, obsolete `run_nondet_unsafe`, and current `.status` response field. |
| `npm run test:solidity` | PASS: CovraPools compiled; 59 ABI functions, 15,195-byte deployable bytecode; 19 Foundry behavioral tests compiled. The test harness warning is about the test contract, not the deployable contract. |
| `forge test --root contracts/base -vv` | PASS: 19 tests passed, 0 failed. Includes duplicate claim IDs, five-member roster replacement snapshots, quorum, replay, denial, expiry, pause, liquidity, invalid-state paths and construction-time separation of deployer, quote, evidence-issuer and attestor identities. |
| `npm run build` | PASS: Next.js 16.4.3 Webpack production build; 23 static pages/routes generated. Existing `ox` dynamic-dependency warning remains. |
| `npm audit --omit=dev --json` | REVIEW REQUIRED: 37 production dependency advisories (14 moderate, 23 high, 0 critical at verification time). No force-fix was applied; `undici` and `zod` upgrades need a compatibility review, while the `minimatch` advisory has no available fix in the installed graph. |
| `npm run test:e2e` | PASS: 8 Playwright tests passed across Chromium desktop and Pixel 7 mobile projects. They cover the public landing page, truthful unconfigured/testnet states, and all major workspace journeys. They do not claim funded cross-chain settlement. A browser-side hydration warning about injected input caret styling remains under the test runner. |
| `py -m genvm_linter.cli lint contracts/genlayer/CovraAdjudicator.py --json` | PASS: 3 lint checks, no determinism warnings after all contract time reads were changed to the deterministic GenVM message datetime. The separate semantic `check/schema/typecheck` path is blocked by the installed linter artifact cache not containing the declared `1zr...` rc7 runner bundle. |
| `py -m genvm_linter.cli typecheck contracts/genlayer/CovraAdjudicator.py --json` | BLOCKED by the linter's runner artifact extraction (`E101`, declared `1zr...` bundle unavailable to the semantic loader); AST lint and Direct Mode both pass. |
| `npm run genlayer:smoke` | PASS for Bradbury EVM identity: chain 4221, expected Phase 2 genesis and AddressManager. The node endpoint `https://rpc-bradbury.genlayer.com` returned the documented exact receipt and trace responses. |
| Bradbury `gen_getContractSchema` preflight | FAIL honestly for the existing COVRA source, a minimal `1jb...` contract, a `# v0.3.0`/`1zr...` contract, the official current `9b8...` v0.3 candidate, and three public Bradbury project sources using the older `1jb...` family: each returned `-32000 VMError: invalid_contract runner malformed` from `https://rpc-bradbury.genlayer.com`. |
| Real Bradbury deployment probes | FAIL honestly: three representative transactions are now `Finalized` at the protocol layer but each has `FinishedWithError` and `invalid contract runner malformed`, including a minimal contract. No adjudicator address was created. See `docs/BRADBURY_DEPLOYMENT.md`. |

## Adversarial coverage executed

- Solidity rejects duplicate/unknown/non-roster signers, fewer than three signatures, wrong chain, wrong evidence, wrong risk digest, wrong amounts, repeat settlement, and paused new exposure. Claim IDs cannot be locked under two policies. An existing claim keeps its original roster version across delayed replacement, while the legacy arbitrary roster-change surface fails closed.
- Exact Bradbury receipt unit tests accept only a matching ID, `FINALIZED` status, successful return execution, adjudicator recipient, `call` type, exact method, and exact argument array. Wrong transaction, recipient, status, method, and claim argument all reject.
- Issuer tests cover approved signatures, altered facts, forged issuer wallet, expired observations, mismatching host/source, and frozen-risk substitution. Python tests cover unavailable/invalid source statuses and issuer observation source binding.
- Production evidence envelopes now accept only `OBSERVED_PUBLIC` / `https_get`; simulated and fixture-shaped payloads are isolated to negative tests and are rejected before settlement verification.
- Browser tests execute real page navigation and visible assertions. No browser test claims a wallet transaction because no deployed contracts were available in this run.

## Not executed / blocked

- Live Bradbury deployment and lifecycle: the disposable Praest account is confirmed at `0x0d5540e0ad4b92aa0ad4e5f1b8cd645ee1e363e7` on chain `4221` with sufficient test GEN. The deployment transactions are finalized with `FinishedWithError` before contract creation because the public GenVM runtime could not load a runner. The isolated positive-control source is present at `contracts/genlayer/BradburyPositiveControl.py`, but its node-side schema preflight is also blocked; it has not been broadcast. No address is recorded.
- Live Base deployment: correctly gated until a real Bradbury adjudicator address is available; no placeholder address was used.
- Supabase migrations, Vault inspection, indexer invocation and Cron history: the operator's `DATABASE_URL` is malformed for the PostgreSQL client because its password contains unescaped URL-reserved characters. `.env.local` was not edited. After manual correction, run migrations 001–008 and verify Vault/Cron as documented.
- Vercel deployment: PASS for code/runtime deployment. The latest production deployment is `dpl_44JLSjnJ1Z44VQYU9FPT2VY1pHPv`, READY at `https://covra-lyart.vercel.app`; homepage and health route were probed over HTTPS, and unauthenticated indexer access returned 401. Vercel environment variables are not configured yet, so the issuer/database/indexer are intentionally not claimed operational. See `docs/VERCEL_DEPLOYMENT.md`.
