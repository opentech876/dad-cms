import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs/operators';
import { OnboardingService } from './onboarding.service';

export const onboardingGuard: CanActivateFn = () => {
  const onboarding = inject(OnboardingService);
  const router = inject(Router);

  return onboarding.shouldGoToOnboarding().pipe(
    take(1),
    map((shouldGo) => (shouldGo ? router.createUrlTree(['/espaces']) : true)),
  );
};
