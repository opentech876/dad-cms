import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, firstValueFrom, Subject, debounceTime, distinctUntilChanged, switchMap, of } from 'rxjs';
import { AppRole, WorkspaceSummary } from '../../../models';
import { AuthService } from '../../auth/auth.service';
import { WorkspaceService } from '../../workspace/workspace.service';
import { WorkspaceContextService } from '../../workspace/workspace-context.service';
import { ToastService, ToastType } from '../../services/toast.service';
import { ThemeService } from '../../services/theme.service';
import { NotificationService } from '../../notifications/notification.service';
import { SupabaseService } from '../../supabase/supabase.service';
import { SearchService, SearchResult, SearchResults } from '../../search/search.service';
import { RefreshRouteReuseStrategy } from '../../router/refresh-route-reuse.strategy';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  badge?: number;
  roles: AppRole[]; // empty = visible to all authenticated roles
}

@Component({
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
  private supabase = inject(SupabaseService);
  private searchService = inject(SearchService);
  private routeReuse = inject(RefreshRouteReuseStrategy);
  private currentRole = toSignal(this.auth.currentRole$);

  readonly toastService = inject(ToastService);
  readonly notifUnread  = signal(0);

  toastIcon(type: ToastType): string {
    const map: Record<ToastType, string> = {
      success: '@tui.check-circle',
      error:   '@tui.circle-x',
      warning: '@tui.triangle-alert',
      info:    '@tui.info',
    };
    return map[type];
  }

  private userId = '';

  userEmail = '';
  userInitials = 'AA';
  userName = 'Utilisateur';

  readonly workspaces = signal<WorkspaceSummary[]>([]);
  /** Active workspace is the one stored in WorkspaceContextService (localStorage-backed). */
  readonly currentWorkspace = computed(() => {
    const id = this.workspaceContext.activeWorkspaceId();
    return this.workspaces().find(w => w.id === id) ?? this.workspaces()[0] ?? null;
  });
  readonly workspaceName = computed(() => this.currentWorkspace()?.name ?? 'Day After Day');
  readonly workspaceInitials = computed(() => {
    const name = this.currentWorkspace()?.name ?? 'Day After Day';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? 'D') + (parts[1]?.[0] ?? parts[0]?.[1] ?? 'A')).toUpperCase();
  });
  readonly workspaceMemberLabel = computed(() => {
    const count = this.currentWorkspace()?.member_count ?? 0;
    return count === 1 ? '1 membre' : `${count} membres`;
  });
  readonly workspaceMenuOpen = signal(false);
  readonly otherWorkspaces = computed(() =>
    this.workspaces().filter(w => w.id !== this.currentWorkspace()?.id),
  );

  toggleWorkspaceMenu(): void {
    this.workspaceMenuOpen.update(v => !v);
  }
  closeWorkspaceMenu(): void { this.workspaceMenuOpen.set(false); }

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
   */
  async switchWorkspace(id: string): Promise<void> {
    if (id === this.currentWorkspace()?.id) { this.closeWorkspaceMenu(); return; }
    this.workspaceContext.setActiveWorkspace(id);
    this.closeWorkspaceMenu();
    const target = this.router.url;
    this.routeReuse.triggerRefresh();
    await this.router.navigateByUrl(target);
  }

  collapsed = signal(false);
  pageTitle = signal('Tableau de bord');

  readonly showProfileSetup = signal(false);
  readonly profileFullName = signal('');
  readonly profilePhone = signal('');
  readonly profilePassword = signal('');
  readonly profileSaveLoading = signal(false);
  readonly profilePasswordError = signal('');
  readonly showProfilePassword = signal(false);
  toggleShowProfilePassword(): void { this.showProfilePassword.update(v => !v); }

  readonly hasPasswordNotSet = signal(false);
  readonly passwordBannerDismissed = signal(false);
  readonly showPasswordBanner = computed(() => this.hasPasswordNotSet() && !this.passwordBannerDismissed());
  dismissPasswordBanner(): void { this.passwordBannerDismissed.set(true); }

  // ── Topbar search ────────────────────────────────────────────────────────
  readonly searchTerm     = signal('');
  readonly searchOpen     = signal(false);
  readonly searchLoading  = signal(false);
  readonly searchResults  = signal<SearchResults>({ events: [], campaigns: [], companies: [], calendars: [] });
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

  closeSearchDropdown(): void { this.searchOpen.set(false); }

  submitSearch(): void {
    const term = this.searchTerm().trim();
    if (!term) return;
    this.closeSearchDropdown();
    this.router.navigate(['/recherche'], { queryParams: { q: term } });
  }

  goToResult(r: SearchResult): void {
    const routes: Record<SearchResult['type'], string> = {
      event:    '/evenements',
      campaign: '/campagnes',
      company:  '/compagnies',
      calendar: '/calendrier',
    };
    this.searchOpen.set(false);
    this.searchTerm.set('');
    this.router.navigate([routes[r.type]], { queryParams: { q: r.label } });
  }

  private readonly navItems: NavItem[] = [
    { id: 'dashboard',       label: 'Tableau de bord',      icon: '@tui.layout-dashboard', path: '/dashboard',       roles: [] },
    { id: 'calendrier',      label: 'Calendrier éditorial', icon: '@tui.calendar',          path: '/calendrier',      roles: [] },
    { id: 'recommandations', label: 'Recommandations',      icon: '@tui.list-checks',       path: '/recommandations', roles: ['owner', 'presidence'] },
    { id: 'evenements',      label: 'Événements',           icon: '@tui.book-open',         path: '/evenements',      roles: ['owner', 'chef_equipe', 'editeur'] },
    { id: 'campagnes',       label: 'Campagnes pub.',        icon: '@tui.megaphone',         path: '/campagnes',       roles: ['owner', 'chef_equipe', 'charge_communication', 'chef_equipe_commerciale'] },
    { id: 'compagnies',      label: 'Compagnies',            icon: '@tui.building',          path: '/compagnies',      roles: ['owner', 'chef_equipe_commerciale', 'charge_communication'] },
    { id: 'utilisateurs',    label: 'Utilisateurs',         icon: '@tui.users',             path: '/utilisateurs',    roles: ['owner'] },
    { id: 'notifications',   label: 'Notifications',        icon: '@tui.bell',              path: '/notifications',   roles: [] },
  ];

  private readonly adminItems: NavItem[] = [
    { id: 'metriques',   label: 'Métriques',         icon: '@tui.bar-chart-2', path: '/metriques',  roles: ['owner', 'chef_equipe', 'charge_communication'] },
    { id: 'workspace',   label: 'Espace de travail', icon: '@tui.building',    path: '/espace-de-travail', roles: [] },
    { id: 'parametres',  label: 'Paramètres',         icon: '@tui.settings',    path: '/parametres', roles: [] },
  ];

  readonly visibleNavItems   = computed(() => this.filterByRole(this.navItems));
  readonly visibleAdminItems = computed(() => this.filterByRole(this.adminItems));

  private filterByRole(items: NavItem[]): NavItem[] {
    const role = this.currentRole();
    if (!role) return [];
    return items.filter(item => item.roles.length === 0 || item.roles.includes(role));
  }

  private readonly routeTitles: Record<string, string> = {
    dashboard:           'Tableau de bord',
    calendrier:          'Calendrier éditorial',
    recommandations:     'Recommandations Présidence',
    evenements:          'Événements historiques',
    campagnes:           'Campagnes publicitaires',
    compagnies:          'Compagnies & Annonceurs',
    utilisateurs:        'Utilisateurs',
    metriques:           'Métriques',
    notifications:       'Notifications',
    profil:              'Mon profil',
    parametres:          'Paramètres',
    'espace-de-travail': 'Espace de travail',
  };

  async ngOnInit(): Promise<void> {
    // Wire the topbar-title subscription FIRST so we don't miss any NavigationEnd
    // that fires while the rest of ngOnInit awaits profile / workspace data.
    // Also seed from the current URL since the initial NavigationEnd may have
    // already fired by the time this component instantiates.
    this.applyTitleFromUrl(this.router.url);
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
    ).subscribe(e => this.applyTitleFromUrl(e.urlAfterRedirects));

    // Debounced topbar search — fires SearchService after 300ms of idle typing.
    this.searchInput$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(term => {
        if (!term.trim()) {
          this.searchLoading.set(false);
          return of({ events: [], campaigns: [], companies: [], calendars: [] } as SearchResults);
        }
        this.searchLoading.set(true);
        return this.searchService.search(term);
      }),
    ).subscribe(results => {
      this.searchResults.set(results);
      this.searchLoading.set(false);
    });

    const user = await firstValueFrom(this.auth.getCurrentUser().pipe(filter(Boolean)));
    this.userId = user.id ?? '';
    this.userEmail = user.email ?? '';
    const parts = this.userEmail.split('@')[0].split('.');
    this.userInitials = ((parts[0]?.[0] ?? 'A') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase();
    this.userName = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');

    try {
      const summaries = await firstValueFrom(this.workspaceService.getWorkspaceSummaries());
      this.workspaces.set(summaries);
      if (summaries.length > 0) {
        const stored = localStorage.getItem('dad-workspace-id');
        const active = summaries.find(w => w.id === stored) ?? summaries[0];
        this.workspaceContext.setActiveWorkspace(active.id);
      }
    } catch {
      // Workspace fetch failed — use fallback name
    }

    try {
      const profile = await firstValueFrom(this.workspaceService.getMyProfile(this.userId));
      if (profile !== null) {
        if (profile.full_name) {
          this.userName = profile.full_name;
          const parts = profile.full_name.trim().split(/\s+/);
          this.userInitials = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'AA';
        } else {
          this.profilePhone.set(profile.phone ?? '');
          this.showProfileSetup.set(true);
        }
      }
    } catch {
      // Profile check failed — skip setup modal
    }

    try {
      const count = await firstValueFrom(this.notifService.unreadCount());
      this.notifUnread.set(count);
    } catch {
      // Notifications non disponibles — pas bloquant
    }

    const pwdSet = await this.supabase.hasPasswordSet();
    this.hasPasswordNotSet.set(!pwdSet);
  }

  private applyTitleFromUrl(url: string | undefined | null): void {
    if (!url) return;
    const key = url.split('?')[0].split('/').filter(Boolean).at(-1) ?? 'dashboard';
    this.pageTitle.set(this.routeTitles[key] ?? 'Day After Day');
  }

  async saveProfile(): Promise<void> {
    if (!this.profileFullName().trim() || this.profileSaveLoading()) return;
    const pwd = this.profilePassword();
    // Password optional in the profile-setup modal — but if entered, must be ≥ 8.
    if (pwd && pwd.length < 8) {
      this.profilePasswordError.set('Le mot de passe doit comporter au moins 8 caractères.');
      return;
    }
    this.profilePasswordError.set('');
    this.profileSaveLoading.set(true);
    await firstValueFrom(
      this.workspaceService.upsertProfile(this.userId, this.profileFullName().trim(), this.profilePhone().trim()),
    );
    if (pwd) {
      const { error } = await this.supabase.updatePassword(pwd);
      if (error) {
        this.profilePasswordError.set('Mot de passe non enregistré : ' + error.message);
        this.profileSaveLoading.set(false);
        return;
      }
      this.supabase.markPasswordSet();
    }
    this.profileSaveLoading.set(false);
    this.showProfileSetup.set(false);
  }

  navigateToProfile(): void {
    this.router.navigate(['/profil']);
  }

  toggleCollapsed(): void {
    this.collapsed.update(v => !v);
  }

  logout(): void {
    this.auth.signOut().subscribe();
  }
}
