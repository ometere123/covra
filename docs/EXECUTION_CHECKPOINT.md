# Execution checkpoint

Overall assignment remains incomplete. Continue automatically with unblocked tasks.

## Live Cron and agent regression

JSON repair reverified in production: dpl_EBzRjDU4Jf5CFAdCK3A6kQn63kL6 READY. scripts/verify-live-agent.mjs passed actual signed wallet authentication, real temporary read-scoped agent credential creation, HTTP 200 scoped policy read (zero policies), credential revocation and HTTP 401 revoked-key rejection. Credential always revoked in finally; no keys/cookies logged. Migration 009 complete including all six JSON shape constraints. Still no real funded policy, observation or settlement has been created. Next independent tests: hosted MCP permission boundaries, auth replay protection, all five actual issuer workflows once policy exists; inspect contract role-rotation separation and remaining economic invariants; confirm latest CI. No need to repeat the runtime download, positive control or finalized deployments.

Cron job 1 installed and active */5 * * * * after successful authenticated hosted indexer execution. First scheduled execution at 2026-11-03 01:10:00 UTC succeeded; net._http_response id 1 returned 200, timed_out=false. Indexer run at 01:10:01.424385 UTC succeeded and persisted through block 53731653 (previous manual cursor 53730951). Authenticated reconciliation returned zero mismatches with zero policies/claims; this proves empty-ledger consistency, not a paid lifecycle.

Live wallet authentication succeeded for configured deployer. Temporary real scoped credential creation succeeded but policy read returned 401 because jsonb scopes were double encoded as a string. Temporary credential revoked in finally. Repaired all six JSON write sites with sql.json rather than JSON.stringify::jsonb. Migration 009 normalizes existing string-encoded JSON and adds shape constraints. The initial normalization-only version applied; full constraint version being applied in current session. Redeployment session 62637 (dpl_EBzRjDU4Jf5CFAdCK3A6kQn63kL6) pending. Rerun scripts/verify-live-agent.mjs after READY to verify the original failing path and revocation.

Desktop/mobile browser suite passed 8/8; known test-runner caret-style hydration warnings persist. CI d565d7f and dc6f33d passed, including newly installed checksum-verified Manager SDK Direct Mode. Real host allowlist write 0xd9ab1ba5e9fe068827dec59686e42d7cc555bace2e9d27ec367a6ab262aa7007 independently Finalized / FinishedWithReturn. No pool funding yet. User asked asynchronously to fund the configured deployer with test USDC and provide participation by three configured attestor operators; no replacement attestors created.

## Active full adjudicator deployment

Indexer live check against real pool returned RPC 413 because public Base endpoint limits getLogs to 200 blocks. Implemented tested 200-block inclusive pagination within existing 2,000-block bounded backfill; pending-log fields fail closed. Range regression test and TypeScript pass. Initial deployment dpl_69tK7rfzutkxFD3QzstfYjjMavCN failed TypeScript before the pending-log null guard; fixed, new deployment launched. Do not activate Cron until patched hosted sync succeeds. Public URL Vault entry configured successfully via supabase/cron/configure-indexer-url.sql. Cron itself is not installed yet.

Adjudicator allow_evidence_host(covra-lyart.vercel.app,true) transaction: 0xd9ab1ba5e9fe068827dec59686e42d7cc555bace2e9d27ec367a6ab262aa7007; last CLI observed Accepted / FinishedWithReturn; recheck finality, do not resubmit.

Base deployed successfully: pool 0xab4436b8ff15b7fa209e2018300d1741db0dfad1, tx 0x5945c5e6637ac9b4811ea4b7ed88c30de077676790c8c2de8d34e318c9fcdabc, block 53729517. Live reads verify attestorCount=5, correct evidenceIssuer and bound adjudicator. All five pools currently have zero assets/reserves/premiums/paid/shares; no funded lifecycle is claimed. Correct actual addresses/start block configured in production Vercel. Deployment session 72745 pending: dpl_96LpVjYXkDCQhj9sxxgDiViSGBuH. Wait for READY then authenticated /api/indexer/sync before activating Cron. Vault covra_indexer_cron_secret securely compared to configured INDEXER_CRON_SECRET: true. Next install URL entry + reviewed cron SQL only after hosted route verifies.

Submitted once after exact-runner Direct Mode/schema checks: 0xd19bcbd6d2c6d3d2718312bb7114eec69d95facbf26a67cd00c2f7ee26432b28. Independently verified Finalized / FinishedWithReturn. Actual FULL COVRA adjudicator: 0xaefc8672272392310a2ea102787e28bb1f34e1d3. Deployed source SHA256 matches 4f424277b2aa1c23d599f8936452c7d16989ab7bd4e4265fbb28aab57092d0f2; initial case count zero and all ten schema methods independently retrieved. No repeat deployment needed. Live adjudication/appeal still pending.

Official artifact breakthrough: genlayerlabs/genvm-manager v0.6.0-rc10 universal bundle, SHA256 d3c6ba368dbd5cad01e484e19573906b4ffed41f46a48191bdc579c81cf801af, contains exact babwp runner and declared std z7fv8... dependency. scripts/prepare-genvm-runtime.py verifies checksum and extracts SDKs; .runtime excluded from Git and Vercel. Python 3.12 required for bundled cloudpickle (3.14 recursion failure). Three Direct Mode tests pass using actual extracted storage and cloudpickle round-trips, including schema, authorization, adjudication, appeal/replay, finalization, persistence and digest parity. This is in-process SDK execution with controlled external web/model inputs, not real network consensus. Ten host tests and three AST lint checks pass. Old linter semantic loader still assumes legacy genlayer.py; actual pinned SDK __get_schema__ test passes instead.

Latest JS tests: 62 Vitest + 7 TAP pass. SSRF fixes reject hexadecimal mapped local IPv4 and reserved/transition ranges (4 evidence-source tests). Assessment callbacks no longer capture self. Base deployer 0xa5840e65a15021d8b1648dB10176c04811f07873 has 0.14 Base Sepolia ETH and zero official Circle USDC. Five configured attestor public addresses verified present, signing custody/independence not verified.

## 2026-11-03 adjudicator security update

Strict model-result validation now rejects unknown/missing fields, noncanonical verdicts, boolean/string/fractional severity, empty or non-string rationale/citations and oversized text. Validator callbacks parse leader results through the same checks before comparing substance. Nine host tests passed, AST lint passed three checks, and actual Bradbury schema extraction passed all ten methods for SHA256 7dd10a936d361f2575e1316dddcfd51240c80999eb7c144edafd7c666c221246 (25,667 bytes). These are not substitutes for Direct Mode or live adjudication.

Applied supabase/cron/reconcile-vault-names.sql successfully through authenticated remote SQL. It copies the existing operator Vault entry internally to covra_indexer_cron_secret only if absent, preserving covra-indexer-secret and returning no values. Cron remains inactive pending real Base deployment and start block. A preceding inline SQL attempt failed syntax parsing before any mutation; the reviewed SQL file succeeded.

Latest verified GitHub CI: 41490181666 succeeded for 699844f. Full adjudicator is not deployed. Mandatory runtime, closure serialization and independent consensus checks remain open. Base deployment/funding, policy-bound issuance, active Cron and cross-chain lifecycle remain unverified. Do not represent the positive control as COVRA adjudicator.

## Application connectivity repaired

scripts/repair-production-database.mjs URL-encodes only the password component in protected process memory, verifies the existing cxvgjycgojjcrmiyclga project identity, authenticates a real Postgres query, and provisions DATABASE_URL as a Vercel Secret over stdin. Both authentication and secret provisioning succeeded. The local file was not changed. This supersedes the earlier database-connection blocker.

Production deployment dpl_4DgZD3ZafZ9DoY4nvSEcYMF9m9cB is READY at https://covra-lyart.vercel.app. Postdeployment health reports database=true, issuer=true, quoteSigner=true, genlayerNode=true, poolContract=false. A real public observation lookup now returns 404 Observation not found (successful database query), replacing the previous unavailable-store 503. Unauthenticated issuance returns 401. No fabricated observations were inserted.

Focused regression verification: 12 tests passed across bradbury-fees, risk-spec and evidence-source. CI for 42d7307 passed (41485993815). Vault names-only inspection confirms existing secret name covra-indexer-secret. Cron SQL currently expects covra_indexer_cron_secret; reconcile internally without displaying the secret. Do not activate a purportedly successful indexer until Base pool and actual start block exist; current route returns 503 without those prerequisites.

Added supabase/.temp/ to .gitignore to protect CLI-generated connection metadata. Outstanding priorities: exact matching runner, semantic/Direct Mode/security checks; adjudicator and Base deployment; real policy-bound issuance and lifecycle; Cron activation after indexer readiness. No automatic payout or mock settlement is authorized.

## Authenticated infrastructure execution

Vercel account delealufejoel-4184, project covra/prj_MEfQ5bR0bq4XEUNg0XzbNtUbfmqi verified before mutation. Production public network/app/issuer settings and available protected auth, quote, indexer and Supabase service credentials were configured through CLI stdin. Dedicated issuer private key and admin token generated, retained in Windows Credential Manager service COVRA-testnet-production (accounts evidence-issuer and issuer-admin-token), and stored as production Vercel Secrets. Public issuer wallet: 0x2e45D3270eeB6A89e5cD4A9CB55282DFA51d87C5. Host allowlists: covra-lyart.vercel.app; wallet map uses that address. scripts/configure-vercel.mjs is resumable and reuses keychain identities.

Deployment dpl_3UyHRN8s3HKro2TcrgBB5ZzGkGgv READY at https://covra-lyart.vercel.app. Actual health reports testnet, quote signer/node/issuer configured; database and pool remain absent. Signed issuance is not verified yet.

Supabase CLI 3.0.0 installed via npm launcher after transient EBUSY. Executable: C:/Users/USER/AppData/Local/npm-cache/_npx/aa8e5c70f9d8d161/node_modules/@supabase/cli-windows-x64/bin/supabase.exe. Existing covra project cxvgjycgojjcrmiyclga verified ACTIVE_HEALTHY. Authenticated `db query --remote=cxvgjycgojjcrmiyclga` works WITHOUT database password; all migrations 001–008 actually applied successfully using --file and --yes. This supersedes the prior assumption that malformed DATABASE_URL blocks migrations. Application Postgres connection still needs repair or supported access path. Vault and pg_cron installed; pg_net not yet installed in observed extension results. Vault secret names query was combined with extension query, whose output only showed final statement; rerun names-only query. No Cron installed or execution claimed. No secrets printed or .env.local changes made.

Outstanding test session 79529 recovered exit 0 (typecheck and quiet Foundry). GitHub CI for 62c8457 passed (run 41480719681).

| Task | Status | Evidence / next action |
| --- | --- | --- |
| Existing GitHub main publication | Verified complete | origin ometere123/covra; preserve history |
| Positive-control deployment | Verified complete | 0x5485f4ad127b5f856820315b1bbf41c6c24e17ed64221ef8e0b64056620025e2: Finalized / FinishedWithReturn |
| Positive-control identity | Verified complete | address 0x3e60d7f8467d67c53e5cc74e8a31876cbdf7b8a1; actual schema retrieved; code SHA256 b8b37b434b91cd6ce9d2c279951407b8859bcea2f968274ec35aefad2f7aa738 equals local source |
| Persistent read/write | Verified execution; refund outstanding | initial read 0; increment tx 0x742bb8539a0fb4470bdbf0c88ee15e20bb21d38fde955b325182cb010e76ce1e is Finalized / FinishedWithReturn; subsequent node read 1; refund logs remain unverified |
| Fee correction | In progress | checked-in patch-package patch passes application; actual estimation succeeds without fetch interception; requires regression tests, clean-install and browser verification |
| CI repair | Verified complete for 8486d8e | GitHub run 41479216051 passed; host discovery fix preserved |
| Direct Mode / semantic lint | Tooling blocked, investigate | cached rc7 lacks babwp runner; preserve known Bradbury runner; locate official runners-all artifact/manager |
| Full adjudicator security and deployment | Not complete | do not deploy before required runtime/security checks |
| Base deployment / full lifecycle | Dependency blocked | adjudicator and issuer identity required; three actual authorized attestor signing identities needed |
| Evidence issuer / Vercel / Supabase Cron | Not complete | verify available configuration without reading or changing .env.local; earlier hosted environment was unconfigured |
| Full frontend/API/MCP/security verification | Not complete | retain prior passing results; close new regressions |

The production SDK patch passes `client.account` into the existing FeeManager simulation, retaining its current-policy gas price. It changes neither estimated budgets nor fee accounting. It is pinned to SDK 2.0.0-rc.2 and applied with postinstall. Callers must configure their funded account.

CLI read default selected an EVM-only endpoint (`gen_call` unavailable); explicit JS client endpoint https://rpc-bradbury.genlayer.com successfully reads state, code and schema. Do not interpret that CLI routing error as a failed deployment.

Recover pending write with `gen_getTransactionReceipt` for the hash above. No repeat deployment or increment needed. Capture final fee settlement/refund from actual events rather than subtracting estimated fields.

Recovered sessions: patch helper 57447 completed successfully and generated the proper contextual SDK patch; CLI write polling 65188 completed at Accepted before the independent finalized check; test session 35304 no longer exists and its successful result was captured in prior execution. No background scheduler is claimed.

New regression tests: `npx vitest run tests/bradbury-fees.test.ts` passed 1/1, executing the installed patched SDK against controlled FeeManager responses and asserting funded caller, nonzero gas context and no broadcast. Actual live fee estimation already passed without global-fetch interception.

Latest infrastructure checks: Vercel production has no environment variables. Local protected configuration reports EVIDENCE_ISSUER_PRIVATE_KEY and EVIDENCE_ISSUER_WALLET missing, as well as final contract addresses. A sanitized database connectivity check fails ERR_INVALID_URL before connection; the operator must correct DATABASE_URL personally. No credential contents were printed. Do not apply migrations or install Cron before valid connectivity and hosted authenticated API verification.

Independent local checks launched in session 79529: sanitized database check (failed ERR_INVALID_URL), typecheck, then quiet Foundry suite. Recover final exit status. Official GenVM repository manager sources were located, but no matching babwp artifact has been loaded yet; rc7 and cached v0.6.0-rc6 indices do not establish matching runner availability.

No .env.local access or modification was performed. Avoid logging secrets. Next: finish current tests, add fee regression coverage, verify write finality, push and inspect CI; then resume remaining gates.
