import { positionLabel, artFor, REC_STATUS_META } from './curation.utils';

describe('curation.utils', () => {
  describe('positionLabel()', () => {
    it('1 → Événement principal', () => {
      expect(positionLabel(1)).toBe('Événement principal');
    });
    it("2 → C'est aussi", () => {
      expect(positionLabel(2)).toBe("C'est aussi");
    });
  });

  describe('artFor()', () => {
    it('est déterministe pour une même graine', () => {
      expect(artFor('evt-1')).toBe(artFor('evt-1'));
    });
    it('retourne un gradient de la palette', () => {
      expect(artFor('abc')).toContain('linear-gradient');
    });
    it('gère la chaîne vide sans planter', () => {
      expect(typeof artFor('')).toBe('string');
    });
    it('varie selon la graine', () => {
      const seeds = ['a', 'bb', 'ccc', 'dddd', 'eeeee', 'ffffff'];
      const distinct = new Set(seeds.map(artFor));
      expect(distinct.size).toBeGreaterThan(1);
    });
  });

  it('REC_STATUS_META expose pending et applied avec leurs badges', () => {
    expect(REC_STATUS_META.pending.badge).toBe('badge-warning');
    expect(REC_STATUS_META.applied.badge).toBe('badge-success');
  });
});
