import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { ReplaySubject } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private supabase: SupabaseClient;

  /**
   * ReplaySubject (buffer 1) so subscribers that arrive before the first
   * session is hydrated from localStorage don't see a misleading `null`.
   * Guards that `take(1)` will wait until the real session state is known.
   */
  private currentUserSubject = new ReplaySubject<User | null>(1);
  private currentSessionSubject = new ReplaySubject<Session | null>(1);

  public currentUser$ = this.currentUserSubject.asObservable();
  public currentSession$ = this.currentSessionSubject.asObservable();

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        // Bypass navigator.locks to avoid LockAcquireTimeoutError in single-tab CMS usage
        lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => fn(),
      },
    });

    // Eagerly hydrate from localStorage so the *first* emission reflects
    // the real session, not a stale null. supabase-js also dispatches an
    // INITIAL_SESSION event via onAuthStateChange, but that may race with
    // route guards on cold page-loads — so we push explicitly here too.
    this.supabase.auth.getSession().then(({ data: { session } }) => {
      this.currentSessionSubject.next(session);
      this.currentUserSubject.next(session?.user ?? null);
    });

    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.currentSessionSubject.next(session);
      this.currentUserSubject.next(session?.user ?? null);
    });
  }

  get client(): SupabaseClient {
    return this.supabase;
  }

  async sendOtp(email: string, shouldCreateUser: boolean = true) {
    return this.supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser },
    });
  }

  // async verifyOtp(email: string, token: string, type: 'signup' | 'email' = 'signup') {
  //   return this.supabase.auth.verifyOtp({
  //     email,
  //     token,
  //     type,
  //   });
  // }
  async verifyOtp(email: string, token: string, type: 'signup' | 'email' = 'signup') {
    // BYPASS DÉVELOPPEMENT - enlève ça en production
    if (environment.bypassOtp) {
      console.log('🚀 [DEV BYPASS] OTP vérifié automatiquement');
      return { data: { user: { email } }, error: null };
    }

    return this.supabase.auth.verifyOtp({
      email,
      token,
      type,
    });
  }

  async isAppInitialized(): Promise<boolean> {
    const { data, error } = await this.supabase.rpc('is_app_initialized');
    if (error) return false;
    return !!data;
  }

  async signOut() {
    return this.supabase.auth.signOut();
  }

  /**
   * Password-based sign-in. Faster than OTP for users who have set a password
   * (avoids the email round-trip — important on the Supabase free plan which
   * limits us to 2 auth emails per hour).
   */
  async signInWithPassword(email: string, password: string) {
    return this.supabase.auth.signInWithPassword({ email, password });
  }

  /**
   * Set or change the password for the currently-authenticated user. Used
   * from /profil (existing users backfilling a password) and from the shell
   * profile-setup modal (invited members on first login).
   */
  async updatePassword(newPassword: string) {
    return this.supabase.auth.updateUser({ password: newPassword });
  }

  /**
   * True if the current user has a password set. We can't directly read
   * `auth.users.encrypted_password` from the client; instead we attempt a
   * harmless re-auth via signInWithPassword with a deliberately wrong
   * password — Supabase responds with a distinct error code for "no
   * password set" vs "wrong password". Cheaper alternative: store a flag
   * client-side after the first successful update. We use the cheap flag.
   */
  async hasPasswordSet(): Promise<boolean> {
    return localStorage.getItem('dad-has-password') === '1';
  }

  /** Persist the "user has a password" flag after a successful set/change. */
  markPasswordSet(): void {
    localStorage.setItem('dad-has-password', '1');
  }

  /**
   * Send a password-reset e-mail. Supabase mails a link that redirects to
   * /reinitialiser-mot-de-passe where the user can pick a new password.
   */
  async resetPasswordForEmail(email: string) {
    return this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reinitialiser-mot-de-passe`,
    });
  }

  /**
   * Request an e-mail address change for the current user. Supabase sends a
   * confirmation link to the NEW address (and to the old one too when
   * "Secure email change" is enabled in the dashboard). Clicking the link
   * lands on /email-confirme and Supabase swaps `auth.users.email`.
   */
  async updateEmail(newEmail: string) {
    return this.supabase.auth.updateUser(
      { email: newEmail },
      { emailRedirectTo: `${window.location.origin}/email-confirme` },
    );
  }

  /**
   * Update the secondary recovery e-mail stored in user_metadata. This is a
   * global per-user field (not per-workspace) used by the lost-password flow
   * to find the account when the primary e-mail is unreachable.
   */
  async updateSecondaryEmail(secondaryEmail: string | null) {
    return this.supabase.auth.updateUser({
      data: { secondary_email: secondaryEmail || null },
    });
  }

  // ── MFA / 2FA ─────────────────────────────────────────────────────────
  // Thin wrappers around supabase.auth.mfa for TOTP factors. Enrollment is
  // a two-step dance: enrollTotp() returns a QR code + secret; the user
  // scans, then verifyTotpEnrollment() confirms with a code from their app.
  // Once verified, every subsequent sign-in needs a TOTP code to reach AAL2.

  /** Start TOTP enrollment. Returns the factor id + a QR code data URL + secret. */
  async enrollTotp(friendlyName?: string) {
    return this.supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: friendlyName || 'Authenticator',
    });
  }

  /** Confirm enrollment by submitting a 6-digit code from the authenticator app. */
  async verifyTotpEnrollment(factorId: string, code: string) {
    const { data: ch, error: chErr } = await this.supabase.auth.mfa.challenge({ factorId });
    if (chErr || !ch) return { data: null, error: chErr ?? new Error('Challenge échoué') };
    return this.supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code });
  }

  /** Issue a fresh challenge against an already-verified factor (login flow). */
  async challengeTotp(factorId: string) {
    return this.supabase.auth.mfa.challenge({ factorId });
  }

  /** Verify a TOTP code against an issued challenge (login flow). */
  async verifyTotpChallenge(factorId: string, challengeId: string, code: string) {
    return this.supabase.auth.mfa.verify({ factorId, challengeId, code });
  }

  /** Remove a TOTP factor from the current user. */
  async unenrollTotp(factorId: string) {
    return this.supabase.auth.mfa.unenroll({ factorId });
  }

  /** List all MFA factors registered on the current user. */
  async listMfaFactors() {
    return this.supabase.auth.mfa.listFactors();
  }

  /** Returns currentLevel (achieved this session) vs nextLevel (required for the user). */
  async getMfaAssuranceLevel() {
    return this.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  }

  async hasWorkspaceRole(): Promise<boolean> {
    const { data } = await this.supabase.from('user_roles').select('role').limit(1);
    return Array.isArray(data) && data.length > 0;
  }

  /** Appelle une Edge Function */
  async invoke<T = any>(functionName: string, body?: any): Promise<{ data: T | null; error: any }> {
    const result = await this.supabase.functions.invoke<T>(functionName, { body });
    if (result.error?.context) {
      try {
        const errorBody = await result.error.context.json();
        if (errorBody?.error) result.error.message = errorBody.error;
      } catch {
        // response not JSON or body already consumed
      }
    }
    return result;
  }
}
