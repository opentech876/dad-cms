import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { CuratorEventsComponent } from './curator-events.component';
import { CurationStore } from './curation-store.service';
import { EventService } from '../../core/events/event.service';

describe('CuratorEventsComponent', () => {
  let component: CuratorEventsComponent;
  let mockEvents: any;

  function build(): void {
    mockEvents = {
      getImageUrl: jest.fn((p: string) => `cover/${p}`),
      getThumbUrl: jest.fn((p: string) => `thumb/${p}`),
    };
    const store = {
      myEvents: signal<any[]>([]),
      myEventsLoading: signal(false),
      entries: signal<any[]>([]),
      myRecs: signal<any[]>([]),
      load: jest.fn().mockResolvedValue(undefined),
      loadMyEvents: jest.fn().mockResolvedValue(undefined),
    };
    TestBed.configureTestingModule({
      imports: [CuratorEventsComponent],
      providers: [
        { provide: CurationStore, useValue: store },
        { provide: EventService, useValue: mockEvents },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    TestBed.overrideComponent(CuratorEventsComponent, { set: { template: '' } });
    const fixture = TestBed.createComponent(CuratorEventsComponent);
    component = fixture.componentInstance;
    return;
  }

  beforeEach(build);

  describe('filtered — recherche', () => {
    it('filtre mes événements par titre (insensible casse/accents)', () => {
      const store = TestBed.inject(CurationStore) as any;
      store.myEvents.set([
        { id: '1', title: 'Indépendance du Congo', event_date: '1960-08-15' },
        { id: '2', title: 'Festival FESPAM', event_date: '1996-08-01' },
      ]);
      component.search.set('congo');
      expect(component.filtered().map((e) => e.id)).toEqual(['1']);
    });

    it('recherche vide → tout', () => {
      const store = TestBed.inject(CurationStore) as any;
      store.myEvents.set([{ id: '1', title: 'A', event_date: '2000-01-01' }]);
      expect(component.filtered().length).toBe(1);
    });
  });

  describe('marqueurs assigné / recommandé', () => {
    it('isAssigned/isRecommended reflètent les entrées et recommandations du store', () => {
      const store = TestBed.inject(CurationStore) as any;
      store.entries.set([{ event_id: 'e1' }]);
      store.myRecs.set([{ event_id: 'e2' }]);
      expect(component.isAssigned({ id: 'e1' } as any)).toBe(true);
      expect(component.isAssigned({ id: 'e9' } as any)).toBe(false);
      expect(component.isRecommended({ id: 'e2' } as any)).toBe(true);
      expect(component.isRecommended({ id: 'e9' } as any)).toBe(false);
    });
  });

  describe('thumbUrl / onThumbError', () => {
    it('thumbUrl renvoie la vignette, null sans image', () => {
      expect(component.thumbUrl({ image_path: 'e/cover.jpg' } as any)).toBe('thumb/e/cover.jpg');
      expect(component.thumbUrl({ image_path: null } as any)).toBeNull();
    });

    it('onThumbError bascule vers le cover une seule fois (garde anti-boucle)', () => {
      const img: any = { dataset: {}, src: 'thumb/e/cover.jpg' };
      component.onThumbError({ target: img } as any, 'e/cover.jpg');
      expect(img.src).toBe('cover/e/cover.jpg');
      expect(img.dataset.fellBack).toBe('1');

      // Second error (cover also failed): must NOT reset src again → no loop.
      mockEvents.getImageUrl.mockClear();
      component.onThumbError({ target: img } as any, 'e/cover.jpg');
      expect(mockEvents.getImageUrl).not.toHaveBeenCalled();
    });
  });
});
