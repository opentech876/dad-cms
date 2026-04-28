import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { WorkspaceSummary } from '../../models';
import { WorkspaceStepComponent } from './workspace-step.component';
import { SupabaseService } from '../../core/supabase/supabase.service';
import { WorkspaceService } from '../../core/workspace/workspace.service';
import { OnboardingService } from '../../core/onboarding/onboarding.service';

const MOCK_WORKSPACE: WorkspaceSummary = {
  id: 'ws-abc',
  name: 'OPEN-TECH Congo',
  logo_url: null,
  member_count: 4,
  last_accessed_at: null,
};

describe('WorkspaceStepComponent', () => {
  let component: WorkspaceStepComponent;
  let fixture: ComponentFixture<WorkspaceStepComponent>;
  let navigateSpy: jest.Mock;
  let mockWorkspaceService: any;
  let mockOnboardingService: any;
  let mockSupabase: any;

  beforeEach(async () => {
    mockSupabase = {
      client: {
        auth: {
          getUser: jest.fn().mockResolvedValue({
            data: { user: { id: 'user-123', email: 'test@exemple.com' } },
          }),
        },
      },
    };

    mockWorkspaceService = {
      getWorkspaceSummaries: jest.fn().mockReturnValue(of([MOCK_WORKSPACE])),
      upsertProfile: jest.fn().mockReturnValue(of(undefined)),
      inviteUser: jest.fn().mockReturnValue(of({ success: true })),
    };

    mockOnboardingService = {
      completeOnboarding: jest.fn().mockReturnValue(of({ success: true, workspaceId: 'ws-new' })),
    };

    await TestBed.configureTestingModule({
      imports: [WorkspaceStepComponent],
      providers: [
        provideRouter([]),
        provideLocationMocks(),
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: WorkspaceService, useValue: mockWorkspaceService },
        { provide: OnboardingService, useValue: mockOnboardingService },
      ],
    }).compileComponents();

    navigateSpy = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true) as any;

    fixture = TestBed.createComponent(WorkspaceStepComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('devrait créer le composant', () => {
    expect(component).toBeTruthy();
  });

  // ─── ngOnInit ─────────────────────────────────────────────────────────────

  describe('ngOnInit()', () => {
    it("appelle auth.getUser() et renseigne l'email", () => {
      expect(mockSupabase.client.auth.getUser).toHaveBeenCalled();
      expect(component.email()).toBe('test@exemple.com');
    });

    it('appelle getWorkspaceSummaries() et charge les workspaces', () => {
      expect(mockWorkspaceService.getWorkspaceSummaries).toHaveBeenCalled();
      expect(component.workspaces()).toEqual([MOCK_WORKSPACE]);
    });
  });

  // ─── État initial ─────────────────────────────────────────────────────────

  describe('État initial', () => {
    it('la modal est fermée', () => {
      expect(component.showModal()).toBe(false);
    });
  });

  // ─── Gestion de la modal ──────────────────────────────────────────────────

  describe('createWorkspace()', () => {
    it('ouvre la modal', () => {
      component.createWorkspace();
      expect(component.showModal()).toBe(true);
    });

    it("démarre à l'étape 1", () => {
      component.currentStep.set(3);
      component.createWorkspace();
      expect(component.currentStep()).toBe(1);
    });
  });

  describe('closeModal()', () => {
    it('ferme la modal', () => {
      component.showModal.set(true);
      component.closeModal();
      expect(component.showModal()).toBe(false);
    });
  });

  // ─── nextStep() ───────────────────────────────────────────────────────────

  describe('nextStep()', () => {
    it("avance de l'étape 1 à 2 quand le nom du workspace est renseigné", () => {
      component.currentStep.set(1);
      component.workspaceName.set('Mon Workspace');
      component.nextStep();
      expect(component.currentStep()).toBe(2);
    });

    it("reste à l'étape 1 et affiche une erreur si le nom du workspace est vide", () => {
      component.currentStep.set(1);
      component.workspaceName.set('');
      component.nextStep();
      expect(component.currentStep()).toBe(1);
      expect(component.stepError()).toBeTruthy();
    });

    it("avance de l'étape 2 à 3 quand le nom d'utilisateur est renseigné", () => {
      component.currentStep.set(2);
      component.userName.set('Elvis OLEMBE');
      component.nextStep();
      expect(component.currentStep()).toBe(3);
    });

    it("reste à l'étape 2 et affiche une erreur si le nom d'utilisateur est vide", () => {
      component.currentStep.set(2);
      component.userName.set('');
      component.nextStep();
      expect(component.currentStep()).toBe(2);
      expect(component.stepError()).toBeTruthy();
    });

    it("ne dépasse pas l'étape 3", () => {
      component.currentStep.set(3);
      component.nextStep();
      expect(component.currentStep()).toBe(3);
    });
  });

  // ─── finish() ─────────────────────────────────────────────────────────────

  describe('finish()', () => {
    beforeEach(() => {
      component.workspaceName.set('OPEN-TECH Congo');
      component.userName.set('Elvis OLEMBE');
      component.userPhone.set('+242 06 123 4567');
    });

    it('appelle completeOnboarding avec le nom du workspace', async () => {
      await component.finish();
      expect(mockOnboardingService.completeOnboarding).toHaveBeenCalledWith('OPEN-TECH Congo');
    });

    it('appelle upsertProfile avec userId, nom et téléphone si workspace créé avec succès', async () => {
      await component.finish();
      expect(mockWorkspaceService.upsertProfile).toHaveBeenCalledWith(
        'user-123',
        'Elvis OLEMBE',
        '+242 06 123 4567',
      );
    });

    it('navigue vers /dashboard après succès', async () => {
      await component.finish();
      expect(navigateSpy).toHaveBeenCalledWith(['/dashboard']);
    });

    it("affiche une erreur et ne navigue pas si completeOnboarding échoue", async () => {
      mockOnboardingService.completeOnboarding.mockReturnValueOnce(
        of({ success: false, error: 'Erreur serveur' }),
      );
      await component.finish();
      expect(mockWorkspaceService.upsertProfile).not.toHaveBeenCalled();
      expect(navigateSpy).not.toHaveBeenCalled();
      expect(component.stepError()).toBeTruthy();
    });
  });

  // ─── sendInvite() ─────────────────────────────────────────────────────────

  describe('sendInvite()', () => {
    beforeEach(() => {
      component.inviteEmail.set('invite@exemple.com');
    });

    it("appelle workspaceService.inviteUser avec l'email et le rôle sélectionné", async () => {
      await component.sendInvite();
      expect(mockWorkspaceService.inviteUser).toHaveBeenCalledWith(
        'invite@exemple.com',
        component.inviteRole(),
      );
    });

    it("définit inviteStatus à 'sent' et vide l'email après succès", async () => {
      await component.sendInvite();
      expect(component.inviteStatus()).toBe('sent');
      expect(component.inviteEmail()).toBe('');
    });

    it("définit inviteStatus à 'error' et renseigne inviteError en cas d'échec", async () => {
      mockWorkspaceService.inviteUser.mockReturnValueOnce(
        of({ success: false, error: 'Utilisateur déjà invité' }),
      );
      await component.sendInvite();
      expect(component.inviteStatus()).toBe('error');
      expect(component.inviteError()).toBeTruthy();
    });

    it('ne soumet pas une deuxième fois pendant le chargement', async () => {
      component.inviteStatus.set('loading');
      await component.sendInvite();
      expect(mockWorkspaceService.inviteUser).not.toHaveBeenCalled();
    });

    it("ne soumet pas si l'email est vide", async () => {
      component.inviteEmail.set('');
      await component.sendInvite();
      expect(mockWorkspaceService.inviteUser).not.toHaveBeenCalled();
    });
  });

  // ─── selectWorkspace() ────────────────────────────────────────────────────

  describe('selectWorkspace()', () => {
    it('navigue vers /dashboard', () => {
      component.selectWorkspace(MOCK_WORKSPACE);
      expect(navigateSpy).toHaveBeenCalledWith(['/dashboard']);
    });
  });

  // ─── Affichage conditionnel ───────────────────────────────────────────────

  describe('Affichage de la liste des espaces', () => {
    it('affiche les espaces de travail disponibles', () => {
      fixture.changeDetectorRef.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).toContain('OPEN-TECH Congo');
    });

    it('affiche le message de chargement quand isLoading est true', () => {
      component.isLoading.set(true);
      fixture.changeDetectorRef.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).toContain('Chargement');
    });
  });
});
