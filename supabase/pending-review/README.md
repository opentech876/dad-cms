# Pending-review DB changes — 2026-07-13

Security/performance hardening drafted from the Supabase advisors + a manual
audit. **Nothing here has been applied.** These files live in a subfolder so
`supabase db push` will *not* pick them up. To apply one: review it, move it
into `supabase/migrations/` with a fresh timestamp prefix, then push.

## Files

| File | Advisor | Risk | Ready? |
|------|---------|------|--------|
| `2026-07-13_p1_rls_initplan.sql` | `auth_rls_initplan` (P-1) + `multiple_permissive_policies` devices dedup (P-2) | **Low** — semantics-preserving | ✅ ready to apply |
| `2026-07-13_p3_fk_indexes.sql` | `unindexed_foreign_keys` (P-3) | **Low** — additive | ✅ ready to apply |
| `2026-07-13_security_hardening.sql` | `function_search_path_mutable` (S-4) + `anon_security_definer_...` (S-2/S-3) | S-4 low / **S-2 needs allowlist confirmation** | ⚠ review S-2 block |
| `2026-07-15_footer_only_ads.sql` | Business rule: one ad at a time, footer only — normalize rows, default + CHECK | **Low** — column kept for mobile compat | ⚠ confirm with mobile dev (2 questions in file header) |
| `2026-07-16_curation_fixes.sql` | **One-shot Espace Curation fix**: apply RPCs get replacement semantics (remove occupant + move same event, never duplicate → fixes the 23505 abort), dedup + UNIQUE one-event-per-day on `presidency_recommendations`, curation notification trigger | **Low** — RPC redefinitions, additive constraint + trigger | ✅ **run this whole file** in Studio → SQL Editor |

## Already applied in code (not here)

- **S-1** — operator email removed from `bootstrap.sql` (now a placeholder).

## Manual dashboard toggles (no SQL)

- **S-5** `public_bucket_allows_listing` — in Storage, disable "public listing"
  on `historical-images`, `ads-banners` (+ any other public bucket). Mobile
  reads objects by known path, so listing can stay off.
- **S-6** `auth_leaked_password_protection` — Auth → Providers → Passwords →
  enable "Leaked password protection" (HaveIBeenPwned).

## Why P-2 is only partially addressed here

`multiple_permissive_policies` fires 36× but most cases are a `SELECT` read
policy overlapping an `ALL` write policy. Merging them means converting the
write policies to explicit `INSERT/UPDATE/DELETE`, which **changes soft-delete
row visibility** for editorial roles (an `editeur`'s `ALL` policy currently also
grants `SELECT` on soft-deleted rows). At current table sizes (≤2.3k rows) the
perf gain is marginal and the risk is real, so only the clearly-redundant
`devices` duplicates are consolidated here. The rest is deferred pending a
per-table access-semantics review.
