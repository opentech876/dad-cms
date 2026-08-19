import { TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { CuratorDashboardComponent } from './curator-dashboard.component';
import { CurationStore } from './curation-store.service';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceService } from '../../core/workspace/workspace.service';
import { EventService } from '../../core/events/event.service';

describe('CuratorDashboardComponent', () => {
  let store: any, auth: any, ws: any, events: any;
  let component: CuratorDashboardComponent;

  function build() {
    store = {
      myRecs: signal([{ mmdd: '03-01', position: 1, event: { image_path: 'e/cover.jpg' } }, {}, {}, {}, {}]),
      upcomingEmptyDates: signal(['03-02', '03-03', '03-04', '03-05']),
      emptyDates: signal(['03-02', '03-03']),
      calendarYear: signal(2026),
      load: jest.fn().mockResolvedValue(undefined),
      loadMyEvents: jest.fn().mockResolvedValue(undefined),
      refreshRecs: jest.fn().mockResolvedValue(undefined),
    };
    auth = { getCurrentUser: jest.fn().mockReturnValue(of({ id: 'u1' })) };
    ws = { getMyProfile: jest.fn().mockReturnValue(of({ full_name: 'Elvis Destin' })) };
    events = { getImageUrl: jest.fn().mockReturnValue('http://cdn/e.jpg') };
    TestBed.configureTestingModule({
      imports: [CuratorDashboardComponent],
      providers: [
        { provide: CurationStore, useValue: store },
        { provide: AuthService, useValue: auth },
        { provide: WorkspaceService, useValue: ws },
        { provide: EventService, useValue: events },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    });
    TestBed.overrideComponent(CuratorDashboardComponent, { set: { template: '' } });
    component = TestBed.createComponent(CuratorDashboardComponent).componentInstance;
  }

  beforeEach(() => build());

  it('devrait être créé', () => {
    expect(component).toBeTruthy();
  });

  it('ngOnInit charge le store et résout le prénom', async () => {
    await component.ngOnInit();
    expect(store.load).toHaveBeenCalled();
    expect(store.loadMyEvents).toHaveBeenCalled();
    expect(component.firstName()).toBe('Elvis');
  });

  it('loadName retombe sur "" en cas d\'erreur', async () => {
    ws.getMyProfile = jest.fn().mockReturnValue(throwError(() => new Error('x')));
    await component.ngOnInit();
    expect(component.firstName()).toBe('');
  });

  it('recentRecs limite à 4', () => {
    expect(component.recentRecs().length).toBe(4);
  });

  it('emptyDatesPreview limite à 3 et emptyDatesCount compte', () => {
    expect(component.emptyDatesPreview().length).toBe(3);
    expect(component.emptyDatesCount()).toBe(2);
  });

  it('mmddLabel / recDateLabel', () => {
    expect(component.mmddLabel('03-01')).toContain('mars');
    expect(component.recDateLabel({ mmdd: '03-01' } as any)).toContain('2026');
  });

  it('positionLabel / artFor', () => {
    expect(component.positionLabel(1)).toBeTruthy();
    expect(component.artFor('x')).toContain('linear-gradient');
  });

  it('imageUrl: URL si image_path, sinon null', () => {
    expect(component.imageUrl({ event: { image_path: 'e/c.jpg' } } as any)).toBe('http://cdn/e.jpg');
    expect(component.imageUrl({ event: {} } as any)).toBeNull();
  });

  it('openPropose / closePropose / onProposeSaved', async () => {
    component.openPropose('03-10');
    expect(component.proposeMmdd()).toBe('03-10');
    component.closePropose();
    expect(component.proposeMmdd()).toBeNull();
    component.openPropose();
    expect(component.proposeMmdd()).toBe('03-02');
    await component.onProposeSaved();
    expect(component.proposeMmdd()).toBeNull();
    expect(store.refreshRecs).toHaveBeenCalled();
  });

  it('openPropose ne fait rien sans date cible', () => {
    store.upcomingEmptyDates.set([]);
    component.openPropose();
    expect(component.proposeMmdd()).toBeNull();
  });
});
