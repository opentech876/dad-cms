import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { CuratorRecsComponent } from './curator-recs.component';
import { CurationStore } from './curation-store.service';
import { EventService } from '../../core/events/event.service';
import { PresidencyRecommendationWithEvent } from '../../core/presidency/recommendation.service';

function rec(over: Partial<PresidencyRecommendationWithEvent> = {}): PresidencyRecommendationWithEvent {
  return {
    id: 'r',
    calendar_id: 'cal-1',
    mmdd: '08-15',
    position: 1,
    event_id: 'e',
    workspace_id: 'ws-1',
    status: 'pending',
    created_by: 'u-1',
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    applied_at: null,
    applied_by: null,
    event: null,
    ...over,
  };
}

describe('CuratorRecsComponent', () => {
  let component: CuratorRecsComponent;
  let myRecs: ReturnType<typeof signal<PresidencyRecommendationWithEvent[]>>;

  beforeEach(() => {
    myRecs = signal<PresidencyRecommendationWithEvent[]>([]);
    const store = { myRecs, load: jest.fn().mockResolvedValue(undefined) };

    TestBed.configureTestingModule({
      imports: [CuratorRecsComponent],
      providers: [
        { provide: CurationStore, useValue: store },
        { provide: EventService, useValue: { getImageUrl: jest.fn((p: string) => `url/${p}`) } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    TestBed.overrideComponent(CuratorRecsComponent, { set: { template: '' } });
    component = TestBed.createComponent(CuratorRecsComponent).componentInstance;
  });

  describe('counts', () => {
    it('compte all / pending / applied', () => {
      myRecs.set([
        rec({ id: 'a', status: 'pending' }),
        rec({ id: 'b', status: 'applied' }),
        rec({ id: 'c', status: 'applied' }),
      ]);

      expect(component.counts()).toEqual({ all: 3, pending: 1, applied: 2 });
    });
  });

  describe('rows — filtre', () => {
    it("'all' renvoie tout", () => {
      myRecs.set([rec({ id: 'a', status: 'pending' }), rec({ id: 'b', status: 'applied' })]);
      component.setFilter('all');
      expect(component.rows().length).toBe(2);
    });

    it("'pending' ne renvoie que les pending", () => {
      myRecs.set([rec({ id: 'a', status: 'pending' }), rec({ id: 'b', status: 'applied' })]);
      component.setFilter('pending');
      expect(component.rows().map((r) => r.id)).toEqual(['a']);
    });

    it("'applied' ne renvoie que les publiées", () => {
      myRecs.set([rec({ id: 'a', status: 'pending' }), rec({ id: 'b', status: 'applied' })]);
      component.setFilter('applied');
      expect(component.rows().map((r) => r.id)).toEqual(['b']);
    });
  });

  describe('rows — tri', () => {
    it("'recent' (défaut) trie par created_at décroissant", () => {
      myRecs.set([
        rec({ id: 'old', created_at: '2026-06-01T00:00:00Z' }),
        rec({ id: 'new', created_at: '2026-07-01T00:00:00Z' }),
      ]);
      expect(component.rows().map((r) => r.id)).toEqual(['new', 'old']);
    });

    it("'event-date' trie par mmdd croissant", () => {
      myRecs.set([rec({ id: 'dec', mmdd: '12-01' }), rec({ id: 'jan', mmdd: '01-05' })]);
      component.onSortChange('event-date');
      expect(component.rows().map((r) => r.id)).toEqual(['jan', 'dec']);
    });

    it('ne mute pas le tableau source du store', () => {
      const source = [rec({ id: 'dec', mmdd: '12-01' }), rec({ id: 'jan', mmdd: '01-05' })];
      myRecs.set(source);
      component.onSortChange('event-date');
      component.rows();
      // Le store garde l'ordre d'origine (rows() opère sur une copie).
      expect(myRecs().map((r) => r.id)).toEqual(['dec', 'jan']);
    });
  });

  describe('libellés', () => {
    it('positionShort: Principal / C\'est aussi', () => {
      expect(component.positionShort(1)).toBe('Principal');
      expect(component.positionShort(2)).toBe("C'est aussi");
    });

    it('mmddLabel: MM-DD → jour + mois FR', () => {
      expect(component.mmddLabel('08-15')).toBe('15 août');
    });
  });

  it('charge le store au démarrage', async () => {
    const store = TestBed.inject(CurationStore) as unknown as { load: jest.Mock };
    await component.ngOnInit();
    expect(store.load).toHaveBeenCalled();
  });
});
