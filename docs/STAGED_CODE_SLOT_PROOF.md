# Bradbury staged code-slot installation proof

Status: **verified on Bradbury Phase 2, chain 4221** (2026-11-13).

This record establishes that the pinned GenVM runtime supports an authenticated,
multi-transaction installation of a complete replacement contract through the
native alternate code slot. It does not claim that `gen_getContractCode` exposes
the currently resolved alternate slot after activation; the Bradbury node's code
readback currently returns the root/default slot. Resolved execution is verified
through the finalized activation receipt, the exact staged digest, V2-only
methods, state readback and removal of the installer methods.

## Runtime and network

- Network: Bradbury Phase 2, chain ID `4221`
- Genesis: `0x17d89764d4f4f963158fc4c5e8f2cb670c2837740b35f37081c12860c3df97e4`
- GenVM Manager: `v0.6.0-rc10`
- GenVM runtime log: `v0.3.0-rc10-x86_64-linux-release`
- Runner: `py-genlayer:babwp9t37jw9g4j2bccgn14g6x7x9s1f7dsmh7emvz735pz4zxa0`
- Execution endpoint: `https://rpc-bradbury.genlayer.com`
- EVM chain endpoint: `https://rpc.testnet-chain.genlayer.com`
- Observed outer transaction safety gate: `2^24 = 16,777,216` gas; each
  measured stage and activation transaction is below that value.

## Supported mechanism

The pinned SDK/runtime exposes the documented `gl.storage.Root` interface:

1. `Root.get_vacant_slot()` returns an alternate code-storage slot.
2. `Root.code_slot` selects the executable slot for subsequent calls.
3. `Root.get().upgraders` authorizes code changes and can be emptied after
   activation.
4. `VLA[u8]` storage can be extended and truncated by bounded writes.
5. Switching `Root.code_slot` does not rerun the replacement `__init__`, so the
   installer explicitly initializes compatible state before activation.

The proof installer uses a single authorized installer, a frozen SHA-256
commitment, sequential bounded chunks, duplicate/reorder protection, a complete
byte-count check, an atomic digest check, and a final code-slot switch. A failed
or incomplete installation remains in the bootstrap code and cannot activate.
After successful activation the installer authority is revoked and the active
V2 code has no `stage_chunk`/`activate` entry points.

## Disposable proof

The harmless proof used `testbed/staged-upgrade/StageableBootstrap.py` and
`StageableReplacement.py`. It deployed and executed on Bradbury without COVRA
policy or financial logic:

- Bootstrap address: `0x1452641F37cd59C797514f997bf6d6D5fe9DFD3C`
- Deployment GenLayer transaction:
  `0x5d6dc94c41f5d0a0dc37d06b937d4624a1d045d67f110061cd6a32c35e4e0e53`
- Three staged writes finalized successfully.
- Activation finalized as:
  `0x23967d46dfa73c812b02b062ab8707af95ce5ba87cda4af1cb4ffbbd96421aa1`
- Replacement write finalized as:
  `0x913dcd93de32b5d59c030c4b20fcb91cac77af19361f8dc24f70e1588b11404e`
- Counter state persisted across activation (`2` before replacement write,
  `5` after it); replacement-only methods were callable and bootstrap-only
  methods were rejected.

The durable receipt record is
`docs/deployments/staged-upgrade-proof-0x5d6dc94c41f5d0a0dc37d06b937d4624a1d045d67f110061cd6a32c35e4e0e53.json`.

## Live COVRA V2 installation

The COVRA bootstrap was deployed once and then upgraded in 61 bounded writes;
there was no second bootstrap and no retry of the completed writes.

- Bootstrap / final V2 address:
  `0x71B1Fb863F29c29D4C3f6423196b60589538E491`
- Bootstrap deployment GenLayer transaction:
  `0x71538bfe48e0fd6fc5a789caf46ebcbc8c8d86656ab4d51a2c3194d782e37dc1`
- Bootstrap source SHA-256:
  `a15fd2431db245a0920dea63c83248bef231cf143bf5e472ca9bbd40a02f6593`
- Replacement artifact:
  `contracts/genlayer/generated/CovraAdjudicator.py`
- Replacement bytes: `42,664`
- Replacement SHA-256:
  `3009c8f48fa380c73879a2c65652931ed0438a2e8e55eda27be59c1df05203ed`
- Chunk size: `700` bytes; `61` sequential chunks; final chunk `664` bytes.
- Every stage receipt finalized with `FinishedWithReturn`.

Activation:

- GenLayer transaction:
  `0x671c8f76094166e4e440dd723c1f3f4ca27b6e7d767b9368fd682ac2f3b647bb`
- Outer EVM transaction:
  `0xe1f58a8bc98b43e0c6c3f6a8b74e60233d95797e12564b514fa8ecf6ee47b7d8`
- Outer receipt: success, block `408512`, gas used `2,094,872`.
- Outer gas limit: `2,425,614`; current read-only estimate: `2,214,452`.
- Outer input: `836` bytes; value/protocol-fee deposit:
  `100000000000010352`.
- GenLayer result: `Finalized / FinishedWithReturn`.
- Fee deposit: `100000000000010352`.
- Execution fee consumed: `61,886,000,000,000`.
- Storage fee consumed: `1,750,000,000`.
- Settlement/refund transaction:
  `0x3b212f07253e246eb21375d01feb45b376ccf7aae582915e4b08a8681d412723`
- Refunded amount: `99,938,112,250,009,058`.

Measured outer gas preflight:

- Chunk estimates: minimum `2,788,290`, maximum `2,881,024`; all have a
  10% safety margin and remain below the observed cap.
- Activation estimate: `2,214,452`; actual receipt gas: `2,094,872`.
- No activation transaction copies the 42,664-byte source. It switches the
  already verified alternate slot after the final digest check.

Live post-activation reads:

- `get_protocol_version` → `COVRA_ADJUDICATOR_V2`
- `get_case_count` → `0`
- `get_decision_digest(unknown-case)` → empty string
- Installation status reconstructed from finalized receipts:
  `activated=true`, `next_chunk=61`, `staged_bytes=42664`, and activation
  digest equal to the replacement SHA-256.
- Bootstrap-only installer access is absent/rejected after activation.

The durable record is
`docs/deployments/staged-upgrade-proof-0x71538bfe48e0fd6fc5a789caf46ebcbc8c8d86656ab4d51a2c3194d782e37dc1.json`.

## Matched Base Sepolia deployment

After the Bradbury activation was finalized and verified, a separate unfunded
Base Sepolia V2 pool was deployed. It is not the V1 pool and no V1 capital was
moved.

- Network: Base Sepolia, chain ID `84532`
- Pool: `0x208f1b9c5694d9fbde32c81b0489db922e33263c`
- Deployment transaction:
  `0x6f41570b4c89d332b5f502f80c29faf3255dc7afbb8e0a42406806aab8d88d04`
- Deployment block: `58311245`
- Gas used: `3,952,135`
- Circle test USDC:
  `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Bradbury binding:
  `0x71B1Fb863F29c29D4C3f6423196b60589538E491`
- All five V2 pool balances are zero; the V2 pool is intentionally unfunded.

The V1 pool remains `0xd8619d3948c08c8364fd3a7a35dc8a65b254a8e4` and was not
modified. No V2 policy, claim, deposit or settlement was created.

## Boundaries and remaining limitations

- The native staged installation is proven and the V2 code is live at the
  bootstrap address, but no V2 financial lifecycle has been run.
- The application remains V1 by default; V2 routing is explicit opt-in and
  must not be enabled for production traffic while the V2 pool is unfunded.
- The Bradbury `gen_getContractCode` response currently exposes the root/default
  slot, so it is not used as the sole proof of resolved alternate-code
  execution.
- Common-custody attestors remain a functional test quorum, not independent
  operators.
- The historical direct single-transaction V2 deployment remains over the
  observed gas gate; staged installation is the verified alternative.
