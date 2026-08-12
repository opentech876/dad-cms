# Pending-review DB changes

Security/performance hardening drafted from the Supabase advisors + a manual
audit. These files live in a subfolder so `supabase db push` will *not* pick
them up. To apply one: review it, run it in Studio → SQL Editor (all are
idempotent), then move it into `supabase/migrations/` with a fresh timestamp
prefix so the history reflects the real schema.

## Nothing pending

All drafts have been applied and moved into `supabase/migrations/` (see below).
This folder is kept for future advisor findings.

> **Shared-DB caveat:** the CMS and the mobile app share ONE Supabase database
> but keep SEPARATE migration histories in their two repos. So this repo's
> `migrations/` is only the CMS's slice — a `supabase db reset` from here alone
> would NOT recreate the mobile-owned RPCs (`sync_calendar`, `get_content_version`,
> …). Every migration here is written idempotent / guard-based so it replays
> safely even when those mobile objects are absent.

## Applied — now in `supabase/migrations/`

| Migration | What | Applied |
|-----------|------|---------|
| `20260716120000_curation_fixes.sql` | Espace Curation: apply-RPC replacement semantics (fixes 23505), one-event-per-day UNIQUE on `presidency_recommendations`, curation notification trigger | ~2026-07-16 |
| `20260812120000_p1_rls_initplan.sql` | `auth_rls_initplan` (P-1) — `(select auth.uid())` rewrite + `devices` policy dedup (P-2 subset) | 2026-08-12 |
| `20260812120001_p3_fk_indexes.sql` | `unindexed_foreign_keys` (P-3) — covering indexes on hot FK/join/RLS paths | 2026-08-12 |
| `20260812120002_security_hardening.sql` | S-4 (pin `search_path` on 4 fns) + S-2 (revoke anon EXECUTE except the confirmed mobile allowlist) | 2026-08-12 |
| `20260812120003_footer_only_ads.sql` | Footer-only rule: normalize rows, default `footer`, `CHECK (position='footer')` | 2026-08-12 |
| `20260812120004_s5_bucket_listing_lockdown.sql` | S-5: drop anon/public SELECT on `storage.objects` (blocks bucket enumeration; reads unaffected) | 2026-08-12 |

## Already applied in code / dropped

- **S-1** — operator email removed from `bootstrap.sql` (now a placeholder).
- **S-3** — notes only, no change (see `20260812120002_security_hardening.sql` tail).
- **S-6** `auth_leaked_password_protection` — **dropped**: Pro-plan only, not available on the current plan.

## Why P-2 is only partially addressed here

`multiple_permissive_policies` fires 36× but most cases are a `SELECT` read
policy overlapping an `ALL` write policy. Merging them means converting the
write policies to explicit `INSERT/UPDATE/DELETE`, which **changes soft-delete
row visibility** for editorial roles (an `editeur`'s `ALL` policy currently also
grants `SELECT` on soft-deleted rows). At current table sizes (≤2.3k rows) the
perf gain is marginal and the risk is real, so only the clearly-redundant
`devices` duplicates are consolidated here. The rest is deferred pending a
per-table access-semantics review.
