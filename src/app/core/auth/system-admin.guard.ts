import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Restricts a route to system_admin users only. Reads the global user_roles
 * row — system_admin is platform-level, not workspace-scoped, so we don't
 * need an active workspace to evaluate this.
 */
export const systemAdminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const isAdmin = await firstValueFrom(auth.isSystemAdmin());
  if (isAdmin) return true;
  return router.createUrlTree(['/dashboard']);
};
