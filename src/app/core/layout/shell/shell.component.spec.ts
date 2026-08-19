import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { NavigationEnd, Router } from '@angular/router';
import { ShellComponent } from './shell.component';
import { AuthService } from '../../auth/auth.service';
import { WorkspaceService } from '../../workspace/workspace.service';
import { AppRole, WorkspaceSummary } from '../../../models';
import { WorkspaceContextService } from '../../workspace/workspace-context.service';
import { NotificationService } from '../../notifications/notification.service';
import { RecommendationService } from '../../presidency/recommendation.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { SearchService, SearchResults } from '../../search/search.service';
import { RefreshRouteReuseStrategy } from '../../router/refresh-route-reuse.strategy';
import { RouteReuseStrategy } from '@angular/router';

describe('ShellComponent — navigation par rôle', () => {
  let component: ShellComponent;
  let fixture: ComponentFixture<ShellComponent>;
  let roleSubject: BehaviorSubject<AppRole | null>;
  let mockWorkspace: {
    getMyProfile: jest.Mock;
    upsertProfile: jest.Mock;
    getWorkspaceSummaries: jest.Mock;
  };
  let mockRouter: { events: any; navigate: jest.Mock; navigateByUrl: jest.Mock; url: string };
  let routerEvents$: Subject<unknown>;
  let mockRouteReuse: { triggerRefresh: jest.Mock };
  let mockRecs: { countAllPending: jest.Mock; countMyPending: jest.Mock };
  let mockWorkspaceContext: {
    activeWorkspaceId: jest.Mock;
    setActiveWorkspace: jest.Mock;
    workspacesChanged$: Subject<void>;
    notifyWorkspacesChanged: jest.Mock;
    profileChanged$: Subject<void>;
    notifyProfileChanged: jest.Mock;
  };

  const MOCK_WORKSPACES: WorkspaceSummary[] = [
    {
      id: 'ws-1',
      name: 'DIOUGA-DIOP Media',
      logo_url: null,
      member_count: 5,
      last_accessed_at: null,
    },
  ];

  function createComponent(
    role: AppRole | null,
    profileOverride?: { full_name: string | null; phone: string | null; avatar_url: string | null },
    workspacesOverride?: WorkspaceSummary[],
    opts?: { isSysadmin?: boolean; userMetadata?: Record<string, unknown>; updateUserResult?: any },
  ): void {
    roleSubject = new BehaviorSubject<AppRole | null>(role);
    routerEvents$ = new Subject<unknown>();
    mockRouter = {
      events: routerEvents$.asObservable(),
      navigate: jest.fn(),
      navigateByUrl: jest.fn().mockResolvedValue(true),
      url: '/dashboard',
    };
    mockRouteReuse = { triggerRefresh: jest.fn() };
    mockRecs = {
      countAllPending: jest.fn().mockReturnValue(of(0)),
      countMyPending: jest.fn().mockReturnValue(of(0)),
    };
    mockWorkspace = {
      getMyProfile: jest
        .fn()
        .mockReturnValue(
          of(profileOverride ?? { full_name: 'Test User', phone: null, avatar_url: null }),
        ),
      upsertProfile: jest.fn().mockReturnValue(of({ success: true })),
      getWorkspaceSummaries: jest.fn().mockReturnValue(of(workspacesOverride ?? MOCK_WORKSPACES)),
    };
    const workspacesChanged$ = new Subject<void>();
    const profileChanged$ = new Subject<void>();
    mockWorkspaceContext = {
      activeWorkspaceId: jest.fn().mockReturnValue('ws-1'),
      setActiveWorkspace: jest.fn(),
      workspacesChanged$,
      notifyWorkspacesChanged: jest.fn(() => workspacesChanged$.next()),
      profileChanged$,
      notifyProfileChanged: jest.fn(() => profileChanged$.next()),
    };
    const updateUserSpy = jest
      .fn()
      .mockResolvedValue(opts?.updateUserResult ?? { data: { user: {} }, error: null });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ShellComponent],
      providers: [
        {
          provide: AuthService,
          useValue: {
            currentRole$: roleSubject.asObservable(),
            getCurrentUser: jest.fn().mockReturnValue(
              of({
                id: 'mock-user-id',
                email: 'test@example.com',
                user_metadata: opts?.userMetadata ?? {},
              }),
            ),
            signOut: jest.fn().mockReturnValue(of(null)),
            isSystemAdmin: jest.fn().mockReturnValue(of(opts?.isSysadmin ?? false)),
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
        {
          provide: NotificationService,
          // NotificationService now exposes a signal-based unreadCount plus
          // an async refreshUnread(). The shell reads the signal directly
          // and calls refresh on init.
          useValue: {
            unreadCount: signal(3),
            refreshUnread: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: SupabaseService,
          useValue: {
            updatePassword: jest.fn().mockResolvedValue({ data: { user: {} }, error: null }),
            markPasswordSet: jest.fn(),
            hasPasswordSet: jest.fn().mockResolvedValue(false),
            client: { auth: { updateUser: updateUserSpy } },
          },
        },
        {
          provide: SearchService,
          useValue: {
            search: jest
              .fn()
              .mockReturnValue(
                of({ events: [], campaigns: [], companies: [], calendars: [] } as SearchResults),
              ),
          },
        },
        {
          provide: RefreshRouteReuseStrategy,
          useValue: mockRouteReuse,
        },
        {
          provide: RecommendationService,
          useValue: mockRecs,
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

  it('affiche tous les nav items pour le rôle owner (recommandations + compagnies inclus)', () => {
    createComponent('owner');
    const paths = component.visibleNavItems().map((i) => i.path);
    expect(paths).toContain('/recommandations');
    expect(paths).toContain('/compagnies');
    // Owner sees every section; quick sanity check
    expect(paths).toContain('/metriques');
    expect(paths).toContain('/espace-de-travail');
    expect(paths).toContain('/parametres');
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
    expect(component.visibleNavItems().map((i) => i.path)).toContain('/metriques');
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

  it("éditeur voit 'espace-de-travail' et 'parametres' mais pas 'metriques'", () => {
    createComponent('editeur');
    const paths = component.visibleNavItems().map((i) => i.path);
    expect(paths).toContain('/espace-de-travail');
    expect(paths).toContain('/parametres');
    expect(paths).not.toContain('/metriques');
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

  it("charge_communication voit 'metriques' (rôle autorisé)", () => {
    createComponent('charge_communication');
    expect(component.visibleNavItems().map((i) => i.path)).toContain('/metriques');
  });

  // ── presidence — Espace Curation ───────────────────────────────────────────

  it('presidence voit la navigation Espace Curation, pas la navigation générale', () => {
    createComponent('presidence');
    const paths = component.visibleNavItems().map((i) => i.path);
    expect(paths).toContain('/curation');
    expect(paths).toContain('/curation/recommander');
    expect(paths).toContain('/curation/mes-recommandations');
    expect(paths).toContain('/curation/evenements');
    expect(paths).toContain('/notifications');
    expect(paths).not.toContain('/recommandations');
    expect(paths).not.toContain('/calendrier');
    expect(paths).not.toContain('/evenements');
    expect(paths).not.toContain('/campagnes');
    expect(paths).not.toContain('/utilisateurs');
  });

  it("isCurator est vrai pour presidence et faux pour owner (l'owner garde le CMS complet)", () => {
    createComponent('presidence');
    expect(component.isCurator()).toBe(true);

    createComponent('owner');
    expect(component.isCurator()).toBe(false);
    expect(component.visibleNavItems().map((i) => i.path)).not.toContain('/curation');
  });

  it("editeur voit 'recommandations' en lecture seule (elle doit pouvoir consulter avant d'appliquer)", () => {
    createComponent('editeur');
    expect(component.visibleNavItems().map((i) => i.path)).toContain('/recommandations');
  });

  it("chef_equipe voit 'recommandations' en lecture seule", () => {
    createComponent('chef_equipe');
    expect(component.visibleNavItems().map((i) => i.path)).toContain('/recommandations');
  });

  // ── chef_equipe_commerciale ───────────────────────────────────────────────

  it("chef_equipe_commerciale voit 'campagnes' et 'compagnies'", () => {
    createComponent('chef_equipe_commerciale');
    const paths = component.visibleNavItems().map((i) => i.path);
    expect(paths).toContain('/campagnes');
    expect(paths).toContain('/compagnies');
    expect(paths).not.toContain('/evenements');
    expect(paths).not.toContain('/utilisateurs');
    // Viewing recommendations is open to every role since 2026-07-03.
    expect(paths).toContain('/recommandations');
  });

  it("editeur ne voit pas 'compagnies'", () => {
    createComponent('editeur');
    expect(component.visibleNavItems().map((i) => i.path)).not.toContain('/compagnies');
  });

  // ── réactivité ─────────────────────────────────────────────────────────────

  it("met à jour les navItems quand le rôle passe de 'editeur' à 'owner'", () => {
    createComponent('editeur');

    roleSubject.next('owner');

    expect(component.visibleNavItems().map((i) => i.path)).toContain('/campagnes');
  });

  it("retourne des navItems vides quand aucun rôle n'est assigné", () => {
    createComponent(null);
    expect(component.visibleNavItems()).toEqual([]);
  });

  it("retourne des sections vides quand aucun rôle n'est assigné", () => {
    createComponent(null);
    expect(component.visibleNavSections()).toEqual([]);
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
    expect(component.userName()).toBe('Test User');
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
      const supabase = TestBed.inject(SupabaseService) as any;
      supabase.hasPasswordSet.mockResolvedValue(true); // bypass the first-time-invitee password requirement
      await component.ngOnInit();
      component.profileFullName.set('Alice Martin');
      component.profilePhone.set('+242060000000');

      await component.saveProfile();

      expect(mockWorkspace.upsertProfile).toHaveBeenCalledWith(
        'mock-user-id',
        'Alice Martin',
        '+242060000000',
      );
    });

    it('saveProfile ferme la modal après enregistrement', async () => {
      createComponent('editeur', { full_name: null, phone: null, avatar_url: null });
      const supabase = TestBed.inject(SupabaseService) as any;
      supabase.hasPasswordSet.mockResolvedValue(true); // bypass the first-time-invitee password requirement
      await component.ngOnInit();
      component.profileFullName.set('Alice Martin');

      await component.saveProfile();

      expect(component.showProfileSetup()).toBe(false);
    });

    // ── Password optional field ──────────────────────────────────────────

    it("saveProfile n'appelle PAS updatePassword si l'utilisateur a déjà un mot de passe et laisse le champ vide", async () => {
      createComponent('editeur', { full_name: null, phone: null, avatar_url: null });
      const supabase = TestBed.inject(SupabaseService) as any;
      supabase.hasPasswordSet.mockResolvedValue(true);
      await component.ngOnInit();
      component.profileFullName.set('Alice Martin');

      await component.saveProfile();

      expect(supabase.updatePassword).not.toHaveBeenCalled();
    });

    it("saveProfile refuse d'enregistrer sans mot de passe quand aucun n'est encore défini (cas invité première connexion)", async () => {
      // hasPasswordSet default = false in beforeEach
      createComponent('editeur', { full_name: null, phone: null, avatar_url: null });
      const supabase = TestBed.inject(SupabaseService) as any;
      await component.ngOnInit();
      component.profileFullName.set('Alice Martin');
      component.profilePassword.set('');

      await component.saveProfile();

      expect(supabase.updatePassword).not.toHaveBeenCalled();
      expect(component.profilePasswordError()).toContain('mot de passe');
      expect(component.showProfileSetup()).toBe(true);
    });

    it('saveProfile appelle updatePassword quand un mot de passe est saisi', async () => {
      createComponent('editeur', { full_name: null, phone: null, avatar_url: null });
      const supabase = TestBed.inject(SupabaseService) as any;
      await component.ngOnInit();
      component.profileFullName.set('Alice Martin');
      component.profilePassword.set('motdepasse123');

      await component.saveProfile();

      expect(supabase.updatePassword).toHaveBeenCalledWith('motdepasse123');
      expect(supabase.markPasswordSet).toHaveBeenCalled();
      expect(component.showProfileSetup()).toBe(false);
    });

    it('saveProfile rejette un mot de passe trop court', async () => {
      createComponent('editeur', { full_name: null, phone: null, avatar_url: null });
      const supabase = TestBed.inject(SupabaseService) as any;
      await component.ngOnInit();
      component.profileFullName.set('Alice Martin');
      component.profilePassword.set('court');

      await component.saveProfile();

      expect(supabase.updatePassword).not.toHaveBeenCalled();
      expect(component.profilePasswordError()).toContain('8 caractères');
      expect(component.showProfileSetup()).toBe(true);
    });

    it('saveProfile affiche profileSaveError quand upsertProfile échoue', async () => {
      createComponent('editeur', { full_name: null, phone: null, avatar_url: null });
      mockWorkspace.upsertProfile.mockReturnValue(of({ success: false, error: 'DB down' }));
      const supabase = TestBed.inject(SupabaseService) as any;
      supabase.hasPasswordSet.mockResolvedValue(true);
      await component.ngOnInit();
      component.profileFullName.set('Alice Martin');

      await component.saveProfile();

      expect(component.profileSaveError()).toContain('DB down');
      expect(component.showProfileSetup()).toBe(true);
    });

    it('renseigne activeWorkspaceName depuis le workspace actif', async () => {
      createComponent('editeur', { full_name: null, phone: null, avatar_url: null });
      await component.ngOnInit();

      // MOCK_WORKSPACES[0].name is "Mon Espace" by convention
      expect(component.activeWorkspaceName()).toBeTruthy();
    });
  });

  // ── sysadmin first-run setup modal ─────────────────────────────────────────

  describe('modal de configuration sysadmin (première connexion)', () => {
    it("affiche le modal sysadmin quand l'utilisateur est system_admin et que user_metadata.full_name est vide", async () => {
      createComponent(null, undefined, undefined, {
        isSysadmin: true,
        userMetadata: {},
      });
      await component.ngOnInit();
      expect(component.showSysadminSetup()).toBe(true);
      // Le modal workspace-scoped ne doit PAS apparaître pour un sysadmin sans workspace
      expect(component.showProfileSetup()).toBe(false);
    });

    it("n'affiche PAS le modal sysadmin si user_metadata.full_name est déjà renseigné", async () => {
      createComponent(null, undefined, undefined, {
        isSysadmin: true,
        userMetadata: { full_name: 'Elvis Destin OLEMBE' },
      });
      await component.ngOnInit();
      expect(component.showSysadminSetup()).toBe(false);
      // Le nom doit être hydraté depuis user_metadata
      expect(component.userName()).toBe('Elvis Destin OLEMBE');
    });

    it('saveSysadminSetup appelle auth.updateUser avec full_name et password', async () => {
      createComponent(null, undefined, undefined, { isSysadmin: true, userMetadata: {} });
      const supabase = TestBed.inject(SupabaseService) as any;
      await component.ngOnInit();
      component.sysadminName.set('Elvis Destin OLEMBE');
      component.sysadminPassword.set('motdepasse123');

      await component.saveSysadminSetup();

      expect(supabase.client.auth.updateUser).toHaveBeenCalledWith({
        data: { full_name: 'Elvis Destin OLEMBE' },
        password: 'motdepasse123',
      });
      expect(supabase.markPasswordSet).toHaveBeenCalled();
      expect(component.showSysadminSetup()).toBe(false);
      expect(component.userName()).toBe('Elvis Destin OLEMBE');
    });

    it('saveSysadminSetup refuse un mot de passe trop court et garde le modal ouvert', async () => {
      createComponent(null, undefined, undefined, { isSysadmin: true, userMetadata: {} });
      const supabase = TestBed.inject(SupabaseService) as any;
      await component.ngOnInit();
      component.sysadminName.set('Alice');
      component.sysadminPassword.set('court');

      await component.saveSysadminSetup();

      expect(supabase.client.auth.updateUser).not.toHaveBeenCalled();
      expect(component.sysadminPasswordError()).toContain('8 caractères');
      expect(component.showSysadminSetup()).toBe(true);
    });

    it('saveSysadminSetup expose une erreur si updateUser échoue', async () => {
      createComponent(null, undefined, undefined, {
        isSysadmin: true,
        userMetadata: {},
        updateUserResult: { data: null, error: { message: 'API down' } },
      });
      await component.ngOnInit();
      component.sysadminName.set('Alice');
      component.sysadminPassword.set('motdepasse123');

      await component.saveSysadminSetup();

      expect(component.sysadminSaveError()).toContain('API down');
      expect(component.showSysadminSetup()).toBe(true);
    });

    it('ne charge PAS le profil workspace-scoped pour un sysadmin (mais bien la liste des workspaces)', async () => {
      // The sysadmin can also be a member of one or more workspaces (invited
      // as manager, or impersonating). We load the summaries so the switcher
      // is populated; we skip getMyProfile because sysadmin identity lives
      // in auth.users.raw_user_meta_data, not in the workspace-scoped
      // profiles table.
      createComponent(null, undefined, undefined, {
        isSysadmin: true,
        userMetadata: { full_name: 'Existing' },
      });
      await component.ngOnInit();

      expect(mockWorkspace.getWorkspaceSummaries).toHaveBeenCalled();
      expect(mockWorkspace.getMyProfile).not.toHaveBeenCalled();
    });
  });

  // ── visibilité du mot de passe (modal setup) ──────────────────────────────

  describe('visibilité du mot de passe de configuration', () => {
    it('showProfilePassword démarre à false', () => {
      createComponent('editeur');
      expect(component.showProfilePassword()).toBe(false);
    });

    it('toggleShowProfilePassword bascule la visibilité', () => {
      createComponent('editeur');
      component.toggleShowProfilePassword();
      expect(component.showProfilePassword()).toBe(true);
      component.toggleShowProfilePassword();
      expect(component.showProfilePassword()).toBe(false);
    });
  });

  // ── bannière mot de passe non défini ──────────────────────────────────────

  describe('bannière mot de passe non défini', () => {
    it('showPasswordBanner est vrai quand hasPasswordSet retourne false', async () => {
      createComponent('editeur');
      await component.ngOnInit();
      expect(component.showPasswordBanner()).toBe(true);
    });

    it('showPasswordBanner est faux quand hasPasswordSet retourne true', async () => {
      createComponent('editeur');
      const supabase = TestBed.inject(SupabaseService) as any;
      supabase.hasPasswordSet.mockResolvedValue(true);
      await component.ngOnInit();
      expect(component.showPasswordBanner()).toBe(false);
    });

    it('dismissPasswordBanner masque la bannière', async () => {
      createComponent('editeur');
      await component.ngOnInit();
      component.dismissPasswordBanner();
      expect(component.showPasswordBanner()).toBe(false);
    });
  });

  // ── recherche dans la topbar ──────────────────────────────────────────────

  describe('recherche topbar', () => {
    it('searchTerm démarre vide', () => {
      createComponent('owner');
      expect(component.searchTerm()).toBe('');
    });

    it('searchOpen démarre à false', () => {
      createComponent('owner');
      expect(component.searchOpen()).toBe(false);
    });

    it('onSearchInput met à jour searchTerm', () => {
      createComponent('owner');
      component.onSearchInput('indep');
      expect(component.searchTerm()).toBe('indep');
    });

    it('closeSearchDropdown ferme la dropdown', () => {
      createComponent('owner');
      component.searchOpen.set(true);
      component.closeSearchDropdown();
      expect(component.searchOpen()).toBe(false);
    });

    it('submitSearch navigue vers /recherche avec le terme', () => {
      createComponent('owner');
      component.searchTerm.set('indep');
      component.submitSearch();
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/recherche'], {
        queryParams: { q: 'indep' },
      });
    });

    it('submitSearch ne navigue pas quand le terme est vide', () => {
      createComponent('owner');
      component.searchTerm.set('   ');
      component.submitSearch();
      expect(mockRouter.navigate).not.toHaveBeenCalledWith(['/recherche'], expect.anything());
    });

    it('goToResult navigue vers la page correspondant au type', () => {
      createComponent('owner');
      component.goToResult({ type: 'event', id: 'e1', label: 'Test' });
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/evenements'], {
        queryParams: { q: 'Test' },
      });

      component.goToResult({ type: 'campaign', id: 'c1', label: 'Test' });
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/campagnes'], {
        queryParams: { q: 'Test' },
      });

      component.goToResult({ type: 'company', id: 'co1', label: 'Test' });
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/compagnies'], {
        queryParams: { q: 'Test' },
      });

      component.goToResult({ type: 'calendar', id: 'ca1', label: 'Test' });
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/calendrier'], {
        queryParams: { q: 'Test' },
      });
    });

    it('goToResult ferme la dropdown et efface le terme', () => {
      createComponent('owner');
      component.searchTerm.set('test');
      component.searchOpen.set(true);
      component.goToResult({ type: 'event', id: 'e1', label: 'Test' });
      expect(component.searchOpen()).toBe(false);
      expect(component.searchTerm()).toBe('');
    });
  });

  // ── sidebar resize + mobile drawer ────────────────────────────────────────

  describe('sidebar resize + mobile drawer', () => {
    it('sidebarWidth a une valeur par défaut dans la plage 200-360', () => {
      createComponent('owner');
      const w = component.sidebarWidth();
      expect(w).toBeGreaterThanOrEqual(200);
      expect(w).toBeLessThanOrEqual(360);
    });

    it('openMobileSidebar passe mobileOpen à true et closeMobileSidebar le ferme', () => {
      createComponent('owner');
      component.openMobileSidebar();
      expect(component.mobileOpen()).toBe(true);
      component.closeMobileSidebar();
      expect(component.mobileOpen()).toBe(false);
    });

    it('onWindowResize met à jour isMobile selon innerWidth', () => {
      createComponent('owner');
      (window as any).innerWidth = 500;
      component.onWindowResize();
      expect(component.isMobile()).toBe(true);
      (window as any).innerWidth = 1280;
      component.onWindowResize();
      expect(component.isMobile()).toBe(false);
    });

    it('onWindowResize ferme la drawer mobile en repassant en desktop', () => {
      createComponent('owner');
      component.mobileOpen.set(true);
      (window as any).innerWidth = 1280;
      component.onWindowResize();
      expect(component.mobileOpen()).toBe(false);
    });
  });

  // ── switchWorkspace (in-place refresh) ────────────────────────────────────

  describe('switchWorkspace', () => {
    it("ne fait rien quand l'id correspond au workspace courant", async () => {
      createComponent('owner');
      // Let ngOnInit's async work (which calls setActiveWorkspace('ws-1') for seeding) settle.
      await component.ngOnInit();
      mockWorkspaceContext.setActiveWorkspace.mockClear();
      mockRouter.navigateByUrl.mockClear();
      await component.switchWorkspace('ws-1'); // current
      expect(mockWorkspaceContext.setActiveWorkspace).not.toHaveBeenCalled();
      expect(mockRouter.navigateByUrl).not.toHaveBeenCalled();
    });

    it('met à jour le workspace actif et déclenche un refresh', async () => {
      createComponent('owner');
      await component.switchWorkspace('ws-2');
      expect(mockWorkspaceContext.setActiveWorkspace).toHaveBeenCalledWith('ws-2');
      expect(mockRouteReuse.triggerRefresh).toHaveBeenCalled();
    });

    it("re-navigue vers l'URL courante pour forcer le re-init des composants", async () => {
      createComponent('owner');
      mockRouter.url = '/calendrier';
      await component.switchWorkspace('ws-2');
      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/calendrier');
    });

    it('ferme le menu workspace après le switch', async () => {
      createComponent('owner');
      component.workspaceMenuOpen.set(true);
      await component.switchWorkspace('ws-2');
      expect(component.workspaceMenuOpen()).toBe(false);
    });
  });

  // ── platform admin mode (sysadmin in switcher) ────────────────────────────

  describe('mode Administration plateforme', () => {
    it('inPlatformMode est faux par défaut (URL = /dashboard, pas sysadmin)', async () => {
      createComponent('editeur');
      await component.ngOnInit();
      expect(component.inPlatformMode()).toBe(false);
    });

    it('inPlatformMode est vrai quand sysadmin et URL commence par /admin', async () => {
      createComponent(null, undefined, undefined, {
        isSysadmin: true,
        userMetadata: { full_name: 'A' },
      });
      await component.ngOnInit();
      component.currentUrl.set('/admin/utilisateurs');
      expect(component.inPlatformMode()).toBe(true);
    });

    it('inPlatformMode est faux pour un sysadmin hors /admin', async () => {
      createComponent(null, undefined, undefined, {
        isSysadmin: true,
        userMetadata: { full_name: 'A' },
      });
      await component.ngOnInit();
      component.currentUrl.set('/dashboard');
      expect(component.inPlatformMode()).toBe(false);
    });

    it("workspaceName affiche 'Administration plateforme' en mode plateforme", async () => {
      createComponent(null, undefined, undefined, {
        isSysadmin: true,
        userMetadata: { full_name: 'A' },
      });
      await component.ngOnInit();
      component.currentUrl.set('/admin');
      expect(component.workspaceName()).toBe('Administration plateforme');
      expect(component.workspaceInitials()).toBe('AP');
    });

    it('enterPlatformMode navigue vers /admin', async () => {
      createComponent(null, undefined, undefined, {
        isSysadmin: true,
        userMetadata: { full_name: 'A' },
      });
      await component.ngOnInit();
      mockRouter.navigateByUrl.mockClear();
      await component.enterPlatformMode();
      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/admin');
    });

    it('enterPlatformMode ne re-navigue pas si déjà sur /admin', async () => {
      createComponent(null, undefined, undefined, {
        isSysadmin: true,
        userMetadata: { full_name: 'A' },
      });
      await component.ngOnInit();
      mockRouter.url = '/admin/utilisateurs';
      mockRouter.navigateByUrl.mockClear();
      await component.enterPlatformMode();
      expect(mockRouter.navigateByUrl).not.toHaveBeenCalled();
    });

    it('switchWorkspace depuis le mode plateforme route vers /dashboard', async () => {
      createComponent(null, undefined, undefined, {
        isSysadmin: true,
        userMetadata: { full_name: 'A' },
      });
      await component.ngOnInit();
      component.currentUrl.set('/admin');
      mockRouter.navigateByUrl.mockClear();
      await component.switchWorkspace('ws-1');
      expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/dashboard');
    });

    // inPlatformMode is now purely URL-driven — systemAdminGuard blocks
    // non-sysadmins from ever reaching /admin, so we trust the URL and
    // avoid an isSystemAdmin race on first paint.
    it("inPlatformMode ne dépend que de l'URL (le guard filtre les rôles)", async () => {
      createComponent('owner');
      await component.ngOnInit();
      component.currentUrl.set('/admin');
      expect(component.inPlatformMode()).toBe(true);
      component.currentUrl.set('/dashboard');
      expect(component.inPlatformMode()).toBe(false);
    });

    it('en mode plateforme, la sidebar montre UNIQUEMENT Plateforme + Compte (pas les sections workspace)', async () => {
      createComponent(null, undefined, undefined, {
        isSysadmin: true,
        userMetadata: { full_name: 'A' },
      });
      await component.ngOnInit();
      component.currentUrl.set('/admin');
      const sectionIds = component.visibleNavSections().map((s) => s.id);
      expect(sectionIds).toEqual(['plateforme', 'compte']);
      // Aucun item workspace-scoped (dashboard, calendrier, evenements, etc.)
      const paths = component.visibleNavItems().map((i) => i.path);
      expect(paths).not.toContain('/dashboard');
      expect(paths).not.toContain('/calendrier');
      expect(paths).not.toContain('/evenements');
      // Les items Compte pointent sur les alias /admin/* pour rester
      // en mode plateforme (sinon inPlatformMode retombe à false et le
      // thème repasse en mode workspace).
      expect(paths).toContain('/admin/profil');
      expect(paths).toContain('/admin/parametres');
      expect(paths).toContain('/admin/notifications');
    });

    it('en mode workspace, la sidebar montre les sections workspace (pas la section Plateforme)', async () => {
      createComponent(null, undefined, undefined, {
        isSysadmin: true,
        userMetadata: { full_name: 'A' },
      });
      await component.ngOnInit();
      component.currentUrl.set('/dashboard');
      const sectionIds = component.visibleNavSections().map((s) => s.id);
      expect(sectionIds).not.toContain('plateforme');
      expect(sectionIds).not.toContain('compte');
    });
  });

  // ── workspace switcher: live-reload + color coding ─────────────────────────

  describe('switcher live-reload et couleurs', () => {
    it('workspaceColorFor renvoie une couleur HSL déterministe par id', () => {
      createComponent('owner');
      const c1 = component.workspaceColorFor('ws-abc');
      const c2 = component.workspaceColorFor('ws-abc');
      const c3 = component.workspaceColorFor('ws-xyz');
      expect(c1).toMatch(/^hsl\(\d+, 62%, 52%\)$/);
      expect(c1).toBe(c2);
      expect(c1).not.toBe(c3);
    });

    it('recharge les workspaces quand notifyWorkspacesChanged est déclenché', async () => {
      createComponent('owner');
      await component.ngOnInit();
      // Fresh mock so we count only post-init calls
      mockWorkspace.getWorkspaceSummaries.mockClear();
      mockWorkspaceContext.notifyWorkspacesChanged();
      // The subscribe callback calls the async _reloadWorkspaceSummaries;
      // let its firstValueFrom + set() settle before we assert.
      await Promise.resolve();
      await Promise.resolve();
      // NB: ngOnInit runs twice in this test bed (once via fixture.detectChanges,
      // once via the explicit await), so there are two subscribers — hence 2
      // reloads per emit. In production there's only one.
      expect(mockWorkspace.getWorkspaceSummaries).toHaveBeenCalled();
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

  // ── badge recommandations en attente ──────────────────────────────────────

  describe('badge recommandations en attente', () => {
    it('charge le compteur de recommandations pending au démarrage', async () => {
      createComponent('owner');
      mockRecs.countAllPending.mockReturnValue(of(4));

      await component.ngOnInit();

      expect(component.pendingRecs()).toBe(4);
    });

    it('rafraîchit le compteur à chaque navigation — le badge disparaît une fois traité', async () => {
      createComponent('owner');
      mockRecs.countAllPending.mockReturnValue(of(4));
      await component.ngOnInit();
      expect(component.pendingRecs()).toBe(4);

      // Applying the recommendations elsewhere brings the count to zero;
      // the next navigation must clear the badge.
      mockRecs.countAllPending.mockReturnValue(of(0));
      routerEvents$.next(new NavigationEnd(1, '/recommandations', '/recommandations'));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(component.pendingRecs()).toBe(0);
    });

    it("reste à zéro (badge masqué) en cas d'échec du comptage", async () => {
      createComponent('owner');
      mockRecs.countAllPending.mockImplementation(() => {
        throw new Error('down');
      });

      await component.ngOnInit();

      expect(component.pendingRecs()).toBe(0);
    });

    it('la Curatrice compte SES pending (countMyPending), pas tout l\'espace', async () => {
      createComponent('presidence');
      mockRecs.countMyPending.mockReturnValue(of(2));
      mockRecs.countAllPending.mockReturnValue(of(9));

      await component.ngOnInit();

      expect(mockRecs.countMyPending).toHaveBeenCalled();
      expect(mockRecs.countAllPending).not.toHaveBeenCalled();
      expect(component.pendingRecs()).toBe(2);
    });

    it('les rôles éditoriaux comptent tout l\'espace (countAllPending)', async () => {
      createComponent('chef_equipe');
      mockRecs.countAllPending.mockReturnValue(of(9));

      await component.ngOnInit();

      expect(mockRecs.countAllPending).toHaveBeenCalled();
      expect(mockRecs.countMyPending).not.toHaveBeenCalled();
      expect(component.pendingRecs()).toBe(9);
    });
  });

  describe('helpers UI (icônes, menu, initiales, toggles)', () => {
    beforeEach(() => createComponent('owner'));

    it('toastIcon mappe chaque type de toast', () => {
      expect(component.toastIcon('success')).toBe('@tui.check-circle');
      expect(component.toastIcon('error')).toBe('@tui.circle-x');
      expect(component.toastIcon('warning')).toBe('@tui.triangle-alert');
      expect(component.toastIcon('info')).toBe('@tui.info');
    });

    it('toggleWorkspaceMenu bascule et closeWorkspaceMenu ferme', () => {
      expect(component.workspaceMenuOpen()).toBe(false);
      component.toggleWorkspaceMenu();
      expect(component.workspaceMenuOpen()).toBe(true);
      component.closeWorkspaceMenu();
      expect(component.workspaceMenuOpen()).toBe(false);
    });

    it('workspaceInitialsFor gère vide, un mot et deux mots', () => {
      expect(component.workspaceInitialsFor('')).toBe('DA');
      expect(component.workspaceInitialsFor('Congo')).toBe('CO');
      expect(component.workspaceInitialsFor('Day After')).toBe('DA');
    });

    it('workspaceMemberLabelFor accorde le pluriel', () => {
      expect(component.workspaceMemberLabelFor(1)).toBe('1 membre');
      expect(component.workspaceMemberLabelFor(3)).toBe('3 membres');
    });

    it('toggleShowSysadminPassword et toggleCollapsed basculent leur signal', () => {
      expect(component.showSysadminPassword()).toBe(false);
      component.toggleShowSysadminPassword();
      expect(component.showSysadminPassword()).toBe(true);
      const collapsed = component.collapsed();
      component.toggleCollapsed();
      expect(component.collapsed()).toBe(!collapsed);
    });

    it('logout appelle auth.signOut', () => {
      const auth = TestBed.inject(AuthService) as any;
      component.logout();
      expect(auth.signOut).toHaveBeenCalled();
    });
  });

  describe('redimensionnement de la barre latérale', () => {
    beforeEach(() => createComponent('owner'));

    it('startResize ne fait rien en mode mobile', () => {
      component.isMobile.set(true);
      const before = component.sidebarWidth();
      component.startResize({ clientX: 100, preventDefault: jest.fn() } as any);
      expect(component.sidebarWidth()).toBe(before);
    });

    it('startResize suit le pointeur et persiste la largeur au relâchement', () => {
      component.isMobile.set(false);
      component.startResize({ clientX: 300, preventDefault: jest.fn() } as any);
      window.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 900 }));
      expect(component.sidebarWidth()).toBe(360); // clampé au maximum
      window.dispatchEvent(new Event('pointerup'));
      expect(localStorage.getItem('dad-sidebar-width')).toBe('360');
    });

    it('un glissement sous le seuil bascule en mode replié', () => {
      component.isMobile.set(false);
      component.collapsed.set(false);
      component.startResize({ clientX: 500, preventDefault: jest.fn() } as any);
      window.dispatchEvent(Object.assign(new Event('pointermove'), { clientX: 50 }));
      expect(component.collapsed()).toBe(true);
      window.dispatchEvent(new Event('pointerup'));
    });
  });
});
