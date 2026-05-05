import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { firstValueFrom } from 'rxjs';
import { EventService } from '../../../core/events/event.service';
import { ToastService } from '../../../core/services/toast.service';
import { CalendarEntryService, CalendarEntryWithEvent } from '../../../core/calendar/calendar-entry.service';
import { Event, EventPosition } from '../../../models';

const MONTHS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

@Component({
  selector: 'app-day-detail',
  standalone: true,
  imports: [TuiIcon, SlicePipe],
  templateUrl: './day-detail.component.html',
})
export class DayDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventService = inject(EventService);
  private readonly calendarEntryService = inject(CalendarEntryService);
  private readonly toast = inject(ToastService);

  calendarId = '';
  date = '';       // full YYYY-MM-DD (calendar publication date)
  mmdd = '';       // 'MM-DD' used to look up matching historical events

  /** All historical events in the library that share this MM-DD (any year). */
  readonly libraryEvents = signal<Event[]>([]);

  /** Current calendar_entries for this calendar + mmdd. */
  readonly entries = signal<CalendarEntryWithEvent[]>([]);

  /** Event ID chosen for position 1 in the UI (may differ from saved state). */
  readonly selectedPos1 = signal<string | null>(null);
  /** Event ID chosen for position 2 in the UI. */
  readonly selectedPos2 = signal<string | null>(null);

  readonly saveLoading = signal(false);

  readonly event1 = computed(() => this.libraryEvents().find(e => e.id === this.selectedPos1()) ?? null);
  readonly event2 = computed(() => this.libraryEvents().find(e => e.id === this.selectedPos2()) ?? null);

  readonly dateLabel = computed(() => {
    const parts = this.date.split('-');
    if (parts.length !== 3) return this.date;
    const d = parseInt(parts[2], 10);
    const m = parseInt(parts[1], 10) - 1;
    const y = parseInt(parts[0], 10);
    return `${d} ${MONTHS_FR[m]} ${y}`;
  });

  async ngOnInit(): Promise<void> {
    this.calendarId = this.route.snapshot.paramMap.get('calendarId') ?? '';
    this.date       = this.route.snapshot.paramMap.get('date') ?? '';
    this.mmdd       = this.date.slice(5); // 'MM-DD'

    const [libEvents, allEntries] = await Promise.all([
      firstValueFrom(this.eventService.listEventsByMmdd(this.mmdd)),
      firstValueFrom(this.calendarEntryService.getEntriesForCalendar(this.calendarId)),
    ]);

    this.libraryEvents.set(libEvents);

    const dayEntries = allEntries.filter(e => e.mmdd === this.mmdd);
    this.entries.set(dayEntries);

    this.selectedPos1.set(dayEntries.find(e => e.position === 1)?.event_id ?? null);
    this.selectedPos2.set(dayEntries.find(e => e.position === 2)?.event_id ?? null);
  }

  assign(eventId: string | null, position: EventPosition): void {
    if (position === 1) this.selectedPos1.set(eventId);
    else this.selectedPos2.set(eventId);
  }

  async save(): Promise<void> {
    if (this.saveLoading()) return;
    this.saveLoading.set(true);

    const ops: Promise<{ success: boolean; error?: string }>[] = [];
    const p1 = this.selectedPos1();
    const p2 = this.selectedPos2();

    if (p1) {
      ops.push(firstValueFrom(this.calendarEntryService.assignEvent(this.calendarId, this.mmdd, p1, 1)));
    } else {
      ops.push(firstValueFrom(this.calendarEntryService.unassignSlot(this.calendarId, this.mmdd, 1)));
    }
    if (p2) {
      ops.push(firstValueFrom(this.calendarEntryService.assignEvent(this.calendarId, this.mmdd, p2, 2)));
    } else {
      ops.push(firstValueFrom(this.calendarEntryService.unassignSlot(this.calendarId, this.mmdd, 2)));
    }

    const results = await Promise.all(ops);
    this.saveLoading.set(false);

    const failed = results.find(r => !r.success);
    if (failed) {
      this.toast.error(failed.error ?? 'Erreur lors de la sauvegarde des affectations.');
    } else {
      this.toast.success('Affectations sauvegardées.');
    }
  }

  goBack(): void {
    this.router.navigate(['/calendrier']);
  }
}
