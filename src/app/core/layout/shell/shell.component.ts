import { ChangeDetectionStrategy, Component, computed, HostListener, inject, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  filter,
  firstValueFrom,
  Subject,
  debounceTime,
  distinctUntilChanged,
  switchMap,
  of,
} from 'rxjs';
import { AppRole, WorkspaceSummary } from '../../../models';
import { AuthService } from '../../auth/auth.service';
import { WorkspaceService } from '../../workspace/workspace.service';
import { WorkspaceContextService } from '../../workspace/workspace-context.service';
import { ToastService, ToastType } from '../../services/toast.service';
import { ThemeService } from '../../services/theme.service';
import { NotificationService } from '../../notifications/notification.service';
import { RecommendationService } from '../../presidency/recommendation.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { SearchService, SearchResult, SearchResults } from '../../search/search.service';
import { RefreshRouteReuseStrategy } from '../../router/refresh-route-reuse.strategy';
import { ROLE_LABELS, getInitials } from '../../utils/labels.utils';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  badge?: number;
  roles: AppRole[]; // empty = visible to all authenticated roles
}

interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TuiIcon],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private workspaceService = inject(WorkspaceService);
  private workspaceContext = inject(WorkspaceContextService);
  private themeService = inject(ThemeService);
  private notifService = inject(NotificationService);
  private recommendationService = inject(RecommendationService);
  private supabase = inject(SupabaseService);
  private searchService = inject(SearchService);
  private routeReuse = inject(RefreshRouteReuseStrategy);
  private currentRole = toSignal(this.auth.currentRole$);
  /** True when the signed-in user is a platform-level system_admin. */
  readonly isSystemAdmin = toSignal(this.auth.isSystemAdmin(), { initialValue: false });

  readonly toastService = inject(ToastService);
  // Reactive signal owned by NotificationService. When the user marks
  // notifications as read (individually or all-at-once) the service
  // updates this signal and the bell badge disappears automatically.
  readonly notifUnread = this.notifService.unreadCount;

  // Recommendation notification: count of pending Curateur recommendations,
  // shown as a badge on the "Recommandations" nav item. Refreshed on every
  // navigation so it disappears as soon as they are applied in the app.
  readonly pendingRecs = signal(0);

  /** Human-readable French label for the current role, shown as a chip
   *  under the user email in the sidebar footer. Empty string when the
   *  role isn't loaded yet — the template hides the chip in that case. */
  readonly currentRoleLabel = computed(() => {
    const role = this.currentRole();
    if (!role) return '';
    return ROLE_LABELS[role] ?? role;
  });

  toastIcon(type: ToastType): string {
    const map: Record<ToastType, string> = {
      success: '@tui.check-circle',
      error: '@tui.circle-x',
      warning: '@tui.triangle-alert',
      info: '@tui.info',
    };
    return map[type];
  }

  private userId = '';

  // Sidebar user card + avatar signals — reactive so a save on /profil
  // (which pings workspaceContext.profileChanged$) makes the sidebar
  // re-render without a page refresh. Templates read these as function
  // calls: {{ userName() }} etc.
  readonly userEmail = signal('');
  readonly userInitials = signal('AA');
  readonly userName = signal('Utilisateur');
  readonly userAvatarUrl = signal<string | null>(null);

  readonly workspaces = signal<WorkspaceSummary[]>([]);
  /** Active workspace is the one stored in WorkspaceContextService (localStorage-backed). */
  readonly currentWorkspace = computed(() => {
    const id = this.workspaceContext.activeWorkspaceId();
    return this.workspaces().find((w) => w.id === id) ?? this.workspaces()[0] ?? null;
  });
  /**
   * Deterministic color for the active workspace, derived from its UUID hash
   * → HSL hue. Same workspace always gets the same color so users build
   * muscle memory: "blue stripe = Tenant A, orange = Tenant B". Used by the
   * topbar accent stripe to make "wrong workspace" mistakes harder.
   */
  readonly currentWorkspaceColor = computed<string | null>(() => {
    const ws = this.currentWorkspace();
    if (!ws) return null;
    return this.workspaceColorFor(ws.id);
  });

  /**
   * Deterministic hue per workspace id. Same id → same color forever, so
   * the switcher dropdown items keep their color across sessions and the
   * user can build "blue = Tenant A, orange = Tenant B" muscle memory.
   */
  workspaceColorFor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 62%, 52%)`;
  }
  /**
   * Current URL, kept reactive via the NavigationEnd subscription in
   * ngOnInit. Drives the "platform mode" detection — when the URL is under
   * /admin, the sidebar + switcher pivot to platform-admin appearance.
   */
  readonly currentUrl = signal(this.router.url);

  /**
   * True when the URL is under /admin. Deliberately does NOT re-check
   * `isSystemAdmin()` — `systemAdminGuard` has already blocked any
   * non-sysadmin from reaching that URL. Removing the isSystemAdmin
   * dependency also eliminates a first-frame race: on a hard load of
   * /admin the async user_roles query returns `false` initially, and
   * gating on it made the sidebar flash the workspace layout before
   * settling on the platform layout.
   */
  readonly inPlatformMode = computed(() => this.currentUrl().startsWith('/admin'));

  readonly workspaceName = computed(() =>
    this.inPlatformMode()
      ? 'Administration plateforme'
      : (this.currentWorkspace()?.name ?? 'Day After Day'),
  );
  readonly workspaceInitials = computed(() => {
    if (this.inPlatformMode()) return 'AP';
    const name = this.currentWorkspace()?.name ?? 'Day After Day';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? 'D') + (parts[1]?.[0] ?? parts[0]?.[1] ?? 'A')).toUpperCase();
  });
  readonly workspaceMemberLabel = computed(() => {
    if (this.inPlatformMode()) return 'Cross-workspace';
    const count = this.currentWorkspace()?.member_count ?? 0;
    return count === 1 ? '1 membre' : `${count} membres`;
  });
  readonly workspaceMenuOpen = signal(false);
  readonly otherWorkspaces = computed(() => {
    // In platform mode the "active" entry is the synthetic platform one, so
    // every real workspace counts as an "other" entry the user can switch to.
    if (this.inPlatformMode()) return this.workspaces();
    return this.workspaces().filter((w) => w.id !== this.currentWorkspace()?.id);
  });

  toggleWorkspaceMenu(): void {
    this.workspaceMenuOpen.update((v) => !v);
  }
  closeWorkspaceMenu(): void {
    this.workspaceMenuOpen.set(false);
  }

  /** Returns 2-letter uppercase initials for a workspace name. */
  workspaceInitialsFor(name: string): string {
    const trimmed = (name ?? '').trim();
    if (!trimmed) return 'DA';
    const parts = trimmed.split(/\s+/);
    const first = parts[0]?.[0] ?? trimmed[0] ?? 'D';
    const second = parts[1]?.[0] ?? trimmed[1] ?? 'A';
    return (first + second).toUpperCase();
  }

  workspaceMemberLabelFor(count: number): string {
    return count === 1 ? '1 membre' : `${count} membres`;
  }

  /**
   * Switch active workspace. Persists in localStorage and re-navigates to the
   * current URL with a one-shot RouteReuseStrategy override + onSameUrlNavigation,
   * forcing every workspace-scoped component to re-init and re-fetch under the
   * new tenant. Cheaper than `window.location.reload()` — no JS bundle re-parse.
   *
   * If we were in /admin (platform mode), we jump out to /dashboard so the user
   * lands inside the chosen workspace, not in an admin section that has nothing
   * to do with it.
   */
  async switchWorkspace(id: string): Promise<void> {
    if (id === this.currentWorkspace()?.id && !this.inPlatformMode()) {
      this.closeWorkspaceMenu();
      return;
    }
    this.workspaceContext.setActiveWorkspace(id);
    this.closeWorkspaceMenu();
    const target = this.inPlatformMode() ? '/dashboard' : this.router.url;
    this.routeReuse.triggerRefresh();
    await this.router.navigateByUrl(target);
  }

  /**
   * Fetch the caller's workspace memberships and repopulate the switcher.
   * Idempotent: safe to call at any time (initial load, workspacesChanged$
   * emission, post-create in /admin/espaces, etc.). Preserves whatever
   * workspace was active if it still exists in the list.
   */
  private async _reloadWorkspaceSummaries(): Promise<void> {
    try {
      const summaries = await firstValueFrom(this.workspaceService.getWorkspaceSummaries());
      this.workspaces.set(summaries);
      if (summaries.length > 0) {
        const stored = localStorage.getItem('dad-workspace-id');
        const active = summaries.find((w) => w.id === stored) ?? summaries[0];
        this.workspaceContext.setActiveWorkspace(active.id);
        this.activeWorkspaceName.set(active.name);
      }
    } catch {
      // Non-blocking — leave whatever we had cached.
    }
  }

  /**
   * Populate the sidebar identity block (email, name, initials, avatar).
   * Split out of ngOnInit so it can be re-run after /profil saves a new
   * name via workspaceContext.profileChanged$ — keeps the sidebar in sync
   * without a page refresh. Handles all three sources of truth:
   *   1. email prefix (fallback if nothing else is set),
   *   2. auth.users.raw_user_meta_data.full_name (sysadmin path),
   *   3. profiles.full_name + avatar_url (workspace-scoped path).
   * Later branches shadow earlier ones.
   */
  private async _refreshDisplayInfo(user: any, isSysadmin: boolean): Promise<void> {
    // 1. Baseline from email. Explicit string annotation because `user` is
    // `any` (Supabase auth types leak through) — without it, `email` +
    // `parts` inherit `any` and `.map(p => ...)` fails noImplicitAny.
    const email: string = user?.email ?? '';
    this.userEmail.set(email);
    const parts: string[] = email.split('@')[0].split('.');
    this.userInitials.set(
      ((parts[0]?.[0] ?? 'A') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase(),
    );
    this.userName.set(parts.map((p: string) => p.charAt(0).toUpperCase() + p.slice(1)).join(' '));
    this.userAvatarUrl.set(null);

    // 2. Sysadmin path — name lives in auth metadata, avatar via storage.
    if (isSysadmin) {
      const metaFullName = (user?.user_metadata?.full_name as string | undefined) ?? '';
      if (metaFullName.trim()) {
        this.userName.set(metaFullName.trim());
        this.userInitials.set(getInitials(metaFullName.trim(), 'AA'));
      } else {
        this.showSysadminSetup.set(true);
      }
      return;
    }

    // 3. Workspace-scoped profile path.
    try {
      const profile = await firstValueFrom(this.workspaceService.getMyProfile(this.userId));
      if (profile) {
        if (profile.full_name) {
          this.userName.set(profile.full_name);
          this.userInitials.set(getInitials(profile.full_name.trim(), 'AA'));
        } else {
          this.profilePhone.set(profile.phone ?? '');
          this.showProfileSetup.set(true);
        }
        if (profile.avatar_url) this.userAvatarUrl.set(profile.avatar_url);
      }
    } catch {
      // Profile check failed — leave email-derived defaults in place.
    }
  }

  /**
   * Sysadmin-only entry in the switcher: jumps into platform admin mode by
   * routing to /admin. The "active" workspace state isn't cleared — the user
   * just visits a different URL. inPlatformMode() = true while on /admin/*.
   */
  async enterPlatformMode(): Promise<void> {
    this.closeWorkspaceMenu();
    if (this.router.url.startsWith('/admin')) return;
    await this.router.navigateByUrl('/admin');
  }

  collapsed = signal(false);
  pageTitle = signal('Tableau de bord');

  // ── Sidebar resize + mobile drawer ──────────────────────────────────────
  /** Sidebar width in px when not collapsed. Persisted to localStorage. Bounded [200, 360]. */
  readonly sidebarWidth = signal(this._loadSidebarWidth());
  /** True under the mobile breakpoint (768px). Updated on resize. */
  readonly isMobile = signal(typeof window !== 'undefined' && window.innerWidth < 768);
  /** Off-canvas sidebar visibility on mobile. */
  readonly mobileOpen = signal(false);

  private _loadSidebarWidth(): number {
    if (typeof localStorage === 'undefined') return 260;
    const stored = parseInt(localStorage.getItem('dad-sidebar-width') ?? '', 10);
    return Number.isFinite(stored) && stored >= 200 && stored <= 360 ? stored : 260;
  }

  openMobileSidebar(): void {
    this.mobileOpen.set(true);
  }
  closeMobileSidebar(): void {
    this.mobileOpen.set(false);
  }

  /** Handle drag from the right-edge resize handle. */
  startResize(ev: PointerEvent): void {
    if (this.isMobile()) return;
    ev.preventDefault();
    const startX = ev.clientX;
    const startW = this.sidebarWidth();
    const onMove = (e: PointerEvent) => {
      const next = Math.min(360, Math.max(200, startW + (e.clientX - startX)));
      this.sidebarWidth.set(next);
      // If the user drags past the lower threshold, snap into the collapsed state.
      if (next <= 200 && !this.collapsed()) this.collapsed.set(true);
      if (next > 220 && this.collapsed()) this.collapsed.set(false);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try {
        localStorage.setItem('dad-sidebar-width', String(this.sidebarWidth()));
      } catch {}
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    const m = window.innerWidth < 768;
    this.isMobile.set(m);
    if (!m) this.mobileOpen.set(false);
  }

  readonly showProfileSetup = signal(false);
  readonly profileFullName = signal('');
  readonly profilePhone = signal('');
  readonly profilePassword = signal('');
  readonly profileSaveLoading = signal(false);
  readonly profilePasswordError = signal('');
  readonly profileSaveError = signal('');
  readonly showProfilePassword = signal(false);
  toggleShowProfilePassword(): void {
    this.showProfilePassword.update((v) => !v);
  }

  // ── Sysadmin first-run setup modal ───────────────────────────────────────
  // Separate from the workspace-scoped profile-setup modal because the
  // seeded system_admin has no workspace and the upsertProfile path would
  // fail with "Aucun espace de travail actif". This modal writes the name
  // straight to auth.users.raw_user_meta_data.full_name (a true platform
  // identity field, not workspace-scoped).
  readonly showSysadminSetup = signal(false);
  readonly sysadminName = signal('');
  readonly sysadminPassword = signal('');
  readonly sysadminSaveLoading = signal(false);
  readonly sysadminPasswordError = signal('');
  readonly sysadminSaveError = signal('');
  readonly showSysadminPassword = signal(false);
  toggleShowSysadminPassword(): void {
    this.showSysadminPassword.update((v) => !v);
  }

  /** Name of the active workspace — shown in the invitation welcome modal. */
  readonly activeWorkspaceName = signal('');

  readonly hasPasswordNotSet = signal(false);
  readonly passwordBannerDismissed = signal(false);
  readonly showPasswordBanner = computed(
    () => this.hasPasswordNotSet() && !this.passwordBannerDismissed(),
  );
  dismissPasswordBanner(): void {
    this.passwordBannerDismissed.set(true);
  }

  // ── Topbar search ────────────────────────────────────────────────────────
  readonly searchTerm = signal('');
  readonly searchOpen = signal(false);
  readonly searchLoading = signal(false);
  readonly searchResults = signal<SearchResults>({
    events: [],
    campaigns: [],
    companies: [],
    calendars: [],
  });
  readonly searchTotalCount = computed(() => {
    const r = this.searchResults();
    return r.events.length + r.campaigns.length + r.companies.length + r.calendars.length;
  });
  readonly searchHasAny = computed(() => this.searchTotalCount() > 0);
  private readonly searchInput$ = new Subject<string>();

  onSearchInput(value: string): void {
    this.searchTerm.set(value);
    this.searchOpen.set(true);
    this.searchInput$.next(value);
  }

  closeSearchDropdown(): void {
    this.searchOpen.set(false);
  }

  submitSearch(): void {
    const term = this.searchTerm().trim();
    if (!term) return;
    this.closeSearchDropdown();
    this.router.navigate(['/recherche'], { queryParams: { q: term } });
  }

  goToResult(r: SearchResult): void {
    const routes: Record<SearchResult['type'], string> = {
      event: '/evenements',
      campaign: '/campagnes',
      company: '/compagnies',
      calendar: '/calendrier',
    };
    this.searchOpen.set(false);
    this.searchTerm.set('');
    this.router.navigate([routes[r.type]], { queryParams: { q: r.label } });
  }

  private readonly navSections: NavSection[] = [
    {
      id: 'pilotage',
      label: 'Pilotage',
      items: [
        {
          id: 'dashboard',
          label: 'Tableau de bord',
          icon: '@tui.layout-dashboard',
          path: '/dashboard',
          roles: [],
        },
        {
          id: 'metriques',
          label: 'Métriques',
          icon: '@tui.bar-chart-2',
          path: '/metriques',
          roles: ['owner', 'chef_equipe', 'charge_communication'],
        },
      ],
    },
    {
      id: 'editorial',
      label: 'Éditorial',
      items: [
        {
          id: 'calendrier',
          label: 'Calendrier éditorial',
          icon: '@tui.calendar',
          path: '/calendrier',
          roles: [],
        },
        {
          id: 'recommandations',
          label: 'Recommandations',
          icon: '@tui.list-checks',
          path: '/recommandations',
          roles: [],
        },
        {
          id: 'evenements',
          label: "Bibliothèque d'événements",
          icon: '@tui.book-open',
          path: '/evenements',
          roles: ['owner', 'chef_equipe', 'editeur'],
        },
      ],
    },
    {
      id: 'regie',
      label: 'Régie publicitaire',
      items: [
        {
          id: 'campagnes',
          label: 'Encarts publicitaires',
          icon: '@tui.megaphone',
          path: '/campagnes',
          roles: ['owner', 'chef_equipe', 'charge_communication', 'chef_equipe_commerciale'],
        },
        {
          id: 'compagnies',
          label: 'Annonceurs',
          icon: '@tui.building',
          path: '/compagnies',
          roles: ['owner', 'chef_equipe_commerciale', 'charge_communication'],
        },
      ],
    },
    {
      id: 'equipe',
      label: 'Équipe & alertes',
      items: [
        {
          id: 'utilisateurs',
          label: 'Utilisateurs',
          icon: '@tui.users',
          path: '/utilisateurs',
          roles: ['owner'],
        },
        {
          id: 'notifications',
          label: 'Notifications',
          icon: '@tui.bell',
          path: '/notifications',
          roles: [],
        },
      ],
    },
    {
      id: 'administration',
      label: 'Administration',
      items: [
        {
          id: 'workspace',
          label: 'Espace de travail',
          icon: '@tui.building',
          path: '/espace-de-travail',
          roles: [],
        },
        {
          id: 'parametres',
          label: 'Customisation',
          icon: '@tui.settings',
          path: '/parametres',
          roles: [],
        },
      ],
    },
  ];

  /** Espace Curation — the presidence (Curateur) role gets its own
   *  navigation universe instead of the generic role-filtered sections.
   *  Same shell, different map: propose, follow, author. */
  private readonly curatorSections: NavSection[] = [
    {
      id: 'pilotage',
      label: 'Pilotage',
      items: [
        {
          id: 'curation-dashboard',
          label: 'Tableau de bord',
          icon: '@tui.layout-dashboard',
          path: '/curation',
          roles: [],
        },
      ],
    },
    {
      id: 'curation',
      label: 'Curation',
      items: [
        {
          id: 'recommander',
          label: 'Recommander',
          icon: '@tui.sparkles',
          path: '/curation/recommander',
          roles: [],
        },
        {
          id: 'mes-recommandations',
          label: 'Mes recommandations',
          icon: '@tui.flag',
          path: '/curation/mes-recommandations',
          roles: [],
        },
        {
          id: 'mes-evenements',
          label: 'Mes événements',
          icon: '@tui.book-open',
          path: '/curation/evenements',
          roles: [],
        },
      ],
    },
    {
      id: 'alertes',
      label: 'Alertes',
      items: [
        {
          id: 'notifications',
          label: 'Notifications',
          icon: '@tui.bell',
          path: '/notifications',
          roles: [],
        },
      ],
    },
    {
      id: 'compte-curation',
      label: 'Compte',
      items: [
        { id: 'profil', label: 'Mon profil', icon: '@tui.user', path: '/profil', roles: [] },
        {
          id: 'parametres',
          label: 'Customisation',
          icon: '@tui.settings',
          path: '/parametres',
          roles: [],
        },
      ],
    },
  ];

  /** True when the signed-in user is the Curateur (pure presidence role).
   *  Owner inherits presidence rights but keeps the full CMS navigation. */
  readonly isCurator = computed(
    () => this.currentRole() === 'presidence' && !this.inPlatformMode(),
  );

  /** Platform-level admin section — only rendered while the sysadmin is
   *  in platform mode (URL under /admin). Labels are explicit about being
   *  "plateforme" so if a mode transition renders both sections briefly,
   *  the two "Tableau de bord" links are still distinguishable. */
  private readonly platformSection: NavSection = {
    id: 'plateforme',
    label: 'Plateforme',
    items: [
      {
        id: 'admin-dashboard',
        label: 'Tableau de bord plateforme',
        icon: '@tui.layout-dashboard',
        path: '/admin',
        roles: [],
      },
      {
        id: 'admin-espaces',
        label: 'Espaces de travail',
        icon: '@tui.building',
        path: '/admin/espaces',
        roles: [],
      },
      {
        id: 'admin-utilisateurs',
        label: 'Tous les utilisateurs',
        icon: '@tui.users',
        path: '/admin/utilisateurs',
        roles: [],
      },
      {
        id: 'admin-logs',
        label: "Journal d'activité",
        icon: '@tui.scroll-text',
        path: '/admin/logs',
        roles: [],
      },
    ],
  };

  /** "Compte" utility section — Profil / Paramètres / Notifications.
   *  Rendered ONLY in platform mode. The paths point at /admin/* aliases
   *  (defined in app.routes.ts) so clicking them keeps the URL under
   *  /admin and inPlatformMode stays true — otherwise the shell would
   *  drop back into workspace mode and the palette would revert. */
  private readonly accountSection: NavSection = {
    id: 'compte',
    label: 'Compte',
    items: [
      {
        id: 'admin-notifications',
        label: 'Notifications',
        icon: '@tui.bell',
        path: '/admin/notifications',
        roles: [],
      },
      {
        id: 'admin-profil',
        label: 'Mon profil',
        icon: '@tui.user',
        path: '/admin/profil',
        roles: [],
      },
      {
        id: 'admin-parametres',
        label: 'Customisation',
        icon: '@tui.settings',
        path: '/admin/parametres',
        roles: [],
      },
    ],
  };

  /**
   * Mode-aware sidebar:
   *   • platform mode → platformSection + accountSection only. Workspace
   *     items don't belong here — clicking one would just teleport the
   *     user out of admin.
   *   • workspace mode → the existing role-filtered workspace sections.
   *     platformSection intentionally hidden even for a sysadmin; they
   *     re-enter platform mode via the workspace switcher's "Administration
   *     plateforme" entry.
   */
  readonly visibleNavSections = computed<NavSection[]>(() => {
    if (this.inPlatformMode()) {
      return [this.platformSection, this.accountSection];
    }
    const role = this.currentRole();
    if (role === 'presidence') return this.curatorSections;
    if (!role && !this.isSystemAdmin()) return [];
    return this.navSections
      .map((s) => ({
        ...s,
        items: s.items.filter(
          (i: NavItem) => i.roles.length === 0 || (role ? i.roles.includes(role) : false),
        ),
      }))
      .filter((s) => s.items.length > 0);
  });

  /** Flat list of all role-visible nav items, in section order. Useful for cross-checks. */
  readonly visibleNavItems = computed<NavItem[]>(() =>
    this.visibleNavSections().flatMap((s) => s.items),
  );

  private readonly routeTitles: Record<string, string> = {
    dashboard: 'Tableau de bord',
    calendrier: 'Calendrier éditorial',
    recommandations: 'Recommandations du Curateur',
    evenements: "Bibliothèque d'événements historiques",
    campagnes: 'Encarts publicitaires',
    compagnies: 'Annonceurs',
    utilisateurs: 'Utilisateurs',
    metriques: 'Métriques',
    notifications: 'Notifications',
    profil: 'Mon profil',
    parametres: 'Customisation',
    'espace-de-travail': 'Espace de travail',
    curation: 'Espace Curation · Tableau de bord',
    'curation/recommander': 'Recommander un événement',
    'curation/mes-recommandations': 'Mes recommandations',
    'curation/evenements': 'Mes événements',
    admin: 'Administration plateforme · Tableau de bord',
    'admin/espaces': 'Administration plateforme · Espaces',
    'admin/utilisateurs': 'Administration plateforme · Utilisateurs',
    'admin/logs': "Administration plateforme · Journal d'activité",
    'admin/notifications': 'Administration plateforme · Notifications',
    'admin/profil': 'Administration plateforme · Mon profil',
    'admin/parametres': 'Administration plateforme · Customisation',
  };

  async ngOnInit(): Promise<void> {
    // Wire the topbar-title subscription FIRST so we don't miss any NavigationEnd
    // that fires while the rest of ngOnInit awaits profile / workspace data.
    // Also seed BOTH the title and currentUrl from router.url — the initial
    // NavigationEnd may have already fired before this component instantiated,
    // and the property-initializer read of router.url (line above signal())
    // can happen before Angular's initial navigation resolves, leaving
    // currentUrl at '/'. That would keep inPlatformMode false on hard reloads
    // of /admin, causing the switcher to render the previous workspace's
    // color/name instead of the platform "AP" icon.
    this.applyTitleFromUrl(this.router.url);
    this.currentUrl.set(this.router.url);
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => {
        this.applyTitleFromUrl(e.urlAfterRedirects);
        this.currentUrl.set(e.urlAfterRedirects);
        // Keep the recommendations badge honest: re-count on every navigation
        // so applying recommendations clears it without a page reload.
        void this.refreshPendingRecs();
      });

    // Debounced topbar search — fires SearchService after 300ms of idle typing.
    this.searchInput$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((term) => {
          if (!term.trim()) {
            this.searchLoading.set(false);
            return of({ events: [], campaigns: [], companies: [], calendars: [] } as SearchResults);
          }
          this.searchLoading.set(true);
          return this.searchService.search(term);
        }),
      )
      .subscribe((results) => {
        this.searchResults.set(results);
        this.searchLoading.set(false);
      });

    const user = await firstValueFrom(this.auth.getCurrentUser().pipe(filter(Boolean)));
    this.userId = user.id ?? '';
    const isSysadmin = await firstValueFrom(this.auth.isSystemAdmin());
    await this._refreshDisplayInfo(user, isSysadmin);

    // Load workspace summaries for BOTH branches. A sysadmin can also be a
    // member of one or more workspaces (either invited as manager, or
    // impersonating into a workspace to help operate it) — they need the
    // switcher to be populated. For a sysadmin with zero memberships the
    // fetch just returns [] and nothing changes.
    await this._reloadWorkspaceSummaries();

    // When /profil saves a new name / avatar / phone, it fires
    // workspaceContext.profileChanged$. Re-run the loader so the
    // sidebar identity block reflects the change immediately.
    this.workspaceContext.profileChanged$.subscribe(() => {
      void (async () => {
        const u = await firstValueFrom(this.auth.getCurrentUser());
        if (!u) return;
        const isAdmin = await firstValueFrom(this.auth.isSystemAdmin());
        await this._refreshDisplayInfo(u, isAdmin);
      })();
    });

    // Live-reload the switcher whenever a workspace is created / renamed /
    // soft-deleted from anywhere in the app (currently /admin/espaces).
    this.workspaceContext.workspacesChanged$.subscribe(() => {
      void this._reloadWorkspaceSummaries();
    });

    // Prime the notification-unread signal from the server. The service
    // swallows failures internally so this is fire-and-forget.
    void this.notifService.refreshUnread();
    await this.refreshPendingRecs();

    const pwdSet = await this.supabase.hasPasswordSet();
    this.hasPasswordNotSet.set(!pwdSet);
  }

  /**
   * Save handler for the sysadmin first-run setup modal. Writes the chosen
   * name to auth.users.raw_user_meta_data.full_name (true platform identity,
   * not workspace-scoped) and sets the initial password in one
   * `auth.updateUser` call. Password is required — sysadmin needs a
   * non-OTP login path because the free-plan OTP quota is 2/h.
   */
  async saveSysadminSetup(): Promise<void> {
    if (!this.sysadminName().trim() || this.sysadminSaveLoading()) return;
    const pwd = this.sysadminPassword();
    if (!pwd || pwd.length < 8) {
      this.sysadminPasswordError.set('Le mot de passe doit comporter au moins 8 caractères.');
      return;
    }
    this.sysadminPasswordError.set('');
    this.sysadminSaveError.set('');
    this.sysadminSaveLoading.set(true);

    const fullName = this.sysadminName().trim();
    const { error } = await this.supabase.client.auth.updateUser({
      data: { full_name: fullName },
      password: pwd,
    });

    if (error) {
      this.sysadminSaveError.set("Échec de l'enregistrement : " + error.message);
      this.sysadminSaveLoading.set(false);
      return;
    }

    this.supabase.markPasswordSet();
    this.hasPasswordNotSet.set(false);
    this.userName.set(fullName);
    const np = fullName.split(/\s+/);
    this.userInitials.set(((np[0]?.[0] ?? '') + (np[1]?.[0] ?? '')).toUpperCase() || 'AA');
    this.sysadminSaveLoading.set(false);
    this.showSysadminSetup.set(false);
  }

  /** Re-count pending Curateur recommendations; keeps the last known value
   *  on failure so a transient error doesn't flicker the badge. */
  private async refreshPendingRecs(): Promise<void> {
    try {
      // The Curateur's "Mes recommandations" badge counts only HER pending
      // proposals; editorial roles' "Recommandations" badge counts the whole
      // workspace (they apply everyone's). One signal, role-appropriate source.
      const count$ =
        this.currentRole() === 'presidence'
          ? this.recommendationService.countMyPending()
          : this.recommendationService.countAllPending();
      this.pendingRecs.set(await firstValueFrom(count$));
    } catch {
      // Keep previous count.
    }
  }

  private applyTitleFromUrl(url: string | undefined | null): void {
    if (!url) return;
    const segments = url.split('?')[0].split('/').filter(Boolean);
    // Try the full path first (e.g. "admin/utilisateurs"), then fall back to
    // the last segment alone. That way nested routes can have dedicated
    // titles without colliding with same-named top-level routes.
    const fullKey = segments.join('/');
    const tailKey = segments.at(-1) ?? 'dashboard';
    // Deep curation URLs (e.g. a recommendation detail) fall back to the
    // area title rather than the app name.
    const areaFallback = segments[0] === 'curation' ? 'Espace Curation' : 'Day After Day';
    const title = this.routeTitles[fullKey] ?? this.routeTitles[tailKey] ?? areaFallback;
    this.pageTitle.set(title);
  }

  async saveProfile(): Promise<void> {
    if (!this.profileFullName().trim() || this.profileSaveLoading()) return;
    const pwd = this.profilePassword();
    // Required when the user has no password yet — first-time invitees only
    // get one reliable shot at this since the free-plan OTP fallback is
    // rate-limited to 2 emails/hr. Optional for existing users who already
    // have a password but somehow re-hit the setup modal.
    if (this.hasPasswordNotSet() && !pwd) {
      this.profilePasswordError.set(
        'Veuillez définir un mot de passe pour finaliser votre inscription.',
      );
      return;
    }
    if (pwd && pwd.length < 8) {
      this.profilePasswordError.set('Le mot de passe doit comporter au moins 8 caractères.');
      return;
    }
    this.profilePasswordError.set('');
    this.profileSaveError.set('');
    this.profileSaveLoading.set(true);
    const profileRes = await firstValueFrom(
      this.workspaceService.upsertProfile(
        this.userId,
        this.profileFullName().trim(),
        this.profilePhone().trim(),
      ),
    );
    if (!profileRes.success) {
      this.profileSaveError.set(
        "Erreur lors de l'enregistrement : " + (profileRes.error ?? 'inconnue'),
      );
      this.profileSaveLoading.set(false);
      return;
    }
    if (pwd) {
      const { error } = await this.supabase.updatePassword(pwd);
      if (error) {
        this.profilePasswordError.set('Mot de passe non enregistré : ' + error.message);
        this.profileSaveLoading.set(false);
        return;
      }
      this.supabase.markPasswordSet();
      this.hasPasswordNotSet.set(false);
    }
    this.profileSaveLoading.set(false);
    this.showProfileSetup.set(false);
  }

  navigateToProfile(): void {
    this.router.navigate(['/profil']);
  }

  toggleCollapsed(): void {
    this.collapsed.update((v) => !v);
  }

  logout(): void {
    this.auth.signOut().subscribe();
  }
}
