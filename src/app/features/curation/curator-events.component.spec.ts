import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { CuratorEventsComponent } from './curator-events.component';
import { CurationStore } from './curation-store.service';
import { EventService } from '../../core/events/event.service';

describe('CuratorEventsComponent', () => {
  let store: any, events: any, component: CuratorEventsComponent;

  beforeEach(() => {
    store = {
      entries: signal([{ event_id: 'ev-1' }]),
      myRecs: signal([{ event_id: 'ev-2' }]),
      myEvents: signal([
        { id: 'ev-1', title: 'Indépendance', event_date: '1960-08-15', image_path: 'e/c.jpg' },
        { id: 'ev-3', title: 'Autre', event_date: '1970-01-02', image_path: null },
      ]),
      load: jest.fn().mockResolvedValue(undefined),
      loadMyEvents: jest.fn().mockResolvedValue(undefined),
    };
    events = {
      getThumbUrl: jest.fn((p: string) => `thumb/${p}`),
      getImageUrl: jest.fn((p: string) => `cover/${p}`),
    };
    TestBed.configureTestingModule({
      imports: [CuratorEventsComponent],
      providers: [
        { provide: CurationStore, useValue: store },
        { provide: EventService, useValue: events },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    TestBed.overrideComponent(CuratorEventsComponent, { set: { template: '' } });
    component = TestBed.createComponent(CuratorEventsComponent).componentInstance;
  });

  it('ngOnInit charge le store et les événements', async () => {
    await component.ngOnInit();
    expect(store.load).toHaveBeenCalled();
    expect(store.loadMyEvents).toHaveBeenCalled();
  });

  it('filtered filtre par recherche', () => {
    expect(component.filtered()).toHaveLength(2);
    component.search.set('indépendance');
    expect(component.filtered()).toHaveLength(1);
  });

  it('thumbUrl renvoie une URL ou null', () => {
    expect(component.thumbUrl({ image_path: 'e/c.jpg' } as any)).toBe('thumb/e/c.jpg');
    expect(component.thumbUrl({ image_path: null } as any)).toBeNull();
  });

  it('onThumbError bascule sur la couverture une seule fois', () => {
    const img: any = { dataset: {}, src: '' };
    component.onThumbError({ target: img } as any, 'e/c.jpg');
    expect(img.src).toBe('cover/e/c.jpg');
    expect(img.dataset['fellBack']).toBe('1');
    // deuxième appel : déjà retombé → ne refait rien
    img.src = 'unchanged';
    component.onThumbError({ target: img } as any, 'e/c.jpg');
    expect(img.src).toBe('unchanged');
  });

  it('eventYear / isAssigned / isRecommended / artFor', () => {
    expect(component.eventYear({ event_date: '1960-08-15' } as any)).toBe('1960');
    expect(component.eventYear({} as any)).toBe('');
    expect(component.isAssigned({ id: 'ev-1' } as any)).toBe(true);
    expect(component.isAssigned({ id: 'ev-9' } as any)).toBe(false);
    expect(component.isRecommended({ id: 'ev-2' } as any)).toBe(true);
    expect(component.artFor('x')).toContain('linear-gradient');
  });
});
