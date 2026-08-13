import { TestBed } from '@angular/core/testing';
import { ThemeService, ThemeId, ColorMode } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ThemeService);
  });

  it('devrait être créé', () => {
    expect(service).toBeTruthy();
  });

  // ── setTheme ─────────────────────────────────────────────────────────────

  describe('setTheme()', () => {
    it('met à jour le signal theme', () => {
      service.setTheme('broadsheet');
      expect(service.theme()).toBe('broadsheet');
    });

    it('persiste le thème dans localStorage', () => {
      service.setTheme('field');
      expect(localStorage.getItem('dad-theme')).toBe('field');
    });

    it('applique chaque thème valide sans erreur', () => {
      (['archive', 'broadsheet', 'field'] as ThemeId[]).forEach(t => {
        expect(() => service.setTheme(t)).not.toThrow();
      });
    });
  });

  // ── setColorMode ──────────────────────────────────────────────────────────

  describe('setColorMode()', () => {
    it('met à jour le signal colorMode', () => {
      service.setColorMode('dark');
      expect(service.colorMode()).toBe('dark');
    });

    it('persiste le mode dans localStorage', () => {
      service.setColorMode('light');
      expect(localStorage.getItem('dad-color-mode')).toBe('light');
    });

    it('applique chaque mode valide sans erreur', () => {
      (['light', 'dark', 'system'] as ColorMode[]).forEach(m => {
        expect(() => service.setColorMode(m)).not.toThrow();
      });
    });
  });

  // ── toggleDark ────────────────────────────────────────────────────────────

  describe('toggleDark()', () => {
    it("passe en mode 'dark' depuis 'system'", () => {
      service.setColorMode('system');
      service.toggleDark();
      expect(service.colorMode()).toBe('dark');
    });

    it("repasse en mode 'system' depuis 'dark'", () => {
      service.setColorMode('dark');
      service.toggleDark();
      expect(service.colorMode()).toBe('system');
    });
  });

  // ── _apply() — attributs DOM ─────────────────────────────────────────────

  describe('_apply() — attributs DOM', () => {
    const root = document.documentElement;

    afterEach(() => {
      root.removeAttribute('data-theme');
      root.removeAttribute('data-mode');
    });

    it('archive + system → pas de data-theme ni data-mode', () => {
      service.setTheme('archive');
      service.setColorMode('system');
      TestBed.flushEffects();
      expect(root.getAttribute('data-theme')).toBeNull();
      expect(root.getAttribute('data-mode')).toBeNull();
    });

    it('broadsheet + system → data-theme="broadsheet", pas de data-mode', () => {
      service.setTheme('broadsheet');
      service.setColorMode('system');
      TestBed.flushEffects();
      expect(root.getAttribute('data-theme')).toBe('broadsheet');
      expect(root.getAttribute('data-mode')).toBeNull();
    });

    it('field + system → data-theme="field", pas de data-mode', () => {
      service.setTheme('field');
      service.setColorMode('system');
      TestBed.flushEffects();
      expect(root.getAttribute('data-theme')).toBe('field');
      expect(root.getAttribute('data-mode')).toBeNull();
    });

    it('archive + dark → pas de data-theme, data-mode="dark"', () => {
      service.setTheme('archive');
      service.setColorMode('dark');
      TestBed.flushEffects();
      expect(root.getAttribute('data-theme')).toBeNull();
      expect(root.getAttribute('data-mode')).toBe('dark');
    });

    it('broadsheet + dark → data-theme="broadsheet", data-mode="dark"', () => {
      service.setTheme('broadsheet');
      service.setColorMode('dark');
      TestBed.flushEffects();
      expect(root.getAttribute('data-theme')).toBe('broadsheet');
      expect(root.getAttribute('data-mode')).toBe('dark');
    });

    it('field + light → data-theme="field", data-mode="light"', () => {
      service.setTheme('field');
      service.setColorMode('light');
      TestBed.flushEffects();
      expect(root.getAttribute('data-theme')).toBe('field');
      expect(root.getAttribute('data-mode')).toBe('light');
    });

    it('archive + light → pas de data-theme, data-mode="light"', () => {
      service.setTheme('archive');
      service.setColorMode('light');
      TestBed.flushEffects();
      expect(root.getAttribute('data-theme')).toBeNull();
      expect(root.getAttribute('data-mode')).toBe('light');
    });

    it('passer de broadsheet à archive supprime data-theme', () => {
      service.setTheme('broadsheet');
      TestBed.flushEffects();
      service.setTheme('archive');
      TestBed.flushEffects();
      expect(root.getAttribute('data-theme')).toBeNull();
    });

    it('passer de dark à system supprime data-mode', () => {
      service.setColorMode('dark');
      TestBed.flushEffects();
      service.setColorMode('system');
      TestBed.flushEffects();
      expect(root.getAttribute('data-mode')).toBeNull();
    });
  });

  // ── _load (persistance) ───────────────────────────────────────────────────

  describe('persistance', () => {
    it('initialise theme depuis localStorage si présent', () => {
      localStorage.setItem('dad-theme', 'broadsheet');
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const svc = TestBed.inject(ThemeService);
      expect(svc.theme()).toBe('broadsheet');
    });

    it("utilise 'archive' comme thème par défaut si localStorage est vide", () => {
      localStorage.clear();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const svc = TestBed.inject(ThemeService);
      expect(svc.theme()).toBe('archive');
    });

    it("utilise 'light' comme mode par défaut si localStorage est vide", () => {
      // The default was changed from 'system' to 'light' to give the app a
      // predictable light-first identity. Users on dark-preferring OSes who
      // want dark can pick it explicitly; their choice persists.
      localStorage.clear();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const svc = TestBed.inject(ThemeService);
      expect(svc.colorMode()).toBe('light');
    });
  });

  // ── loadFromProfile ───────────────────────────────────────────────────────

  describe('loadFromProfile()', () => {
    it('applique un thème valide depuis le profil', () => {
      service.loadFromProfile('broadsheet', null);
      expect(service.theme()).toBe('broadsheet');
    });

    it('applique un mode valide depuis le profil', () => {
      service.loadFromProfile(null, 'dark');
      expect(service.colorMode()).toBe('dark');
    });

    it('persiste le thème dans localStorage après chargement du profil', () => {
      service.loadFromProfile('field', null);
      expect(localStorage.getItem('dad-theme')).toBe('field');
    });

    it('persiste le mode dans localStorage après chargement du profil', () => {
      service.loadFromProfile(null, 'light');
      expect(localStorage.getItem('dad-color-mode')).toBe('light');
    });

    it('ignore un thème invalide provenant du profil', () => {
      service.setTheme('archive');
      service.loadFromProfile('invalid-theme', null);
      expect(service.theme()).toBe('archive');
    });

    it('ignore un mode invalide provenant du profil', () => {
      service.setColorMode('system');
      service.loadFromProfile(null, 'invalid-mode');
      expect(service.colorMode()).toBe('system');
    });

    it('ne modifie rien si les deux valeurs sont null', () => {
      service.setTheme('broadsheet');
      service.setColorMode('dark');
      service.loadFromProfile(null, null);
      expect(service.theme()).toBe('broadsheet');
      expect(service.colorMode()).toBe('dark');
    });
  });

  // ── effectiveDark ─────────────────────────────────────────────────────────

  describe('effectiveDark', () => {
    it("est true quand le mode est 'dark'", () => {
      service.setColorMode('dark');
      expect(service.effectiveDark()).toBe(true);
    });

    it("est false quand le mode est 'light'", () => {
      service.setColorMode('light');
      expect(service.effectiveDark()).toBe(false);
    });

    describe("mode 'system'", () => {
      const realMatchMedia = window.matchMedia;
      afterEach(() => {
        (window as unknown as { matchMedia: unknown }).matchMedia = realMatchMedia;
      });

      function serviceWithSystemPref(prefersDark: boolean): ThemeService {
        (window as unknown as { matchMedia: unknown }).matchMedia = jest.fn().mockReturnValue({
          matches: prefersDark,
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
        });
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({});
        const svc = TestBed.inject(ThemeService);
        svc.setColorMode('system');
        return svc;
      }

      it('suit la préférence système sombre', () => {
        expect(serviceWithSystemPref(true).effectiveDark()).toBe(true);
      });

      it('suit la préférence système claire', () => {
        expect(serviceWithSystemPref(false).effectiveDark()).toBe(false);
      });
    });
  });
});
