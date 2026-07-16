import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { first } from 'rxjs/operators';
import { AuthService } from '../../core/auth/auth.service';
import { CalendarService, CalendarSummary } from '../../core/calendar/calendar.service';
import {
  CalendarEntryService,
  CalendarEntryWithEvent,
} from '../../core/calendar/calendar-entry.service';
import {
  RecommendationService,
  PresidencyRecommendationWithEvent,
} from '../../core/presidency/recommendation.service';
import { APPLY_TIER } from '../../core/utils/labels.utils';
import { CuratorWorkspaceComponent } from './curator-workspace.component';
import { PendingListComponent } from './pending-list.component';

@Component({
  selector: 'app-recommandations',
  standalone: true,
  imports: [CommonModule, CuratorWorkspaceComponent, PendingListComponent],
  templateUrl: './recommandations.component.html',
  styleUrl: './recommandations.component.scss',
})
export class RecommandationsComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly calendarService = inject(CalendarService);
  private readonly calendarEntryService = inject(CalendarEntryService);
  private readonly recommendationService = inject(RecommendationService);

  readonly canManageRecommendations = toSignal(this.authService.hasRoleAtLeast('presidence'), {
    initialValue: false,
  });

  readonly canApply = toSignal(this.authService.hasRoleAtLeast(APPLY_TIER), {
    initialValue: false,
  });

  readonly calendars = signal<CalendarSummary[]>([]);
  readonly selectedCalendarId = signal<string>('');
  readonly loading = signal(true);

  readonly recommendations = signal<PresidencyRecommendationWithEvent[]>([]);
  readonly existingEntries = signal<CalendarEntryWithEvent[]>([]);

  readonly selectedCalendar = () =>
    this.calendars().find((c) => c.id === this.selectedCalendarId());

  async ngOnInit(): Promise<void> {
    // The Curateur now has a dedicated area — steer her there without
    // blocking the page load for every other role (owner keeps this view).
    void firstValueFrom(this.authService.currentRole$.pipe(first((r) => r != null)))
      .then((role) => {
        if (role === 'presidence') void this.router.navigateByUrl('/curation');
      })
      .catch(() => {});

    this.loading.set(true);
    const calendars = await firstValueFrom(this.calendarService.listCalendars());
    this.calendars.set(calendars);
    if (calendars.length > 0) {
      const currentYear = new Date().getFullYear();
      const match = calendars.find((c) => c.year === currentYear) ?? calendars[0];
      await this.selectCalendar(match.id);
    } else {
      this.loading.set(false);
    }
  }

  async selectCalendar(calendarId: string): Promise<void> {
    if (!calendarId) return;
    this.selectedCalendarId.set(calendarId);
    this.loading.set(true);
    const [recs, entries] = await Promise.all([
      firstValueFrom(this.recommendationService.listByCalendar(calendarId)),
      firstValueFrom(this.calendarEntryService.getEntriesForCalendar(calendarId)),
    ]);
    this.recommendations.set(recs);
    this.existingEntries.set(entries);
    this.loading.set(false);
  }
}
