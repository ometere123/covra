# Environment and integration setup

This file tells you **exactly what to collect on your PC**. The complete machine-readable variable list is in the repository root `.env.example`. You can begin with **no credentials**: the user interface shows genuine empty and awaiting-configuration states; sensitive actions remain disabled.

## First: prepare local Windows environment

1. Install Node.js 22+ (24 recommended), Git, VS Code and a wallet extension (MetaMask or another EIP-1193 wallet).
2. Extract COVRA, open PowerShell in the extracted `covra` directory.
3. If `.env.local` does not already exist, run `Copy-Item .env.example .env.local`, then run `npm ci`. Never overwrite an operator-populated `.env.local`.
4. Ensure `.env.local` remains untracked. It is ignored by `.gitignore`. Never upload real keys, seeds, service-role tokens, signed API secrets or server connection strings to chat, GitHub or Vercel's public environment.
5. `npm run dev` to inspect the frontend. A browser wallet is optional for public read-only pages; no fabricated operational records are loaded.

## Variables by priority

| Name | What you supply / where to get it | Need for |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Local URL; later production hostname | Auth/domain |
| `COVRA_ENV` | `testnet` only | Writes testnet-only |
| `AUTH_SECRET` | Unique random secret at least 32 characters | Wallet session |
| `AGENT_API_KEY_PEPPER` | Another unique random secret at least 32 characters | Hashing agent credentials |
| `DATABASE_URL` | Supabase Postgres server connection string, server-only | Claims, policies, keys, migration |
| `DIRECT_URL` | Supabase direct database connection, optional/reserved | Schema tooling |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Private storage client configuration |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key (currently unused by app) | Optional client integration |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role / secret key, **server only** | Private evidence bucket |
| `SUPABASE_EVIDENCE_BUCKET` | `covra-evidence-private` (must be private) | Storage |

| `BRADBURY_CHAIN_ID` | `4221`, fixed | Chain identity |
| `BRADBURY_CHAIN_RPC_URL` | `https://rpc.testnet-chain.genlayer.com/` | Bradbury EVM checks |
| `BRADBURY_NODE_RPC_URL` | `https://rpc-bradbury.genlayer.com` (verified `gen_getTransactionReceipt`; recheck network identity before deployment) | Actual IC deploy/reads |
| `NEXT_PUBLIC_BRADBURY_NODE_RPC_URL` | `https://rpc-bradbury.genlayer.com` (public unkeyed endpoint verified for `gen_*`; never add query tokens) | Wallet-signed browser `submit_case` |
| `BRADBURY_EXPECTED_GENESIS_HASH` | Official Phase 2 genesis: `0x17d89764d4f4f963158fc4c5e8f2cb670c2837740b35f37081c12860c3df97e4` | Reset-chain safety pin |
| `BRADBURY_ADDRESS_MANAGER` | Phase 2 manager: `0x3F71AE080BD6270A91dBcc7960d88797828538E0` | Verify against official networks docs |
| `BRADBURY_ADJUDICATOR_ADDRESS` | Address of *your own* finalized COVRA GenLayer deployment | Base payout contract constructor |
| `NEXT_PUBLIC_BRADBURY_ADJUDICATOR_ADDRESS` | Public copy of deployed Bradbury Intelligent Contract address | Claim-screen Bradbury submission |
| `BASE_CHAIN_ID` | `84532`, fixed | Base Sepolia |
| `BASE_RPC_URL` | Base Sepolia HTTPS RPC; can use public endpoint or provider | Server/contract deploy |
| `NEXT_PUBLIC_BASE_RPC_URL` | Safe public Base Sepolia RPC | Browser |
| `NEXT_PUBLIC_BASE_USDC_ADDRESS` | Circle's official Base Sepolia testnet USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` | USDC transfers |
| `NEXT_PUBLIC_COVRA_POOLS_ADDRESS` | Address printed by successful **Base testnet** deploy | Purchase, pool reads |
| `BASE_DEPLOYMENT_START_BLOCK` | Block printed by deployment script | Policy indexing |
| `QUOTE_SIGNER_PRIVATE_KEY` | Dedicated disposable private key, **not** deployer wallet | Server EIP-712 quote signing |
| `NEXT_PUBLIC_QUOTE_SIGNER_ADDRESS` | Address of that signer, informational | Optional UI integration |
| `DEPLOYER_PRIVATE_KEY` | Disposable Base Sepolia-funded deployer; **never a personal wallet** | Solidity deploy only |
| `ATTESTOR_ADDRESS_1` to `ATTESTOR_ADDRESS_5` | Five unique addresses, each operated by independent verifiers | Base settlement threshold |
| `ATTESTOR_EVIDENCE_HOSTS` | Exact independently authorized HTTPS hostnames, comma-separated | Attestor source checks |
| `COVRA_APPROVED_ISSUER_HOSTS` | Exact issuer hosts approved by COVRA before executable quotes | Insured exposure quote issuance |
| `ATTESTOR_ISSUER_WALLETS` | Hostname-to-public EIP-191 issuer wallet JSON mapping, maintained by each attestor | Authentic observation verification |
| `EVIDENCE_ISSUER_PRIVATE_KEY` | Isolated independent evidence producer key; use only on that producer's machine, not app server | Issue public observation signatures |
| `EVIDENCE_ISSUER_HOST` | Exact hostname that this independent issuer is authorized to sign | Issuer authority |
| `EVIDENCE_ISSUER_WALLET` | Public address derived from the dedicated evidence issuer key | Base constructor identity-separation check |
| `EVIDENCE_ISSUER_ADMIN_TOKEN` | Separate operator-only bearer token, server-side only | Authorize deterministic issue/revoke workflow |
| `EVIDENCE_ISSUER_TTL_SECONDS` | Issuer signature validity, default 110 days (maximum 120); allows claim appeal/finality | Evidence validity |
| `ATTESTOR_PRIVATE_KEY` | One operator's private key on its own device, never all five on the app host | Independently authorized settlement/extension |
| `ATTESTOR_MANUAL_APPROVAL` | Set exactly to `I_INDEPENDENTLY_VERIFIED_THIS_CASE` after real individual review | Signer safety interlock |
| `COVRA_DEPLOY_CONFIRM` | Set `TESTNET_ONLY` only when ready to deploy | Prevent accidental deployment |
| `INDEXER_CRON_SECRET` | Random long bearer secret for indexing endpoint | Automated policy read model |
| `RESEND_API_KEY`, `EMAIL_FROM` | Optional mail service (not yet wired) | Future notifications |
| `SENTRY_DSN` | Optional monitoring (not yet wired) | Future operations |
| `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` | Optional source attestation (not wired) | Future evidence integration |
| `MONITORING_PROVIDER_API_KEY`, `CHAIN_INDEXER_API_KEY` | Optional provider integrations (not wired) | Future external evidence feeds |

## Generate secrets safely

In PowerShell with Node.js installed, generate separate values for `AUTH_SECRET`, `AGENT_API_KEY_PEPPER` and `INDEXER_CRON_SECRET`:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Run it three times. Paste only into `.env.local` and your hosting provider's encrypted secret configuration. A project feature is not safe merely because a variable appears in an example file.

After entering the dedicated issuer key yourself, derive its public address without printing the key:

```powershell
node --env-file=.env.local -e "const {privateKeyToAccount}=require('viem/accounts'); console.log(privateKeyToAccount(process.env.EVIDENCE_ISSUER_PRIVATE_KEY).address)"
```

Record that output as `EVIDENCE_ISSUER_WALLET`, and use the same public address in the hostname entry of `ATTESTOR_ISSUER_WALLETS`. Verify manually that it differs from the Praest deployer, Base deployer, quote signer and all five attestors before Base deployment.

## Supabase

Create a new Supabase project, apply **all** ordered SQL migrations (001 through 008) using `npm run db:migrate` after configuring a URL-encoded `DATABASE_URL`, and create a private bucket exactly matching `SUPABASE_EVIDENCE_BUCKET`. Do not enable public listing of evidence. The service role must never be sent to the browser. Access private data only through authenticated server routes. Use Supabase encrypted backups.

## Base Sepolia and Circle testnet USDC

Add Base Sepolia to your wallet (chain 84532) and obtain testnet ETH for gas and **Circle testnet USDC** using current official faucets. USDC must be the official Circle contract above, **not an arbitrary mock token**. Use a disposable testnet wallet.

Configure a **quote signer wallet** different from the deploying/capital-pool owner. For on-chain Base deployment, additionally prepare five unique attestor addresses; deploying with five addresses you privately control yourself is only a **development demonstration**, not the independent security property. Praest is reserved for the disposable Bradbury deployment wallet and is not reused for Base, evidence, quoting, or attestation.

After Bradbury adjudicator address is known, set `COVRA_DEPLOY_CONFIRM=TESTNET_ONLY` and run:

```bash
npm run typecheck
npm run test
npm run test:solidity
npm run deploy:base
```

The deploy script verifies Base Sepolia chain ID and that the configured USDC address is a deployed contract. It prints the COVRA pools address and deployment block. Copy those to `.env.local` and restart.

## Bradbury Phase 2

- Chain ID: `4221`.
- EVM RPC: `https://rpc.testnet-chain.genlayer.com/`.
- This network is a reset testnet; all previous contract addresses and state are invalid.
- Bradbury Phase 2 uses Consensus v0.6 fees. This source ZIP pins `genlayer-js@2.0.0-rc.2`, not the StudioNet `1.1.8` stable library. The verified CLI is `genlayer 0.40.0-rc.5`; `0.39.1` and older `0.40` RC profiles may contain stale Phase 2 fee-manager addresses.
- `npm run genlayer:smoke` checks the **EVM** chain ID only; it does not simulate validator/GenVM consensus.
- Use Praest on Bradbury only, with a separate verified GenLayer execution RPC. The contract uses the v0.3 declaration and the locally available `py-genlayer:1zr6nqk597d97kg0dyxg0shhrykx5v02zjgnyrajapy4wlqvfvwh` pin. Run `npm run genlayer:preflight` against `contracts/genlayer/BradburyPositiveControl.py` first; it must return a schema before any deployment. Then deploy `contracts/genlayer/CovraAdjudicator.py`, record its deployment transaction and address, and prove `submit_case → adjudicate → [optional appeal → adjudicate] → wait three days → finalize_case → get_decision_digest` with current runner and validators. Each write incurs v0.6 fees. Until that succeeds, leave adjudicator-dependent paths unconfigured. The current public endpoint fails this preflight with `invalid_contract runner malformed`; this is recorded as an external Bradbury runtime blocker, not a successful deployment.
- The browser `submit_case` write estimates fees before sending; the onchain case does not adjudicate itself. If the public GenLayer node is unavailable, keep this action disabled and use independent CLI verification once your own endpoint exists.
- Run `npm run attestor:preflight -- 0xCASE_ID 0xFINALIZATION_TX_ID` after independently verifying the issuer host/wallet mapping. This helper never signs; each operator must separately run the sign/aggregate tools described in [claim protocol](CLAIM_PROTOCOL.md).

## Deploy the web app

The current Vercel project is `covra` at `https://covra-lyart.vercel.app`. Copy the **server-only** secrets into Vercel Environment Variables for the desired environment; never run `vercel env pull` over the operator's local file. Copy only `NEXT_PUBLIC_*` fields into frontend-exposed configuration. Protect preview and admin endpoints; configure the Supabase-backed indexer job from [indexer operations](INDEXER_OPERATIONS.md). Vercel Hobby is for personal, non-commercial use under Vercel's current plan terms; that restriction must be cleared before any commercial launch. Hobby Cron is not suitable for this five-minute schedule, so Supabase Cron remains the scheduler.
