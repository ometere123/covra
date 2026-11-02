# Head of Growth demonstration script

This is a testnet demonstration. COVRA provides no real insurance coverage, collects no commercial premium, and makes no licensed underwriting representation.

1. Open the hosted HTTPS COVRA app at `https://covra-lyart.vercel.app` and show the testnet banner, Base Sepolia `84532`, Bradbury `4221`, and Circle test USDC address. The current deployment is code/runtime verified but remains unconfigured until Vercel environment variables are entered.
2. Connect a demonstration wallet and show one of the five coverage classes, its frozen terms hash, risk subject, evidence host, and non-binding quote.
3. Show the quote's signer and deadline. Explain that an agent credential is scoped and cannot spend funds by itself.
4. Approve only the test USDC allowance needed for the wallet's explicit purchase, then purchase on Base Sepolia. Show the confirmed receipt and indexed policy state.
5. Create a claim intake with a public evidence URL and commitment. Lock it on Base and show the 12-confirmation requirement.
6. From the operator-only evidence workflow, select an attributable public HTTPS observation. Issue an `OBSERVED_PUBLIC` record only after the issuer retrieves and validates that source. Show the source URL, raw-source digest, public JSON, envelope digest, issuer wallet, expiry and independently recovered signature. If no genuine event is available, leave the claim pending; do not manufacture one.
7. Submit the exact Bradbury case, then verify the finalized receipt's transaction ID, adjudicator, method, every argument, and finalized state. A string search is not evidence.
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
