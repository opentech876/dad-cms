import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { WorkspaceSummary } from '../../models';

@Component({
  selector: 'app-workspace-step',
  standalone: true,
  imports: [TuiIcon, DatePipe],
  templateUrl: './workspace-step.component.html',
  styleUrl: './workspace-step.component.scss',
})
export class WorkspaceStepComponent {
  private router = inject(Router);

  email = '';
  workspaces: WorkspaceSummary[] = [];
  isLoading = false;

  // Modal state
  showModal = false;
  currentStep = 1;

  // Step 1 — workspace name
  workspaceName = '';

  // Step 2 — personal info
  userName = '';
  userPhone = '';
  userPhotoUrl: string | null = null;

  // Step 3 — invite members
  inviteEmail = '';

  createWorkspace(): void {
    this.showModal = true;
    this.currentStep = 1;
  }

  closeModal(): void {
    this.showModal = false;
  }

  nextStep(): void {
    if (this.currentStep < 3) this.currentStep++;
  }

  onPhotoSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => (this.userPhotoUrl = e.target?.result as string);
    reader.readAsDataURL(file);
  }

  finish(): void {
    this.router.navigate(['/dashboard']);
  }

  selectWorkspace(ws: WorkspaceSummary): void {
    this.router.navigate(['/dashboard'], { queryParams: { workspace: ws.id } });
  }
}
