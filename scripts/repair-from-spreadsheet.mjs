#!/usr/bin/env node
//
// repair-from-spreadsheet.mjs
//
// One-shot recovery: re-parse `../DayAfterDayBrazzaville Congo.xlsm` with the
// CURRENT parser logic, then patch the existing bulk-imported events in the DB
// to match the spreadsheet (authoritative source of truth).
//
// What it fixes:
//   • Dates that are +1 day off (the SheetJS cellDates LMT bug)
//   • Descriptions that still carry the buggy "Source :" tail
//   • `source` cells that ended up holding description fragments
//   • Missing `historian` values
//
// What it does NOT do:
//   • Touch any event outside the May 19 2026 13:13 bulk-import window
//   • Touch event IDs (so the 1454 calendar_entries rows stay valid)
//   • Touch deleted_at events
//
// Run:
//   node scripts/repair-from-spreadsheet.mjs
//
// Required:
//   • Working dir = dad-cms project root
//   • SUPABASE_SERVICE_ROLE_KEY in env, or in .env.e2e
//   • ../DayAfterDayBrazzaville Congo.xlsm (relative to dad-cms)
//
// Output:
//   • Console summary
//   • recovery-report.json (one JSON file with the full match log)

import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL     = 'https://dttqbktyqhzdmimzkoeb.supabase.co';
const SPREADSHEET_PATH = '../DayAfterDayBrazzaville Congo.xlsm';

// Bulk-import window. ONLY events created in this minute are eligible for
// repair. Hand-created events are left alone.
const BATCH_FROM = '2026-05-19T13:13:00Z';
const BATCH_TO   = '2026-05-19T13:14:00Z';

const CONCURRENCY = 10;
const REPORT_FILE = 'recovery-report.json';

// ── Mirror of events.component.ts parser ─────────────────────────────────────

const HEADER_MAP = {
  date:      ['date', 'jour'],
  evenement: ['evenement', 'événement', 'evènement', 'titre', 'title'],
  source:    ['source', 'sources'],
  historien: ['historien', 'historian', 'auteur', 'éditeur', 'editeur'],
};

function normalizeHeader(h) { return String(h ?? '').trim().toLowerCase(); }

function parseDate(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return null;
    return localIso(raw);
  }
  if (typeof raw === 'number' && isFinite(raw)) {
    const ms = Math.round((raw - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (isNaN(d.getTime())) return null;
    return utcIso(d);
  }
  const s = String(raw).trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const m = +iso[2], d = +iso[3];
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    return null;
  }
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    const day = +dmy[1], m = +dmy[2];
    let y = +dmy[3];
    if (y < 100) y += y < 50 ? 2000 : 1900;
    if (m < 1 || m > 12 || day < 1 || day > 31) return null;
    return `${String(y).padStart(4,'0')}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  return null;
}

function localIso(d) {
  return `${String(d.getFullYear()).padStart(4,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function utcIso(d) {
  return `${String(d.getUTCFullYear()).padStart(4,'0')}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

function extractTitle(text) {
  const cleaned = text.replace(/\.?P\d+$/, '').trim();
  if (cleaned.length <= 100) return cleaned;
  const cut = cleaned.slice(0, 100);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 60 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

// Loose key: strip accents + punctuation + collapse whitespace, take first N chars.
// Used to find the same row across spreadsheet ↔ DB even if one side has had
// its description mangled.
function looseKey(s, n = 40) {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n);
}

// Some spreadsheet rows start with "Date à laquelle ...", "Date de ...", or
// "Date d'..." while the DB has the same event without that intro. Strip these
// French prefixes before taking the loose key so the two sides line up.
function stripIntroFr(s) {
  return String(s ?? '')
    .replace(/^\s*date\s+(?:a\s+laquelle|de\s+la|de\s+l|de|du|d)\s+/i, '')
    .trim();
}

// Trigram set for fuzzy similarity scoring (used in the phase-2 fallback).
function trigrams(s) {
  const norm = looseKey(s, 120);
  const grams = new Set();
  for (let i = 0; i < norm.length - 2; i++) grams.add(norm.slice(i, i + 3));
  return grams;
}
function jaccard(aSet, bSet) {
  let inter = 0;
  for (const t of aSet) if (bSet.has(t)) inter++;
  const union = aSet.size + bSet.size - inter;
  return union === 0 ? 0 : inter / union;
}

function shiftDays(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

function loadServiceRoleKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  const envPath = path.join(process.cwd(), '.env.e2e');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/);
      if (m) return m[1].trim();
    }
  }
  throw new Error('SUPABASE_SERVICE_ROLE_KEY not found (env or .env.e2e).');
}

function readSpreadsheet() {
  const fullPath = path.resolve(process.cwd(), SPREADSHEET_PATH);
  if (!fs.existsSync(fullPath)) throw new Error(`Spreadsheet not found at: ${fullPath}`);
  const buf  = fs.readFileSync(fullPath);
  // NOTE: deliberately NO cellDates:true — see the comment in events.component.ts.
  const wb   = XLSX.read(buf, { type: 'buffer' });
  const name = wb.SheetNames[0];
  const sheet = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
  return { sheetName: name, rows };
}

function detectColumns(headerRow) {
  const cols = {};
  (headerRow ?? []).forEach((h, i) => {
    const norm = normalizeHeader(h);
    for (const [field, syns] of Object.entries(HEADER_MAP)) {
      if (cols[field] !== undefined) continue;
      if (syns.includes(norm)) { cols[field] = i; break; }
    }
  });
  if (cols.date === undefined)      throw new Error('No Date column header detected');
  if (cols.evenement === undefined) throw new Error('No Evenement column header detected');
  return cols;
}

function parseRows(rows, cols) {
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const date = parseDate(r[cols.date]);
    if (!date) continue;
    const ev  = String(r[cols.evenement] ?? '').trim().replace(/\r\n|\r/g, '\n');
    if (!ev) continue;
    const src  = cols.source    !== undefined ? String(r[cols.source]    ?? '').trim() : '';
    const hist = cols.historien !== undefined ? String(r[cols.historien] ?? '').trim() : '';
    out.push({
      sheetRow:    i + 1,
      date,
      title:       ev.length > 100 ? extractTitle(ev) : ev,
      description: ev,
      source:      src  || null,
      historian:   hist || null,
      // Try both: full-text key, and key after stripping the "Date à laquelle"
      // intro phrase. The DB might have either form.
      keys:        [looseKey(ev, 40), looseKey(stripIntroFr(ev), 40)].filter(k => k.length >= 10),
    });
  }
  return out;
}

async function fetchBulkEvents(supabase) {
  const out = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('events')
      .select('id, event_date, title, description, source, historian')
      .gte('created_at', BATCH_FROM)
      .lt('created_at', BATCH_TO)
      .is('deleted_at', null)
      .range(from, from + 999);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}

async function withConcurrency(items, n, fn) {
  let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('▶ Reading spreadsheet…');
  const { sheetName, rows } = readSpreadsheet();
  console.log(`   Sheet "${sheetName}", ${rows.length} rows (incl. header)`);
  const cols = detectColumns(rows[0]);
  console.log('   Columns mapped:', cols);
  const parsed = parseRows(rows, cols);
  console.log(`   ${parsed.length} valid spreadsheet rows parsed.`);

  console.log('\n▶ Fetching bulk events from DB…');
  const supabase = createClient(SUPABASE_URL, loadServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const events = await fetchBulkEvents(supabase);
  console.log(`   ${events.length} bulk events fetched (window ${BATCH_FROM} → ${BATCH_TO})`);

  // ── Date-anchored matcher ────────────────────────────────────────────
  // The spreadsheet's Date column is the source of truth. For each spreadsheet
  // date D, the matching DB events are those on event_date == D OR == D+1
  // (the +1 covers events not yet corrected from the original cellDates bug).
  // Within a date bucket we use text similarity ONLY as a tie-breaker between
  // same-day siblings — never as a gating threshold for accepting a match.
  // This way, a row whose Evenement text was completely rewritten in either
  // the spreadsheet or the CMS still gets matched as long as the date lines up.

  const eventTrigrams = new Map();   // event.id → trigram Set
  const eventsByDate  = new Map();   // 'YYYY-MM-DD' → [event, …]
  for (const e of events) {
    const txt = e.description || e.title || '';
    eventTrigrams.set(e.id, trigrams(txt));
    if (!eventsByDate.has(e.event_date)) eventsByDate.set(e.event_date, []);
    eventsByDate.get(e.event_date).push(e);
  }
  // Spreadsheet rows grouped by their (authoritative) date.
  const sheetByDate = new Map();
  for (const row of parsed) {
    if (!sheetByDate.has(row.date)) sheetByDate.set(row.date, []);
    sheetByDate.get(row.date).push(row);
  }

  const claimed   = new Set();   // DB event IDs already assigned
  const updates   = [];
  const notFound  = [];
  const ambiguous = [];

  // Process each spreadsheet date independently. Sort dates for deterministic output.
  const sheetDates = [...sheetByDate.keys()].sort();
  for (const date of sheetDates) {
    const sheetRows = sheetByDate.get(date);
    const dbExact   = (eventsByDate.get(date) ?? []).filter(e => !claimed.has(e.id));
    const dbPlus1   = (eventsByDate.get(shiftDays(date, +1)) ?? []).filter(e => !claimed.has(e.id));
    const dbCandidates = [...dbExact, ...dbPlus1];

    if (dbCandidates.length === 0) {
      for (const row of sheetRows) notFound.push(row);
      continue;
    }

    // Case 1: 1-to-1 by date. Match directly without consulting text.
    if (sheetRows.length === 1 && dbCandidates.length === 1) {
      const target = dbCandidates[0];
      const kind = target.event_date === date ? 'exact_date' : 'date_shift';
      claimed.add(target.id);
      updates.push({ id: target.id, kind, row: sheetRows[0], before: target });
      continue;
    }

    // Case 2: N spreadsheet rows ↔ M DB events on the same date window.
    // Use greedy bipartite matching by trigram similarity to pair them up.
    // Even at low similarity we still match (date is the source of truth),
    // we just label the kind as 'fuzzy_*' so the report flags it for audit.
    const pairs = [];
    for (const row of sheetRows) {
      const rg = trigrams(row.description);
      for (const ev of dbCandidates) {
        pairs.push({
          row, ev,
          score: jaccard(rg, eventTrigrams.get(ev.id) ?? new Set()),
        });
      }
    }
    pairs.sort((a, b) => b.score - a.score);

    const assignedSheet = new Set();
    const assignedDb    = new Set();
    for (const p of pairs) {
      if (assignedSheet.has(p.row) || assignedDb.has(p.ev.id)) continue;
      if (claimed.has(p.ev.id)) continue;
      assignedSheet.add(p.row);
      assignedDb.add(p.ev.id);
      claimed.add(p.ev.id);
      const kindBase = p.ev.event_date === date ? 'exact_date' : 'date_shift';
      const kind = sheetRows.length === 1 && dbCandidates.length === 1
        ? kindBase
        : `${kindBase}_multi`;  // flag same-date multi-row cases for audit
      updates.push({ id: p.ev.id, kind, row: p.row, before: p.ev, similarity: p.score });
    }

    // Any spreadsheet rows on this date that didn't get a partner are not_found
    for (const row of sheetRows) {
      if (!assignedSheet.has(row)) notFound.push(row);
    }
  }

  const countByKind = k => updates.filter(u => u.kind === k).length;
  console.log(`\n▶ Match summary:`);
  console.log(`   ${updates.length} updates (date-anchored)`);
  console.log(`     – ${countByKind('exact_date')} 1:1 same-date match`);
  console.log(`     – ${countByKind('date_shift')} 1:1 DB +1 day off (will be corrected)`);
  console.log(`     – ${countByKind('exact_date_multi')} multi-row same-date, paired by text similarity`);
  console.log(`     – ${countByKind('date_shift_multi')} multi-row +1-day, paired by text similarity`);
  console.log(`   ${notFound.length} spreadsheet rows with no DB match on date D or D+1`);

  // DB events the spreadsheet never claimed — these are candidates for either
  // manual cleanup (delete) or fuzzy-matching to a spreadsheet row that the
  // script couldn't auto-resolve.
  const unclaimedDbEvents = events.filter(e => !claimed.has(e.id));
  console.log(`   ${unclaimedDbEvents.length} DB events have no spreadsheet match`);

  // Save the full report BEFORE applying, so the user can audit even if the
  // apply fails halfway through.
  fs.writeFileSync(REPORT_FILE, JSON.stringify({
    generated_at: new Date().toISOString(),
    spreadsheet_path: SPREADSHEET_PATH,
    counts: {
      spreadsheet_rows: parsed.length,
      db_events: events.length,
      to_update: updates.length,
      not_found: notFound.length,
      unclaimed_db_events: unclaimedDbEvents.length,
    },
    updates: updates.map(u => ({
      id: u.id,
      kind: u.kind,
      similarity: u.similarity,
      before: u.before,
      after:  { event_date: u.row.date, title: u.row.title, description: u.row.description, source: u.row.source, historian: u.row.historian },
    })),
    not_found: notFound,
    unclaimed_db_events: unclaimedDbEvents,
  }, null, 2));
  console.log(`\n📄 Match report written to ${REPORT_FILE}`);

  if (process.argv.includes('--dry-run')) {
    console.log(`\n🔍 --dry-run flag set — exiting without applying any updates.`);
    console.log(`   Review ${REPORT_FILE} then re-run without --dry-run to apply.`);
    return;
  }

  console.log(`\n▶ Applying ${updates.length} updates (concurrency ${CONCURRENCY})…`);
  let done = 0; let errors = 0;
  await withConcurrency(updates, CONCURRENCY, async (u) => {
    const { error } = await supabase.from('events').update({
      event_date:  u.row.date,
      title:       u.row.title,
      description: u.row.description,
      source:      u.row.source,
      historian:   u.row.historian,
      updated_at:  new Date().toISOString(),
    }).eq('id', u.id);
    if (error) {
      errors++;
      console.error(`   ✖ ${u.id}: ${error.message}`);
    }
    done++;
    if (done % 100 === 0) console.log(`   ${done}/${updates.length}…`);
  });

  console.log(`\n✅ Done. ${done - errors}/${updates.length} applied, ${errors} errors.`);
  if (ambiguous.length || notFound.length) {
    console.log(`   See ${REPORT_FILE} for ${ambiguous.length} ambiguous + ${notFound.length} not-found rows.`);
  }
}

main().catch(err => {
  console.error('\n❌ FAILED:', err.stack ?? err.message);
  process.exit(1);
});
