import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { User, Session } from '@supabase/supabase-js';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';
import { AppRole } from '../../models'; // ← chemin corrigé
import { SupabaseService } from '../supabase/supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private currentRoleSubject = new BehaviorSubject<AppRole | null>(null);
  public currentRole$ = this.currentRoleSubject.asObservable();

  constructor(
    private supabaseService: SupabaseService,
    private router: Router,
  ) {
    this.listenToRoleChanges();
  }

  /**
   * Écoute les changements d'utilisateur et recharge le rôle en temps réel.
   * Prend en compte les rôles temporaires (expires_at).
   */
  private listenToRoleChanges(): void {
    this.supabaseService.currentUser$
      .pipe(
        switchMap((user) => {
          if (!user) {
            this.currentRoleSubject.next(null);
            return of(null);
          }

          return from(
            this.supabaseService.client
              .from('user_roles')
              .select('role, expires_at')
              .eq('user_id', user.id)
              .single(),
          ).pipe(
            map(({ data }) => {
              if (!data) return null;
              // Rôle expiré = aucun rôle côté client
              if (data.expires_at && new Date(data.expires_at) < new Date()) {
                return null;
              }
              return (data.role as AppRole) ?? null;
            }),
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
        if (userRole === 'owner') return true;
        if (userRole === 'chef_equipe')
          return ['chef_equipe', 'editeur', 'charge_communication'].includes(requiredRole);
        if (userRole === 'editeur') return requiredRole === 'editeur';
        if (userRole === 'charge_communication') return requiredRole === 'charge_communication';
        return false;
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
