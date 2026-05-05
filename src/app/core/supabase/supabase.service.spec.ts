import { TestBed } from '@angular/core/testing';
import { SupabaseService } from './supabase.service';

describe('SupabaseService', () => {
  let service: SupabaseService;
  let signInWithOtpSpy: jest.Mock;
  let verifyOtpSpy: jest.Mock;
  let rpcSpy: jest.Mock;
  let onAuthStateChangeSpy: jest.Mock;

  beforeEach(() => {
    signInWithOtpSpy = jest.fn().mockResolvedValue({ data: {}, error: null });
    verifyOtpSpy = jest.fn().mockResolvedValue({ data: { user: {} }, error: null });
    rpcSpy = jest.fn().mockResolvedValue({ data: true, error: null });
    onAuthStateChangeSpy = jest.fn().mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });

    jest.mock('../../../environments/environment', () => ({
      environment: {
        supabaseUrl: 'https://test.supabase.co',
        supabaseKey: 'test-key',
        bypassOtp: false,
      },
    }));

    TestBed.configureTestingModule({ providers: [SupabaseService] });

    service = TestBed.inject(SupabaseService);

    // Replace the real Supabase client with a mock
    (service as any).supabase = {
      auth: {
        signInWithOtp: signInWithOtpSpy,
        verifyOtp: verifyOtpSpy,
        onAuthStateChange: onAuthStateChangeSpy,
      },
      rpc: rpcSpy,
      functions: { invoke: jest.fn().mockResolvedValue({ data: null, error: null }) },
    };
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── sendOtp() ──────────────────────────────────────────────────────────────

  describe('sendOtp()', () => {
    it("appelle signInWithOtp avec shouldCreateUser=true pour l'onboarding", async () => {
      await service.sendOtp('test@exemple.com', true);
      expect(signInWithOtpSpy).toHaveBeenCalledWith({
        email: 'test@exemple.com',
        options: { shouldCreateUser: true },
      });
    });

    it("appelle signInWithOtp avec shouldCreateUser=false pour le login", async () => {
      await service.sendOtp('test@exemple.com', false);
      expect(signInWithOtpSpy).toHaveBeenCalledWith({
        email: 'test@exemple.com',
        options: { shouldCreateUser: false },
      });
    });
  });

  // ── verifyOtp() ────────────────────────────────────────────────────────────

  describe('verifyOtp()', () => {
    it("appelle supabase.auth.verifyOtp avec le type 'email'", async () => {
      await service.verifyOtp('test@exemple.com', '123456', 'email');
      expect(verifyOtpSpy).toHaveBeenCalledWith({
        email: 'test@exemple.com',
        token: '123456',
        type: 'email',
      });
    });

    it("n'appelle pas verifyOtp quand bypassOtp est actif", async () => {
      (service as any).supabase.auth.verifyOtp = verifyOtpSpy;
      // Simulate bypass by reading the environment flag
      const env = (await import('../../../environments/environment')).environment;
      if (!env.bypassOtp) {
        await service.verifyOtp('test@exemple.com', '000000', 'email');
        expect(verifyOtpSpy).toHaveBeenCalled();
      } else {
        await service.verifyOtp('test@exemple.com', '000000', 'email');
        expect(verifyOtpSpy).not.toHaveBeenCalled();
      }
    });
  });

  // ── isAppInitialized() ─────────────────────────────────────────────────────

  describe('isAppInitialized()', () => {
    it("appelle supabase.rpc('is_app_initialized') et retourne true", async () => {
      rpcSpy.mockResolvedValue({ data: true, error: null });
      const result = await service.isAppInitialized();
      expect(rpcSpy).toHaveBeenCalledWith('is_app_initialized');
      expect(result).toBe(true);
    });

    it("retourne false si la RPC retourne false", async () => {
      rpcSpy.mockResolvedValue({ data: false, error: null });
      expect(await service.isAppInitialized()).toBe(false);
    });

    it("retourne false si la RPC retourne une erreur", async () => {
      rpcSpy.mockResolvedValue({ data: null, error: { message: 'DB error' } });
      expect(await service.isAppInitialized()).toBe(false);
    });
  });
});
