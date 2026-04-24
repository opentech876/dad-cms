import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user = await firstValueFrom(authService.getCurrentUser());

  if (user) {
    return true;
  }

  // Style de redirection que tu aimais
  router.navigate(['/login']);
  return false;
};
