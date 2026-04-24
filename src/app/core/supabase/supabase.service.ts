import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  private supabase: SupabaseClient;

  private currentUserSubject = new BehaviorSubject<User | null>(null);
  private currentSessionSubject = new BehaviorSubject<Session | null>(null);

  public currentUser$ = this.currentUserSubject.asObservable();
  public currentSession$ = this.currentSessionSubject.asObservable();

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
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

  /** Appelle une Edge Function */
  invoke<T = any>(functionName: string, body?: any): Promise<{ data: T | null; error: any }> {
    return this.supabase.functions.invoke(functionName, { body });
  }
}
