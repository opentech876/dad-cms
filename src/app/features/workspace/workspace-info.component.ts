import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TuiIcon } from '@taiga-ui/core';
import { WorkspaceService } from '../../core/workspace/workspace.service';
import { WorkspaceContextService } from '../../core/workspace/workspace-context.service';
import { AuthService } from '../../core/auth/auth.service';
import { AdminService } from '../../core/admin/admin.service';
import { ToastService } from '../../core/services/toast.service';
import { formatDateLong } from '../../core/utils/date.utils';
import { compressImage } from '../../core/utils/image.utils';

@Component({
  selector: 'app-workspace-info',
  standalone: true,
  imports: [TuiIcon],
  templateUrl: './workspace-info.component.html',
  styleUrl: './workspace-info.component.scss',
})
export class WorkspaceInfoComponent implements OnInit {
  private readonly wsService        = inject(WorkspaceService);
  private readonly workspaceContext = inject(WorkspaceContextService);
  private readonly authService      = inject(AuthService);
  private readonly adminService     = inject(AdminService);
  private readonly toast            = inject(ToastService);
  private readonly router           = inject(Router);

  readonly workspaceId   = signal<string | null>(null);
  readonly workspaceName = signal('');
  readonly logoUrl       = signal<string | null>(null);
  readonly createdAt     = signal<string | null>(null);
  readonly memberCount   = signal(0);

  readonly logoFile      = signal<File | null>(null);
  readonly logoPreview   = signal<string | null>(null);
  readonly saving        = signal(false);
  readonly logoUploading = signal(false);

  /** Workspace owner role (per-workspace, from workspace_members). */
  readonly isOwner       = signal(false);
  /** Platform-level admin (global user_roles). */
  readonly isSystemAdmin = signal(false);
  /** Either of the above can rename / upload logo. Only system_admin can delete. */
  readonly canManage     = computed(() => this.isOwner() || this.isSystemAdmin());

  readonly showDeleteModal = signal(false);
  readonly deleting        = signal(false);

  async ngOnInit(): Promise<void> {
    const role = await firstValueFrom(this.authService.currentRole$);
    this.isOwner.set(role === 'owner');
    this.isSystemAdmin.set(await firstValueFrom(this.authService.isSystemAdmin()));

    // Load the ACTIVE workspace — not whatever workspaces[0] happens to be.
    // Without this, the page can show details for a workspace the user isn't
    // currently switched into, which would let them rename / upload-to / delete
    // the wrong tenant.
    const activeId = this.workspaceContext.activeWorkspaceId();
    const workspaces = await firstValueFrom(this.wsService.getWorkspaces());
    const ws = (activeId ? workspaces.find(w => w.id === activeId) : null) ?? workspaces[0] ?? null;
    this.workspaceId.set(ws?.id ?? null);
    this.workspaceName.set(ws?.name ?? '');
    this.logoUrl.set(ws?.logo_url ?? null);
    this.createdAt.set(ws?.created_at ?? null);

    if (this.canManage()) {
      const users = await firstValueFrom(this.wsService.listUsers());
      this.memberCount.set(users.length);
    }
  }

  async saveWorkspaceName(): Promise<void> {
    const id   = this.workspaceId();
    const name = this.workspaceName().trim();
    if (!id || !name) return;

    this.saving.set(true);
    const res = await firstValueFrom(this.wsService.updateWorkspace(id, name));
    this.saving.set(false);

    if (res.success) {
      this.toast.success('Nom de l\'espace de travail mis à jour.');
    } else {
      this.toast.error(res.error ? res.error + '.' : 'Erreur de sauvegarde.');
    }
  }

  onLogoChange(event: Event): void {
    const files = (event.target as HTMLInputElement).files;
    if (!files?.length) return;
    const file = files[0];
    this.logoFile.set(file);
    const prev = this.logoPreview();
    if (prev) URL.revokeObjectURL(prev);
    this.logoPreview.set(URL.createObjectURL(file));
  }

  async uploadLogo(): Promise<void> {
    const id   = this.workspaceId();
    const file = this.logoFile();
    if (!id || !file) return;

    this.logoUploading.set(true);
    const compressed = await compressImage(file);
    const res = await firstValueFrom(this.wsService.uploadLogo(id, compressed));
    this.logoUploading.set(false);

    if (!res.success) {
      this.toast.error(res.error ? res.error + '.' : 'Erreur d\'upload.');
    } else {
      this.logoUrl.set(res.logoUrl ?? null);
      this.logoFile.set(null);
      this.logoPreview.set(null);
      this.toast.success('Logo mis à jour.');
    }
  }

  openDeleteModal(): void {
    if (!this.isSystemAdmin()) return;
    this.showDeleteModal.set(true);
  }

  closeDeleteModal(): void {
    if (this.deleting()) return;
    this.showDeleteModal.set(false);
  }

  async confirmDelete(): Promise<void> {
    const id = this.workspaceId();
    if (!id || !this.isSystemAdmin()) return;
    this.deleting.set(true);
    const res = await firstValueFrom(this.adminService.softDeleteWorkspace(id));
    this.deleting.set(false);
    if (!res.success) {
      this.toast.error(res.error ?? "Impossible de supprimer l'espace de travail.");
      return;
    }
    this.toast.success('Espace de travail marqué comme supprimé.');
    this.showDeleteModal.set(false);
    // Active workspace no longer valid; route back to admin so the system_admin
    // sees the deleted-list on the platform page.
    this.router.navigate(['/admin']);
  }

  formatDate(iso: string | null): string {
    return iso ? (formatDateLong(iso) || iso) : '—';
  }
}
