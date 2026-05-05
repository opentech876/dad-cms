import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SupabaseService } from '../supabase/supabase.service';

export const authGuard: CanActivateFn = async () => {
  const supabase = inject(SupabaseService);
  const router = inject(Router);

  // getSession() reads from localStorage synchronously — no race condition with BehaviorSubject
  const { data: { session } } = await supabase.client.auth.getSession();

  if (session) return true;

  router.navigate(['/login']);
  return false;
};
