import { Injectable } from '@angular/core';
import { Observable, combineLatest, from } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { AuthService } from '../auth/auth.service';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceService } from '../workspace/workspace.service';

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  constructor(
    private supabaseService: SupabaseService,
    private workspaceService: WorkspaceService,
    private authService: AuthService,
  ) {}

  /**
   * Détermine si l'utilisateur doit passer par l'onboarding.
   * Condition : il est owner (temporaire ou permanent) MAIS aucun workspace n'existe encore.
   */
  shouldGoToOnboarding(): Observable<boolean> {
    return combineLatest([this.authService.isOwner(), this.workspaceService.hasWorkspace()]).pipe(
      map(([isOwner, hasWorkspace]) => isOwner && !hasWorkspace),
    );
  }

  /**
   * Finalise l'onboarding en créant le workspace.
   * Cela rend le rôle owner permanent via la Edge Function.
   */
  completeOnboarding(
    workspaceName: string = 'Day After Day',
    fullName?: string,
    phone?: string,
  ): Observable<any> {
    return this.workspaceService.createWorkspace(workspaceName, fullName, phone).pipe(
      tap((result) => {
        if (result?.success) {
          console.log('✅ Workspace créé avec succès. Rôle owner permanent assigné.');
        }
      }),
    );
  }

  /**
   * Nettoie les owners temporaires expirés (appelable manuellement ou via pg_cron).
   */
  cleanupTemporaryOwners(): Observable<any> {
    return from(this.supabaseService.client.rpc('cleanup_temporary_owners'));
  }
}
