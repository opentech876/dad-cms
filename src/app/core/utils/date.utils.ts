/**
 * Shared French date formatting.
 *
 * All inputs accept either a YYYY-MM-DD date string, a full ISO timestamp,
 * `null`, or `undefined`. Null/undefined → empty string so templates render
 * blank cells instead of "Invalid Date".
 */

export const MONTHS_FR_LONG = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

export const MONTHS_FR_SHORT = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

export const MONTHS_FR_LONG_CAP = MONTHS_FR_LONG.map(
  m => m.charAt(0).toUpperCase() + m.slice(1),
);

export const DAYS_FR_LONG = [
  'dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi',
];

/**
 * Canonical Angular `DatePipe` format strings (fr locale) — the single source
 * of truth for every `| date:…:'fr'` usage in templates. Import `DATE_FMT` and
 * bind e.g. `| date:DATE_FMT.long:'':'fr'` instead of scattering literal
 * format strings across templates. Chosen to render identically to
 * `formatDateLong` / `formatDateShort` / `formatDateTime` below (full month
 * names, 4-digit year, "14h30" time style).
 */
export const DATE_FMT = {
  long: 'd MMMM y',                              // 15 août 2026
  short: 'dd/MM/y',                              // 15/08/2026
  time: "HH'h'mm",                               // 14h30
  datetime: "dd/MM/y HH'h'mm",                   // 15/08/2026 14h30
  longDatetime: "d MMMM y 'à' HH'h'mm",          // 15 août 2026 à 14h30
  weekday: 'EEEE d MMMM y',                      // samedi 15 août 2026
  weekdayDatetime: "EEEE d MMMM y 'à' HH'h'mm",  // samedi 15 août 2026 à 14h30
} as const;

/** "15 août 2026" — use for hero blocks, detail cards, event titles. */
export function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  const monthName = MONTHS_FR_LONG[parseInt(m, 10) - 1] ?? '';
  return `${parseInt(d, 10)} ${monthName} ${y}`;
}

/** "15/08/2026" — use for tables, lists, badges, filter labels. */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** "15/08/2026 14h30" — use for notifications, audit log entries. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}h${mi}`;
}

/**
 * Relative time in French — "il y a 8 min", "hier", etc.
 * Falls back to short date after a week.
 */
export function formatRelativeFr(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return iso;
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 60) return "À l'instant";
  if (diffSec < 3600) return `il y a ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `il y a ${Math.floor(diffSec / 3600)} h`;
  const diffDay = Math.floor(diffSec / 86400);
  if (diffDay === 1) return 'hier';
  if (diffDay < 7) return `il y a ${diffDay} j`;
  return formatDateShort(iso);
}

/**
 * "lundi 13 juillet 2026" — weekday + long date. Accepts a YYYY-MM-DD string
 * (parsed as a local date, so the weekday is timezone-stable) or a `Date`
 * (used as-is, for "today" in the local zone).
 */
export function formatWeekdayLong(input: string | Date | null | undefined): string {
  if (!input) return '';
  let date: Date;
  if (typeof input === 'string') {
    const [y, m, d] = input.slice(0, 10).split('-').map(n => parseInt(n, 10));
    if (!y || !m || !d) return '';
    date = new Date(y, m - 1, d);
  } else {
    date = input;
  }
  if (isNaN(date.getTime())) return '';
  return `${DAYS_FR_LONG[date.getDay()]} ${date.getDate()} ${MONTHS_FR_LONG[date.getMonth()]} ${date.getFullYear()}`;
}

/** "15 août" — long form without year, for in-year contexts. */
export function formatDayMonthLong(iso: string | null | undefined): string {
  if (!iso) return '';
  const [_y, m, d] = iso.slice(0, 10).split('-');
  if (!m || !d) return iso;
  const monthName = MONTHS_FR_LONG[parseInt(m, 10) - 1] ?? '';
  return `${parseInt(d, 10)} ${monthName}`;
}

/**
 * Lowercase + strip accents. Used to normalize both search queries and
 * indexed text so French accents don't break substring matching.
 */
export function normalizeSearchable(s: string | null | undefined): string {
  return (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Expand a yyyy-mm-dd date into every searchable form a user might type:
 * the ISO form, the French dd/mm/yyyy form, the French month name, and the
 * bare year. Result is already normalized (lowercased, accent-stripped) so
 * the caller can match it directly against `normalizeSearchable(query)`.
 *
 * `1960-08-15` →  "1960-08-15 15/08/1960 15 aout 1960 aout 1960 1960"
 */
export function dateSearchHaystack(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const [, y, mm, dd] = m;
  const monthName = MONTHS_FR_LONG[parseInt(mm, 10) - 1] ?? '';
  return normalizeSearchable(
    `${y}-${mm}-${dd} ${dd}/${mm}/${y} ${parseInt(dd, 10)} ${monthName} ${y} ${monthName} ${y} ${y}`
  );
}
