import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, UrlTree } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { AppRole } from '../../models';
import { AuthService } from './auth.service';

export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const requiredRoles: AppRole[] = route.data['requiredRoles'] ?? [];

  return authService.currentRole$.pipe(
    take(1),
    map((role) => {
      if (!role) {
        return router.createUrlTree(['/login']);
      }

      // Pas de restriction sur cette route
      if (requiredRoles.length === 0) return true;

      // L'owner passe partout
      if (role === 'owner') return true;

      // Vérification des rôles demandés
      return requiredRoles.includes(role) ? true : router.createUrlTree(['/dashboard']);
    }),
  );
};
