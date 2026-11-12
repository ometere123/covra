# Bradbury Phase 2 deployment record

## Verified COVRA V1 deployment — 2026-11-03

Full adjudicator address: `0xaefc8672272392310a2ea102787e28bb1f34e1d3`.
Transaction: `0xd19bcbd6d2c6d3d2718312bb7114eec69d95facbf26a67cd00c2f7ee26432b28`.
Independent GenLayer receipt: `Finalized` / `FinishedWithReturn`.
Deployed source SHA-256: `4f424277b2aa1c23d599f8936452c7d16989ab7bd4e4265fbb28aab57092d0f2`. The exact byte-preserving local snapshot is `contracts/genlayer/CovraAdjudicatorV1.py`; the active `contracts/genlayer/CovraAdjudicator.py` is now a separate V2 candidate and must not be described as the deployed source.
Initial `get_case_count` returned zero; all ten V1 public methods returned in the deployed schema.

Runner: `py-genlayer:babwp9t37jw9g4j2bccgn14g6x7x9s1f7dsmh7emvz735pz4zxa0`.
Official matching bundle is GenVM Manager v0.6.0-rc10 from `genlayerlabs/genvm-manager`, not the older `genlayerlabs/genvm` rc7 release. Bundle SHA-256: `d3c6ba368dbd5cad01e484e19573906b4ffed41f46a48191bdc579c81cf801af`.
Twenty-four pinned-SDK Direct Mode tests passed on Python 3.12 for the historical V1 source. The current V2 candidate has 25 Direct Mode tests, including structured findings, committed-origin retrieval, provenance fail-closed behavior, callback cloudpickle round trips, adversarial leader/model/HTTP cases, delegation/revocation and appeal/finalization/digest checks with controlled external inputs. `npm run genlayer:validate` verifies the checksum-pinned Manager SDK, AST safety and its actual v0.3 semantic/schema API for the selected source. These local tests do not prove live evidence consensus.

## Current V2 candidate — not deployed

The current `contracts/genlayer/CovraAdjudicator.py` is a versioned candidate with source SHA-256 `d1ac448c9b6946f19d1771e8bc2bc5cdad6a28da6a09c34f5f796ef8a9e5616b`. Its decision schema is `covra-decision-v2` and its verified local ABI contains 11 methods, including `get_protocol_version`. It requires an evidence envelope to bind the exact source facts digest, a public HTTPS origin digest, explicit provenance metadata, observer count and source authority. Each independent assessment returns bounded finding IDs, statuses, evidence references, provenance, exclusions, contradictions and uncertainty; validator agreement compares that material vector while allowing natural-language reasons to differ. `COVERED` is fail-closed unless deterministic class facts, source support, public provenance and no material contradiction/exclusion are all established.

`npm run genlayer:validate` currently passes the V2 candidate with Manager v0.6.0-rc10, runner `py-genlayer:babwp9t…`, AST lint 3/3 and the 11-method v0.3 schema. `npm run test:genlayer-direct` passes 25/25 and `npm run test:genlayer-logic` passes 10/10. This source is not configured as the live adjudicator: the Base V1 pool immutably binds `0xaefc8672272392310a2ea102787e28bb1f34e1d3`, so a safe V2 rollout would require a separately verified Bradbury deployment and matching Base V2 pool. No V2 transaction was submitted and V1 history/funds remain protected.

Deployment fee deposit:100000000000010352wei, payable user value0. Actual mined refund:99937910750009058wei, verified in FeesRefunded at EVMtx`0xab44df92843d6c03bb929c6eb2fdfbc4d3afd5159d6dbc3490e0494f4ce3ed72`, block208720, together with UnifiedFeesDistributed and TransactionFinalized. Public JSON record is in docs/deployments. This is an actual refund event. Positive-control deployment/write refund evidence is separately preserved there.

Set both public/server adjudicator address variables to the verified address above. The historical failures below are retained as investigation evidence and are superseded by this deployment.

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
