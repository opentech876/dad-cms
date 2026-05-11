import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { filter, firstValueFrom } from 'rxjs';
import { AppRole } from '../../models';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceService } from '../../core/workspace/workspace.service';
import { ToastService } from '../../core/services/toast.service';

const ROLE_LABELS: Record<AppRole, string> = {
  owner:                  'Propriétaire',
  chef_equipe:            "Chef d'équipe",
  editeur:                'Éditeur',
  charge_communication:   'Chargé de communication',
};

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [TuiIcon, FormsModule],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
})
export class ProfileComponent implements OnInit {
  private readonly auth             = inject(AuthService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly router           = inject(Router);
  private readonly toast            = inject(ToastService);

  private userId = '';

  readonly userEmail = signal('');
  readonly fullName  = signal('');
  readonly phone     = signal('');
  readonly role      = signal<AppRole | null>(null);
  readonly saving          = signal(false);
  readonly avatarUrl       = signal<string | null>(null);
  readonly avatarFile      = signal<File | null>(null);
  readonly avatarPreview   = signal<string | null>(null);
  readonly avatarUploading = signal(false);

  readonly initials = computed(() => {
    const name = this.fullName().trim();
    if (name) {
      const parts = name.split(/\s+/);
      return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || name[0].toUpperCase();
    }
    return (this.userEmail()[0] ?? '?').toUpperCase();
  });

  readonly roleLabel = computed(() =>
    this.role() ? ROLE_LABELS[this.role()!] : '',
  );

  readonly displayName = computed(() =>
    this.fullName().trim() || this.userEmail(),
  );

  async ngOnInit(): Promise<void> {
    const user = await firstValueFrom(this.auth.getCurrentUser().pipe(filter(Boolean)));
    this.userId = (user as any).id ?? '';
    this.userEmail.set((user as any).email ?? '');
    this.role.set(await firstValueFrom(this.auth.currentRole$));

    const profile = await firstValueFrom(this.workspaceService.getMyProfile(this.userId));
    if (profile) {
      this.fullName.set(profile.full_name ?? '');
      this.phone.set(profile.phone ?? '');
      this.avatarUrl.set(profile.avatar_url ?? null);
    }
  }

  async saveProfile(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.workspaceService.upsertProfile(
          this.userId,
          this.fullName().trim(),
          this.phone().trim(),
        ),
      );
      this.toast.success('Profil mis à jour avec succès.');
    } catch {
      this.toast.error('Impossible de mettre à jour le profil. Veuillez réessayer.');
    } finally {
      this.saving.set(false);
    }
  }

  onAvatarChange(ev: any): void {
    const files = (ev.target as HTMLInputElement).files;
    if (!files?.length) return;
    const file = files[0];
    this.avatarFile.set(file);
    const prev = this.avatarPreview();
    if (prev) URL.revokeObjectURL(prev);
    this.avatarPreview.set(URL.createObjectURL(file));
  }

  async uploadAvatar(): Promise<void> {
    const file = this.avatarFile();
    if (!file || !this.userId) return;
    this.avatarUploading.set(true);
    try {
      const res = await firstValueFrom(this.workspaceService.uploadAvatar(this.userId, file));
      if (!res.success) {
        this.toast.error(res.error ?? 'Erreur lors du téléversement.');
      } else {
        this.avatarUrl.set(res.avatarUrl ?? null);
        this.avatarFile.set(null);
        const prev = this.avatarPreview();
        if (prev) URL.revokeObjectURL(prev);
        this.avatarPreview.set(null);
        this.toast.success('Photo de profil mise à jour.');
      }
    } finally {
      this.avatarUploading.set(false);
    }
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }
}
