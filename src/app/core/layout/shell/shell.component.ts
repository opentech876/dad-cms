import { Component, inject, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { filter, firstValueFrom } from 'rxjs';
import { AuthService } from '../../auth/auth.service';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TuiIcon],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent implements OnInit {
  private auth = inject(AuthService);

  userEmail = '';

  async ngOnInit(): Promise<void> {
    const user = await firstValueFrom(this.auth.getCurrentUser().pipe(filter(Boolean)));
    this.userEmail = user.email ?? '';
  }

  logout(): void {
    this.auth.signOut().subscribe();
  }
}
