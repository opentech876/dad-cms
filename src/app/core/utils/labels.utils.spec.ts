import { getInitials, ROLE_LABELS, APPLY_TIER } from './labels.utils';

describe('labels.utils', () => {
  describe('getInitials()', () => {
    it('retourne deux initiales pour prénom + nom', () => {
      expect(getInitials('Elvis Olembe')).toBe('EO');
    });

    it('retourne une initiale pour un seul mot', () => {
      expect(getInitials('Elvis')).toBe('E');
    });

    it('gère les espaces multiples', () => {
      expect(getInitials('  Jean   Dupont ')).toBe('JD');
    });

    it("retourne le fallback par défaut '?' pour une chaîne vide", () => {
      expect(getInitials('   ')).toBe('?');
    });

    it('retourne le fallback personnalisé quand fourni', () => {
      expect(getInitials('', 'NA')).toBe('NA');
    });
  });

  it('ROLE_LABELS mappe owner → Administrateur et presidence → Curateur', () => {
    expect(ROLE_LABELS.owner).toBe('Administrateur');
    expect(ROLE_LABELS.presidence).toBe('Curateur');
  });

  it('APPLY_TIER vaut chef_equipe', () => {
    expect(APPLY_TIER).toBe('chef_equipe');
  });
});
