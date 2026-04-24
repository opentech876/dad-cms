import { Injectable } from '@angular/core';
import {
  AuthChangeEvent,
  createClient,
  Session,
  SupabaseClient,
  User,
} from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { AppRole, WorkspaceSummary } from '../../models';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  get client(): SupabaseClient {
    return this.supabase;
  }

  authChanges(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    return this.supabase.auth.onAuthStateChange(callback);
  }

  async getSession(): Promise<Session | null> {
    const { data } = await this.supabase.auth.getSession();
    return data.session;
  }

  async getUser(): Promise<User | null> {
    const { data } = await this.supabase.auth.getUser();
    return data.user ?? null;
  }

  signIn(email: string, password: string) {
    return this.supabase.auth.signInWithPassword({ email, password });
  }

  signInWithOtp(email: string) {
    return this.supabase.auth.signInWithOtp({ email });
  }

  signOut() {
    return this.supabase.auth.signOut();
  }

  async getUserRole(userId: string): Promise<AppRole | null> {
    const { data, error } = await this.supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .single();
    if (error || !data) return null;
    return data.role as AppRole;
  }

  async getWorkspaceSummaries(): Promise<WorkspaceSummary[]> {
    const { data: workspaces, error } = await this.supabase
      .from('workspaces')
      .select('id, name, logo_path');
    if (error || !workspaces) return [];

    const { count: memberCount } = await this.supabase
      .from('user_roles')
      .select('*', { count: 'exact', head: true });

    return workspaces.map((ws) => ({
      id: ws.id,
      name: ws.name,
      logo_path: ws.logo_path ?? null,
      member_count: memberCount ?? 0,
      last_accessed_at: null,
    }));
  }
}
