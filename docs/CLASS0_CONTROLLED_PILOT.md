# Class 0 controlled testbed pilot

This is a **testnet-only controlled technical demonstration**, not a commercial insurance claim and not independent real-world evidence.

The signed task agreement at [`testbed/class0/task-agreement.json`](../testbed/class0/task-agreement.json) is published before policy inception. Its frozen SHA-256 task specification hash is:

`0x97ea456fd40203a4ac6424955312ec10aa200ceba0a855bf01022c7d408b0f74`

The task requires a JSON deliverable to be present at the specified public repository path by `2026-11-11T09:25:00.000Z`. The observer workflow checks that path only after the deadline and publishes a COVRA-shaped public observation. The workflow, repository, observer, task agreement and testnet penalty accounting are controlled by COVRA. No external commercial counterparty, independent operator or real contractual penalty is asserted.

The observation is usable for exercising the deployed class-0 protocol and its policy-bound evidence, claim, adjudication and settlement controls only with that disclosure. It must not be presented as proof of an independently verified service failure or as genuine insurance coverage.

The observation facts retain the deployed terms requirements:

- `task_id` equals the frozen subject;
- `task_spec_hash` equals the frozen reference hash;
- `missed_deadline` is derived from the deliverable path at the frozen deadline; and
- `contracted_penalty_micro_usdc` is the one-USDC testnet accounting amount in the signed agreement.

The issuer will retrieve the observation over an immutable raw GitHub HTTPS URL, publish an `OBSERVED_PUBLIC` COVRA evidence envelope, and bind it to the claim. The issuer remains COVRA-operated; its signature proves issuer identity and envelope integrity, not the truth or independence of the underlying task outcome.

For the live pilot, `EVIDENCE_ISSUER_DEMO_TOKEN` is a separately generated Vercel Secret used only by the controlled execution process. It is not the issuer signing key, quote signer, deployer key or an attestor key. The existing administrator token remains unchanged.

## Live testnet result — 2026-11-11

The controlled pilot was exercised with a real one-day Base Sepolia policy. The $99 class-0 pool deposit and $1 premium were transferred into the deployed pool before the policy was purchased; the policy then reserved the full $100 limit. The exact Base receipts and readbacks are recorded in [`class0-base-funding-purchase-2026-11-11.json`](deployments/class0-base-funding-purchase-2026-11-11.json).

The immutable observer record was issued by the repository workflow at [`e0b235c`](https://github.com/ometere123/covra/commit/e0b235c732b7afa60c37cfc719d26c477945ad14). The Vercel issuer returned a claim-bound `OBSERVED_PUBLIC` envelope whose signature recovered to the approved issuer wallet `0x2e45D3270eeB6A89e5cD4A9CB55282DFA51d87C5`; its digest is `0xd8a2318604d39bd6bd39391cf020455e283e6ec00bea797a51d6a3de7b517fff`. The Base claim lock finalized in `0x561ad6d0efbcf681953fb22845f22e00a6b65ae809c27b2132b9e5abf394df08` at block `57340019`.

Bradbury `submit_case` finalized successfully as `0x92cb881154e1adc3a90795a63cc8f786ecf2df10b30bee95e29e62f9e02af84a`, and `adjudicate` finalized successfully as `0x9d592885d77fda8215bcafcc304e6611edcda27511838cd09fe04801dd0cc597`. Five validator votes were revealed for each transaction. The final decision is **`INSUFFICIENT_EVIDENCE`**, not `COVERED`: the adjudicator explicitly recorded that the source, workflow and observer are COVRA-controlled and that operator independence is not verified. The production claim ledger is reconciled to `DECIDED` with both Bradbury hashes.

No payout was authorized or submitted. The deployed Base contract rejects both the unsupported insufficient-evidence verdict and a denial with zero attestor signatures in read-only simulations (`InvalidInput` and `InvalidAttestation`, respectively). The full machine-readable continuation state, including fee refunds, is [`class0-live-lifecycle.json`](deployments/class0-live-lifecycle.json). The adjudicator's 72-hour appeal/finalization gate is not shortened; the earliest lawful `finalize_case` time recorded by the run is `2026-11-14T09:41:17Z`. This is a functional testnet lifecycle through an honest negative decision, not proof of an independently verified service failure, commercial insurance, or independent attestor operation.
