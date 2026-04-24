import { Injectable } from '@angular/core';
import { Observable, forkJoin, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { Workspace, WorkspaceSummary } from '../../models';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  constructor(private supabaseService: SupabaseService) {}

  hasWorkspace(): Observable<boolean> {
    return from(
      this.supabaseService.client
        .from('workspaces')
        .select('id', { count: 'exact', head: true }),
    ).pipe(map(({ count }) => (count ?? 0) > 0));
  }

  getWorkspaces(): Observable<Workspace[]> {
    return from(
      this.supabaseService.client.from('workspaces').select('id, name, logo_url, created_at, updated_at'),
    ).pipe(map(({ data }) => (data as Workspace[]) ?? []));
  }

  getWorkspaceSummaries(): Observable<WorkspaceSummary[]> {
    const workspaces$ = from(
      this.supabaseService.client.from('workspaces').select('id, name, logo_url'),
    );
    const memberCount$ = from(
      this.supabaseService.client
        .from('user_roles')
        .select('*', { count: 'exact', head: true }),
    );

    return forkJoin([workspaces$, memberCount$]).pipe(
      map(([{ data: workspaces }, { count }]) =>
        (workspaces ?? []).map((ws) => ({
          id: ws.id,
          name: ws.name,
          logo_url: ws.logo_url ?? null,
          member_count: count ?? 0,
          last_accessed_at: null,
        })),
      ),
    );
  }

  upsertProfile(userId: string, fullName: string, phone: string): Observable<void> {
    return from(
      this.supabaseService.client.from('profiles').upsert({
        user_id: userId,
        full_name: fullName || null,
        phone: phone || null,
      }),
    ).pipe(map(() => undefined));
  }

  createWorkspace(name: string): Observable<{ success: boolean; workspaceId?: string; error?: any }> {
    return from(this.supabaseService.invoke<{ id: string }>('create-workspace', { name })).pipe(
      map(({ data, error }) => {
        if (error) return { success: false, error };
        return { success: true, workspaceId: data?.id };
      }),
    );
  }
}
