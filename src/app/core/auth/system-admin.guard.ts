import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * Restricts a route to system_admin users **with an AAL2 session**. Two
 * gates, in order:
 *
 *   1. Global user_roles row must be `system_admin` (platform-level role,
 *      not workspace-scoped — no active workspace needed to evaluate).
 *   2. The current Supabase session must be at AAL2 (i.e., the user has a
 *      verified TOTP factor AND has passed the challenge this session).
 *      A system_admin without enrolled TOTP gets sent to `/profil` to
 *      enroll. A system_admin at AAL1 with TOTP enrolled gets sent to
 *      `/verifier-2fa` to complete the challenge — with `?returnTo=`
 *      preserved so they bounce back to the admin route they wanted.
 *
 * Fail-closed semantics: if the AAL lookup errors out for any reason, we
 * deny access (redirect to /dashboard) rather than letting a possibly
 * un-elevated session through.
 */
export const systemAdminGuard: CanActivateFn = async (_route, state) => {
  const auth     = inject(AuthService);
  const supabase = inject(SupabaseService);
  const router   = inject(Router);

  const isAdmin = await firstValueFrom(auth.isSystemAdmin());
  if (!isAdmin) return router.createUrlTree(['/dashboard']);

  const { data: aal, error } = await supabase.getMfaAssuranceLevel();
  if (error || !aal) return router.createUrlTree(['/dashboard']);

  // No verified TOTP factor yet → force enrollment.
  if (aal.nextLevel !== 'aal2') {
    return router.createUrlTree(['/profil'], { queryParams: { mfa_required: '1' } });
  }

  // TOTP enrolled but session is still AAL1 → force challenge.
  if (aal.currentLevel !== 'aal2') {
    return router.createUrlTree(['/verifier-2fa'], { queryParams: { returnTo: state.url } });
  }

  return true;
};
