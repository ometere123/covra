# Head of Growth demonstration script

This is a testnet demonstration. COVRA provides no real insurance coverage, collects no commercial premium, and makes no licensed underwriting representation.

1. Open the hosted HTTPS COVRA app at `https://covra-lyart.vercel.app` and show the testnet banner, Base Sepolia `84532`, Bradbury `4221`, and Circle test USDC address. Production database/authentication/issuer configuration is complete; contracts are deployed, Cron runs, and balances are honestly zero. Clearly disclose that funded claims and cross-chain payout have not yet been demonstrated.
2. Connect the funded wallet. On **Capital pools**, deposit Circle test USDC into each class to be demonstrated. Approve only each intended deposit, then verify the confirmed transfer and that only the selected class's capital changed. For a purchase, fund that class for at least the quoted coverage limit and leave separate USDC for the premium. Show the chosen class, frozen terms hash, risk subject, evidence host and non-binding quote.
3. Show the quote's signer and deadline. Explain that an agent credential is scoped and cannot spend funds by itself.
4. Approve only the test USDC allowance needed for the wallet's explicit purchase, then purchase on Base Sepolia. Show the confirmed receipt and indexed policy state.
5. Open an owned claim intake with both public evidence fields empty. Give the claim UUID and the exact incident time to the approved issuer operator.
6. Issue an `OBSERVED_PUBLIC` record from an attributable public HTTPS observation. Show the source URL, raw-source digest, public JSON, envelope digest, issuer wallet, expiry and independently recovered signature. Issuance binds the evidence digest to the pending intake. Resume the claim, lock it on Base and show the 12-confirmation requirement. If genuine eligible evidence is unavailable, leave the intake pending.
7. Submit the exact Bradbury case and request adjudication. If an eligible appeal has new attributable evidence, submit the appeal, synchronize its evidence revision on Base, and request the revised decision. Wait through the claim appeal window before calling `finalize_case`. Verify its successful finalized receipt, including transaction ID, adjudicator, method, arguments and finalized decision digest. Keep a submitted or appealed claim pending while its required windows or confirmations are open.
8. Run independent preflight checks and obtain three signatures from three distinct authorized attestors. Explain that the claim snapshots the five-member roster at lock time.
9. Submit settlement on Base Sepolia. Show that the frontend first displays pending, then confirmed, and that `ClaimSettled`/`ClaimDenied` is independently verified before it says paid/denied.
10. Run the indexer endpoint and reconciliation report. Show the cursor, recent run, event history, on-chain state, and zero mismatches.
11. Use the MCP lifecycle inspection tool with a scoped read credential to show the same claim and receipt history. It cannot sign or settle.

Negative demonstrations:

- alter one evidence byte or issuer signature: verification rejects it;
- use a wrong Bradbury method, wrong claim, wrong adjudicator, accepted receipt, or stale state: exact provenance verification rejects it;
- submit two signatures, duplicate a signer, use an unknown signer, or reuse a certificate on another claim: Base settlement rejects it;
- revoke/supersede an observation: the public issuer route returns `410` and attestor preflight fails closed;
- attempt to let an agent redirect a delegated purchase or invoke settlement directly: scope and wallet authorization reject it.

Any step that cannot produce a real testnet receipt is presented as pending or blocked, never as completed.
