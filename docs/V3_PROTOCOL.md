# COVRA V3 implementation and verification

V3 separates the underwriting decision, witness verification, GenLayer adjudication and Base settlement. This branch contains local implementations. V3 has no deployed addresses or verified financial lifecycle.

## Underwriting and release

The Base constructor pins exposure caps and the eligible provider and common-cause mapping. The same provider and common-cause counters apply across coverage classes. Groups start closed. Opening a group requires owner execution and three roster signatures. Retirement stops new sales while existing liabilities retain their coverage and reserve. Each active policy reserves its maximum liability. Terminal payout, denial, unproven closure and expiry decrement the same counters once.

Base settlement uses the EIP-712 COVRA version 3 domain. Settlement binds the policy, latest evidence revision, result digest, source chain, adjudicator, beneficiary, timing and claim-time roster. Unproven closure uses verdict code 3 and zero payout. Expiry remains available after the bounded resolution deadline. The quorum must verify the cross-chain facts before authorizing any disposition.

## Coverage

`src/lib/v3-terms.ts` defines the five separate term commitments and deterministic testnet payout calculations. The initial delay is 900 seconds. Reporting lasts 14 days after expiry. The cure period is seven days and the appeal window is 72 hours.

| Class | Covered trigger | Maximum payout |
| --- | --- | --- |
| Service failure | Independently corroborated failure to satisfy a signed delivery obligation | Verified contracted penalty up to the limit |
| Dependency outage | Attributable continuous unavailability of the frozen service | 25%, 50% or 100% of the limit at 30, 60 or 120 minutes |
| Execution error | Executed action outside a signed mandate that directly causes loss | Verified direct loss up to the limit |
| DeFi protection | Eligible exploit, bridge compromise or sustained depeg of at least 500 basis points for one hour | Verified realized loss up to the limit |
| Business interruption | Attributable interruption of at least two hours with baseline-backed loss | Net attributable loss up to the limit |

## Evidence and adjudication

The V3 evidence library commits the frozen method and registry revision. For independent witnesses it verifies distinct governance-reviewed control groups, conflict checks, signatures and the received raw-byte digest. The GitHub Status adapter uses the provider's fixed public endpoint and returns provider-reported observations. Independent probe records are a separate requirement. See the [GitHub Status API](https://www.githubstatus.com/api).

The GenLayer contract implements evidence pending, one cure, one appeal, and terminal unproven closure. The canonical SHA-256 digest binds the state, incident time, revision, decision timestamps and structured findings. The Base contract and the local TypeScript verifier use separate version-aware domains and encodings.

V3 remains gated until GenLayer can verify a frozen operator registry and signed source records, and until the claim coordinator verifies and applies compatible revision and timing rules on both chains. The current witness format uses EIP-191 signer recovery through viem. The pinned GenVM runner has no verified equivalent integration for that format. GenLayer also needs authenticated Base policy commitments and deterministic fact extraction from each raw record. The GenLayer contract fails closed for financial dispositions. V3 transaction routing remains disabled. Independent operator onboarding and a qualifying incident are subsequent operational requirements.

For the verified offline candidate, the readable GenLayer source SHA-256 is `03736dbd47a875ceaf547c942de5fe9d56a8d088ede79d1c16e80faa4e617030`. The generated artifact is 45,386 bytes and 65 chunks, with SHA-256 `f78f6914a83dc6d5a9d73785d58ef958d4ad5951b5396602bebfa49cba872257`. The staged installer verified exact slot readback in Direct Mode. Live gas and activation remain unverified.

## Reproduction

```sh
npm ci
npm run typecheck
npm test
forge test --root contracts/base -vv
python -m unittest discover -s scripts -p test_prepare_v3_staged.py
python scripts/prepare-v3-staged.py --verify
python -m pytest tests/python/test_adjudicator_v3_direct.py -q
```

Run the Python checks with the pinned runtime installation used in the Linux quality gate. Stage artifacts into a new directory when rerunning the preparation command.
