# Vercel deployment record

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
