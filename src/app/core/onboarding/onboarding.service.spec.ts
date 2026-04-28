import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, firstValueFrom, of } from 'rxjs';
import { OnboardingService } from './onboarding.service';
import { AuthService } from '../auth/auth.service';
import { WorkspaceService } from '../workspace/workspace.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('OnboardingService', () => {
  let service: OnboardingService;
  let isOwnerSubject: BehaviorSubject<boolean>;
  let hasWorkspaceSubject: BehaviorSubject<boolean>;
  let mockAuthService: any;
  let mockWorkspaceService: any;
  let mockSupabaseService: any;

  beforeEach(() => {
    isOwnerSubject = new BehaviorSubject<boolean>(false);
    hasWorkspaceSubject = new BehaviorSubject<boolean>(false);

    mockAuthService = { isOwner: jest.fn().mockReturnValue(isOwnerSubject.asObservable()) };
    mockWorkspaceService = {
      hasWorkspace: jest.fn().mockReturnValue(hasWorkspaceSubject.asObservable()),
      createWorkspace: jest.fn().mockReturnValue(of({ success: true, workspaceId: 'ws-1' })),
    };
    mockSupabaseService = { client: { rpc: jest.fn().mockResolvedValue({ data: null, error: null }) } };

    TestBed.configureTestingModule({
      providers: [
        OnboardingService,
        { provide: AuthService, useValue: mockAuthService },
        { provide: WorkspaceService, useValue: mockWorkspaceService },
        { provide: SupabaseService, useValue: mockSupabaseService },
      ],
    });

    service = TestBed.inject(OnboardingService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── shouldGoToOnboarding() ─────────────────────────────────────────────────

  describe('shouldGoToOnboarding()', () => {
    it("retourne true quand l'utilisateur est owner ET qu'il n'a pas de workspace", async () => {
      isOwnerSubject.next(true);
      hasWorkspaceSubject.next(false);
      expect(await firstValueFrom(service.shouldGoToOnboarding())).toBe(true);
    });

    it("retourne false quand l'utilisateur n'est pas owner", async () => {
      isOwnerSubject.next(false);
      hasWorkspaceSubject.next(false);
      expect(await firstValueFrom(service.shouldGoToOnboarding())).toBe(false);
    });

    it("retourne false quand l'utilisateur a déjà un workspace", async () => {
      isOwnerSubject.next(true);
      hasWorkspaceSubject.next(true);
      expect(await firstValueFrom(service.shouldGoToOnboarding())).toBe(false);
    });
  });

  // ── completeOnboarding() ───────────────────────────────────────────────────

  describe('completeOnboarding()', () => {
    it('appelle workspaceService.createWorkspace avec le nom fourni', async () => {
      await firstValueFrom(service.completeOnboarding('Mon Workspace'));
      expect(mockWorkspaceService.createWorkspace).toHaveBeenCalledWith('Mon Workspace');
    });

    it('retourne le résultat de createWorkspace', async () => {
      const result = await firstValueFrom(service.completeOnboarding('Mon Workspace'));
      expect(result.success).toBe(true);
      expect(result.workspaceId).toBe('ws-1');
    });

    it("utilise 'Day After Day' comme nom par défaut si aucun nom n'est fourni", async () => {
      await firstValueFrom(service.completeOnboarding());
      expect(mockWorkspaceService.createWorkspace).toHaveBeenCalledWith('Day After Day');
    });
  });
});
