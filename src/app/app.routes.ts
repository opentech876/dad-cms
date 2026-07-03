import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';
import { systemAdminGuard } from './core/auth/system-admin.guard';
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
    path: 'verifier',
    loadComponent: () =>
      import('./features/onboarding/otp-step.component').then((m) => m.OtpStepComponent),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'mot-de-passe-oublie',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password.component').then(
        (m) => m.ForgotPasswordComponent,
      ),
  },
  {
    path: 'reinitialiser-mot-de-passe',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password.component').then(
        (m) => m.ResetPasswordComponent,
      ),
  },
  {
    path: 'email-confirme',
    loadComponent: () =>
      import('./features/auth/email-confirmed/email-confirmed.component').then(
        (m) => m.EmailConfirmedComponent,
      ),
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
        data: { requiredRoles: ['owner', 'chef_equipe', 'charge_communication', 'chef_equipe_commerciale'] },
        loadComponent: () =>
          import('./features/ad-campaigns/ad-campaigns.component').then(
            (m) => m.AdCampaignsComponent,
          ),
      },
      {
        path: 'compagnies',
        canActivate: [roleGuard],
        data: { requiredRoles: ['owner', 'chef_equipe_commerciale', 'charge_communication'] },
        loadComponent: () =>
          import('./features/companies/companies.component').then((m) => m.CompaniesComponent),
      },
      {
        path: 'utilisateurs',
        canActivate: [roleGuard],
        data: { requiredRoles: ['owner'] },
        loadComponent: () =>
          import('./features/users/users.component').then((m) => m.UsersComponent),
      },
      {
        path: 'recommandations',
        // Viewing is open to every authenticated role (product decision
        // 2026-07-03): all members can see what the Curateur proposes.
        // Writes stay curateur-only (RLS) and applying stays chef_equipe+
        // (SECURITY DEFINER gate on both apply RPCs) — the component only
        // renders the corresponding controls per role.
        loadComponent: () =>
          import('./features/presidence/recommandations.component').then((m) => m.RecommandationsComponent),
      },
      {
        path: 'metriques',
        loadComponent: () =>
          import('./features/metriques/metriques.component').then((m) => m.MetriquesComponent),
      },
      {
        path: 'recherche',
        loadComponent: () =>
          import('./features/search/search.component').then((m) => m.SearchComponent),
      },
      {
        path: 'admin',
        canActivate: [systemAdminGuard],
        loadComponent: () =>
          import('./features/admin/admin-dashboard.component').then((m) => m.AdminDashboardComponent),
      },
      {
        path: 'admin/espaces',
        canActivate: [systemAdminGuard],
        loadComponent: () =>
          import('./features/admin/admin.component').then((m) => m.AdminComponent),
      },
      {
        path: 'admin/utilisateurs',
        canActivate: [systemAdminGuard],
        loadComponent: () =>
          import('./features/admin/admin-users.component').then((m) => m.AdminUsersComponent),
      },
      {
        path: 'admin/logs',
        canActivate: [systemAdminGuard],
        loadComponent: () =>
          import('./features/admin/admin-logs.component').then((m) => m.AdminLogsComponent),
      },
      // /admin/* aliases for the shared user pages, so the sysadmin's Compte
      // sidebar links keep the URL under /admin and inPlatformMode stays
      // true. Same components as the workspace-mode routes below.
      {
        path: 'admin/notifications',
        canActivate: [systemAdminGuard],
        loadComponent: () =>
          import('./features/notifications/notifications.component').then((m) => m.NotificationsComponent),
      },
      {
        path: 'admin/profil',
        canActivate: [systemAdminGuard],
        loadComponent: () =>
          import('./features/profile/profile.component').then((m) => m.ProfileComponent),
      },
      {
        path: 'admin/parametres',
        canActivate: [systemAdminGuard],
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
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
