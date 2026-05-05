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

    it("utilise 'system' comme mode par défaut si localStorage est vide", () => {
      localStorage.clear();
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const svc = TestBed.inject(ThemeService);
      expect(svc.colorMode()).toBe('system');
    });
  });
});
