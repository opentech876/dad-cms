import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
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
  {
    path: 'espaces',
    loadComponent: () =>
      import('./features/onboarding/workspace-step.component').then(
        (m) => m.WorkspaceStepComponent,
      ),
  },
  {
    path: '',
    loadComponent: () =>
      import('./core/layout/shell/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
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
        path: 'evenements',
        loadComponent: () =>
          import('./features/events/events.component').then((m) => m.EventsComponent),
      },
      {
        path: 'campagnes',
        loadComponent: () =>
          import('./features/ad-campaigns/ad-campaigns.component').then(
            (m) => m.AdCampaignsComponent,
          ),
      },
      {
        path: 'utilisateurs',
        loadComponent: () =>
          import('./features/users/users.component').then((m) => m.UsersComponent),
      },
      {
        path: 'metriques',
        loadComponent: () =>
          import('./features/metriques/metriques.component').then((m) => m.MetriquesComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
