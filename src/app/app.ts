import { TuiRoot } from '@taiga-ui/core';
import { Component, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/services/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TuiRoot],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class AppComponent {
  // Instantiate the theme service at boot so it applies the saved theme and
  // syncs Taiga's dark mode from the very first render (not just once the
  // shell loads).
  private readonly theme = inject(ThemeService);
  protected readonly title = signal('Day After Day');
}
