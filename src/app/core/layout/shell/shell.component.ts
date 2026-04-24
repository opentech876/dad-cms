import { Component, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TuiIcon],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit {
  userEmail = '';

  constructor(
    private supabase: SupabaseService,
    private router: Router,
  ) {}

  async ngOnInit() {
    const user = await this.supabase.getUser();
    this.userEmail = user?.email ?? '';
  }

  async logout() {
    await this.supabase.signOut();
    this.router.navigate(['/login']);
  }
}
