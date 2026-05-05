import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { SettingsComponent } from './settings.component';
import { ThemeService, ThemeId, ColorMode } from '../../core/services/theme.service';
import { WorkspaceService } from '../../core/workspace/workspace.service';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { signal } from '@angular/core';

describe('SettingsComponent', () => {
  let component: SettingsComponent;
  let fixture: ComponentFixture<SettingsComponent>;
  let mockTheme: jest.Mocked<Pick<ThemeService, 'setTheme' | 'setColorMode' | 'theme' | 'colorMode'>>;
  let mockWorkspace: jest.Mocked<Pick<WorkspaceService, 'getWorkspaces' | 'updateWorkspace'>>;
  let mockWorkspaceCtx: { activeWorkspaceId: ReturnType<typeof signal<string | null>> };
  let mockAuth: { currentRole$: any };
  let mockToast: jest.Mocked<Pick<ToastService, 'success' | 'error'>>;

  beforeEach(async () => {
    mockTheme = {
      theme:     signal<ThemeId>('archive') as any,
      colorMode: signal<ColorMode>('system') as any,
      setTheme:     jest.fn(),
      setColorMode: jest.fn(),
    };

    mockWorkspace = {
      getWorkspaces:   jest.fn().mockReturnValue(of([{ id: 'ws-1', name: 'Day After Day' }])),
      updateWorkspace: jest.fn().mockReturnValue(of({ success: true })),
    };

    mockWorkspaceCtx = { activeWorkspaceId: signal<string | null>('ws-1') };

    mockAuth  = { currentRole$: of('owner') };
    mockToast = { success: jest.fn(), error: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        { provide: ThemeService,           useValue: mockTheme },
        { provide: WorkspaceService,        useValue: mockWorkspace },
        { provide: WorkspaceContextService, useValue: mockWorkspaceCtx },
        { provide: AuthService,             useValue: mockAuth },
        { provide: ToastService,            useValue: mockToast },
      ],
    }).compileComponents();

    fixture   = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
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

  // ── Espace de travail ───────────────────────────────────────────────────────

  describe('ngOnInit()', () => {
    it('charge les espaces de travail via WorkspaceService', () => {
      expect(mockWorkspace.getWorkspaces).toHaveBeenCalled();
    });

    it('pré-remplit workspaceName avec le nom de l\'espace actif', () => {
      expect(component.workspaceName()).toBe('Day After Day');
    });

    it('expose isOwner = true pour le rôle owner', () => {
      expect(component.isOwner()).toBe(true);
    });
  });

  describe('saveWorkspaceName()', () => {
    it('appelle updateWorkspace() avec l\'id et le nom saisi', async () => {
      component.workspaceName.set('Nouveau Nom');
      await component.saveWorkspaceName();
      expect(mockWorkspace.updateWorkspace).toHaveBeenCalledWith('ws-1', 'Nouveau Nom');
    });

    it('ne fait rien si le nom est vide', async () => {
      component.workspaceName.set('   ');
      await component.saveWorkspaceName();
      expect(mockWorkspace.updateWorkspace).not.toHaveBeenCalled();
    });

    it('ne fait rien si aucun workspace actif', async () => {
      mockWorkspaceCtx.activeWorkspaceId.set(null);
      component.workspaceName.set('Test');
      await component.saveWorkspaceName();
      expect(mockWorkspace.updateWorkspace).not.toHaveBeenCalled();
    });

    it('affiche un toast de succès après une sauvegarde réussie', async () => {
      component.workspaceName.set('Test');
      await component.saveWorkspaceName();
      expect(mockToast.success).toHaveBeenCalled();
    });

    it('affiche un toast d\'erreur si updateWorkspace() échoue', async () => {
      mockWorkspace.updateWorkspace.mockReturnValue(of({ success: false, error: 'Accès refusé' }));
      component.workspaceName.set('Test');
      await component.saveWorkspaceName();
      expect(mockToast.error).toHaveBeenCalledWith('Accès refusé.');
    });
  });
});
