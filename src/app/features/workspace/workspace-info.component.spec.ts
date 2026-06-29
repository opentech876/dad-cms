import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { WorkspaceInfoComponent } from './workspace-info.component';
import { WorkspaceService } from '../../core/workspace/workspace.service';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { AdminService } from '../../core/admin/admin.service';
import { ToastService } from '../../core/services/toast.service';
import { Workspace } from '../../models';

const MOCK_WORKSPACE: Workspace = {
  id: 'ws-1',
  name: 'Day After Day',
  logo_url: null,
  created_by: 'user-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-15T00:00:00Z',
};

const MOCK_WORKSPACE_2: Workspace = {
  ...MOCK_WORKSPACE,
  id: 'ws-2',
  name: 'Autre tenant',
};

describe('WorkspaceInfoComponent', () => {
  let component: WorkspaceInfoComponent;
  let fixture: ComponentFixture<WorkspaceInfoComponent>;
  let mockWorkspace: jest.Mocked<Pick<WorkspaceService,
    'getWorkspaces' | 'updateWorkspace' | 'uploadLogo' | 'listUsers'>>;
  let mockAuth: { currentRole$: any; isSystemAdmin: jest.Mock };
  let mockAdmin: jest.Mocked<Pick<AdminService, 'softDeleteWorkspace'>>;
  let mockToast: jest.Mocked<Pick<ToastService, 'success' | 'error'>>;
  let mockContext: { activeWorkspaceId: jest.Mock };
  let mockRouter: { navigate: jest.Mock };

  beforeEach(async () => {
    global.URL.createObjectURL = jest.fn().mockReturnValue('blob:fake-url');
    global.URL.revokeObjectURL = jest.fn();

    mockWorkspace = {
      getWorkspaces: jest.fn().mockReturnValue(of([MOCK_WORKSPACE])),
      updateWorkspace: jest.fn().mockReturnValue(of({ success: true })),
      uploadLogo: jest.fn().mockReturnValue(of({ success: true, logoUrl: 'https://example.com/logo.jpg' })),
      listUsers: jest.fn().mockReturnValue(of([{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }])),
    };
    mockAuth  = { currentRole$: of('owner'), isSystemAdmin: jest.fn().mockReturnValue(of(false)) };
    mockAdmin = { softDeleteWorkspace: jest.fn().mockReturnValue(of({ success: true })) };
    mockToast = { success: jest.fn(), error: jest.fn() };
    mockContext = { activeWorkspaceId: jest.fn().mockReturnValue('ws-1') };
    mockRouter = { navigate: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [WorkspaceInfoComponent],
      providers: [
        { provide: WorkspaceService,        useValue: mockWorkspace },
        { provide: WorkspaceContextService, useValue: mockContext },
        { provide: AuthService,             useValue: mockAuth },
        { provide: AdminService,            useValue: mockAdmin },
        { provide: ToastService,            useValue: mockToast },
        { provide: Router,                  useValue: mockRouter },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    TestBed.overrideComponent(WorkspaceInfoComponent, { set: { template: '' } });

    fixture   = TestBed.createComponent(WorkspaceInfoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await component.ngOnInit();
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
  });

  // ── chargement ─────────────────────────────────────────────────────────────

  describe('chargement', () => {
    it('appelle getWorkspaces au démarrage', () => {
      expect(mockWorkspace.getWorkspaces).toHaveBeenCalled();
    });

    it('initialise workspaceName depuis le workspace chargé', () => {
      expect(component.workspaceName()).toBe('Day After Day');
    });

    it('expose workspaceId depuis le workspace chargé', () => {
      expect(component.workspaceId()).toBe('ws-1');
    });

    it('expose createdAt depuis le workspace chargé', () => {
      expect(component.createdAt()).toBe('2026-01-01T00:00:00Z');
    });

    it('expose memberCount depuis listUsers (owner uniquement)', () => {
      expect(component.memberCount()).toBe(3);
    });

    it('isOwner vaut true pour le rôle owner', () => {
      expect(component.isOwner()).toBe(true);
    });

    it('isOwner vaut false pour un rôle non-owner', async () => {
      mockAuth.currentRole$ = of('editeur');
      await component.ngOnInit();
      expect(component.isOwner()).toBe(false);
    });

    it('ne charge pas le memberCount pour un non-owner', async () => {
      mockWorkspace.listUsers.mockClear();
      mockAuth.currentRole$ = of('editeur');
      await component.ngOnInit();
      expect(mockWorkspace.listUsers).not.toHaveBeenCalled();
    });
  });

  // ── saveWorkspaceName ──────────────────────────────────────────────────────

  describe('saveWorkspaceName()', () => {
    it('appelle updateWorkspace avec workspaceId et le nom saisi', async () => {
      component.workspaceName.set('Nouveau Nom');
      await component.saveWorkspaceName();
      expect(mockWorkspace.updateWorkspace).toHaveBeenCalledWith('ws-1', 'Nouveau Nom');
    });

    it('ne fait rien si workspaceName est vide', async () => {
      component.workspaceName.set('   ');
      await component.saveWorkspaceName();
      expect(mockWorkspace.updateWorkspace).not.toHaveBeenCalled();
    });

    it('ne fait rien si workspaceId est null', async () => {
      mockWorkspace.getWorkspaces.mockReturnValueOnce(of([]));
      await component.ngOnInit();
      component.workspaceName.set('Test');
      await component.saveWorkspaceName();
      expect(mockWorkspace.updateWorkspace).not.toHaveBeenCalled();
    });

    it('met saving à false après la sauvegarde', async () => {
      component.workspaceName.set('Test');
      await component.saveWorkspaceName();
      expect(component.saving()).toBe(false);
    });

    it('affiche un toast de succès après la sauvegarde', async () => {
      component.workspaceName.set('Test');
      await component.saveWorkspaceName();
      expect(mockToast.success).toHaveBeenCalled();
    });

    it('affiche un toast d\'erreur si updateWorkspace échoue', async () => {
      mockWorkspace.updateWorkspace.mockReturnValue(of({ success: false, error: 'Accès refusé' }));
      component.workspaceName.set('Test');
      await component.saveWorkspaceName();
      expect(mockToast.error).toHaveBeenCalledWith('Accès refusé.');
    });
  });

  // ── onLogoChange ───────────────────────────────────────────────────────────

  describe('onLogoChange()', () => {
    it('met logoFile à jour quand un fichier est sélectionné', () => {
      const file = new File(['data'], 'logo.jpg', { type: 'image/jpeg' });
      const event = { target: { files: [file] } } as unknown as Event;
      component.onLogoChange(event);
      expect(component.logoFile()).toBe(file);
    });

    it('ne modifie pas logoFile si aucun fichier', () => {
      const event = { target: { files: [] } } as unknown as Event;
      component.onLogoChange(event);
      expect(component.logoFile()).toBeNull();
    });

    it('crée une prévisualisation locale', () => {
      const file = new File(['data'], 'logo.jpg', { type: 'image/jpeg' });
      const event = { target: { files: [file] } } as unknown as Event;
      component.onLogoChange(event);
      expect(component.logoPreview()).toBe('blob:fake-url');
    });
  });

  // ── uploadLogo ─────────────────────────────────────────────────────────────

  describe('uploadLogo()', () => {
    it('appelle WorkspaceService.uploadLogo avec workspaceId et file', async () => {
      const file = new File(['data'], 'logo.jpg', { type: 'image/jpeg' });
      component.logoFile.set(file);
      await component.uploadLogo();
      expect(mockWorkspace.uploadLogo).toHaveBeenCalledWith('ws-1', file);
    });

    it('ne fait rien si logoFile est null', async () => {
      component.logoFile.set(null);
      await component.uploadLogo();
      expect(mockWorkspace.uploadLogo).not.toHaveBeenCalled();
    });

    it('ne fait rien si workspaceId est null', async () => {
      mockWorkspace.getWorkspaces.mockReturnValueOnce(of([]));
      await component.ngOnInit();
      const file = new File(['data'], 'logo.jpg', { type: 'image/jpeg' });
      component.logoFile.set(file);
      await component.uploadLogo();
      expect(mockWorkspace.uploadLogo).not.toHaveBeenCalled();
    });

    it('met logoUploading à false après l\'upload', async () => {
      const file = new File(['data'], 'logo.jpg', { type: 'image/jpeg' });
      component.logoFile.set(file);
      await component.uploadLogo();
      expect(component.logoUploading()).toBe(false);
    });

    it('affiche un toast de succès après l\'upload', async () => {
      const file = new File(['data'], 'logo.jpg', { type: 'image/jpeg' });
      component.logoFile.set(file);
      await component.uploadLogo();
      expect(mockToast.success).toHaveBeenCalled();
    });

    it('met à jour logoUrl avec la valeur retournée', async () => {
      const file = new File(['data'], 'logo.jpg', { type: 'image/jpeg' });
      component.logoFile.set(file);
      await component.uploadLogo();
      expect(component.logoUrl()).toBe('https://example.com/logo.jpg');
    });

    it('réinitialise logoFile après un upload réussi', async () => {
      const file = new File(['data'], 'logo.jpg', { type: 'image/jpeg' });
      component.logoFile.set(file);
      await component.uploadLogo();
      expect(component.logoFile()).toBeNull();
    });

    it('affiche un toast d\'erreur si uploadLogo échoue', async () => {
      mockWorkspace.uploadLogo.mockReturnValue(of({ success: false, error: 'Bucket introuvable' }));
      const file = new File(['data'], 'logo.jpg', { type: 'image/jpeg' });
      component.logoFile.set(file);
      await component.uploadLogo();
      expect(mockToast.error).toHaveBeenCalledWith('Bucket introuvable.');
    });
  });

  // ── active workspace selection + system_admin ─────────────────────────────

  describe('sélection du workspace actif et accès system_admin', () => {
    it("charge le workspace dont l'id correspond à activeWorkspaceId, pas le premier", async () => {
      mockWorkspace.getWorkspaces.mockReturnValueOnce(of([MOCK_WORKSPACE, MOCK_WORKSPACE_2]));
      mockContext.activeWorkspaceId.mockReturnValueOnce('ws-2');
      await component.ngOnInit();
      expect(component.workspaceId()).toBe('ws-2');
      expect(component.workspaceName()).toBe('Autre tenant');
    });

    it("retombe sur le premier workspace quand activeWorkspaceId est null", async () => {
      mockWorkspace.getWorkspaces.mockReturnValueOnce(of([MOCK_WORKSPACE]));
      mockContext.activeWorkspaceId.mockReturnValueOnce(null);
      await component.ngOnInit();
      expect(component.workspaceId()).toBe('ws-1');
    });

    it("canManage est vrai pour le rôle owner", () => {
      expect(component.canManage()).toBe(true);
    });

    it("canManage est vrai pour un system_admin même non-owner", async () => {
      mockAuth.currentRole$ = of('editeur');
      mockAuth.isSystemAdmin.mockReturnValueOnce(of(true));
      await component.ngOnInit();
      expect(component.canManage()).toBe(true);
    });

    it("canManage est faux pour un éditeur non system_admin", async () => {
      mockAuth.currentRole$ = of('editeur');
      mockAuth.isSystemAdmin.mockReturnValueOnce(of(false));
      await component.ngOnInit();
      expect(component.canManage()).toBe(false);
    });
  });

  // ── soft-delete (system_admin only) ───────────────────────────────────────

  describe('suppression de workspace (system_admin)', () => {
    beforeEach(async () => {
      mockAuth.isSystemAdmin.mockReturnValue(of(true));
      await component.ngOnInit();
    });

    it("openDeleteModal n'ouvre rien si l'utilisateur n'est pas system_admin", async () => {
      mockAuth.isSystemAdmin.mockReturnValueOnce(of(false));
      await component.ngOnInit();
      component.openDeleteModal();
      expect(component.showDeleteModal()).toBe(false);
    });

    it('openDeleteModal ouvre le modal pour un system_admin', () => {
      component.openDeleteModal();
      expect(component.showDeleteModal()).toBe(true);
    });

    it("confirmDelete appelle adminService.softDeleteWorkspace et redirige vers /admin", async () => {
      component.openDeleteModal();
      await component.confirmDelete();
      expect(mockAdmin.softDeleteWorkspace).toHaveBeenCalledWith('ws-1');
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/admin']);
    });

    it("affiche un toast d'erreur quand la suppression échoue", async () => {
      mockAdmin.softDeleteWorkspace.mockReturnValueOnce(of({ success: false, error: 'Boom' }));
      component.openDeleteModal();
      await component.confirmDelete();
      expect(mockToast.error).toHaveBeenCalledWith('Boom');
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });
  });
});
