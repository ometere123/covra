# COVRA V1 Bradbury deployment reconstruction

Status: **verified from repository bytes, the public Bradbury chain RPC, the GenLayer execution RPC and the recorded fee settlement**.

This record reconstructs the November 3, 2026 V1 deployment. It deliberately separates the outer EVM transaction, the GenLayer transaction ID, and the later fee-refund transaction. It does not treat a fee refund as the deployment.

## Network and toolchain

| Item | Verified value |
| --- | --- |
| Network | Bradbury Phase 2 / `testnet-bradbury` |
| Chain ID | `4221` |
| Genesis | `0x17d89764d4f4f963158fc4c5e8f2cb670c2837740b35f37081c12860c3df97e4` |
| EVM chain RPC | `https://rpc.testnet-chain.genlayer.com` |
| GenLayer execution RPC | `https://rpc-bradbury.genlayer.com` |
| AddressManager | `0x3F71AE080BD6270A91dBcc7960d88797828538E0` |
| FeeManager | `0x7678587A847712f2A96082AC07883A88D0fc7245` |
| CLI | `genlayer 0.40.0-rc.5` |
| JavaScript SDK | `genlayer-js@2.0.0-rc.2` |
| GenVM Manager | `v0.6.0-rc10`, universal bundle SHA-256 `d3c6ba368dbd5cad01e484e19573906b4ffed41f46a48191bdc579c81cf801af` |
| Contract runner | `py-genlayer:babwp9t37jw9g4j2bccgn14g6x7x9s1f7dsmh7emvz735pz4zxa0` |
| Deployment sender | `0x0d5540e0ad4b92aa0ad4e5f1b8cd645ee1e363e7` (Praest) |

The CLI version is recorded in the contemporaneous Bradbury deployment record and is reproducible with `genlayer --version`. The repository pins the JavaScript SDK. The exact interactive shell transcript used on November 3 was not committed, so this report does not invent a command line. The serialized transaction proves the SDK deployment method and arguments below byte-for-byte.

## Source and constructor

The deployed source is the byte-preserving snapshot [`CovraAdjudicatorV1.py`](../../contracts/genlayer/CovraAdjudicatorV1.py):

- UTF-8 source bytes: `25,703`
- SHA-256: `4f424277b2aa1c23d599f8936452c7d16989ab7bd4e4265fbb28aab57092d0f2`
- Runner header: v0.3.0 with the `babwp...` dependency above
- Constructor arguments: none
- GenLayer constructor payload: one-byte encoded empty calldata object, `0x06`
- `leaderOnly`: `false`

The deployment payload was built by the SDK-equivalent operation:

```js
const constructorData = abi.calldata.encode(
  abi.calldata.makeCalldataObject(undefined, [], undefined),
);
const serializedDeployment = abi.transactions.serialize([
  source,
  constructorData,
  false,
]);
```

The exact serialized deployment payload was `25,711` bytes (`51,424` hexadecimal characters including `0x`) with SHA-256 `7ef3a881c53f5c6577a64bfb984997eed6797b27c6f601d1c0b309ca547edfe3`. This matches the `txCalldata` decoded from the mined outer transaction.

## Recovered outer EVM transaction

The outer transaction that called Bradbury Consensus Main was recovered from the public EVM RPC:

- Outer EVM hash: `0x2fc4701edec82882a108982728c3b8f18d9311c810c7eeb9cb8891f127e37b1d`
- Block: `208707`
- Block hash: `0x1bdb2c1b588eb4a76e7a1458caba4fca345d671dac15ef72a5bc96529c7bb623`
- Block timestamp: `2026-11-03T01:00:49Z`
- `to`: `0x2E2766cbc3E5e61Ce93bBcdCBb3eAcB82082A019` (Bradbury Consensus Main)
- `from`: `0x0d5540e0ad4b92aa0ad4e5f1b8cd645ee1e363e7`
- Type: legacy, nonce `8`, gas price `10,000,000`
- Gas limit: `43,908,642`
- Gas used: `21,162,162`
- Value: `100000000000010352` wei (protocol-fee deposit; payable user value was zero)
- Outer calldata: `26,532` bytes
- Outer calldata SHA-256: `172ff2c53593d77a72d8cc3f3ccd4e4379659789b26157d837afdad703818c0c`
- Receipt: success, 16 logs

The decoded call was `addTransaction(AddTransactionParams)`. Its deployment-relevant fields were:

| Field | Recovered value |
| --- | --- |
| `sender` | `0x0d5540e0aD4B92Aa0ad4e5F1b8cD645ee1E363E7` |
| `recipient` | zero address (deployment) |
| `numOfInitialValidators` | `5` |
| `maxRotations` | `3` |
| `validUntil` | `1793671244` (`2026-11-03T02:00:44Z`) |
| `saltNonce` | `0` |
| `userValue` | `0` |
| `messageAllocations` | empty |
| `txCalldata` | exact 25,711-byte serialized source payload |

The repository test [`bradbury-deployment-envelope.test.mjs`](../../scripts/bradbury-deployment-envelope.test.mjs) rebuilds this call using the pinned SDK ABI and asserts both historical SHA-256 values. This is the closest safe, reproducible equivalent of the historical deployment path.

The receipt emitted `CreatedTransaction` and `NewTransaction`. The latter carried GenLayer transaction ID `0xd19bcbd6d2c6d3d2718312bb7114eec69d95facbf26a67cd00c2f7ee26432b28` and recipient `0xaeFC8672272392310A2eA102787e28bB1f34e1D3`. The outer transaction's recipient field was zero because the contract address did not exist until GenLayer execution completed.

## FeeManager distribution and settlement

The recorded `addTransaction` fee distribution and the finalized GenLayer receipt agree:

```text
leaderTimeunitsAllocation: 100
validatorTimeunitsAllocation: 200
appealRounds: 0
executionBudgetPerRound: 25000000000000000
totalMessageFees: 0
rotations: [3]
maxPriceGenPerTimeUnit: 2
storageFeeMaxGasPrice: 300000000
receiptFeeMaxGasPrice: 300000000
```

The deposit was `100000000000010352` wei. The GenLayer receipt reported:

```text
status: Finalized
txExecutionResult: FinishedWithReturn
recipient: 0xaefc8672272392310a2ea102787e28bb1f34e1d3
executionConsumed: 61886000000000
storageFeeUsed: 203250000000
messageFeesConsumed: 0
messageFeesBudgetTotal: 0
```

The separately mined fee settlement/refund transaction was:

- Refund EVM hash: `0xab44df92843d6c03bb929c6eb2fdfbc4d3afd5159d6dbc3490e0494f4ce3ed72`
- Block: `208720`
- `FeesRefunded` amount: `99937910750009058` wei to the Praest sender
- Companion events: `UnifiedFeesDistributed` and `TransactionFinalized`

This refund is evidence of fee settlement only. It is not the deployment transaction and is not used as the deployment hash.

The exact fee record is [`bradbury-fees-0xd19bcbd6d2c6d3d2718312bb7114eec69d95facbf26a67cd00c2f7ee26432b28.json`](bradbury-fees-0xd19bcbd6d2c6d3d2718312bb7114eec69d95facbf26a67cd00c2f7ee26432b28.json).

## GenLayer receipt and source readback

The execution RPC returned the GenLayer transaction as `Finalized` / `FinishedWithReturn` with deployed address `0xaefc8672272392310a2ea102787e28bb1f34e1d3`. The source readback through `getContractCode` is currently `25,703` UTF-8 bytes and has SHA-256 `4f424277b2aa1c23d599f8936452c7d16989ab7bd4e4265fbb28aab57092d0f2`, matching the local V1 snapshot.

The deployed schema contains these ten public methods:

```text
adjudicate
allow_evidence_host
appeal
authorize_case_agent
finalize_case
get_case
get_case_count
get_case_id_at
get_decision_digest
submit_case
```

At deployment, `get_case_count` returned zero. A later live pilot now makes the current count `1`; that later state is not confused with the deployment-initial state. V1 has no `get_protocol_version` method, so attempting that V2-only read is correctly treated as an unsupported method rather than a failed deployment.

The source owner is initialized from `gl.message.sender_address`; no constructor argument or backend owner override was encoded. The exact validator wallet addresses selected for the initial five-validator round are not present in the outer `addTransaction` payload and are not claimed here; only the configured count (`5`) and rotation budget (`3`) are recoverable from the transaction.

## Direct comparison with current V2

The current readable V2 source is `49,160` bytes, SHA-256 `a21c8be4f51942fe3c0b7d87e15d737c9ac369b94eadb4a9be7969e86821e308`. The deterministic deployment artifact is `42,664` bytes, SHA-256 `3009c8f48fa380c73879a2c65652931ed0438a2e8e55eda27be59c1df05203ed`. Both preserve the v0.3 header, public method names, storage fields and string values; the artifact removes comments/docstrings through AST parsing and is separately schema- and Direct-Mode-tested.

| Deployment layer measurement | V1 historical | V1 current exact-envelope read-only control | V2 readable current | V2 compact current |
| --- | ---: | ---: | ---: | ---: |
| Source bytes | 25,703 | 25,703 | 49,160 | 42,664 |
| Serialized deployment bytes | 25,711 | 25,711 | 49,168 | 42,672 |
| Outer calldata bytes | 26,532 | 26,532 | 49,988 | 43,492 |
| Outer gas | 21,162,162 used | 21,955,287 estimated; ~21,873,062 call floor | ~39,888,326 call floor | ~34,802,522 call floor |
| Current observed `2^24` gate | not active for historical block | fails | fails | fails |

The current V1 control is decisive: the exact historical deployment envelope still encodes correctly, but current Bradbury read-only execution needs more than `16,777,216` gas. The V1 transaction used `21,162,162` gas and succeeded on November 3, so the network/runtime admission behavior changed after that deployment. V2 is also substantially larger and needs roughly 1.6x the current V1 read-only floor even after safe comment/docstring compaction.

The machine-readable current control is [`bradbury-v1-current-preflight-2026-11-12.json`](bradbury-v1-current-preflight-2026-11-12.json); it records the exact historical calldata probes and explicitly confirms that no transaction was submitted.

`eth_estimateGas` returns an empty-data execution revert for the large V2 envelopes. The bounded `eth_call` floors are read-only measurements, not permission to broadcast. The public endpoint does not expose debug traces without an authenticated API key, so the exact deepest inner revert frame remains unverified. The public [GenLayer CLI issue #419](https://github.com/genlayerlabs/genlayer-cli/issues/419) reports the same Bradbury large-IC behavior and a `2^24` per-transaction ceiling; it is engineering evidence rather than a formal protocol guarantee.

## Deployment decision

The V1 procedure is fully reconstructed and remains the correct SDK/fee/encoding procedure. Replaying that procedure against today's Bradbury conditions would be rejected by the measured gate even for V1. The V2 artifact is safer and materially smaller, but it remains more than twice the observed gate and cannot be safely broadcast.

The release verdict is **`NETWORK_LIMIT_CONFIRMED_ESCALATION_REQUIRED`**, with the residual uncertainty limited to the exact internal frame consuming gas. No V2 transaction was submitted in this reconstruction, no V2 Bradbury address exists, and no V2 Base pool was deployed. The smallest safe next step is an operator-provided Bradbury deployment path with a verified higher runtime/transaction cap (or a documented, target-runtime-supported modular deployment model). Until then, V1 remains the production pair.
