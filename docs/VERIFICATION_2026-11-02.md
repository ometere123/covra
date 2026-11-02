# Verification record — 2026-11-02

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
