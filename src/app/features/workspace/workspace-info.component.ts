import { Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TuiIcon } from '@taiga-ui/core';
import { WorkspaceService } from '../../core/workspace/workspace.service';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { formatDateLong } from '../../core/utils/date.utils';

@Component({
  selector: 'app-workspace-info',
  standalone: true,
  imports: [TuiIcon],
  templateUrl: './workspace-info.component.html',
  styleUrl: './workspace-info.component.scss',
})
export class WorkspaceInfoComponent implements OnInit {
  private readonly wsService   = inject(WorkspaceService);
  private readonly authService = inject(AuthService);
  private readonly toast       = inject(ToastService);

  readonly workspaceId   = signal<string | null>(null);
  readonly workspaceName = signal('');
  readonly logoUrl       = signal<string | null>(null);
  readonly createdAt     = signal<string | null>(null);
  readonly memberCount   = signal(0);

  readonly logoFile      = signal<File | null>(null);
  readonly logoPreview   = signal<string | null>(null);
  readonly saving        = signal(false);
  readonly logoUploading = signal(false);

  readonly isOwner = signal(false);

  async ngOnInit(): Promise<void> {
    const role = await firstValueFrom(this.authService.currentRole$);
    this.isOwner.set(role === 'owner');

    const workspaces = await firstValueFrom(this.wsService.getWorkspaces());
    const ws = workspaces[0] ?? null;
    this.workspaceId.set(ws?.id ?? null);
    this.workspaceName.set(ws?.name ?? '');
    this.logoUrl.set(ws?.logo_url ?? null);
    this.createdAt.set(ws?.created_at ?? null);

    if (this.isOwner()) {
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
    const res = await firstValueFrom(this.wsService.uploadLogo(id, file));
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

  formatDate(iso: string | null): string {
    return iso ? (formatDateLong(iso) || iso) : '—';
  }
}
