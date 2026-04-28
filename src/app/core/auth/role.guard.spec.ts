import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router } from '@angular/router';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { roleGuard } from './role.guard';
import { AuthService } from './auth.service';
import { AppRole } from '../../models';

describe('roleGuard', () => {
  let roleSubject: BehaviorSubject<AppRole | null>;

  function route(requiredRoles: AppRole[]): ActivatedRouteSnapshot {
    return { data: { requiredRoles } } as any;
  }

  async function run(requiredRoles: AppRole[]): Promise<any> {
    return firstValueFrom(
      TestBed.runInInjectionContext(() => roleGuard(route(requiredRoles), {} as any)) as any,
    );
  }

  beforeEach(() => {
    roleSubject = new BehaviorSubject<AppRole | null>(null);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { currentRole$: roleSubject.asObservable() } },
        { provide: Router, useValue: { createUrlTree: (cmds: any[]) => cmds } },
      ],
    });
  });

  it('redirects to /login when the user has no role', async () => {
    roleSubject.next(null);
    expect(await run(['editeur'])).toEqual(['/login']);
  });

  it('allows owner through any protected route', async () => {
    roleSubject.next('owner');
    expect(await run(['editeur'])).toBe(true);
  });

  it('allows a role that is listed in requiredRoles', async () => {
    roleSubject.next('editeur');
    expect(await run(['editeur', 'chef_equipe'])).toBe(true);
  });

  it('redirects to /dashboard when role is not in requiredRoles', async () => {
    roleSubject.next('editeur');
    expect(await run(['charge_communication'])).toEqual(['/dashboard']);
  });

  it('allows any authenticated role when requiredRoles is empty', async () => {
    roleSubject.next('charge_communication');
    expect(await run([])).toBe(true);
  });
});
