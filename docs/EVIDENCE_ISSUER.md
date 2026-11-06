# Hosted evidence issuer

COVRA's evidence issuer is implemented as server-side Node.js routes in the Next.js application intended for Vercel. It is a demonstration issuer, not an operationally independent oracle: the frontend, issuer and operator control plane share one hosting boundary. That limitation must be replaced or independently monitored before commercial use.

## Routes

- `POST /api/evidence-issuer/issue` — operator-only issuance from an independently retrievable public HTTPS observation.
- `GET /api/evidence-issuer/observations/:observationId` — stable public HTTPS observation record.
- `POST /api/evidence-issuer/revoke` — operator-only revocation or supersession.

Issue and revoke require `Authorization: Bearer <EVIDENCE_ISSUER_ADMIN_TOKEN>`. The issue body is deliberately narrow:

```json
{
  "observationId": "provider-outage-<operator-id>",
  "claimId": "<claim UUID>",
  "sourceUrl": "https://<approved-public-source>/<observation>.json"
}
```

The route loads the claim, policy and immutable risk specification from Supabase. It does not accept caller-supplied facts, payout amounts, issuer wallets or assertions. The server retrieves the source itself and only signs a strict response containing `observation_id`, `coverage_class`, canonical UTC `event_time` and class-specific `facts`. The facts must match the frozen subject/reference and both TypeScript and the GenLayer contract's class predicates.

To obtain a claim UUID before signing, open an owned intake with both evidence fields empty. The issuer requires the observation time to match the intake time and publishes the envelope with a canonical millisecond UTC timestamp. It saves the observation and binds its public URL and digest to the unanchored intake in one database transaction. Resume the intake to load the commitment before locking reserves. Issuing a replacement observation leaves any existing commitment in place for the separate appeal path.

The source request is constrained to HTTPS without credentials, fragments or nonstandard ports. DNS results are checked against loopback, private, link-local and metadata ranges; redirects are rejected; the response must be JSON and at most 32 KiB; the request has a 10-second timeout. The raw source response digest is bound as `origin_payload_digest`, while `source_payload_digest` is the digest of canonical signed facts. These digests support reproducible review but do not prove that the external source is truthful.

## Canonical evidence format

The public response body is canonical JSON, with lexicographically sorted object keys. Its SHA-256 digest is the `evidenceDigest` returned by the issue route and the `x-covra-evidence-digest` response header. The envelope includes:

- policy, claim, terms, risk specification and coverage-class bindings;
- `observation_id`, `event_time` and `observed_at` in UTC ISO-8601 form;
- `observation_mode: "OBSERVED_PUBLIC"` for production issuance;
- issuer host, exact public endpoint, external origin URL, retrieval method and both digests;
- dedicated issuer wallet, signing time, expiry and an EIP-191 signature;
- class-specific facts required by `validateCoverageFacts` and the frozen risk subject/reference.

The production envelope schema accepts only `observation_mode: "OBSERVED_PUBLIC"` and `retrieval_method: "https_get"`. Isolated tests may construct simulated or fixture-shaped invalid payloads to prove that the verifier rejects them; the hosted route never produces them and the product never renders them as activity.

The issuer signs `COVRA-ISSUER-EVIDENCE:` plus the SHA-256 digest of the canonical unsigned envelope. Attestors and the backend independently recover the signer and compare it to the approved host-to-wallet map. A matching digest without an approved issuer signature is not accepted.

The public route returns `410` after expiry, revocation or supersession. Revocation prevents future retrieval without mutating the signed observation. Attestor preflight checks the issuer wallet against both the approved host map and the wallet bound on Base. The quorum signs a deadline no later than the last second before evidence expiry. Issuer revocation alone cannot invalidate an already signed Base certificate before its deadline. Confidential user evidence remains in the private Supabase bucket.

## Required configuration

`EVIDENCE_ISSUER_PRIVATE_KEY` is a dedicated key and must not equal the Praest deployer, Base deployer, quote signer or any attestor. `EVIDENCE_ISSUER_WALLET` is its derived public address and is required by the Base constructor to enforce that separation on-chain. `EVIDENCE_ISSUER_ADMIN_TOKEN` authorizes the operator workflow and remains server-side. `EVIDENCE_ISSUER_HOST` is a bare lowercase hostname, not an origin or URL. `ATTESTOR_EVIDENCE_HOSTS` is a comma-separated hostname allowlist. `COVRA_APPROVED_ISSUER_HOSTS` uses the same hostname format. `ATTESTOR_ISSUER_WALLETS` is JSON mapping each approved hostname to the issuer public wallet.

The production configuration uses `covra-lyart.vercel.app` for both host allowlists and `{"covra-lyart.vercel.app":"0x2e45D3270eeB6A89e5cD4A9CB55282DFA51d87C5"}` for `ATTESTOR_ISSUER_WALLETS`. The public wallet matches the issuer configured in the verified Base deployment. The private key is held in Vercel server-side configuration. The operator must verify the provenance of the public source before issuance. HTTPS and the issuer signature alone establish retrieval and integrity, while independent attestors evaluate the underlying evidence before settlement.
