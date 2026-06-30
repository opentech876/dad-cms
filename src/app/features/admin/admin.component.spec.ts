import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { AdminComponent } from './admin.component';
import { AdminService, AdminWorkspace } from '../../core/admin/admin.service';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';
import { RefreshRouteReuseStrategy } from '../../core/router/refresh-route-reuse.strategy';

const FAKE: AdminWorkspace[] = [
  {
    id: 'ws-1', name: 'DIOUGA-DIOP Media', logo_url: null, member_count: 3,
    created_at: '2026-01-01T08:00:00Z', created_by: 'u1', created_by_email: 'opentech876@gmail.com', deleted_at: null,
  },
  {
    id: 'ws-2', name: 'Ancien test', logo_url: null, member_count: 0,
    created_at: '2026-02-15T10:00:00Z', created_by: 'u1', created_by_email: 'opentech876@gmail.com', deleted_at: '2026-04-12T09:00:00Z',
  },
];

describe('AdminComponent', () => {
  let component: AdminComponent;
  let fixture: ComponentFixture<AdminComponent>;
  let admin: jest.Mocked<Pick<AdminService, 'listWorkspaces' | 'createWorkspace' | 'softDeleteWorkspace' | 'restoreWorkspace' | 'renameWorkspace' | 'inviteManager'>>;
  let mockContext: { setActiveWorkspace: jest.Mock };
  let mockRouter: { navigate: jest.Mock };
  let mockReuse: { triggerRefresh: jest.Mock };

  beforeEach(async () => {
    admin = {
      listWorkspaces:      jest.fn().mockReturnValue(of(FAKE)),
      createWorkspace:     jest.fn().mockReturnValue(of({ success: true, workspaceId: 'ws-new' })),
      softDeleteWorkspace: jest.fn().mockReturnValue(of({ success: true })),
      restoreWorkspace:    jest.fn().mockReturnValue(of({ success: true })),
      renameWorkspace:     jest.fn().mockReturnValue(of({ success: true })),
      inviteManager:       jest.fn().mockReturnValue(of({ success: true })),
    };
    mockContext = { setActiveWorkspace: jest.fn() };
    mockRouter  = { navigate: jest.fn() };
    mockReuse   = { triggerRefresh: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [AdminComponent],
      providers: [
        { provide: AdminService,             useValue: admin },
        { provide: WorkspaceContextService,  useValue: mockContext },
        { provide: Router,                   useValue: mockRouter },
        { provide: RefreshRouteReuseStrategy, useValue: mockReuse },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    TestBed.overrideComponent(AdminComponent, { set: { template: '' } });
    fixture = TestBed.createComponent(AdminComponent);
    component = fixture.componentInstance;
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
  });

  it('charge les workspaces au démarrage', async () => {
    await component.ngOnInit();
    expect(admin.listWorkspaces).toHaveBeenCalled();
    expect(component.workspaces().length).toBe(2);
  });

  it("activeWorkspaces et deletedWorkspaces partagent la liste correctement", async () => {
    await component.ngOnInit();
    expect(component.activeWorkspaces().length).toBe(1);
    expect(component.deletedWorkspaces().length).toBe(1);
    expect(component.activeWorkspaces()[0].id).toBe('ws-1');
    expect(component.deletedWorkspaces()[0].id).toBe('ws-2');
  });

  describe('createWorkspace', () => {
    it("rejette un nom vide", async () => {
      component.newName.set('  ');
      await component.submitCreate();
      expect(admin.createWorkspace).not.toHaveBeenCalled();
      expect(component.createError()).toBeTruthy();
    });

    it('appelle createWorkspace et recharge la liste en cas de succès', async () => {
      await component.ngOnInit();
      admin.listWorkspaces.mockClear();
      component.newName.set('Tenant B');
      await component.submitCreate();
      expect(admin.createWorkspace).toHaveBeenCalledWith('Tenant B', null);
      expect(admin.listWorkspaces).toHaveBeenCalled();
      expect(component.showCreateModal()).toBe(false);
    });

    it("affiche l'erreur quand le RPC échoue", async () => {
      admin.createWorkspace.mockReturnValueOnce(of({ success: false, error: 'Boom' }));
      component.openCreateModal();
      component.newName.set('Tenant B');
      await component.submitCreate();
      expect(component.createError()).toBe('Boom');
      expect(component.showCreateModal()).toBe(true);
    });
  });

  describe('soft-delete / restore', () => {
    it('softDelete appelle le service et recharge', async () => {
      await component.ngOnInit();
      admin.listWorkspaces.mockClear();
      await component.softDelete('ws-1');
      expect(admin.softDeleteWorkspace).toHaveBeenCalledWith('ws-1');
      expect(admin.listWorkspaces).toHaveBeenCalled();
    });

    it('restore appelle le service et recharge', async () => {
      await component.ngOnInit();
      admin.listWorkspaces.mockClear();
      await component.restore('ws-2');
      expect(admin.restoreWorkspace).toHaveBeenCalledWith('ws-2');
      expect(admin.listWorkspaces).toHaveBeenCalled();
    });
  });

  describe('rename inline', () => {
    beforeEach(async () => { await component.ngOnInit(); });

    it('openRename initialise renameValue avec le nom actuel', () => {
      component.openRename('ws-1', 'DIOUGA-DIOP Media');
      expect(component.renameTargetId()).toBe('ws-1');
      expect(component.renameValue()).toBe('DIOUGA-DIOP Media');
    });

    it("submitRename appelle renameWorkspace et recharge", async () => {
      component.openRename('ws-1', 'DIOUGA-DIOP Media');
      component.renameValue.set('Nouveau nom');
      admin.listWorkspaces.mockClear();
      await component.submitRename();
      expect(admin.renameWorkspace).toHaveBeenCalledWith('ws-1', 'Nouveau nom');
      expect(admin.listWorkspaces).toHaveBeenCalled();
      expect(component.renameTargetId()).toBeNull();
    });

    it('submitRename refuse un nom vide', async () => {
      component.openRename('ws-1', 'Old');
      component.renameValue.set('  ');
      await component.submitRename();
      expect(admin.renameWorkspace).not.toHaveBeenCalled();
    });

    it('cancelRename efface la cible', () => {
      component.openRename('ws-1', 'Old');
      component.cancelRename();
      expect(component.renameTargetId()).toBeNull();
    });
  });

  describe('enterAsAdmin (impersonation)', () => {
    beforeEach(async () => { await component.ngOnInit(); });

    it("definit l'espace actif sur la workspace cible et navigue vers /dashboard", () => {
      component.enterAsAdmin('ws-1');
      expect(mockContext.setActiveWorkspace).toHaveBeenCalledWith('ws-1');
      expect(mockReuse.triggerRefresh).toHaveBeenCalled();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
    });
  });

  describe('inviteManager (sysadmin → owner)', () => {
    beforeEach(async () => { await component.ngOnInit(); });

    it("openInviteManager ouvre le modal avec l'espace cible", () => {
      component.openInviteManager('ws-1', 'DIOUGA-DIOP Media');
      expect(component.showInviteModal()).toBe(true);
      expect(component.inviteWorkspaceId()).toBe('ws-1');
      expect(component.inviteWorkspaceName()).toBe('DIOUGA-DIOP Media');
    });

    it("closeInviteManager ferme le modal et purge l'état", () => {
      component.openInviteManager('ws-1', 'DIOUGA-DIOP Media');
      component.inviteEmail.set('x@y.com');
      component.closeInviteManager();
      expect(component.showInviteModal()).toBe(false);
      expect(component.inviteEmail()).toBe('');
    });

    it("submitInviteManager appelle inviteManager et affiche le message de succès", async () => {
      component.openInviteManager('ws-1', 'DIOUGA-DIOP Media');
      component.inviteEmail.set('mgr@x.com');
      await component.submitInviteManager();
      expect(admin.inviteManager).toHaveBeenCalledWith('ws-1', 'mgr@x.com');
      expect(component.inviteSuccess()).toContain('mgr@x.com');
      expect(component.inviteError()).toBe('');
    });

    it("submitInviteManager expose l'erreur retournée par le service", async () => {
      admin.inviteManager.mockReturnValueOnce(of({ success: false, error: 'rate limit' }));
      component.openInviteManager('ws-1', 'DIOUGA-DIOP Media');
      component.inviteEmail.set('mgr@x.com');
      await component.submitInviteManager();
      expect(component.inviteError()).toContain('rate limit');
      expect(component.inviteSuccess()).toBe('');
    });

    it("submitInviteManager ne fait rien quand l'email est vide", async () => {
      component.openInviteManager('ws-1', 'DIOUGA-DIOP Media');
      component.inviteEmail.set('   ');
      await component.submitInviteManager();
      expect(admin.inviteManager).not.toHaveBeenCalled();
    });
  });
});
