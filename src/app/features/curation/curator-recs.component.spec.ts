import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { CuratorRecsComponent } from './curator-recs.component';
import { CurationStore } from './curation-store.service';
import { EventService } from '../../core/events/event.service';

function rec(over: any = {}) {
  return {
    id: 'r1',
    mmdd: '08-15',
    position: 1,
    status: 'pending',
    created_at: '2026-06-01T00:00:00Z',
    event: { image_path: 'e/c.jpg' },
    ...over,
  };
}

describe('CuratorRecsComponent', () => {
  let store: any, events: any, component: CuratorRecsComponent;

  beforeEach(() => {
    store = {
      myRecs: signal([
        rec({ id: 'r1', status: 'pending', mmdd: '08-15', created_at: '2026-06-03T00:00:00Z' }),
        rec({ id: 'r2', status: 'applied', mmdd: '01-02', created_at: '2026-06-01T00:00:00Z' }),
      ]),
      load: jest.fn().mockResolvedValue(undefined),
    };
    events = { getImageUrl: jest.fn((p: string) => `cover/${p}`) };
    TestBed.configureTestingModule({
      imports: [CuratorRecsComponent],
      providers: [
        { provide: CurationStore, useValue: store },
        { provide: EventService, useValue: events },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    TestBed.overrideComponent(CuratorRecsComponent, { set: { template: '' } });
    component = TestBed.createComponent(CuratorRecsComponent).componentInstance;
  });

  it('ngOnInit charge le store', async () => {
    await component.ngOnInit();
    expect(store.load).toHaveBeenCalled();
  });

  it('counts agrège all/pending/applied', () => {
    expect(component.counts()).toEqual({ all: 2, pending: 1, applied: 1 });
  });

  it('setFilter filtre les lignes par statut', () => {
    component.setFilter('applied');
    expect(component.rows().every((r) => r.status === 'applied')).toBe(true);
  });

  it('onSortChange trie par date d\'événement puis par statut', () => {
    component.onSortChange('event-date');
    expect(component.rows()[0].mmdd).toBe('01-02');
    component.onSortChange('status');
    expect(component.rows()[0].status).toBe('applied');
  });

  it('rows: tri par défaut = plus récent d\'abord', () => {
    expect(component.rows()[0].id).toBe('r1');
  });

  it('libellés et image', () => {
    expect(component.mmddLabel('08-15')).toContain('août');
    expect(component.submittedLabel(rec() as any)).toBeTruthy();
    expect(component.positionShort(1)).toBe('Principal');
    expect(component.positionShort(2)).toBe("C'est aussi");
    expect(component.positionLabel(1)).toBeTruthy();
    expect(component.artFor('x')).toContain('linear-gradient');
    expect(component.imageUrl(rec() as any)).toBe('cover/e/c.jpg');
    expect(component.imageUrl(rec({ event: { image_path: null } }) as any)).toBeNull();
  });
});
