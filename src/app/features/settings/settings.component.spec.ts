import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { SettingsComponent } from './settings.component';
import { ThemeService, ThemeId, ColorMode } from '../../core/services/theme.service';
import { AuthService } from '../../core/auth/auth.service';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { signal } from '@angular/core';

function makeClientMock(dbError: any = null, storageData: any = 45) {
  const selectMock = jest.fn().mockResolvedValue({ error: dbError });
  const fromMock   = jest.fn().mockReturnValue({ select: selectMock });
  const rpcMock    = jest.fn().mockResolvedValue({ data: storageData });
  return { from: fromMock, rpc: rpcMock };
}

describe('SettingsComponent', () => {
  let component: SettingsComponent;
  let fixture: ComponentFixture<SettingsComponent>;
  let mockTheme: jest.Mocked<Pick<ThemeService, 'setTheme' | 'setColorMode' | 'theme' | 'colorMode'>>;
  let mockAuth: { currentRole$: any };
  let mockSupabase: { client: ReturnType<typeof makeClientMock> };

  beforeEach(async () => {
    mockTheme = {
      theme:        signal<ThemeId>('archive') as any,
      colorMode:    signal<ColorMode>('system') as any,
      setTheme:     jest.fn(),
      setColorMode: jest.fn(),
    };
    mockAuth     = { currentRole$: of('editeur') };
    mockSupabase = { client: makeClientMock() };

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        { provide: ThemeService,    useValue: mockTheme },
        { provide: AuthService,     useValue: mockAuth },
        { provide: SupabaseService, useValue: mockSupabase },
      ],
    }).compileComponents();

    fixture   = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
  });

  // ── isOwner ─────────────────────────────────────────────────────────────────

  describe('isOwner()', () => {
    it('vaut false pour un rôle editeur', () => {
      expect(component.isOwner()).toBe(false);
    });
  });

  // ── Apparence — thème ───────────────────────────────────────────────────────

  describe('selectTheme()', () => {
    it('appelle ThemeService.setTheme() avec le thème sélectionné', () => {
      component.selectTheme('broadsheet');
      expect(mockTheme.setTheme).toHaveBeenCalledWith('broadsheet');
    });

    it('appelle ThemeService.setTheme() pour chaque thème valide', () => {
      (['archive', 'broadsheet', 'field'] as ThemeId[]).forEach(t => {
        component.selectTheme(t);
        expect(mockTheme.setTheme).toHaveBeenCalledWith(t);
      });
    });
  });

  // ── Apparence — mode de couleur ─────────────────────────────────────────────

  describe('selectColorMode()', () => {
    it('appelle ThemeService.setColorMode() avec le mode sélectionné', () => {
      component.selectColorMode('dark');
      expect(mockTheme.setColorMode).toHaveBeenCalledWith('dark');
    });

    it('appelle ThemeService.setColorMode() pour chaque mode valide', () => {
      (['light', 'dark', 'system'] as ColorMode[]).forEach(m => {
        component.selectColorMode(m);
        expect(mockTheme.setColorMode).toHaveBeenCalledWith(m);
      });
    });
  });

  // ── _checkHealth ────────────────────────────────────────────────────────────

  describe('_checkHealth()', () => {
    it('passe dbStatus à connected quand la requête DB réussit', async () => {
      await component['_checkHealth']();
      expect(component.dbStatus()).toBe('connected');
    });

    it('passe dbStatus à error quand la requête DB échoue', async () => {
      mockSupabase.client = makeClientMock({ message: 'Connexion refusée' }) as any;
      await component['_checkHealth']();
      expect(component.dbStatus()).toBe('error');
    });

    it('remplit storageUsedMb avec la valeur retournée par l\'RPC', async () => {
      mockSupabase.client = makeClientMock(null, 42) as any;
      await component['_checkHealth']();
      expect(component.storageUsedMb()).toBe(42);
    });

    it('laisse storageUsedMb à null si l\'RPC retourne null', async () => {
      mockSupabase.client = makeClientMock(null, null) as any;
      await component['_checkHealth']();
      expect(component.storageUsedMb()).toBeNull();
    });
  });

  // ── storagePercent ──────────────────────────────────────────────────────────

  describe('storagePercent()', () => {
    it('retourne 0 quand storageUsedMb est null', () => {
      component.storageUsedMb.set(null);
      expect(component.storagePercent()).toBe(0);
    });

    it('retourne le bon pourcentage pour 250 Mo / 500 Mo', () => {
      component.storageUsedMb.set(250);
      expect(component.storagePercent()).toBe(50);
    });

    it('plafonne à 100 % si dépassement 500 Mo', () => {
      component.storageUsedMb.set(600);
      expect(component.storagePercent()).toBe(100);
    });
  });

  // ── refreshHealth ───────────────────────────────────────────────────────────

  describe('refreshHealth()', () => {
    it('remet storageUsedMb à null au début du refresh', async () => {
      component.storageUsedMb.set(99);
      const p = component.refreshHealth();
      expect(component.storageUsedMb()).toBeNull();
      await p;
    });

    it('remet dbStatus à checking puis le passe à connected', async () => {
      component.dbStatus.set('error');
      await component.refreshHealth();
      expect(component.dbStatus()).toBe('connected');
    });
  });
});
