# Vercel deployment record

## Current production release and V2 opt-in state — 2026-11-13

- Project: `covra` (linked project id `prj_MEfQ5bR0bq4XEUNg0XzbNtUbfmqi`)
- Target: Vercel production on the authenticated Hobby team
- Deployment ID: `dpl_5PX1EPBB4E8YsaXu7PCwQrpVrx5m`
- Stable alias: [https://covra-lyart.vercel.app](https://covra-lyart.vercel.app)
- Inspection: [Vercel deployment](https://vercel.com/delealufejoel-4184s-projects/covra/5PX1EPBB4E8YsaXu7PCwQrpVrx5m)
- Status: `READY`
- Runtime verification: `/api/health` reported `available` / `testnet`; `/api/protocol-status` reported active `V1`; `/demo`, `/case-study/first-pilot`, and `/app/pools` returned captured HTML responses containing the expected COVRA route content.

This production application remains on the verified V1 pair by explicit default. The native staged V2 pair is now independently deployed and verified: Bradbury/bootstrap `0x71B1Fb863F29c29D4C3f6423196b60589538E491` and Base pool `0x208f1b9c5694d9fbde32c81b0489db922e33263c`, currently unfunded. The existing version-aware routing accepts V2 only when `NEXT_PUBLIC_COVRA_DEPLOYMENT_VERSION=V2` and both V2 public addresses are configured; no production V1 behavior or historical case data is silently switched. No V2 policy, claim or settlement is claimed.

The V2 deployment proof is recorded in [`BRADBURY_DEPLOYMENT.md`](BRADBURY_DEPLOYMENT.md) and [`staged-upgrade-proof-0x71538bfe48e0fd6fc5a789caf46ebcbc8c8d86656ab4d51a2c3194d782e37dc1.json`](deployments/staged-upgrade-proof-0x71538bfe48e0fd6fc5a789caf46ebcbc8c8d86656ab4d51a2c3194d782e37dc1.json). Do not add V2 private keys to Vercel; only the public V2 addresses belong in an opt-in deployment configuration.

## Historical production record — 2026-11-03 (superseded)

Deployment `dpl_7CvirQmqhDGsr6GUtkJ7aVdDhUZk` is READY at https://covra-lyart.vercel.app, using the hardened Base contract and deployment-specific indexer cursor. Real hosted database reads/writes, wallet authentication, scoped agent credential creation/revocation, MCP scope enforcement and prospective quote issuance passed. Authentication replay is rejected using durable atomic nonce consumption (migration 010).

Twenty-four production browser route/device combinations passed, covering all twelve routes at desktop/mobile sizes with screenshots and no horizontal overflow. The wallet verification bridge signs only the exact COVRA login domain/message in Node; no private key enters the browser and no transaction is submitted. Screenshots/results are in ignored `test-results/production/`.

Issuer public identity: `0x2e45D3270eeB6A89e5cD4A9CB55282DFA51d87C5`. The protected existing key is reused, retained in Windows Credential Manager and Vercel Secret. Current exact configuration:

```text
EVIDENCE_ISSUER_HOST=covra-lyart.vercel.app
ATTESTOR_EVIDENCE_HOSTS=covra-lyart.vercel.app
COVRA_APPROVED_ISSUER_HOSTS=covra-lyart.vercel.app
ATTESTOR_ISSUER_WALLETS={"covra-lyart.vercel.app":"0x2e45D3270eeB6A89e5cD4A9CB55282DFA51d87C5"}
NEXT_PUBLIC_COVRA_POOLS_ADDRESS=0xd8619d3948c08c8364fd3a7a35dc8a65b254a8e4
BASE_DEPLOYMENT_START_BLOCK=53734261
BRADBURY_ADJUDICATOR_ADDRESS=0xaefc8672272392310a2ea102787e28bb1f34e1d3
NEXT_PUBLIC_BRADBURY_ADJUDICATOR_ADDRESS=0xaefc8672272392310a2ea102787e28bb1f34e1d3
```

Host lists use comma-separated bare hostnames, not origins or paths; wallet registration is JSON hostname-to-address. These are already configured in production; the operator alone may enter public values locally. `.env.local` remains untouched. Keys, admin tokens, DB credentials, auth pepper and cron bearer stay server-side.

Public observation URLs use `/api/evidence-issuer/observations/:observationId`. No positive policy-bound observation has yet been issued: no real funded policy or attributable covered event exists. Sharing COVRA's Vercel infrastructure does not make this an independent oracle. Supabase Cron job 1, rather than Vercel Cron, performs the five-minute schedule.

## Historical initial deployment — superseded

## Verified deployment

- Project: `covra`
- Target: Vercel production
- Deployment ID: `dpl_44JLSjnJ1Z44VQYU9FPT2VY1pHPv`
- Stable alias: `https://covra-lyart.vercel.app`
- Deployment inspection: `https://vercel.com/delealufejoel-4184s-projects/covra/44JLSjnJ1Z44VQYU9FPT2VY1pHPv`
- Runtime observed in the deployment record: Node.js 26.x, 300-second function timeout
- `.env.local` was excluded by `.vercelignore` and was not uploaded or modified.

## Route verification

Verified over public HTTPS after the deployment became `READY`:

- `/` returned HTTP 200.
- `/api/health` returned HTTP 200 and correctly reported `mode: unconfigured` because Vercel environment variables have not been entered.
- `POST /api/indexer/sync` without the cron bearer token returned HTTP 401.
- `POST /api/evidence-issuer/issue` returned the deliberate HTTP 400 testnet guard because `COVRA_ENV` has not been configured in Vercel; no signing operation occurred.
- `GET /api/evidence-issuer/observations/probe-check` returned the safe HTTP 503 `Evidence store unavailable` response because Supabase is not configured in Vercel yet.

The CLI's optional `--verify` probe timed out once while the alias was propagating; the subsequent direct HTTPS probes above succeeded. The deployment inspection reports `READY`.

The deployment is therefore a verified code/runtime deployment, not a claim that the issuer, database, indexer, or cross-chain lifecycle is live. Enter the server-side variables from [environment setup](ENV_SETUP.md), redeploy, and repeat the authenticated route checks before installing Supabase Cron.

## Public issuer hostname

If the same Vercel origin is used for the demonstration issuer, the exact hostname format is:

```text
EVIDENCE_ISSUER_HOST=covra-lyart.vercel.app
ATTESTOR_EVIDENCE_HOSTS=covra-lyart.vercel.app
COVRA_APPROVED_ISSUER_HOSTS=covra-lyart.vercel.app
```

These values are not populated automatically. `ATTESTOR_ISSUER_WALLETS` must remain unset until a separate dedicated evidence-issuer key is generated and its public address is independently recorded. The issuer key must not equal the Praest deployer, quote signer, or any settlement attestor.

The Base deployment script also requires the derived public wallet as `EVIDENCE_ISSUER_WALLET`; it is not a secret and must be entered only after the dedicated key has been generated and its address independently checked.

## Plan limitation

Vercel Hobby is suitable for this testnet demonstration only subject to its current non-commercial/personal-use terms. It is not the commercial hosting basis for a real insurance launch. Supabase Cron, not Vercel Cron, is the intended five-minute indexer scheduler.
