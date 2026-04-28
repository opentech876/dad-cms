import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { filter, firstValueFrom } from 'rxjs';
import { AuthService } from '../../auth/auth.service';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  path: string;
  badge?: number;
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

  userEmail = '';
  userInitials = 'AA';
  userName = 'Utilisateur';

  collapsed = signal(false);
  pageTitle = signal('Tableau de bord');

  readonly navItems: NavItem[] = [
    { id: 'dashboard',    label: 'Tableau de bord',      icon: '@tui.layout-dashboard', path: '/dashboard' },
    { id: 'calendrier',   label: 'Calendrier éditorial', icon: '@tui.calendar',          path: '/calendrier' },
    { id: 'evenements',   label: 'Événements',           icon: '@tui.book-open',         path: '/evenements' },
    { id: 'campagnes',    label: 'Campagnes pub.',        icon: '@tui.megaphone',         path: '/campagnes' },
    { id: 'utilisateurs', label: 'Utilisateurs',         icon: '@tui.users',             path: '/utilisateurs' },
  ];

  readonly adminItems: NavItem[] = [
    { id: 'metriques', label: 'Métriques',         icon: '@tui.bar-chart-2', path: '/metriques' },
    { id: 'workspace', label: 'Espace de travail', icon: '@tui.building',    path: '/espaces' },
  ];

  private readonly routeTitles: Record<string, string> = {
    dashboard:    'Tableau de bord',
    calendrier:   'Calendrier éditorial',
    evenements:   'Événements historiques',
    campagnes:    'Campagnes publicitaires',
    utilisateurs: 'Utilisateurs',
    metriques:    'Métriques',
  };

  async ngOnInit(): Promise<void> {
    const user = await firstValueFrom(this.auth.getCurrentUser().pipe(filter(Boolean)));
    this.userEmail = user.email ?? '';
    const parts = this.userEmail.split('@')[0].split('.');
    this.userInitials = ((parts[0]?.[0] ?? 'A') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase();
    this.userName = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');

    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
    ).subscribe(e => {
      const key = e.urlAfterRedirects.split('/').filter(Boolean).at(-1) ?? 'dashboard';
      this.pageTitle.set(this.routeTitles[key] ?? 'Day After Day');
    });
  }

  toggleCollapsed(): void {
    this.collapsed.update(v => !v);
  }

  logout(): void {
    this.auth.signOut().subscribe();
  }
}
