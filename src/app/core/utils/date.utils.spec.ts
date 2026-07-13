import { formatDate, registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import {
  MONTHS_FR_LONG,
  MONTHS_FR_SHORT,
  DATE_FMT,
  formatDateLong,
  formatDateShort,
  formatDateTime,
  formatRelativeFr,
  formatDayMonthLong,
  formatWeekdayLong,
  normalizeSearchable,
  dateSearchHaystack,
} from './date.utils';

registerLocaleData(localeFr);

describe('date.utils', () => {
  describe('MONTHS_FR_LONG', () => {
    it('contient 12 mois en minuscule', () => {
      expect(MONTHS_FR_LONG).toHaveLength(12);
      expect(MONTHS_FR_LONG[0]).toBe('janvier');
      expect(MONTHS_FR_LONG[7]).toBe('août');
    });
  });

  describe('MONTHS_FR_SHORT', () => {
    it('contient 12 abréviations', () => {
      expect(MONTHS_FR_SHORT).toHaveLength(12);
      expect(MONTHS_FR_SHORT[0]).toBe('janv.');
      expect(MONTHS_FR_SHORT[7]).toBe('août');
    });
  });

  describe('formatDateLong', () => {
    it('formate "2026-08-15" en "15 août 2026"', () => {
      expect(formatDateLong('2026-08-15')).toBe('15 août 2026');
    });

    it('gère un timestamp ISO complet', () => {
      expect(formatDateLong('2026-08-15T14:30:00Z')).toBe('15 août 2026');
    });

    it('retire le zéro devant le jour', () => {
      expect(formatDateLong('2026-01-05')).toBe('5 janvier 2026');
    });

    it('renvoie une chaîne vide pour null/undefined', () => {
      expect(formatDateLong(null)).toBe('');
      expect(formatDateLong(undefined)).toBe('');
    });
  });

  describe('formatDateShort', () => {
    it('formate "2026-08-15" en "15/08/2026"', () => {
      expect(formatDateShort('2026-08-15')).toBe('15/08/2026');
    });

    it('garde les zéros devant le jour et le mois', () => {
      expect(formatDateShort('2026-01-05')).toBe('05/01/2026');
    });

    it('renvoie une chaîne vide pour null/undefined', () => {
      expect(formatDateShort(null)).toBe('');
      expect(formatDateShort(undefined)).toBe('');
    });
  });

  describe('formatDateTime', () => {
    it('formate un ISO en "DD/MM/YYYY HHhmm"', () => {
      const iso = '2026-08-15T14:30:00';
      const out = formatDateTime(iso);
      // Local timezone-dependent; assert pattern + date portion
      expect(out).toMatch(/^15\/08\/2026 \d{2}h\d{2}$/);
    });

    it('renvoie une chaîne vide pour null/undefined', () => {
      expect(formatDateTime(null)).toBe('');
    });
  });

  describe('formatRelativeFr', () => {
    const now = new Date('2026-08-15T12:00:00Z');

    it('renvoie "À l\'instant" pour moins de 60 secondes', () => {
      expect(formatRelativeFr('2026-08-15T11:59:30Z', now)).toBe("À l'instant");
    });

    it('renvoie "il y a X min" pour les minutes', () => {
      expect(formatRelativeFr('2026-08-15T11:52:00Z', now)).toBe('il y a 8 min');
    });

    it('renvoie "il y a X h" pour les heures', () => {
      expect(formatRelativeFr('2026-08-15T09:00:00Z', now)).toBe('il y a 3 h');
    });

    it('renvoie "hier" pour exactement 1 jour', () => {
      expect(formatRelativeFr('2026-08-14T12:00:00Z', now)).toBe('hier');
    });

    it('renvoie "il y a X j" pour 2-6 jours', () => {
      expect(formatRelativeFr('2026-08-12T12:00:00Z', now)).toBe('il y a 3 j');
    });

    it('renvoie la date courte après 7 jours', () => {
      expect(formatRelativeFr('2026-07-01T12:00:00Z', now)).toBe('01/07/2026');
    });
  });

  describe('formatDayMonthLong', () => {
    it('formate "2026-08-15" en "15 août"', () => {
      expect(formatDayMonthLong('2026-08-15')).toBe('15 août');
    });
  });

  describe('normalizeSearchable', () => {
    it('met en minuscules', () => {
      expect(normalizeSearchable('Brazzaville')).toBe('brazzaville');
    });

    it("supprime les accents", () => {
      expect(normalizeSearchable('événement')).toBe('evenement');
      expect(normalizeSearchable('août')).toBe('aout');
      expect(normalizeSearchable('Présidence')).toBe('presidence');
    });

    it('gère null et undefined', () => {
      expect(normalizeSearchable(null)).toBe('');
      expect(normalizeSearchable(undefined)).toBe('');
    });
  });

  describe('DATE_FMT (formats canoniques du pipe Angular, locale fr)', () => {
    // Rendered through Angular's own formatDate so the test proves each
    // canonical format string produces the intended French output.
    // 2026-08-15 is a Saturday; timezone forced to UTC for deterministic time.
    const ISO = '2026-08-15T14:30:00Z';
    const render = (fmt: string) => formatDate(ISO, fmt, 'fr', '+0000');

    it('long → "15 août 2026"', () => {
      expect(render(DATE_FMT.long)).toBe('15 août 2026');
    });

    it('short → "15/08/2026"', () => {
      expect(render(DATE_FMT.short)).toBe('15/08/2026');
    });

    it('time → "14h30"', () => {
      expect(render(DATE_FMT.time)).toBe('14h30');
    });

    it('datetime → "15/08/2026 14h30"', () => {
      expect(render(DATE_FMT.datetime)).toBe('15/08/2026 14h30');
    });

    it('longDatetime → "15 août 2026 à 14h30"', () => {
      expect(render(DATE_FMT.longDatetime)).toBe('15 août 2026 à 14h30');
    });

    it('weekday → "samedi 15 août 2026"', () => {
      expect(render(DATE_FMT.weekday)).toBe('samedi 15 août 2026');
    });

    it('weekdayDatetime → "samedi 15 août 2026 à 14h30"', () => {
      expect(render(DATE_FMT.weekdayDatetime)).toBe('samedi 15 août 2026 à 14h30');
    });
  });

  describe('formatWeekdayLong', () => {
    it('formate une date-string en "jour j mois aaaa"', () => {
      // 2026-07-13 est un lundi (construction locale, insensible au fuseau)
      expect(formatWeekdayLong('2026-07-13')).toBe('lundi 13 juillet 2026');
    });

    it('accepte un objet Date', () => {
      expect(formatWeekdayLong(new Date(2026, 6, 13))).toBe('lundi 13 juillet 2026');
    });

    it('renvoie une chaîne vide pour null/undefined', () => {
      expect(formatWeekdayLong(null)).toBe('');
      expect(formatWeekdayLong(undefined)).toBe('');
    });
  });

  describe('dateSearchHaystack', () => {
    it("inclut l'ISO, le format jj/mm/aaaa, et le mois en français", () => {
      const out = dateSearchHaystack('1960-08-15');
      expect(out).toContain('1960-08-15');
      expect(out).toContain('15/08/1960');
      expect(out).toContain('aout'); // accent-stripped by design
      expect(out).toContain('1960');
    });

    it('renvoie une chaîne vide pour une date invalide', () => {
      expect(dateSearchHaystack('not-a-date')).toBe('');
      expect(dateSearchHaystack(null)).toBe('');
      expect(dateSearchHaystack('')).toBe('');
    });

    it("permet de chercher par nom de mois en français", () => {
      const out = dateSearchHaystack('1960-12-25');
      expect(out).toContain('decembre');
    });
  });
});
