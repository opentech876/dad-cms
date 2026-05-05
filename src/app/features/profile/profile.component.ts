import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { filter, firstValueFrom } from 'rxjs';
import { AppRole } from '../../models';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceService } from '../../core/workspace/workspace.service';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [TuiIcon],
  templateUrl: './profile.component.html',
})
export class ProfileComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly workspaceService = inject(WorkspaceService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  private userId = '';

  readonly userEmail = signal('');
  readonly fullName = signal('');
  readonly phone = signal('');
  readonly role = signal<AppRole | null>(null);
  readonly saving = signal(false);

  async ngOnInit(): Promise<void> {
    const user = await firstValueFrom(this.auth.getCurrentUser().pipe(filter(Boolean)));
    this.userId = (user as any).id ?? '';
    this.userEmail.set((user as any).email ?? '');
    this.role.set(await firstValueFrom(this.auth.currentRole$));

    const profile = await firstValueFrom(this.workspaceService.getMyProfile(this.userId));
    if (profile) {
      this.fullName.set(profile.full_name ?? '');
      this.phone.set(profile.phone ?? '');
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

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }
}
