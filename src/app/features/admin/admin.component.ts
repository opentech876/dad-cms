import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { AdminService, AdminWorkspace } from '../../core/admin/admin.service';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';
import { RefreshRouteReuseStrategy } from '../../core/router/refresh-route-reuse.strategy';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [TuiIcon, DatePipe, DecimalPipe],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss',
})
export class AdminComponent implements OnInit {
  private admin       = inject(AdminService);
  private context     = inject(WorkspaceContextService);
  private router      = inject(Router);
  private routeReuse  = inject(RefreshRouteReuseStrategy);

  readonly loading    = signal(true);
  readonly workspaces = signal<AdminWorkspace[]>([]);

  readonly activeWorkspaces  = computed(() => this.workspaces().filter(w => !w.deleted_at));
  readonly deletedWorkspaces = computed(() => this.workspaces().filter(w => !!w.deleted_at));

  readonly showCreateModal = signal(false);
  readonly newName         = signal('');
  readonly createSaving    = signal(false);
  readonly createError     = signal('');

  readonly busyWorkspaceId = signal<string | null>(null);

  // Inline rename — one row at a time
  readonly renameTargetId = signal<string | null>(null);
  readonly renameValue    = signal('');
  readonly renameSaving   = signal(false);

  // Invite-manager modal (sysadmin-only path to mint a workspace `owner`)
  readonly inviteWorkspaceId   = signal<string | null>(null);
  readonly inviteWorkspaceName = signal('');
  readonly inviteEmail         = signal('');
  readonly inviteSaving        = signal(false);
  readonly inviteError         = signal('');
  readonly inviteSuccess       = signal('');
  readonly showInviteModal = computed(() => this.inviteWorkspaceId() !== null);

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async reload(): Promise<void> {
    this.loading.set(true);
    try {
      const rows = await firstValueFrom(this.admin.listWorkspaces());
      this.workspaces.set(rows);
    } catch {
      this.workspaces.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  openCreateModal(): void {
    this.newName.set('');
    this.createError.set('');
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    if (this.createSaving()) return;
    this.showCreateModal.set(false);
  }

  async submitCreate(): Promise<void> {
    const name = this.newName().trim();
    this.createError.set('');
    if (!name) { this.createError.set("Le nom de l'espace est requis."); return; }
    if (this.createSaving()) return;

    this.createSaving.set(true);
    try {
      // ownerUserId left null → admin becomes the initial owner (placeholder
      // until we wire the "assign to existing user" picker in iteration B).
      const res = await firstValueFrom(this.admin.createWorkspace(name, null));
      if (!res.success) { this.createError.set(res.error ?? 'Échec de la création.'); return; }
      this.showCreateModal.set(false);
      await this.reload();
      // Nudge the shell so its switcher dropdown picks the new row up.
      this.context.notifyWorkspacesChanged();
    } finally {
      this.createSaving.set(false);
    }
  }

  async softDelete(workspaceId: string): Promise<void> {
    if (this.busyWorkspaceId()) return;
    this.busyWorkspaceId.set(workspaceId);
    try {
      const res = await firstValueFrom(this.admin.softDeleteWorkspace(workspaceId));
      if (res.success) {
        await this.reload();
        this.context.notifyWorkspacesChanged();
      }
    } finally {
      this.busyWorkspaceId.set(null);
    }
  }

  async restore(workspaceId: string): Promise<void> {
    if (this.busyWorkspaceId()) return;
    this.busyWorkspaceId.set(workspaceId);
    try {
      const res = await firstValueFrom(this.admin.restoreWorkspace(workspaceId));
      if (res.success) {
        await this.reload();
        this.context.notifyWorkspacesChanged();
      }
    } finally {
      this.busyWorkspaceId.set(null);
    }
  }

  // ── Inline rename ─────────────────────────────────────────────────────

  openRename(workspaceId: string, currentName: string): void {
    this.renameTargetId.set(workspaceId);
    this.renameValue.set(currentName);
  }

  cancelRename(): void {
    if (this.renameSaving()) return;
    this.renameTargetId.set(null);
    this.renameValue.set('');
  }

  async submitRename(): Promise<void> {
    const id   = this.renameTargetId();
    const name = this.renameValue().trim();
    if (!id || !name || this.renameSaving()) return;
    this.renameSaving.set(true);
    try {
      const res = await firstValueFrom(this.admin.renameWorkspace(id, name));
      if (res.success) {
        await this.reload();
        this.context.notifyWorkspacesChanged();
        this.renameTargetId.set(null);
        this.renameValue.set('');
      }
    } finally {
      this.renameSaving.set(false);
    }
  }

  // ── Invite manager (system_admin → owner) ─────────────────────────────

  openInviteManager(workspaceId: string, workspaceName: string): void {
    this.inviteWorkspaceId.set(workspaceId);
    this.inviteWorkspaceName.set(workspaceName);
    this.inviteEmail.set('');
    this.inviteError.set('');
    this.inviteSuccess.set('');
  }

  closeInviteManager(): void {
    if (this.inviteSaving()) return;
    this.inviteWorkspaceId.set(null);
    this.inviteWorkspaceName.set('');
    this.inviteEmail.set('');
    this.inviteError.set('');
    this.inviteSuccess.set('');
  }

  async submitInviteManager(): Promise<void> {
    const workspaceId = this.inviteWorkspaceId();
    const email = this.inviteEmail().trim();
    if (!workspaceId || !email || this.inviteSaving()) return;
    this.inviteSaving.set(true);
    this.inviteError.set('');
    this.inviteSuccess.set('');
    try {
      const res = await firstValueFrom(this.admin.inviteManager(workspaceId, email));
      if (!res.success) {
        this.inviteError.set(res.error ?? "Échec de l'invitation.");
        return;
      }
      this.inviteSuccess.set(`Invitation envoyée à ${email}.`);
      this.inviteEmail.set('');
    } finally {
      this.inviteSaving.set(false);
    }
  }

  // ── Impersonation ─────────────────────────────────────────────────────
  /**
   * system_admin "enters" a workspace: we set the active workspace to the
   * target's id and navigate to /dashboard. RLS still treats them as
   * system_admin so they can see/edit everything inside that workspace.
   * triggerRefresh() forces component re-init under the new tenant.
   */
  enterAsAdmin(workspaceId: string): void {
    this.context.setActiveWorkspace(workspaceId);
    this.routeReuse.triggerRefresh();
    this.router.navigate(['/dashboard']);
  }
}
