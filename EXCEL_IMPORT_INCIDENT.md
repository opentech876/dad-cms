# Excel Import Incident — Investigation & Fix Report

> Date: 2026-06-29
> Status: **Resolved.** Database reset and re-imported cleanly.

## Summary

The Excel-import path used to populate the `events` repository had three
independent bugs that compounded into a fully corrupted dataset:

1. Every imported pre-1970 event was stored **one day too early**.
2. The `Source` column was merged into the description as a `\n\nSource : …`
   tail instead of being stored as its own field.
3. The `Historien` column was completely dropped — no first-class storage,
   no UI surface.

Because we couldn't reliably untangle the dates from the data after the fact
(see "Recovery path" below), the chosen resolution was to ship a corrected
parser, wipe the content tables + storage buckets, and re-import the
spreadsheet from scratch. Final state: 1035/1035 rows present with correct
dates, sources, and historians, and a structural regression guard so the
specific failure pattern can no longer reach the database silently.

---

## Bug 1 — Pre-1970 dates were off by one day

### Root cause

The parser opened the workbook with `XLSX.read(data, { cellDates: true })`,
which converts every date cell into a JavaScript `Date` object in the
**local timezone**. For dates before 1970 SheetJS doesn't use the modern UTC
offset — it uses the historical **Local Mean Time** (LMT) for the system's
timezone. On a Brazzaville machine (UTC+1) an `1960-08-15` cell came back
as `1960-08-14T22:59:25Z`.

The original `_dateToIso()` then read the UTC components off that Date
(`getUTCFullYear`, `getUTCMonth`, `getUTCDate`), so it stored `1960-08-14`
instead of the spreadsheet's `1960-08-15`. Every pre-1970 row had this same
one-day shift backwards.

### Fix

Disabled `cellDates: true` entirely. The parser now reads each date cell as
a raw Excel serial number (days since 1899-12-30) and converts via
deterministic UTC math:

```ts
const ms = Math.round((raw - 25569) * 86400 * 1000);
const d = new Date(ms);
return this._utcDateToIso(d);
```

Excel serials have no timezone semantics, so this gives the same answer in
every locale. For text dates (`15/08/1960`, `1960-08-15`) the parser also
handles them explicitly without going through SheetJS.

The function is split into `_localDateToIso` (for any path that might still
receive a Date in local frame) and `_utcDateToIso` (for the deterministic
serial-number path), so the timezone semantics are explicit at every call
site instead of accidental.

### Regression test

`events.component.spec.ts`:

```ts
it("Independence Day (serial 22143) must parse to 1960-08-15", () => {
  expect((component as any)._parseDateCell(22143)).toBe('1960-08-15');
});
```

This is the canonical proof that the LMT bug is gone.

---

## Bug 2 — `Source` was merged into the description

### Root cause

The old parser concatenated the spreadsheet's `Source` cell onto the
description as `${evenement}\n\nSource : ${source}`. This had three knock-on
effects:

- The source citation became unsearchable as a structured field.
- The description text was polluted with metadata.
- Later recovery attempts couldn't extract source cleanly when the
  description itself contained an inline `Source :` substring — my SQL
  regex would mis-cut and store narrative text in the `source` column.

### Fix

- New columns on `events`: `source text` and `historian text` (migration in
  `supabase/migrations/20260424120000_baseline.sql`).
- `ImportPreviewRow` gained explicit `source` and `historian` fields.
- `IMPORT_HEADER_SYNONYMS` was extended so `Source` / `Historien` columns
  map to their canonical fields.
- The description column in the DB now contains only the Evenement text —
  nothing appended.
- The `EventService.createEvent`, `updateEvent`, and `batchCreateEvents`
  signatures pass source/historian through.
- The event editor (`events.component.html`) shows source and historian as
  first-class form inputs.

### Anti-regression guard

```ts
// events.component.ts _parseImportRows()
if (/\r?\n\s*Source\s*:/i.test(description)) {
  skippedEmpty++;
  continue;
}
```

If a future upload contains a description with the legacy `\nSource :` tail
(either because the parser regression returns, or because someone uploads a
previously-polluted export), the importer **rejects that row** instead of
silently writing bad data. Spec test covers this.

---

## Bug 3 — `Historien` was discarded

### Root cause

The old parser never read the `Historien` column. The information existed
in the spreadsheet but was never persisted, so all 1035 imported events had
an unknown editor.

### Fix

Same as Bug 2: dedicated column, dedicated parser field, dedicated UI input,
header synonyms in `IMPORT_HEADER_SYNONYMS` (`historien`, `historian`,
`auteur`, `éditeur`, `rédacteur`).

---

## Recovery path

The original plan was to fix the bug in code and patch the corrupted data
in place. We tried two approaches:

### Attempt 1 — Title-match recovery (`scripts/recover-events.mjs`)

Re-parsed the spreadsheet with the new logic, matched DB events by title
prefix, applied UPDATEs. Recovered 79/1035 rows before stalling — most
titles diverged between old DB and new parser output (the old parser
truncated and rewrote some titles, so my prefixes didn't line up).

### Attempt 2 — Date-anchored recovery (`scripts/repair-from-spreadsheet.mjs`)

Better strategy: trust the spreadsheet's `Date` column as the identity
anchor (curated by editors), use text similarity only as a tie-breaker
within same-date buckets. Recovered 1035/1035 spreadsheet rows.

But this exposed a second-order problem: `calendar_entries.mmdd` is a
cached MM-DD copy of the event's date at assignment time. Fixing
`events.event_date` left those caches stale, and naive sync hit the unique
constraint because **the buggy import had created more `calendar_entries`
rows than the schema's 2-per-day cap allows** — the wrong dates were
inadvertently spreading events across more slots, masking the
overcommitment.

### Final decision — Wipe + clean re-import

Given:

- the fix was clearly in code (verified by tests and a clean dry-run import),
- recovery would have required manual reconciliation of `calendar_entries`,
- the deployment is still pre-launch (no production audience yet),

we wiped the content tables + Supabase Storage buckets and re-imported the
spreadsheet from scratch through the CMS Excel uploader. The new parser
handled it correctly: 1035 events, correct dates, source and historian
populated as first-class fields.

Tables wiped (TRUNCATE … CASCADE in one transaction):
`audit_log`, `notification_reads`, `notifications`, `devices_logs`,
`ad_campaign_device_clicks`, `ad_campaign_device_views`, `ad_campaigns`,
`companies`, `presidency_recommendations`, `calendar_entries`, `events`,
`content_versions`.

Storage buckets emptied (`scripts/reset-storage.mjs`):
`historical-images`, `ads-banners`.

Tables preserved: `workspaces`, `user_roles`, `workspace_members`,
`profiles`, `calendars` (2 yearly shells), `devices` (28 Expo push tokens).

While we were in there, we also dropped a duplicate unique constraint on
`calendar_entries` (`calendar_entries_calendar_id_mmdd_position_key` was
defined twice under different names — leftover from a prior migration).

---

## UX improvements added along the way

Once the data was clean we improved the `/evenements` page so editors can
spot-check their work easily:

- **Search bar** now matches against title, description, source, historian,
  and date in any common format (`1960-08-15`, `15/08/1960`, `août 1960`,
  `août`, `1960`). Accent-insensitive and case-insensitive.
- **Sort dropdown** with four options: date asc/desc, title asc/desc.
- Pagination resets to page 0 when any filter or sort changes.

Two new shared helpers in `src/app/core/utils/date.utils.ts`:
`normalizeSearchable()` (lowercase + accent strip) and
`dateSearchHaystack()` (expand an ISO date into every searchable form).

---

## Files changed

### Code
- `src/app/features/events/events.component.ts` — disabled `cellDates:true`,
  split date parsing into local-vs-UTC paths, added Source/Historian
  parsing, anti-regression guard, search/sort logic.
- `src/app/features/events/events.component.html` — Source/Historian inputs
  in editor; better search placeholder; sort dropdown.
- `src/app/features/events/events.component.spec.ts` — new specs
  (serial 22143 regression, source-merge guard, search-by-description, etc.).
- `src/app/core/events/event.service.ts` — pass source/historian through
  on create/update/batchCreate.
- `src/app/models/index.ts` — `Event.source`, `Event.historian` typed as
  `string | null`; `CreateEventDto` updated.
- `src/app/core/utils/date.utils.ts` + `.spec.ts` — new
  `normalizeSearchable`, `dateSearchHaystack` helpers + their tests.

### Database
- `supabase/migrations/20260424120000_baseline.sql` — `events.source text`,
  `events.historian text` added with column comments. Duplicate unique
  constraint on `calendar_entries` removed.

### Tools (one-off, not shipped to mobile/users)
- `scripts/repair-from-spreadsheet.mjs` — date-anchored recovery script
  (was used in the data-recovery attempt; kept in the repo as a reference).
- `scripts/reset-storage.mjs` — wipe both Supabase Storage buckets.
- `scripts/recover-events.mjs` — original title-match recovery attempt
  (kept as historical reference, superseded).

### Tests
All 977 tests across 48 suites green. Coverage threshold (70%) still met.

---

## Lessons / future safeguards

1. **Never trust library defaults for dates that span timezones or eras.**
   `cellDates: true` is a convenience that hides real semantics. Reading
   raw serials and doing explicit math is verbose but timezone-stable.
2. **Match the database schema to the spreadsheet, not the other way
   around.** Concatenating Source into Description "to save a column" was
   the original sin — it cost a multi-hour recovery effort and a wipe.
3. **Add structural guards at the boundary.** The
   `if (/\nSource\s*:/.test(description)) skip` guard means even if a
   developer reverts the parser fix by accident, the database can't be
   re-polluted silently. Tests cover this.
4. **Pre-launch data corruption is recoverable; post-launch isn't.** Doing
   the wipe-and-reimport now (no users depending on the data yet) was the
   right call — would have been impossible later.
