import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { AuthService } from './auth.service';

/**
 * The Curateur has exactly one dashboard: /curation. Every entry point that
 * lands on the generic /dashboard (login redirect, deep links, the '' route)
 * reroutes a pure `presidence` user there before the page loads — no flash,
 * no wasted KPI queries. Every other role (owner included) passes through.
 */
export const curatorHomeGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.currentRole$.pipe(
    take(1),
    map((role) => (role === 'presidence' ? router.createUrlTree(['/curation']) : true)),
  );
};
