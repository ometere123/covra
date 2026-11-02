# Execution checkpoint

Overall assignment remains incomplete. Continue automatically with unblocked tasks.

| Task | Status | Evidence / next action |
| --- | --- | --- |
| Existing GitHub main publication | Verified complete | origin ometere123/covra; preserve history |
| Positive-control deployment | Verified complete | 0x5485f4ad127b5f856820315b1bbf41c6c24e17ed64221ef8e0b64056620025e2: Finalized / FinishedWithReturn |
| Positive-control identity | Verified complete | address 0x3e60d7f8467d67c53e5cc74e8a31876cbdf7b8a1; actual schema retrieved; code SHA256 b8b37b434b91cd6ce9d2c279951407b8859bcea2f968274ec35aefad2f7aa738 equals local source |
| Persistent read/write | In progress | initial read 0; increment tx 0x742bb8539a0fb4470bdbf0c88ee15e20bb21d38fde955b325182cb010e76ce1e; subsequent node read 1; verify write finality and refund logs |
| Fee correction | In progress | checked-in patch-package patch passes application; actual estimation succeeds without fetch interception; requires regression tests, clean-install and browser verification |
| CI repair | In progress | host unittest discovery now explicitly targets test_adjudicator_logic.py; eight host tests pass; rerun GitHub CI after push |
| Direct Mode / semantic lint | Tooling blocked, investigate | cached rc7 lacks babwp runner; preserve known Bradbury runner; locate official runners-all artifact/manager |
| Full adjudicator security and deployment | Not complete | do not deploy before required runtime/security checks |
| Base deployment / full lifecycle | Dependency blocked | adjudicator and issuer identity required; three actual authorized attestor signing identities needed |
| Evidence issuer / Vercel / Supabase Cron | Not complete | verify available configuration without reading or changing .env.local; earlier hosted environment was unconfigured |
| Full frontend/API/MCP/security verification | Not complete | retain prior passing results; close new regressions |

The production SDK patch passes `client.account` into the existing FeeManager simulation, retaining its current-policy gas price. It changes neither estimated budgets nor fee accounting. It is pinned to SDK 2.0.0-rc.2 and applied with postinstall. Callers must configure their funded account.

CLI read default selected an EVM-only endpoint (`gen_call` unavailable); explicit JS client endpoint https://rpc-bradbury.genlayer.com successfully reads state, code and schema. Do not interpret that CLI routing error as a failed deployment.

Recover pending write with `gen_getTransactionReceipt` for the hash above. No repeat deployment or increment needed. Capture final fee settlement/refund from actual events rather than subtracting estimated fields.

Tests currently launched: npm test (session 35304); patch generation helper (57447, may be waiting on npm registry); CLI write polling (65188). Recover or terminate these exact processes before starting duplicates. No background scheduler is claimed.

No .env.local access or modification was performed. Avoid logging secrets. Next: finish current tests, add fee regression coverage, verify write finality, push and inspect CI; then resume remaining gates.
