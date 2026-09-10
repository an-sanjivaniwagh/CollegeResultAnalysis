import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the result import workspace', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Turn results into');
  });

  it('should extract subject codes, names, and marks from report text', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as {
      parseReport: (text: string) => {
        subjects: { code: string; name: string }[];
        results: { marks: Record<string, number> }[];
      };
    };
    const report = app.parseReport('MATH101 Mathematics SCI102 Science ENG103 English PRN Name CR-24001 Aarav Joshi 82 78 88');

    expect(report.subjects).toEqual([
      { code: 'MATH101', name: 'Mathematics' },
      { code: 'SCI102', name: 'Science' },
      { code: 'ENG103', name: 'English' },
    ]);
    expect(report.results[0].marks).toEqual({ MATH101: 82, SCI102: 78, ENG103: 88 });
  });

  it('should extract records with numeric PRNs', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as {
      parseReport: (text: string) => { results: { prn: string }[] };
    };
    const report = app.parseReport('MATH101 Mathematics SCI102 Science PRN Name 2024012345 Aarav Joshi 82 78');

    expect(report.results[0].prn).toBe('2024012345');
  });
});
