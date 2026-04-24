import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { authGuard } from './auth.guard';
import { SupabaseService } from '../supabase/supabase.service';

describe('authGuard', () => {
  let router: jasmine.SpyObj<Router>;
  let supabase: jasmine.SpyObj<SupabaseService>;

  beforeEach(() => {
    router = jasmine.createSpyObj('Router', ['navigate']);
    supabase = jasmine.createSpyObj('SupabaseService', ['getSession']);

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: SupabaseService, useValue: supabase },
      ],
    });
  });

  it('returns true when a session exists', async () => {
    supabase.getSession.and.resolveTo({ user: { id: 'u1' } } as any);

    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as any, {} as any),
    );

    expect(result).toBeTrue();
  });

  it('navigates to /login and returns false when no session', async () => {
    supabase.getSession.and.resolveTo(null);

    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as any, {} as any),
    );

    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    expect(result).toBeFalse();
  });
});
