import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { authGuard } from './auth.guard';
import { SupabaseService } from '../supabase/supabase.service';

describe('authGuard', () => {
  let router: { navigate: jest.Mock };
  let supabase: { client: { auth: { getSession: jest.Mock } } };

  beforeEach(() => {
    router = { navigate: jest.fn() };
    supabase = { client: { auth: { getSession: jest.fn() } } };

    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: SupabaseService, useValue: supabase },
      ],
    });
  });

  it('returns true when a session exists', async () => {
    supabase.client.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
    });

    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as any, {} as any),
    );

    expect(result).toBe(true);
  });

  it('navigates to /login and returns false when no session', async () => {
    supabase.client.auth.getSession.mockResolvedValue({ data: { session: null } });

    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as any, {} as any),
    );

    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    expect(result).toBe(false);
  });
});
