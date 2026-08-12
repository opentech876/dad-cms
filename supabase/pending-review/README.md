# Pending-review DB changes

Security/performance hardening drafted from the Supabase advisors + a manual
audit. These files live in a subfolder so `supabase db push` will *not* pick
them up. To apply one: review it, run it in Studio → SQL Editor (all are
idempotent), then move it into `supabase/migrations/` with a fresh timestamp
prefix so the history reflects the real schema.

## Still pending

| File | Advisor | Risk | Ready? |
|------|---------|------|--------|
| `2026-07-13_security_hardening.sql` | `function_search_path_mutable` (S-4) + `anon_security_definer_...` (S-2/S-3) | S-4 low / **S-2 needs allowlist confirmation** | ⚠ S-4 ready; S-2 needs the mobile RPC allowlist confirmed with Mondésir |
| `2026-07-15_footer_only_ads.sql` | Business rule: one ad at a time, footer only — normalize rows, default + CHECK | **Low** — column kept for mobile compat | ✅ confirmed with Mondésir (mobile never writes ad_campaigns; tolerates footer-only) |
| `2026-08-12_s5_bucket_listing_lockdown.sql` | S-5: drop the anon/public SELECT policies on `storage.objects` so anon can't enumerate the (public-flagged) buckets; reads bypass RLS via CDN so unaffected | **Low** — reversible; reads use getPublicUrl only (mobile + CMS verified) | ✅ ready |

## Applied — now in `supabase/migrations/`

| Migration | What | Applied |
|-----------|------|---------|
| `20260716120000_curation_fixes.sql` | Espace Curation: apply-RPC replacement semantics (fixes 23505), one-event-per-day UNIQUE on `presidency_recommendations`, curation notification trigger | ~2026-07-16 |
| `20260812120000_p1_rls_initplan.sql` | `auth_rls_initplan` (P-1) — `(select auth.uid())` rewrite + `devices` policy dedup (P-2 subset) | 2026-08-12 |
| `20260812120001_p3_fk_indexes.sql` | `unindexed_foreign_keys` (P-3) — covering indexes on hot FK/join/RLS paths | 2026-08-12 |

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
