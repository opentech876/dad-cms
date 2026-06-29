import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { provideRouter, Router } from '@angular/router';
import { of, Subject } from 'rxjs';
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
      upsertProfile: jest.fn().mockReturnValue(of({ success: true })),
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
    it("avance de l'étape 1 à 2 quand le nom du workspace est renseigné", async () => {
      component.currentStep.set(1);
      component.workspaceName.set('Mon Workspace');
      await component.nextStep();
      expect(component.currentStep()).toBe(2);
    });

    it("reste à l'étape 1 et affiche une erreur si le nom du workspace est vide", async () => {
      component.currentStep.set(1);
      component.workspaceName.set('');
      await component.nextStep();
      expect(component.currentStep()).toBe(1);
      expect(component.stepError()).toBeTruthy();
    });

    it("avance de l'étape 2 à 3 et appelle completeOnboarding avec workspace + profil", async () => {
      component.currentStep.set(2);
      component.workspaceName.set('OPEN-TECH Congo');
      component.userName.set('Elvis OLEMBE');
      component.userPhone.set('+242 06 123 4567');
      await component.nextStep();
      expect(mockOnboardingService.completeOnboarding).toHaveBeenCalledWith(
        'OPEN-TECH Congo',
        'Elvis OLEMBE',
        '+242 06 123 4567',
      );
      expect(component.currentStep()).toBe(3);
    });

    it("reste à l'étape 2 et affiche une erreur si le nom d'utilisateur est vide", async () => {
      component.currentStep.set(2);
      component.userName.set('');
      await component.nextStep();
      expect(component.currentStep()).toBe(2);
      expect(component.stepError()).toBeTruthy();
    });

    it("reste à l'étape 2 et affiche une erreur si completeOnboarding échoue", async () => {
      mockOnboardingService.completeOnboarding.mockReturnValueOnce(
        of({ success: false, error: 'Erreur serveur' }),
      );
      component.currentStep.set(2);
      component.workspaceName.set('OPEN-TECH Congo');
      component.userName.set('Elvis OLEMBE');
      await component.nextStep();
      expect(component.currentStep()).toBe(2);
      expect(component.stepError()).toBeTruthy();
    });

    it("ne fait rien à l'étape 3", async () => {
      component.currentStep.set(3);
      await component.nextStep();
      expect(component.currentStep()).toBe(3);
    });

    it('ignore les appels supplémentaires pendant le chargement — completeOnboarding ne doit être appelé qu\'une seule fois', async () => {
      component.currentStep.set(2);
      component.workspaceName.set('OPEN-TECH Congo');
      component.userName.set('Elvis OLEMBE');

      const subject = new Subject<{ success: boolean; workspaceId?: string }>();
      mockOnboardingService.completeOnboarding.mockReturnValue(subject.asObservable());

      // Two synchronous calls before the first await resolves
      const p1 = component.nextStep();
      const p2 = component.nextStep();

      expect(mockOnboardingService.completeOnboarding).toHaveBeenCalledTimes(1);

      subject.next({ success: true, workspaceId: 'ws-1' });
      subject.complete();
      await Promise.all([p1, p2]);
    });
  });

  // ─── finish() ─────────────────────────────────────────────────────────────

  describe('finish()', () => {
    it('navigue vers /dashboard', () => {
      component.finish();
      expect(navigateSpy).toHaveBeenCalledWith(['/dashboard']);
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
