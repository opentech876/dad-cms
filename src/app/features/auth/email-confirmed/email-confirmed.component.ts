import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-email-confirmed',
  standalone: true,
  imports: [TuiIcon, RouterLink],
  templateUrl: './email-confirmed.component.html',
  styleUrl: './email-confirmed.component.scss',
})
export class EmailConfirmedComponent {}
