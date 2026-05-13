import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';
import { onboardingGuard } from './core/onboarding/onboarding.guard';

export const routes: Routes = [
  // ── Routes publiques ──────────────────────────────────────────────────────
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/landing/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'demarrer',
    loadComponent: () =>
      import('./features/onboarding/email-step.component').then((m) => m.EmailStepComponent),
  },
  {
    path: 'verifier',
    loadComponent: () =>
      import('./features/onboarding/otp-step.component').then((m) => m.OtpStepComponent),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },

  // ── Workspace (auth requise, pas d'onboardingGuard — c'est la destination) ─
  {
    path: 'espaces',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/onboarding/workspace-step.component').then(
        (m) => m.WorkspaceStepComponent,
      ),
  },

  // ── Shell protégé ─────────────────────────────────────────────────────────
  {
    path: '',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () =>
      import('./core/layout/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'calendrier',
        loadComponent: () =>
          import('./features/calendar/calendar.component').then((m) => m.CalendarComponent),
      },
      {
        path: 'calendrier/:calendarId/:date',
        canActivate: [roleGuard],
        data: { requiredRoles: ['owner', 'chef_equipe', 'editeur'] },
        loadComponent: () =>
          import('./features/calendar/day-detail/day-detail.component').then((m) => m.DayDetailComponent),
      },
      {
        path: 'evenements',
        canActivate: [roleGuard],
        data: { requiredRoles: ['owner', 'chef_equipe', 'editeur'] },
        loadComponent: () =>
          import('./features/events/events.component').then((m) => m.EventsComponent),
      },
      {
        path: 'campagnes',
        canActivate: [roleGuard],
        data: { requiredRoles: ['owner', 'chef_equipe', 'charge_communication'] },
        loadComponent: () =>
          import('./features/ad-campaigns/ad-campaigns.component').then(
            (m) => m.AdCampaignsComponent,
          ),
      },
      {
        path: 'utilisateurs',
        canActivate: [roleGuard],
        data: { requiredRoles: ['owner'] },
        loadComponent: () =>
          import('./features/users/users.component').then((m) => m.UsersComponent),
      },
      {
        path: 'metriques',
        loadComponent: () =>
          import('./features/metriques/metriques.component').then((m) => m.MetriquesComponent),
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./features/notifications/notifications.component').then((m) => m.NotificationsComponent),
      },
      {
        path: 'profil',
        loadComponent: () =>
          import('./features/profile/profile.component').then((m) => m.ProfileComponent),
      },
      {
        path: 'parametres',
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
      {
        path: 'espace-de-travail',
        loadComponent: () =>
          import('./features/workspace/workspace-info.component').then((m) => m.WorkspaceInfoComponent),
      },
    ],
  },

  { path: '**', redirectTo: '' },
];
