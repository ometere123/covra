# Verification record — 2026-11-02

## Verified continuation — 2026-11-03 (supersedes older status statements)

- Full adjudicator `0xaefc8672272392310a2ea102787e28bb1f34e1d3`, deployment `0xd19bcbd6d2c6d3d2718312bb7114eec69d95facbf26a67cd00c2f7ee26432b28`, independently Finalized / FinishedWithReturn; exact source and ten-method schema checked.
- Account-aware RC2 SDK patch replaces the diagnostic global-fetch hook in production. Manager v0.6.0-rc10 official universal bundle contains the exact babwp runner. Checksum verified; 15 SDK-backed Direct Mode tests now pass, including storage, cloudpickle serialization and independent callback disagreement. Legacy linter semantic CLI remains incompatible with ZIP runner packaging; AST lint passes 3 checks. These tests are not live consensus proof.
- Hardened five-class Base pool `0xd8619d3948c08c8364fd3a7a35dc8a65b254a8e4`, successful transaction `0xfe01a9b68ac5a54df1173231c49838a0d67ba37be35e85624cd7d912461f93f2`, block 53734261. Sourcify exact creation/runtime match. Original empty pool preserved and paused after role-rotation hardening.
- Vercel READY `dpl_7CvirQmqhDGsr6GUtkJ7aVdDhUZk`; real hosted authentication, replay rejection, agent credential lifecycle, MCP scope boundaries, database persistence and prospective signed quotation passed. Twenty-four desktop/mobile production page checks passed.
- Supabase migrations 001–010 applied. Vault name mismatch reconciled internally without displaying values. Actual Cron job 1 active every five minutes; scheduled HTTP 200 responses verified. Current deployment-bound indexer and empty-ledger reconciliation both return 200.
- Still incomplete: pool funding/premium/payout, real policy-bound issuance, live adjudication/appeal, and 3-of-5 settlement. Configured deployer last held zero Circle test USDC; three configured attestor operators' participation/custody is unavailable. No incident, observation or settlement has been fabricated.

## Historical investigation — preserved evidence

## Subsequent verified progress

The existing directory is now a Git repository on main, origin https://github.com/ometere123/covra. The empty remote was inspected before initialization. Initial commit 2a80676 preserved 131 non-secret source files; the staged credential-pattern scan reported no findings and `.env.local` is ignored.

The RC2 fee failure was isolated in the installed SDK: its separate public client calls FeeManager `estimateProposeReceiptGas` with gasPrice and no account. `scripts/bradbury-fee-probe.mjs` applies a narrowly scoped read-only funded-caller correction for that FeeManager call. The actual node then returned feeValue 100000000000010352 wei with the SDK-derived distribution, execution budget 25000000000000000 and three rotations. This is a diagnostic repair; browser/server fee paths still require integration and regression testing.

The positive control was submitted with that exact estimated distribution and deposit: transaction `0x5485f4ad127b5f856820315b1bbf41c6c24e17ed64221ef8e0b64056620025e2`, recipient `0x3e60d7f8467d67c53e5cc74e8a31876cbdf7b8a1`. Latest observed status: Accepted; execution: FinishedWithReturn. Finalization and read/write/read verification remain outstanding. The receipt reports executionConsumed 61886000000000 and storageFeeUsed 5750000000; refund is not yet verified. Do not describe this as a finalized deployment.

Completion verdict: incomplete. No successful new contract deployment is claimed.

## Verified runtime correction

Both contracts now pin `py-genlayer:babwp9t37jw9g4j2bccgn14g6x7x9s1f7dsmh7emvz735pz4zxa0` under the v0.3.0 header. COVRA uses `gl.storage.TreeMap` and `gl.storage.DynArray`. The Bradbury node returned the constructor and all ten COVRA methods. This supersedes the earlier report that runner loading remains blocked for every candidate.

COVRA schema source: 25,208 bytes; SHA-256 `4d3da1943be9a855760b566ea5e3057e8d66ddeb88e7e94b7655a258d5783b52`.
Positive control: 480 bytes; SHA-256 `b8b37b434b91cd6ce9d2c279951407b8859bcea2f968274ec35aefad2f7aa738`.

`npm run genlayer:smoke` passed chain 4221, expected genesis, AddressManager, FeeManager and GenLayer receipt-method checks.

## Direct Mode and semantic validation

The recovered Direct Mode run failed both tests before contract loading because gltest 0.29.2 selected cached v0.3.0-rc7 artifacts without the babwp runner. Semantic validation likewise reports E101 missing runner. AST lint passed three checks. The official release API lists rc7 as the latest release; the attempted rc10 universal artifact URL returned HTTP 404. Do not count the earlier rc7-pin test successes as validation of the new runner.

## Deployment attempt and fee failure

CLI: 0.40.0-rc.5; project JS SDK: 2.0.0-rc.2. Praest is unlocked on testnet-bradbury and reported 49.999219676469991915 GEN before this attempt.

`genlayer deploy --contract contracts/genlayer/BradburyPositiveControl.py` failed at the EVM envelope stage with `FeeValueMustBeNonZero`, selector `0x632be5a1`, RPC code 3. EVM transaction: `0x5142569b94df844774e9c6888107e9bd76f597f64906e4c0d2ff6fddf51583a2`. This is a reverted transaction, not an Intelligent Contract deployment.

Explicit distribution fee estimation then failed because the CLI made the FeeManager eth_call without a funded sender while including a gas price. The node charged the simulated zero address and returned -32000 insufficient funds. Praest itself is funded; funding the zero address is not a remedy. Repair the estimation transport to include the funded caller or omit gasPrice before another broadcast. Do not repeatedly submit zero-fee deployments.

## Remaining gates

Matching Direct Mode runner artifacts and semantic validation; positive-control deployment/read/write/read; full contract execution and consensus audit; COVRA deployment; dependent Base deployment; dedicated issuer identity; Vercel environment configuration; live Supabase migration/Vault/Cron verification; authorized attestor signatures; full testnet lifecycle. Earlier Vercel code deployment and local Solidity/browser results do not prove these gates.

`.env.local` was not modified or printed. No Git repository exists in the authoritative directory, so no commit or push is available.
