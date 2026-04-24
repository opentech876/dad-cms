import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
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

  isInitialized = false;
  isLoading = true;

  async ngOnInit(): Promise<void> {
    this.isInitialized = await this.supabase.isAppInitialized();
    this.isLoading = false;
  }
}
