import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom, of } from 'rxjs';
import { onboardingGuard } from './onboarding.guard';
import { OnboardingService } from './onboarding.service';

describe('onboardingGuard', () => {
  let router: jasmine.SpyObj<Router>;

  function setup(shouldGo: boolean) {
    router = jasmine.createSpyObj('Router', ['createUrlTree']);
    router.createUrlTree.and.callFake((cmds: any[]) => cmds as any);

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        {
          provide: OnboardingService,
          useValue: { shouldGoToOnboarding: () => of(shouldGo) },
        },
      ],
    });
  }

  it('redirects to /espaces when owner has no workspace yet', async () => {
    setup(true);
    const result = await firstValueFrom(
      TestBed.runInInjectionContext(() => onboardingGuard({} as any, {} as any)) as any,
    );
    expect(result).toEqual(['/espaces']);
  });

  it('returns true when no onboarding is required', async () => {
    setup(false);
    const result = await firstValueFrom(
      TestBed.runInInjectionContext(() => onboardingGuard({} as any, {} as any)) as any,
    );
    expect(result).toBeTrue();
  });
});
