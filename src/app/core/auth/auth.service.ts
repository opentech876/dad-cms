import { inject, Injectable } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { User, Session } from '@supabase/supabase-js';
import { Observable, ReplaySubject, combineLatest, from, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { AppRole } from '../../models';
import { SupabaseService } from '../supabase/supabase.service';
import { WorkspaceContextService } from '../workspace/workspace-context.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  /**
   * ReplaySubject (buffer 1) instead of BehaviorSubject so subscribers that
   * arrive *before* the async role lookup completes don't get a stale `null`.
   * Guards using `take(1)` will wait for the first real emission and then
   * pick it up immediately on every subsequent subscribe.
   */
  private currentRoleSubject = new ReplaySubject<AppRole | null>(1);
  public currentRole$ = this.currentRoleSubject.asObservable();

  private workspaceContext = inject(WorkspaceContextService);

  constructor(
    private supabaseService: SupabaseService,
    private router: Router,
  ) {
    this.listenToRoleChanges();
  }

  /**
   * Re-emit the role whenever the user OR the active workspace changes.
   *
   * Authoritative source: `workspace_members.role` for the active workspace.
   * Fallback to `user_roles` ONLY when no workspace is active — this covers
   * the seeded `system_admin` (global role, no workspace) and any user who has
   * a global role but no active workspace yet (e.g. about to create one via
   * /espaces).
   *
   * Per-workspace lookup is what makes multi-tenant roles real: the same user
   * can be `editeur` in workspace A and `chef_equipe` in workspace B.
   */
  private listenToRoleChanges(): void {
    const workspaceId$ = toObservable(this.workspaceContext.activeWorkspaceId);

    combineLatest([this.supabaseService.currentUser$, workspaceId$])
      .pipe(
        switchMap(([user, workspaceId]) => {
          if (!user) return of(null);

          // No active workspace → consult the global user_roles (seeded
          // system_admin and the workspace creation flow).
          if (!workspaceId) {
            return from(
              this.supabaseService.client
                .from('user_roles')
                .select('role, expires_at')
                .eq('user_id', user.id)
                .single(),
            ).pipe(
              map(({ data }: any) => {
                if (!data) return null;
                if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
                return (data.role as AppRole) ?? null;
              }),
              catchError(() => of(null)),
            );
          }

          // Normal path: workspace-scoped role from membership.
          return from(
            this.supabaseService.client
              .from('workspace_members')
              .select('role')
              .eq('user_id', user.id)
              .eq('workspace_id', workspaceId)
              .maybeSingle(),
          ).pipe(
            map(({ data }: any) => (data?.role as AppRole) ?? null),
            catchError(() => of(null)),
          );
        }),
        tap((role) => this.currentRoleSubject.next(role)),
      )
      .subscribe();
  }

  hasRoleAtLeast(requiredRole: AppRole): Observable<boolean> {
    return this.currentRole$.pipe(
      map((userRole) => {
        if (!userRole) return false;
        // system_admin is platform-level: trumps every role check, mirrors
        // the SQL has_role_at_least short-circuit.
        if (userRole === 'system_admin') return true;
        if (userRole === 'owner') return true;
        if (userRole === 'chef_equipe')
          return ['chef_equipe', 'editeur', 'charge_communication'].includes(requiredRole);
        // chef_equipe_commerciale inherits charge_communication (symmetric to
        // how chef_equipe inherits editeur). It can manage companies and
        // oversee campaigns.
        if (userRole === 'chef_equipe_commerciale')
          return ['chef_equipe_commerciale', 'charge_communication'].includes(requiredRole);
        if (userRole === 'editeur') return requiredRole === 'editeur';
        if (userRole === 'charge_communication') return requiredRole === 'charge_communication';
        // presidence is a parallel tier: only itself and owner satisfy
        // has_role_at_least('presidence'). It does not inherit editorial
        // permissions, and editorial roles do not inherit it.
        if (userRole === 'presidence') return requiredRole === 'presidence';
        return false;
      }),
    );
  }

  /**
   * True when the caller is a system_admin (platform-level admin who can
   * manage workspaces). Reads from user_roles, not workspace_members,
   * because system_admin is global by design.
   */
  isSystemAdmin(): Observable<boolean> {
    return this.supabaseService.currentUser$.pipe(
      switchMap((user) => {
        if (!user) return of(false);
        return from(
          this.supabaseService.client
            .from('user_roles')
            .select('role')
            .eq('user_id', user.id)
            .maybeSingle(),
        ).pipe(
          map(({ data }: any) => data?.role === 'system_admin'),
          catchError(() => of(false)),
        );
      }),
    );
  }

  isOwner(): Observable<boolean> {
    return this.currentRole$.pipe(map((role) => role === 'owner'));
  }

  getCurrentUser(): Observable<User | null> {
    return this.supabaseService.currentUser$;
  }

  getCurrentSession(): Observable<Session | null> {
    return this.supabaseService.currentSession$;
  }

  signOut(): Observable<any> {
    return from(this.supabaseService.signOut()).pipe(tap(() => this.router.navigate(['/login'])));
  }
}
