import { CommonModule, DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { AppRole, WorkspaceSummary } from '../../models';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { WorkspaceService } from '../../core/workspace/workspace.service';
import { OnboardingService } from '../../core/onboarding/onboarding.service';

@Component({
  selector: 'app-workspace-step',
  standalone: true,
  imports: [CommonModule, DatePipe, TuiIcon],
  templateUrl: './workspace-step.component.html',
  styleUrl: './workspace-step.component.scss',
})
export class WorkspaceStepComponent implements OnInit {
  private router = inject(Router);
  private supabase = inject(SupabaseService);
  private workspaceService = inject(WorkspaceService);
  private onboardingService = inject(OnboardingService);

  readonly email = signal('');
  readonly workspaces = signal<WorkspaceSummary[]>([]);
  readonly isLoading = signal(false);

  readonly showModal = signal(false);
  readonly currentStep = signal(1);
  readonly isModalLoading = signal(false);
  readonly stepError = signal('');

  readonly workspaceName = signal('');
  readonly userName = signal('');
  readonly userPhone = signal('');
  readonly userPhotoUrl = signal<string | null>(null);
  readonly inviteEmail = signal('');
  readonly inviteRole = signal<AppRole>('editeur');
  readonly inviteStatus = signal<'idle' | 'loading' | 'sent' | 'error'>('idle');
  readonly inviteError = signal('');

  private currentUserId = '';

  async ngOnInit(): Promise<void> {
    this.isLoading.set(true);

    // getUser() reads the session from localStorage — no BehaviorSubject timing issues
    const { data: { user } } = await this.supabase.client.auth.getUser();
    this.email.set(user?.email ?? '');
    this.currentUserId = user?.id ?? '';

    this.workspaces.set(await firstValueFrom(this.workspaceService.getWorkspaceSummaries()));
    this.isLoading.set(false);
  }

  createWorkspace(): void {
    this.showModal.set(true);
    this.currentStep.set(1);
    this.stepError.set('');
    this.workspaceName.set('');
  }

  closeModal(): void {
    this.showModal.set(false);
    this.stepError.set('');
  }

  nextStep(): void {
    this.stepError.set('');
    if (this.currentStep() === 1 && !this.workspaceName().trim()) {
      this.stepError.set("Le nom de l'espace de travail est requis.");
      return;
    }
    if (this.currentStep() === 2 && !this.userName().trim()) {
      this.stepError.set('Votre nom complet est requis.');
      return;
    }
    if (this.currentStep() < 3) this.currentStep.update(s => s + 1);
  }

  onPhotoSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => this.userPhotoUrl.set(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  async finish(): Promise<void> {
    if (this.isModalLoading()) return;
    this.isModalLoading.set(true);
    this.stepError.set('');

    const result = await firstValueFrom(
      this.onboardingService.completeOnboarding(this.workspaceName()),
    );

    if (!result?.success) {
      this.stepError.set("Impossible de créer l'espace de travail. Veuillez réessayer.");
      this.isModalLoading.set(false);
      return;
    }

    // Save personal info collected in Step 2
    if (this.currentUserId) {
      await firstValueFrom(
        this.workspaceService.upsertProfile(this.currentUserId, this.userName(), this.userPhone()),
      );
    }

    console.log('✅ Workspace créé, profil sauvegardé');
    this.router.navigate(['/dashboard']);
  }

  async sendInvite(): Promise<void> {
    if (!this.inviteEmail().trim() || this.inviteStatus() === 'loading') return;
    this.inviteStatus.set('loading');
    this.inviteError.set('');

    const result = await firstValueFrom(
      this.workspaceService.inviteUser(this.inviteEmail().trim(), this.inviteRole()),
    );

    if (!result.success) {
      this.inviteStatus.set('error');
      this.inviteError.set(result.error ?? "Impossible d'envoyer l'invitation.");
      return;
    }

    this.inviteStatus.set('sent');
    this.inviteEmail.set('');
  }

  selectWorkspace(_ws: WorkspaceSummary): void {
    this.router.navigate(['/dashboard']);
  }
}
