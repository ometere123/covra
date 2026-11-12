# Base Sepolia deployment — 2026-11-03

## Current hardened deployment

- Pool: `0xd8619d3948c08c8364fd3a7a35dc8a65b254a8e4` (all five coverage classes).
- Successful transaction: `0xfe01a9b68ac5a54df1173231c49838a0d67ba37be35e85624cd7d912461f93f2`.
- Block: `53734261`; gas used: `3952135`.
- Source SHA-256: `49b19bfa5eb7162766b5b9c8224b565aed18dfa0362e634981b2dfe5af9cc3d1`.
- Compiler: `0.8.38+commit.1835d247`, optimizer 200, viaIR.
- Sourcify completed job `0bc5f539-1fca-4051-928b-2715d101d8e1`: creation and runtime **exact_match**, match ID `58152728`.
- [Source verification](https://repo.sourcify.dev/84532/0xD8619d3948c08c8364fD3a7a35Dc8a65B254A8e4), [transaction](https://sepolia.basescan.org/tx/0xfe01a9b68ac5a54df1173231c49838a0d67ba37be35e85624cd7d912461f93f2).
- Live readback verifies owner, permanent deployment authority, separate quote/issuer identities, bound adjudicator, Circle USDC and all five configured attestors.
- Role rotations cannot merge administration, quoting, issuer or attestation authority. Retired attestors remain barred from owner/quote roles because old claims retain roster snapshots.
- At the current pilot read, class 0 has `100 USDC` assets, `100 USDC` reserved, `1 USDC` premium and `0 USDC` paid against the live class-0 policy; classes 1–4 remain unfunded. The current class-0 reserve and lawful release path are documented in [the public operations runbook](PUBLIC_DEMO_OPERATIONS.md).
- The first class-0 pilot produced no payout. Vercel uses this address and block, and the indexer has a separate deployment-bound cursor.

Full public receipt/configuration/code-hash record: `docs/deployments/base-84532-0xfe01a9b68ac5a54df1173231c49838a0d67ba37be35e85624cd7d912461f93f2.json`.

## Superseded, preserved deployment

The deployment below was replaced to close role-rotation overlap. It was independently confirmed empty before pausing new sales. Pause transaction `0xc823bf6bf8ceb102cd8b9dd8bc1e76c130679f8f9e659f3d34661ec35dcc8176` succeeded at block `53734569`. Its history is retained; do not configure new purchases against it.

- Chain: 84532.
- Pool contract (five ring-fenced classes): `0xab4436b8ff15b7fa209e2018300d1741db0dfad1`.
- Successful deployment transaction: `0x5945c5e6637ac9b4811ea4b7ed88c30de077676790c8c2de8d34e318c9fcdabc`.
- Actual deployment block: `53729517`.
- Owner: `0xa5840e65a15021d8b1648dB10176c04811f07873`.
- Quote signer: `0x870d04144Ef72B02B1740D7c6a893036F29fb3A4`.
- Evidence issuer: `0x2e45D3270eeB6A89e5cD4A9CB55282DFA51d87C5`.
- Bound Bradbury adjudicator: `0xaefc8672272392310a2ea102787e28bb1f34e1d3`.
- Official Circle test USDC: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`.

Deployment receipt succeeded with two confirmations. Funding and policy/payout transactions are not yet verified. Deployer's last checked USDC balance was zero. No pool balances or payouts are invented.

Explorer: https://sepolia.basescan.org/address/0xab4436b8ff15b7fa209e2018300d1741db0dfad1
