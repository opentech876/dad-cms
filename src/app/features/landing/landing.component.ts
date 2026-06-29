import { Component, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from '../../core/supabase/supabase.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss',
})
export class LandingComponent implements OnInit {
  private supabase = inject(SupabaseService);
  private router = inject(Router);

  async ngOnInit(): Promise<void> {
    // '/' is a pure redirector: logged-in users go to dashboard, everyone
    // else goes straight to /login. The landing copy is never rendered.
    // (This route is still hit by the post-magic-link Supabase redirect.)
    const { data: { session } } = await this.supabase.client.auth.getSession();
    this.router.navigate([session ? '/dashboard' : '/login']);
  }
}
