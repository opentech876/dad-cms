import {
  MONTHS_FR_LONG,
  MONTHS_FR_SHORT,
  formatDateLong,
  formatDateShort,
  formatDateTime,
  formatRelativeFr,
  formatDayMonthLong,
} from './date.utils';

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
});
