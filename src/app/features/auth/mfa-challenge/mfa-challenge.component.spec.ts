import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router } from '@angular/router';
import { MfaChallengeComponent } from './mfa-challenge.component';
import { SupabaseService } from '../../../core/supabase/supabase.service';

describe('MfaChallengeComponent', () => {
  let component: MfaChallengeComponent;
  let fixture: ComponentFixture<MfaChallengeComponent>;
  let mockSupabase: any;
  let mockRouter: { navigate: jest.Mock };

  beforeEach(async () => {
    mockSupabase = {
      listMfaFactors:       jest.fn().mockResolvedValue({
        data: { totp: [{ id: 'f1', status: 'verified' }], phone: [] },
        error: null,
      }),
      challengeTotp:        jest.fn().mockResolvedValue({ data: { id: 'ch1' }, error: null }),
      verifyTotpChallenge:  jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }),
    };
    mockRouter = { navigate: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [MfaChallengeComponent],
      providers: [
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: Router,          useValue: mockRouter },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();
    TestBed.overrideComponent(MfaChallengeComponent, { set: { template: '' } });
    fixture = TestBed.createComponent(MfaChallengeComponent);
    component = fixture.componentInstance;
  });

  it('charge le facteur TOTP au démarrage', async () => {
    await component.ngOnInit();
    expect(component.factorId()).toBe('f1');
  });

  it("redirige vers /login s'il n'y a pas de facteur TOTP vérifié", async () => {
    mockSupabase.listMfaFactors.mockResolvedValueOnce({ data: { totp: [], phone: [] }, error: null });
    await component.ngOnInit();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/login']);
  });

  describe('submit()', () => {
    beforeEach(async () => { await component.ngOnInit(); });

    it("rejette un code trop court", async () => {
      component.code.set('123');
      await component.submit();
      expect(mockSupabase.challengeTotp).not.toHaveBeenCalled();
    });

    it("appelle challenge puis verify et navigue vers /dashboard", async () => {
      component.code.set('123456');
      await component.submit();
      expect(mockSupabase.challengeTotp).toHaveBeenCalledWith('f1');
      expect(mockSupabase.verifyTotpChallenge).toHaveBeenCalledWith('f1', 'ch1', '123456');
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/dashboard']);
    });

    it("affiche une erreur si le code est invalide", async () => {
      mockSupabase.verifyTotpChallenge.mockResolvedValueOnce({ data: null, error: { message: 'Invalid code' } });
      component.code.set('999999');
      await component.submit();
      expect(component.errorMessage()).toBeTruthy();
    });
  });
});
