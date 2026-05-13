import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, firstValueFrom } from 'rxjs';
import { AppRole, WorkspaceSummary } from '../../../models';
import { AuthService } from '../../auth/auth.service';
import { WorkspaceService } from '../../workspace/workspace.service';
import { WorkspaceContextService } from '../../workspace/workspace-context.service';
import { ToastService, ToastType } from '../../services/toast.service';
import { ThemeService } from '../../services/theme.service';
import { NotificationService } from '../../notifications/notification.service';

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
  readonly currentWorkspace = computed(() => this.workspaces()[0] ?? null);
  readonly workspaceName = computed(() => this.currentWorkspace()?.name ?? 'Day After Day');

  collapsed = signal(false);
  pageTitle = signal('Tableau de bord');

  readonly showProfileSetup = signal(false);
  readonly profileFullName = signal('');
  readonly profilePhone = signal('');
  readonly profileSaveLoading = signal(false);

  private readonly navItems: NavItem[] = [
    { id: 'dashboard',      label: 'Tableau de bord',      icon: '@tui.layout-dashboard', path: '/dashboard',      roles: [] },
    { id: 'calendrier',     label: 'Calendrier éditorial', icon: '@tui.calendar',          path: '/calendrier',     roles: [] },
    { id: 'evenements',     label: 'Événements',           icon: '@tui.book-open',         path: '/evenements',     roles: ['owner', 'chef_equipe', 'editeur'] },
    { id: 'campagnes',      label: 'Campagnes pub.',        icon: '@tui.megaphone',         path: '/campagnes',      roles: ['owner', 'chef_equipe', 'charge_communication'] },
    { id: 'utilisateurs',   label: 'Utilisateurs',         icon: '@tui.users',             path: '/utilisateurs',   roles: ['owner'] },
    { id: 'notifications',  label: 'Notifications',        icon: '@tui.bell',              path: '/notifications',  roles: [] },
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
    evenements:          'Événements historiques',
    campagnes:           'Campagnes publicitaires',
    utilisateurs:        'Utilisateurs',
    metriques:           'Métriques',
    notifications:       'Notifications',
    profil:              'Mon profil',
    parametres:          'Paramètres',
    'espace-de-travail': 'Espace de travail',
  };

  async ngOnInit(): Promise<void> {
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

    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
    ).subscribe(e => {
      const key = e.urlAfterRedirects.split('/').filter(Boolean).at(-1) ?? 'dashboard';
      this.pageTitle.set(this.routeTitles[key] ?? 'Day After Day');
    });

    try {
      const count = await firstValueFrom(this.notifService.unreadCount());
      this.notifUnread.set(count);
    } catch {
      // Notifications non disponibles — pas bloquant
    }
  }

  async saveProfile(): Promise<void> {
    if (!this.profileFullName().trim() || this.profileSaveLoading()) return;
    this.profileSaveLoading.set(true);
    await firstValueFrom(
      this.workspaceService.upsertProfile(this.userId, this.profileFullName().trim(), this.profilePhone().trim()),
    );
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
