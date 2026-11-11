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
