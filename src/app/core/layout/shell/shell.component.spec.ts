import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject, EMPTY, of } from 'rxjs';
import { Router } from '@angular/router';
import { ShellComponent } from './shell.component';
import { AuthService } from '../../auth/auth.service';
import { WorkspaceService } from '../../workspace/workspace.service';
import { AppRole, WorkspaceSummary } from '../../../models';
import { WorkspaceContextService } from '../../workspace/workspace-context.service';

describe('ShellComponent — navigation par rôle', () => {
  let component: ShellComponent;
  let fixture: ComponentFixture<ShellComponent>;
  let roleSubject: BehaviorSubject<AppRole | null>;
  let mockWorkspace: { getMyProfile: jest.Mock; upsertProfile: jest.Mock; getWorkspaceSummaries: jest.Mock };
  let mockRouter: { events: any; navigate: jest.Mock };
  let mockWorkspaceContext: { activeWorkspaceId: jest.Mock; setActiveWorkspace: jest.Mock };

  const MOCK_WORKSPACES: WorkspaceSummary[] = [
    { id: 'ws-1', name: 'DIOUGA-DIOP Media', logo_url: null, member_count: 5, last_accessed_at: null },
  ];

  function createComponent(
    role: AppRole | null,
    profileOverride?: { full_name: string | null; phone: string | null; avatar_url: string | null },
    workspacesOverride?: WorkspaceSummary[],
  ): void {
    roleSubject = new BehaviorSubject<AppRole | null>(role);
    mockRouter = { events: EMPTY, navigate: jest.fn() };
    mockWorkspace = {
      getMyProfile: jest.fn().mockReturnValue(
        of(profileOverride ?? { full_name: 'Test User', phone: null, avatar_url: null }),
      ),
      upsertProfile: jest.fn().mockReturnValue(of(undefined)),
      getWorkspaceSummaries: jest.fn().mockReturnValue(of(workspacesOverride ?? MOCK_WORKSPACES)),
    };
    mockWorkspaceContext = {
      activeWorkspaceId: jest.fn().mockReturnValue('ws-1'),
      setActiveWorkspace: jest.fn(),
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [
        {
          provide: AuthService,
          useValue: {
            currentRole$: roleSubject.asObservable(),
            getCurrentUser: jest.fn().mockReturnValue(of({ id: 'mock-user-id', email: 'test@example.com' })),
            signOut: jest.fn().mockReturnValue(of(null)),
          },
        },
        {
          provide: Router,
          useValue: mockRouter,
        },
        {
          provide: WorkspaceService,
          useValue: mockWorkspace,
        },
        {
          provide: WorkspaceContextService,
          useValue: mockWorkspaceContext,
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });

    // Override template so RouterLink/RouterLinkActive don't need ActivatedRoute in unit tests
    TestBed.overrideComponent(ShellComponent, { set: { template: '' } });

    fixture = TestBed.createComponent(ShellComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  // ── owner ──────────────────────────────────────────────────────────────────

  it('affiche les 5 navItems pour le rôle owner', () => {
    createComponent('owner');
    expect(component.visibleNavItems().length).toBe(5);
  });

  it('affiche les 3 adminItems pour le rôle owner', () => {
    createComponent('owner');
    expect(component.visibleAdminItems().length).toBe(3);
  });

  // ── chef_equipe ────────────────────────────────────────────────────────────

  it("chef_equipe voit 'evenements'", () => {
    createComponent('chef_equipe');
    expect(component.visibleNavItems().map((i) => i.path)).toContain('/evenements');
  });

  it("chef_equipe voit 'campagnes'", () => {
    createComponent('chef_equipe');
    expect(component.visibleNavItems().map((i) => i.path)).toContain('/campagnes');
  });

  it("chef_equipe ne voit pas 'utilisateurs'", () => {
    createComponent('chef_equipe');
    expect(component.visibleNavItems().map((i) => i.path)).not.toContain('/utilisateurs');
  });

  it("chef_equipe voit 'metriques'", () => {
    createComponent('chef_equipe');
    expect(component.visibleAdminItems().map((i) => i.path)).toContain('/metriques');
  });

  it("chef_equipe ne voit pas 'workspace'", () => {
    createComponent('chef_equipe');
    expect(component.visibleAdminItems().map((i) => i.path)).not.toContain('/espaces');
  });

  // ── editeur ────────────────────────────────────────────────────────────────

  it("éditeur ne voit pas 'campagnes'", () => {
    createComponent('editeur');
    expect(component.visibleNavItems().map((i) => i.path)).not.toContain('/campagnes');
  });

  it("éditeur ne voit pas 'utilisateurs'", () => {
    createComponent('editeur');
    expect(component.visibleNavItems().map((i) => i.path)).not.toContain('/utilisateurs');
  });

  it("éditeur voit 'evenements'", () => {
    createComponent('editeur');
    expect(component.visibleNavItems().map((i) => i.path)).toContain('/evenements');
  });

  it("éditeur voit 'espace-de-travail' et 'parametres' dans les adminItems", () => {
    createComponent('editeur');
    expect(component.visibleAdminItems().map(i => i.path)).toEqual(['/espace-de-travail', '/parametres']);
  });

  // ── charge_communication ───────────────────────────────────────────────────

  it("charge_communication ne voit pas 'evenements'", () => {
    createComponent('charge_communication');
    expect(component.visibleNavItems().map((i) => i.path)).not.toContain('/evenements');
  });

  it("charge_communication ne voit pas 'utilisateurs'", () => {
    createComponent('charge_communication');
    expect(component.visibleNavItems().map((i) => i.path)).not.toContain('/utilisateurs');
  });

  it("charge_communication voit 'campagnes'", () => {
    createComponent('charge_communication');
    expect(component.visibleNavItems().map((i) => i.path)).toContain('/campagnes');
  });

  it("charge_communication ne voit pas 'workspace'", () => {
    createComponent('charge_communication');
    expect(component.visibleAdminItems().map((i) => i.path)).not.toContain('/espaces');
  });

  // ── réactivité ─────────────────────────────────────────────────────────────

  it("met à jour les navItems quand le rôle passe de 'editeur' à 'owner'", () => {
    createComponent('editeur');

    roleSubject.next('owner');

    expect(component.visibleNavItems().map((i) => i.path)).toContain('/campagnes');
  });

  it('retourne des navItems vides quand aucun rôle n\'est assigné', () => {
    createComponent(null);
    expect(component.visibleNavItems()).toEqual([]);
  });

  it('retourne des adminItems vides quand aucun rôle n\'est assigné', () => {
    createComponent(null);
    expect(component.visibleAdminItems()).toEqual([]);
  });

  // ── workspace name ────────────────────────────────────────────────────────

  it('workspaceName est défini à partir du premier workspace retourné', async () => {
    createComponent('owner');
    await component.ngOnInit();
    expect(component.workspaceName()).toBe('DIOUGA-DIOP Media');
  });

  it("workspaceName vaut 'Day After Day' quand aucun workspace n'est retourné", async () => {
    createComponent('owner', undefined, []);
    await component.ngOnInit();
    expect(component.workspaceName()).toBe('Day After Day');
  });

  it('navigateToProfile navigue vers /profil', () => {
    createComponent('owner');
    component.navigateToProfile();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/profil']);
  });

  // ── profile full_name → userName ──────────────────────────────────────────

  it('userName est défini à partir de profile.full_name quand disponible', async () => {
    createComponent('owner'); // default mock returns { full_name: 'Test User', ... }
    await component.ngOnInit();
    expect(component.userName).toBe('Test User');
  });

  // ── profile setup modal ────────────────────────────────────────────────────

  describe('profile setup modal', () => {
    it('showProfileSetup est false si le profil a un full_name', async () => {
      createComponent('editeur');
      await component.ngOnInit();

      expect(component.showProfileSetup()).toBe(false);
    });

    it('showProfileSetup est true quand full_name est null', async () => {
      createComponent('editeur', { full_name: null, phone: null, avatar_url: null });
      await component.ngOnInit();

      expect(component.showProfileSetup()).toBe(true);
    });

    it('saveProfile appelle upsertProfile avec le userId, fullName et phone', async () => {
      createComponent('editeur');
      await component.ngOnInit();
      component.profileFullName.set('Alice Martin');
      component.profilePhone.set('+242060000000');

      await component.saveProfile();

      expect(mockWorkspace.upsertProfile).toHaveBeenCalledWith('mock-user-id', 'Alice Martin', '+242060000000');
    });

    it('saveProfile ferme la modal après enregistrement', async () => {
      createComponent('editeur', { full_name: null, phone: null, avatar_url: null });
      await component.ngOnInit();
      component.profileFullName.set('Alice Martin');

      await component.saveProfile();

      expect(component.showProfileSetup()).toBe(false);
    });
  });

  // ── workspace context ─────────────────────────────────────────────────────

  it("setActiveWorkspace est appelé avec l'id du premier workspace au démarrage", async () => {
    createComponent('owner');
    await component.ngOnInit();
    expect(mockWorkspaceContext.setActiveWorkspace).toHaveBeenCalledWith('ws-1');
  });

  it("setActiveWorkspace n'est pas appelé quand aucun workspace n'est retourné", async () => {
    createComponent('owner', undefined, []);
    await component.ngOnInit();
    expect(mockWorkspaceContext.setActiveWorkspace).not.toHaveBeenCalled();
  });
});
