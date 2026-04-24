import { CommonModule, DatePipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { filter, firstValueFrom } from 'rxjs';
import { WorkspaceSummary } from '../../models';
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

  email = '';
  workspaces: WorkspaceSummary[] = [];
  isLoading = false;

  showModal = false;
  currentStep = 1;
  isModalLoading = false;
  stepError = '';

  workspaceName = '';
  userName = '';
  userPhone = '';
  userPhotoUrl: string | null = null;
  inviteEmail = '';

  private currentUserId = '';

  async ngOnInit(): Promise<void> {
    this.isLoading = true;

    const user = await firstValueFrom(this.supabase.currentUser$.pipe(filter(Boolean)));
    this.email = user.email ?? '';
    this.currentUserId = user.id;

    // Chargement correct des workspaces
    this.workspaces = await firstValueFrom(this.workspaceService.getWorkspaceSummaries());
    this.isLoading = false;
  }

  createWorkspace(): void {
    this.showModal = true;
    this.currentStep = 1;
    this.stepError = '';
    this.workspaceName = '';
  }

  closeModal(): void {
    this.showModal = false;
    this.stepError = '';
  }

  nextStep(): void {
    this.stepError = '';
    if (this.currentStep === 1 && !this.workspaceName.trim()) {
      this.stepError = "Le nom de l'espace de travail est requis.";
      return;
    }
    if (this.currentStep === 2 && !this.userName.trim()) {
      this.stepError = 'Votre nom complet est requis.';
      return;
    }
    if (this.currentStep < 3) this.currentStep++;
  }

  onPhotoSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => (this.userPhotoUrl = e.target?.result as string);
    reader.readAsDataURL(file);
  }

  async finish(): Promise<void> {
    if (this.isModalLoading) return;
    this.isModalLoading = true;
    this.stepError = '';

    const result = await firstValueFrom(
      this.onboardingService.completeOnboarding(this.workspaceName),
    );

    if (!result?.success) {
      this.stepError = "Impossible de créer l'espace de travail. Veuillez réessayer.";
      this.isModalLoading = false;
      return;
    }

    console.log('✅ Workspace créé avec succès');
    this.router.navigate(['/dashboard']);
  }

  selectWorkspace(_ws: WorkspaceSummary): void {
    this.router.navigate(['/dashboard']);
  }
}
