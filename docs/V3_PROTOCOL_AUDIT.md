# V3 protocol audit

| Review concern | Existing control | Remaining V3 implementation and acceptance evidence |
| --- | --- | --- |
| Witness independence | V2 commits to origin bytes and compares structured validator findings. The issuer signs the envelope. | Freeze source operators with the risk spec. Check control and conflicts independently of hostname and issuer labels. Verify raw provider records through bounded, deterministic adapters. Test claimant-controlled sources, shared operators, false attribution and source outages. |
| Coverage terms | Existing terms and risk specs are hashed. The attestor derives capped payouts from coverage-specific facts. | Commit waiting periods, accepted causes, exclusions, loss attribution and recovery deadlines to the purchased version. Test every threshold boundary and keep payout authority outside model output. |
| Correlated exposure | Base reserves each policy's maximum liability against its class pool. | Atomically cap provider and group exposure across classes without reducing benefits on issued policies. Test simultaneous purchases, shared dependencies and exact counter release on every terminal path. |
| Insufficient evidence | The existing appeal can revise evidence. Finalized insufficient evidence cannot produce a settlement certificate. Base has an expiry path. | Provide bounded evidence cure, then an explicit terminal unproven decision. Bind reserve release to the final decision, exact policy and latest revision. Test late cure, pending appeal, source recovery and premature release. |

The deployed V1 digest hashes ten fields. V2 adds eight structured decision fields. Both use SHA-256 over sorted, compact UTF-8 JSON. The claim-proof route derives the deployment from the confirmed Base purchase receipt and validates its adjudicator binding. Attestor preflight uses the configured pair and independently checks the on-chain binding and claim revision before producing a candidate certificate. Historical routing in other application paths still requires verification.

V3 has no verified deployment or lifecycle in this revision. The compatibility verifier rejects V3 until its canonical decision format is defined and tested.
