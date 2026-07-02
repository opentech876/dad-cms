import { Injectable, inject } from '@angular/core';
import { Observable, from } from 'rxjs';
import { map } from 'rxjs/operators';
import { SupabaseService } from '../supabase/supabase.service';

/** Aggregate platform-level stats returned by admin_dashboard_stats(). */
export interface AdminDashboardStats {
  workspaces: { active: number; deleted: number };
  users: { total: number; confirmed: number; pending: number; system_admins: number };
  recent_workspaces: Array<{
    id: string;
    name: string;
    created_at: string;
    deleted_at: string | null;
    member_count: number;
  }>;
  pending_invitations: Array<{
    id: string;
    email: string | null;
    created_at: string;
    invited_role: string;
    workspace_id: string | null;
  }>;
}

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

/** Tables that the /admin/logs page surfaces. See admin_list_audit_log(). */
export type AdminAuditTable = 'workspaces' | 'user_roles' | 'workspace_members';

/** A row from admin_list_audit_log() — one admin-scope audit event. */
export interface AdminAuditEntry {
  id:             string;
  table_name:     AdminAuditTable;
  action:         'INSERT' | 'UPDATE' | 'DELETE';
  record_id:      string;
  actor_id:       string | null;
  actor_email:    string | null;
  actor_name:     string | null;
  workspace_id:   string | null;
  workspace_name: string | null;
  old_data:       Record<string, any> | null;
  new_data:       Record<string, any> | null;
  changed_at:     string;
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
  last_sign_in_at:    string | null;
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

  /**
   * One-round-trip platform stats for /admin (the dashboard landing).
   * The RPC asserts system_admin server-side; the caller already passed the
   * systemAdminGuard, so this is belt-and-suspenders.
   */
  dashboardStats(): Observable<AdminDashboardStats> {
    return from(this.supabase.client.rpc('admin_dashboard_stats')).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return data as AdminDashboardStats;
      }),
    );
  }

  listAllUsers(): Observable<AdminUser[]> {
    return from(this.supabase.client.rpc('admin_list_all_users')).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return (data ?? []) as AdminUser[];
      }),
    );
  }

  /**
   * List admin-scope audit-log entries. Cursor-paginated on changed_at.
   * @param limit  How many rows to fetch (server caps at whatever LIMIT accepts).
   * @param before Cursor: fetch entries strictly older than this timestamp.
   * @param table  Optional table filter — one of AdminAuditTable, or null for all.
   */
  listAuditLog(
    limit  = 50,
    before: string | null = null,
    table:  AdminAuditTable | null = null,
  ): Observable<AdminAuditEntry[]> {
    return from(
      this.supabase.client.rpc('admin_list_audit_log', {
        p_limit:  limit,
        p_before: before,
        p_table:  table,
      }),
    ).pipe(
      map(({ data, error }: any) => {
        if (error) throw error;
        return (data ?? []) as AdminAuditEntry[];
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

  /**
   * system_admin invites an `owner` (UI label: "Administrateur") into the
   * target workspace. The `role` field is fixed server-side — sysadmin can
   * only invite at this tier through this entry point, not arbitrary roles.
   * Delegates to the same invite-user Edge Function regular workspace
   * inviters use; the EF distinguishes inviter type and applies the right
   * authorization branch.
   */
  inviteManager(workspaceId: string, email: string): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.invoke<{ id: string; email: string }>('invite-user', {
        email,
        role: 'owner',
        workspace_id: workspaceId,
      }),
    ).pipe(
      map(({ error }) => (error ? { success: false, error: error.message } : { success: true })),
    );
  }
}
