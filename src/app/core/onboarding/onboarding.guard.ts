import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../supabase/supabase.service';

export const onboardingGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService).client;
  const router = inject(Router);

  // Direct DB calls — no dependency on BehaviorSubject timing
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role, expires_at')
    .single();

  if (!roleData || roleData.role !== 'owner') return true;

  const isExpired = roleData.expires_at && new Date(roleData.expires_at) < new Date();
  if (isExpired) return true;

  // Active owner — check if workspace exists
  const { count } = await supabase
    .from('workspaces')
    .select('id', { count: 'exact', head: true });

  if ((count ?? 0) === 0) return router.createUrlTree(['/espaces']);
  return true;
};
