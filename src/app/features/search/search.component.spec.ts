import { TestBed, ComponentFixture } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { SearchComponent } from './search.component';
import { SearchService, SearchResults } from '../../core/search/search.service';

describe('SearchComponent', () => {
  let component: SearchComponent;
  let fixture: ComponentFixture<SearchComponent>;
  let mockSearch: { search: jest.Mock };
  let mockRouter: { navigate: jest.Mock };
  let queryParams$: BehaviorSubject<any>;

  const EMPTY_RESULTS: SearchResults = { events: [], campaigns: [], companies: [], calendars: [] };

  beforeEach(async () => {
    queryParams$ = new BehaviorSubject<any>({ q: 'indep' });
    mockSearch = {
      search: jest.fn().mockReturnValue(of({
        events:    [{ type: 'event',    id: 'e1', label: 'Indépendance' }],
        campaigns: [{ type: 'campaign', id: 'c1', label: 'Campagne Indep' }],
        companies: [{ type: 'company',  id: 'co1', label: 'Indep SARL' }],
        calendars: [{ type: 'calendar', id: 'ca1', label: 'Indep 2026' }],
      } as SearchResults)),
    };
    mockRouter = { navigate: jest.fn() };

    await TestBed.configureTestingModule({
      imports: [SearchComponent],
      providers: [
        { provide: SearchService, useValue: mockSearch },
        { provide: Router, useValue: mockRouter },
        { provide: ActivatedRoute, useValue: { queryParams: queryParams$.asObservable() } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    TestBed.overrideComponent(SearchComponent, { set: { template: '' } });

    fixture = TestBed.createComponent(SearchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
  });

  it("lit le terme de la query param `q`", () => {
    expect(component.term()).toBe('indep');
  });

  it("appelle SearchService.search avec le terme et un limit augmenté", () => {
    expect(mockSearch.search).toHaveBeenCalledWith('indep', 30);
  });

  it("hydrate les résultats depuis SearchService", () => {
    expect(component.results().events.length).toBe(1);
    expect(component.results().campaigns.length).toBe(1);
    expect(component.results().companies.length).toBe(1);
    expect(component.results().calendars.length).toBe(1);
  });

  it("totalCount agrège les 4 groupes", () => {
    expect(component.totalCount()).toBe(4);
  });

  it("re-cherche quand le terme change dans la query param", () => {
    mockSearch.search.mockClear();
    queryParams$.next({ q: 'mtn' });
    expect(mockSearch.search).toHaveBeenCalledWith('mtn', 30);
  });

  it("ne cherche pas si la query param est vide", () => {
    mockSearch.search.mockClear();
    queryParams$.next({ q: '' });
    expect(mockSearch.search).not.toHaveBeenCalled();
    expect(component.results()).toEqual(EMPTY_RESULTS);
  });

  describe('filterType', () => {
    it("démarre à 'all'", () => {
      expect(component.filterType()).toBe('all');
    });

    it("setFilter('event') met à jour le filtre", () => {
      component.setFilter('event');
      expect(component.filterType()).toBe('event');
    });

    it("visibleResults masque les groupes hors filtre", () => {
      component.setFilter('event');
      const v = component.visibleResults();
      expect(v.events.length).toBe(1);
      expect(v.campaigns.length).toBe(0);
      expect(v.companies.length).toBe(0);
      expect(v.calendars.length).toBe(0);
    });

    it("filterType='all' montre tous les groupes", () => {
      component.setFilter('event');
      component.setFilter('all');
      const v = component.visibleResults();
      expect(v.events.length + v.campaigns.length + v.companies.length + v.calendars.length).toBe(4);
    });

    it("chaque filtre n'expose que son propre groupe", () => {
      component.setFilter('campaign');
      expect(component.visibleResults().campaigns.length).toBe(1);
      expect(component.visibleResults().events.length).toBe(0);
      component.setFilter('company');
      expect(component.visibleResults().companies.length).toBe(1);
      expect(component.visibleResults().campaigns.length).toBe(0);
      component.setFilter('calendar');
      expect(component.visibleResults().calendars.length).toBe(1);
      expect(component.visibleResults().companies.length).toBe(0);
    });
  });

  describe('goToResult', () => {
    it("navigue vers la bonne page selon le type", () => {
      component.goToResult({ type: 'event', id: 'e1', label: 'Indep' });
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/evenements'], { queryParams: { q: 'Indep' } });

      component.goToResult({ type: 'company', id: 'co1', label: 'Indep SARL' });
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/compagnies'], { queryParams: { q: 'Indep SARL' } });
    });
  });
});
