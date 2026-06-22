import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase/supabase.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent implements OnInit {
  private supabase = inject(SupabaseService);
  private router = inject(Router);

  readonly isInitialized = signal(false);
  readonly isLoading = signal(true);

  readonly todayDay = new Date().getDate();
  readonly todayMonth = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  async ngOnInit(): Promise<void> {
    // '/' is now a pure redirector: logged-in users go to dashboard,
    // everyone else goes straight to /login. The landing copy is no longer shown.
    // (This route is still hit by the post-magic-link Supabase redirect.)
    const { data: { session } } = await this.supabase.client.auth.getSession();
    this.router.navigate([session ? '/dashboard' : '/login']);
  }
}
