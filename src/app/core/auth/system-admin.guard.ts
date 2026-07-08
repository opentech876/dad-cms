import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Restricts a route to `system_admin` users. Reads the global user_roles row
 * — system_admin is platform-level (not workspace-scoped), so no active
 * workspace is needed to evaluate.
 *
 * NOTE: this guard used to also enforce AAL2 (require TOTP challenge before
 * /admin). The MFA feature was disabled — the AAL2 branch and the
 * `/verifier-2fa` / `/profil?mfa_required=1` redirects were removed. The
 * MFA plumbing on SupabaseService is intentionally kept in place so the
 * feature can be re-enabled later by re-adding the branch here.
 */
export const systemAdminGuard: CanActivateFn = async () => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  const isAdmin = await firstValueFrom(auth.isSystemAdmin());
  if (isAdmin) return true;
  return router.createUrlTree(['/dashboard']);
};
