import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from '../supabase/supabase.service';

/** A row in the system_admin workspaces table view. */
export interface AdminWorkspace {
  id: string;
  name: string;
  logo_url: string | null;
  member_count: number;
  created_at: string;
  created_by: string | null;
  created_by_email: string | null;
  deleted_at: string | null;
}

/** One workspace_members entry, denormalised for /admin/utilisateurs display. */
export interface AdminUserMembership {
  workspace_id:   string;
  workspace_name: string;
  role:           string;
  joined_at:      string | null;
  deleted:        boolean;
}

/** A row in the system_admin global users table view. */
export interface AdminUser {
  user_id:            string;
  email:              string | null;
  display_name:       string | null;
  global_role:        string | null;
  email_confirmed_at: string | null;
  banned:             boolean;
  created_at:         string | null;
  memberships:        AdminUserMembership[];
}

/**
 * Thin Angular wrapper over the `admin_*` Postgres RPCs. Every method here
 * requires the caller to be `system_admin` server-side — the RPC's
 * `_assert_system_admin()` precheck enforces it. The client-side
 * `systemAdminGuard` gates the `/admin` route so we never reach this
 * service without an admin user, but the server is the source of truth.
 */
@Injectable({ providedIn: 'root' })
export class AdminService {
  private supabase = inject(SupabaseService);

  listAllUsers(): Observable<AdminUser[]> {
    return from(this.supabase.client.rpc('admin_list_all_users')).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return (data ?? []) as AdminUser[];
      }),
    );
  }

  listWorkspaces(): Observable<AdminWorkspace[]> {
    return from(this.supabase.client.rpc('admin_list_workspaces')).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return (data ?? []) as AdminWorkspace[];
      }),
    );
  }

  createWorkspace(name: string, ownerUserId?: string | null): Observable<{ success: boolean; workspaceId?: string; error?: string }> {
    return from(
      this.supabase.client.rpc('admin_create_workspace', {
        p_name: name,
        p_owner_user_id: ownerUserId ?? null,
      }),
    ).pipe(
      map(({ data, error }: any) =>
        error ? { success: false, error: error.message } : { success: true, workspaceId: data as string },
      ),
    );
  }

  renameWorkspace(workspaceId: string, name: string): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.client.rpc('admin_rename_workspace', { p_workspace_id: workspaceId, p_name: name }),
    ).pipe(
      map(({ error }: any) => (error ? { success: false, error: error.message } : { success: true })),
    );
  }

  softDeleteWorkspace(workspaceId: string): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.client.rpc('admin_soft_delete_workspace', { p_workspace_id: workspaceId }),
    ).pipe(
      map(({ error }: any) => (error ? { success: false, error: error.message } : { success: true })),
    );
  }

  restoreWorkspace(workspaceId: string): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.client.rpc('admin_restore_workspace', { p_workspace_id: workspaceId }),
    ).pipe(
      map(({ error }: any) => (error ? { success: false, error: error.message } : { success: true })),
    );
  }
}
