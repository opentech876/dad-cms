import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';

type CalendarView = 'year' | 'month' | 'list';

export interface Calendar {
  id: string;
  year: number;
  name: string;
  status: 'published' | 'draft' | 'archived';
  eventCount: number;
  campaignCount: number;
  fillPct: number;
}

interface DayCell {
  d: number | null;
  isToday: boolean;
  totalEvents: number;
  pinnedCount: 0 | 1 | 2;
  title: string | null;
  ad: boolean;
}

interface HeatmapCell { d: number | null; intensity: 0 | 1 | 2 | 3; }
interface HeatmapMonth { label: string; mi: number; cells: HeatmapCell[]; pct: number; dow: string[]; }

interface DateRow {
  day: number;
  month: number;
  date: string;
  dow: string;
  totalEvents: number;
  pinnedCount: 0 | 1 | 2;
  title: string | null;
  sub: string | null;
  ad: string;
  status: 'published' | 'draft' | 'empty';
}

export interface DayEvent {
  id: string;
  historicalYear: number;
  title: string;
  description: string;
  hasImage: boolean;
  imageSizeKb: number;
  charCount: number;
  status: 'published' | 'draft';
  displayPosition: 1 | 2 | null;
}

export interface DayCampaign {
  id: string;
  name: string;
  advertiser: string;
  color: string;
  textColor: string;
  status: 'active' | 'scheduled';
}

export interface DayDetailData {
  day: number;
  month: number;
  year: number;
  dayOfWeek: string;
  events: DayEvent[];
  campaigns: DayCampaign[];
}

const MONTHS_FR       = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const MONTHS_FR_CAP   = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const MONTHS_FR_SHORT = ['Jan','Fév','Mar','Avr','Mai','Jun','Juil','Aoû','Sep','Oct','Nov','Déc'];
const DOW_SHORT       = ['L','M','M','J','V','S','D'];
const DOW_LONG        = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const DAYS_FR         = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const EVENT_TITLES    = [
  'Indépendance de la République du Congo',
  'Naissance de Marien Ngouabi',
  'Conférence nationale souveraine',
  "Création de l'AEF à Brazzaville",
  'Festival panafricain de Brazzaville',
  'Premier Conseil des ministres',
  'Inauguration du chemin de fer Congo-Océan',
  'Création du Parti Congolais du Travail',
  "Sommet de l'OUA à Brazzaville",
  'Discours de la réconciliation nationale',
];
const HIST_YEARS      = [1910, 1934, 1938, 1960, 1963, 1969, 1977, 1991, 1992, 1997, 2002, 2016];
const DESCRIPTIONS    = [
  'Le Congo accède à l\'indépendance, mettant fin à la période coloniale française. Le pays devient officiellement la République du Congo, avec Fulbert Youlou comme premier président.',
  'Réunion inaugurale du gouvernement provisoire à Brazzaville. Le Conseil adopte les premières mesures administratives de la jeune République, dont la définition des emblèmes nationaux.',
  'La conférence rassemble l\'ensemble des forces politiques et sociales du pays pour définir le cadre d\'une transition démocratique. Elle aboutira à l\'adoption d\'une nouvelle constitution.',
];
const SAMPLE_CAMPAIGNS: DayCampaign[] = [
  { id: 'c1', name: 'MTN Forfait étudiant', advertiser: 'MTN Congo',     color: '#FFC72C', textColor: '#1f1a14', status: 'active'    },
  { id: 'c2', name: 'Tontine+',             advertiser: 'SG Congo',      color: '#E60028', textColor: '#ffffff', status: 'active'    },
  { id: 'c3', name: 'Stations Congo',       advertiser: 'TotalEnergies', color: '#D60000', textColor: '#ffffff', status: 'scheduled' },
];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}
function dowMondayFirst(year: number, month: number, day: number): number {
  return (new Date(year, month, day).getDay() + 6) % 7;
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [TuiIcon],
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.scss',
})
export class CalendarComponent {
  private readonly router = inject(Router);

  readonly monthsFr      = MONTHS_FR;
  readonly monthsFrCap   = MONTHS_FR_CAP;
  readonly monthsFrShort = MONTHS_FR_SHORT;
  readonly dowShort      = DOW_SHORT;
  readonly dowLong       = DOW_LONG;
  readonly viewOptions: { id: CalendarView; label: string }[] = [
    { id: 'year', label: 'Année' },
    { id: 'month', label: 'Mois' },
    { id: 'list', label: 'Liste' },
  ];
  readonly filterChips = ['Toutes les dates', '2 affichés', '1 affiché', 'Vide', 'Avec campagne'];

  private readonly _today = new Date();
  readonly currentYear  = this._today.getFullYear();
  readonly currentMonth = this._today.getMonth();
  readonly todayDate    = this._today.getDate();

  // ── Calendars ─────────────────────────────────────
  readonly calendars = signal<Calendar[]>([
    { id: '1', year: 2024, name: 'Calendrier 2024', status: 'archived',  eventCount: 412, campaignCount:  8, fillPct: 85 },
    { id: '2', year: 2025, name: 'Calendrier 2025', status: 'published', eventCount: 487, campaignCount: 12, fillPct: 67 },
    { id: '3', year: 2026, name: 'Calendrier 2026', status: 'draft',     eventCount: 124, campaignCount:  3, fillPct: 34 },
  ]);

  readonly selectedCalendarId = signal('2');

  readonly sortedCalendars = computed(() =>
    [...this.calendars()].sort((a, b) => a.year - b.year)
  );

  readonly selectedCalendar = computed(() =>
    this.calendars().find(c => c.id === this.selectedCalendarId()) ?? this.calendars()[0]
  );

  readonly canPrevCalendar = computed(() =>
    this.sortedCalendars().findIndex(c => c.id === this.selectedCalendarId()) > 0
  );

  readonly canNextCalendar = computed(() => {
    const sorted = this.sortedCalendars();
    const idx = sorted.findIndex(c => c.id === this.selectedCalendarId());
    return idx < sorted.length - 1;
  });

  readonly availableYears = computed(() => {
    const taken = new Set(this.calendars().map(c => c.year));
    return Array.from({ length: 10 }, (_, i) => this.currentYear - 2 + i).filter(y => !taken.has(y));
  });

  // ── View state ────────────────────────────────────
  readonly view          = signal<CalendarView>('month');
  readonly selectedYear  = signal(this.currentYear);
  readonly selectedMonth = signal(this.currentMonth);
  readonly activeFilter  = signal(0);

  // ── Calendar navigation ───────────────────────────
  selectCalendar(id: string): void {
    this.selectedCalendarId.set(id);
    const cal = this.calendars().find(c => c.id === id);
    if (cal) this.selectedYear.set(cal.year);
    this.selectedDay.set(null);
  }

  prevCalendar(): void {
    const sorted = this.sortedCalendars();
    const idx = sorted.findIndex(c => c.id === this.selectedCalendarId());
    if (idx > 0) this.selectCalendar(sorted[idx - 1].id);
  }

  nextCalendar(): void {
    const sorted = this.sortedCalendars();
    const idx = sorted.findIndex(c => c.id === this.selectedCalendarId());
    if (idx < sorted.length - 1) this.selectCalendar(sorted[idx + 1].id);
  }

  prevMonth(): void { this.selectedMonth.update(m => Math.max(0, m - 1)); }
  nextMonth(): void { this.selectedMonth.update(m => Math.min(11, m + 1)); }
  pickMonth(mi: number): void { this.selectedMonth.set(mi); this.view.set('month'); }

  // ── Day detail ────────────────────────────────────
  readonly selectedDay      = signal<{ day: number; month: number } | null>(null);
  readonly dayDetailCache   = signal<Record<string, DayDetailData>>({});

  readonly selectedDayDetail = computed((): DayDetailData | null => {
    const sel = this.selectedDay();
    if (!sel) return null;
    const year  = this.selectedCalendar().year;
    const calId = this.selectedCalendarId();
    const key   = `${sel.day}-${sel.month}-${calId}`;
    return this.dayDetailCache()[key] ?? this._generateDayDetail(sel.day, sel.month, year);
  });

  openDayDetail(day: number | null, month: number): void {
    if (day === null) return;
    this.selectedDay.set({ day, month });
  }

  closeDayDetail(): void {
    this.selectedDay.set(null);
  }

  navigateToPrevDay(): void {
    const sel = this.selectedDay();
    if (!sel) return;
    const { day, month } = sel;
    if (day > 1) {
      this.selectedDay.set({ day: day - 1, month });
    } else if (month > 0) {
      const prevMonth = month - 1;
      const lastDay = daysInMonth(this.selectedCalendar().year, prevMonth);
      this.selectedDay.set({ day: lastDay, month: prevMonth });
    }
  }

  navigateToNextDay(): void {
    const sel = this.selectedDay();
    if (!sel) return;
    const { day, month } = sel;
    const maxDay = daysInMonth(this.selectedCalendar().year, month);
    if (day < maxDay) {
      this.selectedDay.set({ day: day + 1, month });
    } else if (month < 11) {
      this.selectedDay.set({ day: 1, month: month + 1 });
    }
  }

  // ── Pin / Unpin ───────────────────────────────────
  pinEvent(eventId: string, position: 1 | 2): void {
    const sel = this.selectedDay();
    const detail = this.selectedDayDetail();
    if (!sel || !detail) return;
    const key = `${sel.day}-${sel.month}-${this.selectedCalendarId()}`;
    const events = detail.events.map((ev): DayEvent => ({
      ...ev,
      displayPosition:
        ev.id === eventId ? position :
        ev.displayPosition === position ? null :
        ev.displayPosition,
    }));
    this.dayDetailCache.update(c => ({ ...c, [key]: { ...detail, events } }));
  }

  unpinEvent(eventId: string): void {
    const sel = this.selectedDay();
    const detail = this.selectedDayDetail();
    if (!sel || !detail) return;
    const key = `${sel.day}-${sel.month}-${this.selectedCalendarId()}`;
    const events = detail.events.map((ev): DayEvent => ({
      ...ev,
      displayPosition: ev.id === eventId ? null : ev.displayPosition,
    }));
    this.dayDetailCache.update(c => ({ ...c, [key]: { ...detail, events } }));
  }

  // ── Navigation shortcuts ──────────────────────────
  editEvent(_eventId: string): void {
    this.router.navigate(['/evenements']);
  }

  addEventForDay(): void {
    this.router.navigate(['/evenements']);
  }

  editCampaign(_campaignId: string): void {
    this.router.navigate(['/campagnes']);
  }

  // ── Helpers ───────────────────────────────────────
  statusBadgeClass(status: Calendar['status']): string {
    return { published: 'badge-success', draft: 'badge-warning', archived: '' }[status];
  }

  statusLabel(status: Calendar['status']): string {
    return { published: 'Publié', draft: 'Brouillon', archived: 'Archivé' }[status];
  }

  calLabel(cal: Calendar): string {
    return `${cal.year} — ${cal.name}`;
  }

  intensityBg(intensity: 0 | 1 | 2 | 3): string {
    return ['var(--bg-sunken)', 'var(--accent-2-soft)', 'var(--accent-2)', 'var(--accent)'][intensity];
  }

  pinnedCount(events: DayEvent[]): number {
    return events.filter(e => e.displayPosition !== null).length;
  }

  dayDetailHeadline(events: DayEvent[]): string {
    const pinned = events.filter(e => e.displayPosition !== null);
    if (pinned.length === 0 && events.length === 0) return 'Aucun événement pour cette date';
    if (pinned.length === 0) return `${events.length} événement(s) — aucun sélectionné pour l'affichage`;
    if (pinned.length === 1) return `« ${pinned[0].title} »`;
    return 'Une date, deux histoires';
  }

  // ── Mock data generator ───────────────────────────
  private _generateDayDetail(day: number, month: number, year: number): DayDetailData {
    const seed = (year * 372 + month * 31 + day) % 100;
    const dayOfWeek = DAYS_FR[new Date(year, month, day).getDay()];
    const total = seed < 25 ? 0 : seed < 48 ? 1 : seed < 68 ? 2 : seed < 84 ? 3 : 4;

    const events: DayEvent[] = Array.from({ length: total }, (_, i) => {
      const es = (seed * 7 + i * 17) % 100;
      return {
        id: `${day}-${month}-${year}-${i}`,
        historicalYear: HIST_YEARS[(seed + i * 3) % HIST_YEARS.length],
        title: EVENT_TITLES[(seed + i * 7) % EVENT_TITLES.length],
        description: DESCRIPTIONS[i % DESCRIPTIONS.length],
        hasImage: i < 2,
        imageSizeKb: 120 + es % 30,
        charCount: 200 + es * 3,
        status: i === 0 ? 'published' : 'draft',
        displayPosition: i === 0 ? 1 : i === 1 ? 2 : null,
      };
    });

    const hasCampaign = seed % 4 === 0 || seed % 5 === 1;
    const campaigns = hasCampaign ? [SAMPLE_CAMPAIGNS[seed % 3]] : [];

    return { day, month, year, dayOfWeek, events, campaigns };
  }

  // ── Computed views ────────────────────────────────
  readonly monthLabel = computed(() =>
    MONTHS_FR[this.selectedMonth()] + ' ' + this.selectedYear()
  );

  readonly monthDayCount = computed(() =>
    daysInMonth(this.selectedYear(), this.selectedMonth())
  );

  readonly monthCells = computed<DayCell[]>(() => {
    const year = this.selectedYear(), month = this.selectedMonth();
    const dim = daysInMonth(year, month), offset = dowMondayFirst(year, month, 1);
    return Array.from({ length: 42 }, (_, i) => {
      const d = i - offset + 1;
      if (d < 1 || d > dim) return { d: null, isToday: false, totalEvents: 0, pinnedCount: 0, title: null, ad: false };
      const isToday = d === this.todayDate && month === this.currentMonth && year === this.currentYear;
      const seed = (year * 372 + month * 31 + d) % 100;
      const totalEvents = seed < 25 ? 0 : seed < 48 ? 1 : seed < 68 ? 2 : seed < 84 ? 3 : 4;
      const pinnedCount = Math.min(totalEvents, 2) as 0 | 1 | 2;
      return {
        d, isToday, totalEvents, pinnedCount,
        title: totalEvents > 0 ? EVENT_TITLES[(seed * 7) % EVENT_TITLES.length] : null,
        ad: seed % 5 === 0,
      };
    });
  });

  readonly yearHeatmap = computed<HeatmapMonth[]>(() => {
    const year = this.selectedYear();
    return MONTHS_FR.map((label, mi) => {
      const dim = daysInMonth(year, mi), offset = dowMondayFirst(year, mi, 1);
      const blanks: HeatmapCell[] = Array.from({ length: offset }, () => ({ d: null, intensity: 0 as 0 }));
      const days: HeatmapCell[] = Array.from({ length: dim }, (_, i) => {
        const d = i + 1;
        const seed = (year * 372 + mi * 31 + d) % 100;
        const tot = seed < 25 ? 0 : seed < 48 ? 1 : seed < 68 ? 2 : seed < 84 ? 3 : 4;
        const intensity = tot === 0 ? 0 : tot === 1 ? 1 : tot === 2 ? 2 : 3;
        return { d, intensity: intensity as 0 | 1 | 2 | 3 };
      });
      const filled = days.filter(c => c.intensity > 0).length;
      return { label, mi, cells: [...blanks, ...days], pct: Math.round((filled / dim) * 100), dow: DOW_SHORT };
    });
  });

  readonly listRows: DateRow[] = [
    { day: 15, month: 7, date: '15 août',     dow: 'Vendredi', totalEvents: 3, pinnedCount: 2, title: 'Indépendance de la République du Congo', sub: '+ Premier Conseil des ministres', ad: 'MTN',        status: 'published' },
    { day: 14, month: 7, date: '14 août',     dow: 'Jeudi',    totalEvents: 1, pinnedCount: 1, title: 'Visite officielle à Pointe-Noire',       sub: null,                              ad: 'MTN',        status: 'published' },
    { day: 13, month: 7, date: '13 août',     dow: 'Mercredi', totalEvents: 0, pinnedCount: 0, title: null,                                     sub: null,                              ad: '—',          status: 'empty'     },
    { day: 12, month: 7, date: '12 août',     dow: 'Mardi',    totalEvents: 4, pinnedCount: 2, title: "Création de l'AEF à Brazzaville",        sub: '+ Inauguration du chemin de fer', ad: 'MTN · SG',   status: 'published' },
    { day: 11, month: 7, date: '11 août',     dow: 'Lundi',    totalEvents: 1, pinnedCount: 1, title: "Discours de Léon M'Ba à l'Assemblée",   sub: null,                              ad: '—',          status: 'draft'     },
    { day: 10, month: 7, date: '10 août',     dow: 'Dimanche', totalEvents: 2, pinnedCount: 2, title: "Naissance de Tchicaya U Tam'si",         sub: '+ Festival panafricain',          ad: 'BraCongo',   status: 'published' },
    { day:  9, month: 7, date: '09 août',     dow: 'Samedi',   totalEvents: 0, pinnedCount: 0, title: null,                                     sub: null,                              ad: '—',          status: 'empty'     },
    { day:  8, month: 7, date: '08 août',     dow: 'Vendredi', totalEvents: 2, pinnedCount: 1, title: "Sommet de l'OUA à Brazzaville",          sub: null,                              ad: 'SG Congo',   status: 'draft'     },
    { day: 28, month:10, date: '28 novembre', dow: 'Vendredi', totalEvents: 2, pinnedCount: 2, title: 'Adoption de la Constitution de 1958',   sub: '+ Serment de la République',      ad: '—',          status: 'published' },
    { day: 10, month: 2, date: '10 mars',     dow: 'Lundi',    totalEvents: 3, pinnedCount: 2, title: 'Conférence nationale souveraine',        sub: "+ Discours d'André Milongo",       ad: '—',          status: 'draft'     },
    { day: 28, month: 5, date: '28 juin',     dow: 'Samedi',   totalEvents: 1, pinnedCount: 1, title: 'Naissance de Marien Ngouabi',            sub: null,                              ad: '—',          status: 'published' },
    { day: 18, month: 1, date: '18 février',  dow: 'Mardi',    totalEvents: 1, pinnedCount: 1, title: 'Création du Parti Congolais du Travail', sub: null,                             ad: '—',          status: 'published' },
  ];

  // ── Nouveau calendrier modal ──────────────────────
  readonly showNewCalModal = signal(false);
  readonly newCalYear      = signal(0);
  readonly newCalName      = signal('');
  readonly newCalStatus    = signal<'draft' | 'published'>('draft');

  openNewCalModal(): void {
    const avail = this.availableYears();
    this.newCalYear.set(avail[0] ?? this.currentYear + 1);
    this.newCalName.set('');
    this.newCalStatus.set('draft');
    this.showNewCalModal.set(true);
  }

  closeNewCalModal(): void { this.showNewCalModal.set(false); }

  createCalendar(): void {
    const year  = this.newCalYear();
    const name  = this.newCalName().trim() || `Calendrier ${year}`;
    const newId = `cal-${Date.now()}`;
    this.calendars.update(cals => [
      ...cals,
      { id: newId, year, name, status: this.newCalStatus(), eventCount: 0, campaignCount: 0, fillPct: 0 },
    ]);
    this.closeNewCalModal();
    this.selectCalendar(newId);
  }

  // ── Dupliquer modal ───────────────────────────────
  readonly showDupModal        = signal(false);
  readonly dupSourceId         = signal('');
  readonly dupIncludeEvents    = signal(true);
  readonly dupIncludeCampaigns = signal(true);
  readonly dupTargetType       = signal<'existing' | 'new'>('existing');
  readonly dupTargetId         = signal('');
  readonly dupNewYear          = signal(0);
  readonly dupNewName          = signal('');
  readonly dupResultCalId      = signal('');
  readonly dupStatus           = signal<'idle' | 'done'>('idle');

  readonly dupSourceCalendar = computed(() =>
    this.calendars().find(c => c.id === this.dupSourceId())
  );

  readonly dupTargetCalendars = computed(() =>
    this.sortedCalendars().filter(c => c.id !== this.dupSourceId() && c.status !== 'archived')
  );

  openDupModal(): void {
    const selId = this.selectedCalendarId();
    this.dupSourceId.set(selId);
    this.dupIncludeEvents.set(true);
    this.dupIncludeCampaigns.set(true);
    this.dupTargetType.set('existing');
    const targets = this.sortedCalendars().filter(c => c.id !== selId && c.status !== 'archived');
    this.dupTargetId.set(targets[0]?.id ?? '');
    const avail = this.availableYears();
    this.dupNewYear.set(avail[0] ?? this.currentYear + 1);
    this.dupNewName.set('');
    this.dupResultCalId.set('');
    this.dupStatus.set('idle');
    this.showDupModal.set(true);
  }

  closeDupModal(): void { this.showDupModal.set(false); }

  goToDupResult(): void {
    const id = this.dupResultCalId();
    this.closeDupModal();
    if (id) this.selectCalendar(id);
  }

  confirmDuplicate(): void {
    const src = this.dupSourceCalendar();
    if (!src) return;
    const evCount   = this.dupIncludeEvents()    ? src.eventCount    : 0;
    const campCount = this.dupIncludeCampaigns() ? src.campaignCount : 0;
    if (this.dupTargetType() === 'new') {
      const year = this.dupNewYear(), name = this.dupNewName().trim() || `Calendrier ${year}`;
      const newId = `cal-${Date.now()}`;
      this.calendars.update(cals => [...cals, {
        id: newId, year, name, status: 'draft',
        eventCount: evCount, campaignCount: campCount,
        fillPct: this.dupIncludeEvents() ? src.fillPct : 0,
      }]);
      this.dupResultCalId.set(newId);
    } else {
      const targetId = this.dupTargetId();
      this.calendars.update(cals => cals.map(c =>
        c.id !== targetId ? c : {
          ...c, eventCount: c.eventCount + evCount, campaignCount: c.campaignCount + campCount,
          fillPct: this.dupIncludeEvents()
            ? Math.min(100, Math.round((c.fillPct + src.fillPct) / 2)) : c.fillPct,
        }
      ));
      this.dupResultCalId.set(targetId);
    }
    this.dupStatus.set('done');
  }
}
