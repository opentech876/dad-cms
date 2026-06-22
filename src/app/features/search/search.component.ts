import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TuiIcon } from '@taiga-ui/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SearchService, SearchResult, SearchResults } from '../../core/search/search.service';

type FilterType = 'all' | SearchResult['type'];

const EMPTY: SearchResults = { events: [], campaigns: [], companies: [], calendars: [] };

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [TuiIcon, RouterLink],
  templateUrl: './search.component.html',
  styleUrl: './search.component.scss',
})
export class SearchComponent {
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private searchService  = inject(SearchService);

  readonly term       = signal('');
  readonly results    = signal<SearchResults>(EMPTY);
  readonly loading    = signal(false);
  readonly filterType = signal<FilterType>('all');

  readonly totalCount = computed(() => {
    const r = this.results();
    return r.events.length + r.campaigns.length + r.companies.length + r.calendars.length;
  });

  readonly visibleResults = computed<SearchResults>(() => {
    const f = this.filterType();
    if (f === 'all') return this.results();
    const r = this.results();
    return {
      events:    f === 'event'    ? r.events    : [],
      campaigns: f === 'campaign' ? r.campaigns : [],
      companies: f === 'company'  ? r.companies : [],
      calendars: f === 'calendar' ? r.calendars : [],
    };
  });

  constructor() {
    this.route.queryParams.pipe(takeUntilDestroyed()).subscribe(params => {
      const q = (params['q'] ?? '').toString();
      this.term.set(q);
      if (!q.trim()) {
        this.results.set(EMPTY);
        return;
      }
      this.loading.set(true);
      this.searchService.search(q, 30).subscribe(r => {
        this.results.set(r);
        this.loading.set(false);
      });
    });
  }

  setFilter(f: FilterType): void { this.filterType.set(f); }

  goToResult(r: SearchResult): void {
    const routes: Record<SearchResult['type'], string> = {
      event:    '/evenements',
      campaign: '/campagnes',
      company:  '/compagnies',
      calendar: '/calendrier',
    };
    this.router.navigate([routes[r.type]], { queryParams: { q: r.label } });
  }
}
