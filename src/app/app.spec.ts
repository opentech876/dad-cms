import { TestBed } from '@angular/core/testing';
import { AppComponent } from './app';

describe('AppComponent', () => {
  it('should be created', () => {
    // AppComponent now injects ThemeService (field initializer), so it must be
    // constructed inside an injection context rather than via `new`.
    TestBed.configureTestingModule({});
    const app = TestBed.runInInjectionContext(() => new AppComponent());
    expect(app).toBeTruthy();
  });
});
