# Bradbury Phase 2 deployment record

## Current live staged V2 installation — 2026-11-13

V1 remains deployed and unchanged. V2 is now live through the supported RC10 native alternate-code-slot mechanism; it was not submitted as an oversized direct deployment. The V2 code runs at the staged-install address below, and the matching Base V2 pool is separately deployed and verified. Production remains explicitly V1 until an operator opts into the matched, currently unfunded V2 pair.

| Item | Verified value |
| --- | --- |
| Bradbury network | Phase 2, chain `4221`, genesis `0x17d89764d4f4f963158fc4c5e8f2cb670c2837740b35f37081c12860c3df97e4` |
| Runner | `py-genlayer:babwp9t37jw9g4j2bccgn14g6x7x9s1f7dsmh7emvz735pz4zxa0` |
| V2/bootstrap address | `0x71B1Fb863F29c29D4C3f6423196b60589538E491` |
| Bootstrap deployment GenLayer tx | `0x71538bfe48e0fd6fc5a789caf46ebcbc8c8d86656ab4d51a2c3194d782e37dc1` |
| Activation GenLayer tx | `0x671c8f76094166e4e440dd723c1f3f4ca27b6e7d767b9368fd682ac2f3b647bb` (`Finalized` / `FinishedWithReturn`) |
| Activation outer EVM tx | `0xe1f58a8bc98b43e0c6c3f6a8b74e60233d95797e12564b514fa8ecf6ee47b7d8`, block `408512`, gas used `2,094,872`, receipt success |
| Replacement artifact | `contracts/genlayer/generated/CovraAdjudicator.py`, `42,664` bytes, SHA-256 `3009c8f48fa380c73879a2c65652931ed0438a2e8e55eda27be59c1df05203ed` |
| Installation | `61` finalized sequential chunk writes of `700` bytes (last `664`) followed by one atomic activation; every write returned `FinishedWithReturn` |
| Active readback | `get_protocol_version = COVRA_ADJUDICATOR_V2`, `get_case_count = 0`, unknown decision digest empty; bootstrap installer methods are absent after activation |
| Base V2 pool | `0x208f1b9c5694d9fbde32c81b0489db922e33263c`, tx `0x6f41570b4c89d332b5f502f80c29faf3255dc7afbb8e0a42406806aab8d88d04`, block `58311245`, gas `3,952,135`, currently unfunded |

The durable proof is [`staged-upgrade-proof-0x71538bfe48e0fd6fc5a789caf46ebcbc8c8d86656ab4d51a2c3194d782e37dc1.json`](deployments/staged-upgrade-proof-0x71538bfe48e0fd6fc5a789caf46ebcbc8c8d86656ab4d51a2c3194d782e37dc1.json), with the fee/refund record in [`bradbury-fees-0x671c8f76094166e4e440dd723c1f3f4ca27b6e7d767b9368fd682ac2f3b647bb.json`](deployments/bradbury-fees-0x671c8f76094166e4e440dd723c1f3f4ca27b6e7d767b9368fd682ac2f3b647bb.json). The activation deposited `100000000000010352` wei of protocol fee, consumed `61886000000000` execution units and `1750000000` storage-fee units, and emitted a verified refund of `99938112250009058` wei in outer settlement tx `0x3b212f07253e246eb21375d01feb45b376ccf7aae582915e4b08a8681d412723` at block `408581`.

The public `gen_getContractCode` endpoint currently returns the root/default bootstrap slot rather than exposing resolved alternate-slot code. This is recorded as an RPC readback limitation, not hidden: the alternate execution is established by the finalized atomic pointer write, exact staged SHA-256 digest, V2-only method execution, storage-compatible empty state and removal of installer methods. No V1 write or V1 capital was involved.

## Historical direct-deployment gate — 2026-11-12

Before the staged proof, the readable V2 source was `contracts/genlayer/CovraAdjudicator.py`, SHA-256 `a21c8be4f51942fe3c0b7d87e15d737c9ac369b94eadb4a9be7969e86821e308`, with runner `py-genlayer:babwp9t37jw9g4j2bccgn14g6x7x9s1f7dsmh7emvz735pz4zxa0`. Bradbury Phase 2 schema extraction accepted it and returned the expected 11-method schema. A deterministic comment/docstring-compacted artifact was also schema-valid and Direct-Mode tested; the direct deployment route was too large under the observed gate and is retained here as historical failure evidence.

The exact byte-level reconstruction of the successful V1 deployment, including the recovered outer EVM transaction, serialized payload, fee distribution and separate refund, is in [`V1_EXACT_DEPLOYMENT_RECONSTRUCTION.md`](deployments/V1_EXACT_DEPLOYMENT_RECONSTRUCTION.md). The checked-in envelope regression test rebuilds the historical V1 calldata using the pinned SDK ABI.

The failed V2 transaction was investigated without another broadcast. The exact outer transaction was `0xe80b56e339a7ac4ae095769751e9e39567d7ec2b5ccdc443fce5e7209c466924`, from the isolated Praest sender, to the Bradbury consensus contract, with a `45000000` gas limit and protocol-fee value `100000000000010352`. Its receipt was included in block `0x597ef`, had `status=0x0`, `gasUsed=29238269`, no logs and no GenLayer transaction ID. The block gas limit was `0x4000000000000` (`1125899906842624`) and only two transactions were present, so this was not block gas exhaustion. Praest's balance was sufficient for the transaction value plus the gas actually consumed. The calldata decodes as the expected `addTransaction` deployment envelope; no fee-zero or wrong-sender condition was observed.

The measured cause is an execution-gas ceiling/inner-call out-of-gas failure for this large GenLayer deployment envelope. The latest bounded read-only simulation reaches a success boundary at approximately `39888326` gas for the readable source and `34802522` for the compact artifact (each boundary is measured within 1024 gas); the public `eth_estimateGas` endpoint instead returns an empty-data `execution reverted`. The serialized deployment sizes are `49,168` and `42,672` bytes respectively; the compact artifact reduces source bytes from `49,160` to `42,664` but remains above `16,777,216`. The current block gas limit is therefore not the relevant cap. Public debug/trace methods return `-32401 authenticated API key required`, so the exact failing inner frame cannot be obtained from the public endpoint. GenLayer's official deployment issue documents the same Bradbury large-IC failure mode: a post-sequencer/runtime `2^24` transaction ceiling can reject or exhaust large deployments even when an RPC simulation succeeds, with no useful revert reason ([GenLayer CLI issue #419](https://github.com/genlayerlabs/genlayer-cli/issues/419)).

The `2^24` value was a verified direct-deployment/runtime gate, not a claim about the EVM block gas limit. The staged proof avoids copying the 42KB source in the activation transaction and keeps every individual outer transaction below the observed gate. The historical direct-deployment verdict remains **`NETWORK_LIMIT_CONFIRMED_ESCALATION_REQUIRED`**; it is superseded for V2 installation by the separately verified native code-slot path, not erased.

The failed public transactions and classifications are preserved in [`bradbury-v2-failed-submissions-2026-11-12.json`](deployments/bradbury-v2-failed-submissions-2026-11-12.json). The compact-artifact measurements are in [`bradbury-v2-compact-preflight-2026-11-12.json`](deployments/bradbury-v2-compact-preflight-2026-11-12.json). The deployment script now requires an isolated `BRADBURY_DEPLOYER_PRIVATE_KEY`, performs schema and account-aware fee checks, performs a bounded read-only gas-floor probe when `eth_estimateGas` fails, and refuses to sign above the verified gate; it never falls back to the Base deployer key.

V2 application routing is opt-in only: `NEXT_PUBLIC_COVRA_DEPLOYMENT_VERSION=V2` activates only when both the verified V2 Bradbury/bootstrap address and V2 Base pool address are valid and configured. The production deployment remains V1 by default because the V2 pool is unfunded; switching is a deliberate operator configuration change, not an automatic consequence of a deployment record.

## Verified COVRA V1 deployment — 2026-11-03

Full adjudicator address: `0xaefc8672272392310a2ea102787e28bb1f34e1d3`.
Transaction: `0xd19bcbd6d2c6d3d2718312bb7114eec69d95facbf26a67cd00c2f7ee26432b28`.
Independent GenLayer receipt: `Finalized` / `FinishedWithReturn`.
Deployed source SHA-256: `4f424277b2aa1c23d599f8936452c7d16989ab7bd4e4265fbb28aab57092d0f2`. The exact byte-preserving local snapshot is `contracts/genlayer/CovraAdjudicatorV1.py`; `contracts/genlayer/CovraAdjudicator.py` is the readable V2 development source and must not be confused with the exact generated artifact hash recorded above.
Initial `get_case_count` returned zero; all ten V1 public methods returned in the deployed schema.

Runner: `py-genlayer:babwp9t37jw9g4j2bccgn14g6x7x9s1f7dsmh7emvz735pz4zxa0`.
Official matching bundle is GenVM Manager v0.6.0-rc10 from `genlayerlabs/genvm-manager`, not the older `genlayerlabs/genvm` rc7 release. Bundle SHA-256: `d3c6ba368dbd5cad01e484e19573906b4ffed41f46a48191bdc579c81cf801af`.
Twenty-four pinned-SDK Direct Mode tests passed on Python 3.12 for the historical V1 source. The current V2 implementation has 25 Direct Mode tests, including structured findings, committed-origin retrieval, provenance fail-closed behavior, callback cloudpickle round trips, adversarial leader/model/HTTP cases, delegation/revocation and appeal/finalization/digest checks with controlled external inputs. `npm run genlayer:validate` verifies the checksum-pinned Manager SDK, AST safety and its actual v0.3 semantic/schema API for the selected source. These local tests do not prove live evidence consensus.

## V2 source and staged-install compatibility

The current `contracts/genlayer/CovraAdjudicator.py` is the readable V2 implementation with source SHA-256 `a21c8be4f51942fe3c0b7d87e15d737c9ac369b94eadb4a9be7969e86821e308`; its generated deployed artifact is recorded in the staged proof above. Its decision schema is `covra-decision-v2` and its verified local ABI contains 11 methods, including `get_protocol_version`. It requires an evidence envelope to bind the exact source facts digest, a public HTTPS origin digest, explicit provenance metadata, observer count and source authority. Each independent assessment returns bounded finding IDs, statuses, evidence references, provenance, exclusions, contradictions and uncertainty; validator agreement compares that material vector while allowing natural-language reasons to differ. `COVERED` is fail-closed unless deterministic class facts, source support, public provenance and no material contradiction/exclusion are all established.

`npm run genlayer:validate` passes the V2 source with Manager v0.6.0-rc10, runner `py-genlayer:babwp9t…`, AST lint 3/3 and the 11-method v0.3 schema. `npm run test:genlayer-direct` passes 25/25 and `npm run test:genlayer-logic` passes 10/10. The native installation adds 2/2 direct code-slot tests and a live 61-chunk/activation proof. The Base V1 pool still immutably binds `0xaefc8672272392310a2ea102787e28bb1f34e1d3`; V2 uses the separate Base pool listed above. V1 history and funds remain protected.

The historical V1 deployment's fee deposit/refund evidence is preserved in its original `docs/deployments/bradbury-fees-*.json` record; it is not the V2 activation receipt. The current V2 activation fee deposit and refund are recorded in the current-live section above. Positive-control deployment/write refund evidence is separately preserved there.

For deliberate V2 opt-in, set the dedicated public/server V2 adjudicator and Base-pool variables documented in `docs/ENV_SETUP.md`; keep the production V1 variables unchanged while V2 is unfunded. The historical failures below are retained as investigation evidence and are superseded for V2 installation by the staged deployment above.

Historical failure details below predate the successful deployment above. They do not describe the current runner or deployment state.

## Fixed target

- Network: GenLayer Bradbury Phase 2
- Chain ID: `4221`
- GenLayer execution RPC: `https://rpc-bradbury.genlayer.com` (verified with `gen_getTransactionReceipt`; deployment-specific reads still require the deployed contract address)
- GenLayer Chain RPC: `https://rpc.testnet-chain.genlayer.com/`
- CLI verified: `genlayer 0.40.0-rc.5` (the earlier `0.40.0-rc.3` profile used stale Phase 2 fee-manager data)
- Current FeeManager: `0x7678587A847712f2A96082AC07883A88D0fc7245`
- Explorer: `https://scan.bradbury.genlayer.com/` (Bradbury Phase 2; transaction links use `/tx/<transaction-id>`)
- Expected genesis: `0x17d89764d4f4f963158fc4c5e8f2cb670c2837740b35f37081c12860c3df97e4`
- AddressManager: `0x3F71AE080BD6270A91dBcc7960d88797828538E0`

Praest is the disposable GenLayer deployment wallet for this demonstration. It must be funded with Bradbury testnet GEN only and must not be used as a Base deployer, quote signer, evidence issuer, or attestor. The active CLI account `praest-deployer` reports this public address: `0x0d5540e0ad4b92aa0ad4e5f1b8cd645ee1e363e7`. The latest account read reports `49.999219676469991915 GEN` after failed deployment attempts. Use the official [Bradbury testnet faucet](https://testnet-faucet.genlayer.foundation/) to fund this address with test GEN only.

## Verified failed deployment attempts

These are genuine Bradbury transactions, not successful deployment records. The node now reports them as finalized; an outer protocol finality status does not imply successful GenVM execution:

| Contract | Transaction ID | Final protocol result | Observed failure |
| --- | --- | --- | --- |
| COVRA adjudicator, official `py-genlayer` pin | `0x7a7e3921a9af2c1d5893d63b8b3b9dd4514e8d841891ab639cb65249a0e7f55c` | `Finalized`, `FinishedWithError` | `invalid contract runner malformed` |
| COVRA adjudicator, newer runner pin probe | `0xb80843025e9f99a89296b85c9cf7675be5cec1bc080ff36ba2be34170e07083c` | `Finalized`, `FinishedWithError` | `invalid contract runner malformed` |
| Minimal Bradbury smoke contract, official pin | `0x9f7511d78a82a443c42e1943cb2951c1584931cdc3b138d71f5cc4cb7ec1fa3b` | `Finalized`, `FinishedWithError` | `invalid contract runner malformed` |

The minimal contract failed before application code executed. Its exact deployed source payload was 301 UTF-8 bytes with SHA-256 `42e779017f4985e763735020eb84e3a6c9398257a6f0867b1d71ab9c925eaa47`. The COVRA source payload in the first failed deployment was 23,441 bytes with SHA-256 `ac83430059be0030d95a95c6d0521cbe2c837cc548856ffbfd76362ba65cd40a`. The node trace reports GenVM `v0.3.0-rc10-x86_64-linux-release`, runner-load charged, `compilation_time=0`, and `compiled_modules=0`. The receipt for the minimal smoke transaction records `statusName=Finalized`, `resultName=MajorityAgree`, `txExecutionResultName=FinishedWithError`, five committed votes, and five revealed votes. This isolates the failure to runner loading on the public GenLayer execution path rather than COVRA application logic.

## Root-cause investigation

The failure was reproduced at both stages below, without another deployment after the blocker was isolated:

1. `genlayer deploy` submitted a real Bradbury transaction. `gen_getTransactionReceipt` returned protocol finality but `FinishedWithError`; `gen_dbg_traceTransaction` returned the non-sensitive VM diagnostic `invalid_contract runner malformed`.
2. Before broadcast, `gen_getContractSchema` was called against `https://rpc-bradbury.genlayer.com` with base64-encoded source. It returned the same `-32000` `VMError: invalid_contract runner malformed` for the existing COVRA source, a minimal contract using the existing `1jb...` pin, a `# v0.3.0`/`1jb...` variant, and the currently published official v0.3 example dependency `9b8kjyda2ycxyq4ea6g4yfpnydxhd52gqba5rb8dw7krkh5mn9p0`. The exact current `llm_erc20.py` example from GenLayer's official repository was also submitted verbatim and produced the same error.

As an additional non-broadcast control, the same schema request was run against three public Bradbury project sources whose repositories document Bradbury deployments: GLENS `ai_debugger_v3.py`, ClauseFlow `clauseflow.py`, and Tribune `tribune_bradbury.py`. Their first-line runner declarations are respectively the older `py-genlayer:1jb...` pin, the same `1jb...` pin, and `# v0.2.16` plus the same `1jb...` pin. All three independently returned `-32000 VMError: invalid_contract runner malformed`. These repository claims are not used as COVRA deployment evidence; the control is useful because it removes COVRA-specific imports, storage, ABI, and contract size from the failing schema path.

The repository now has a deployment gate for this exact check:

```text
npm run genlayer:preflight
```

It must return a constructor and method schema before any Bradbury deployment is allowed. At the time of this report it returns `ok: false` with the runner error above, so no positive-control transaction was submitted after the preflight failure.

The current unbroadcast source fingerprints are:

- `contracts/genlayer/BradburyPositiveControl.py`: 480 UTF-8 bytes, SHA-256 `26900ea08699924d293e542e376fc2a04f9d72ff94f2bedd3459e2dd8d58d759`.
- `contracts/genlayer/CovraAdjudicator.py`: 25,271 UTF-8 bytes, SHA-256 `00cf372dda76119699a360e62de8e3007844b3c5a1b42f59f71722382a59ff88`.

The evidence rules out a COVRA storage field, method ABI, HTTP evidence, consensus callback, fee, or claim-logic defect as the immediate cause: the minimal contract is rejected before compilation, and the trace has no compiled modules. The standard chain endpoint `https://rpc.testnet-chain.genlayer.com` correctly rejects `gen_getContractSchema` as unavailable, while `https://rpc-bradbury.genlayer.com` exposes the GenLayer node methods but returns `runner malformed` even for the exact official v0.3 example. This is a Bradbury GenVM runner availability/resolution failure (or a validator/node runner-store mismatch) for the published dependency family. A valid Bradbury-compatible dependency cannot be certified until the target runtime successfully returns a schema for the positive-control source.

The built-in CLI package `genlayer 0.40.0-rc.5` maps its Bradbury chain object to `https://rpc-bradbury.genlayer.com`; the separate `https://rpc.testnet-chain.genlayer.com` endpoint is used for ordinary `eth_*` chain identity and contract metadata checks. The project keeps these endpoints separate. `genlayer network info` currently displays the chain-RPC alias field, so deployment and `gen_*` checks must be verified from the CLI package chain definition and direct RPC method response rather than that display field alone.

## Runner/header compatibility evidence

| Source variant | Preflight result |
| --- | --- |
| Existing JSON dependency header, `py-genlayer:1jb45...` | `-32000 VMError: invalid_contract runner malformed` |
| `# v0.3.0` plus local rc7 dependency, `py-genlayer:1zr6...` | `-32000 VMError: invalid_contract runner malformed` |
| Official current `llm_erc20.py` source, `py-genlayer:9b8...` | `-32000 VMError: invalid_contract runner malformed` |
| Historical Bradbury `15qf...` candidate substituted into a public v0.2.16 source | `-32000 VMError: invalid_contract runner malformed` |

The contract source is now on the v0.3 declaration and the locally available rc7 runner pin `1zr6nqk597d97kg0dyxg0shhrykx5v02zjgnyrajapy4wlqvfvwh`. The installed `gltest` Direct Mode runner can load and execute the contract after its Windows test bridge is adapted to the v0.3 SDK. The installed `genvm-linter 0.11.0` AST lint now passes with no determinism warnings after replacing validator-local wall-clock reads with the deterministic GenVM message datetime. Its semantic validator still cannot extract the `1zr...` runner from the cached artifact bundle. Neither local result overrides the target Bradbury node, whose schema preflight still rejects the same runner as malformed.

## Required verified fields

```text
BRADBURY_ADJUDICATOR_ADDRESS=<not available: deployment failed before contract creation>
NEXT_PUBLIC_BRADBURY_ADJUDICATOR_ADDRESS=<not available: deployment failed before contract creation>
BRADBURY_NODE_RPC_URL=https://rpc-bradbury.genlayer.com
NEXT_PUBLIC_BRADBURY_NODE_RPC_URL=https://rpc-bradbury.genlayer.com
deployment_transaction_id=<none: recorded attempts finalized with FinishedWithError>
finalization_status=not deployed
```

The EVM chain receipt and the GenLayer protocol receipt are different records. Deployment is not complete merely because an outer EVM transaction was accepted. The SDK must wait for finalization and inspect execution success, then `get_case`/the deployed interface must be independently readable at the finalized state.

Do not deploy this contract to StudioNet, Studio Dev, or another chain. Do not submit another Bradbury deployment until the node-side schema preflight for `contracts/genlayer/BradburyPositiveControl.py` returns a schema. After that succeeds, deploy the positive control and verify its constructor, read, write, and read-back on Bradbury before retrying COVRA. When COVRA succeeds, enter only the actual public address, transaction ID, and node endpoint into the environment.
