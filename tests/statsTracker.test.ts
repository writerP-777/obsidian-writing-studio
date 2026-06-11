import { StatsTracker } from '../src/StatsTracker';

const mockPlugin = {
  app: {},
  settings: { appendToDailyNote: false, sprintHistoryRetention: 30 },
  projectManager: { getActiveProject: () => null },
  fmManager: {},
} as never;

describe('StatsTracker.calculateReadingTime', () => {
  let tracker: StatsTracker;
  beforeEach(() => { tracker = new StatsTracker(mockPlugin); });

  it('returns minutes for text under one hour', () => {
    expect(tracker.calculateReadingTime(238)).toBe('1 min');
    expect(tracker.calculateReadingTime(476)).toBe('2 min');
  });

  it('rounds up to the next full minute', () => {
    // 100 words / 238 wpm = 0.42 min → ceil → 1 min
    expect(tracker.calculateReadingTime(100)).toBe('1 min');
  });

  it('returns whole hours when minutes is divisible by 60', () => {
    expect(tracker.calculateReadingTime(238 * 60)).toBe('1h');
  });

  it('returns hours and minutes for mixed durations', () => {
    expect(tracker.calculateReadingTime(238 * 90)).toBe('1h 30m');
  });

  it('handles large word counts correctly', () => {
    // 238 * 120 = 28560 words → 120 min → 2h
    expect(tracker.calculateReadingTime(238 * 120)).toBe('2h');
  });
});

describe('StatsTracker word-count session tracking', () => {
  let tracker: StatsTracker;
  beforeEach(() => { tracker = new StatsTracker(mockPlugin); });

  it('returns 0 delta before any updates', () => {
    expect(tracker.getSessionDelta('notes.md')).toBe(0);
  });

  it('returns 0 delta immediately after the first update (baseline equals current)', () => {
    tracker.updateFileWordCount('notes.md', 100);
    expect(tracker.getSessionDelta('notes.md')).toBe(0);
  });

  it('returns the word increase between baseline and current', () => {
    tracker.updateFileWordCount('notes.md', 100); // sets baseline
    tracker.updateFileWordCount('notes.md', 150);
    expect(tracker.getSessionDelta('notes.md')).toBe(50);
  });

  it('never returns a negative delta (deletion does not subtract)', () => {
    tracker.updateFileWordCount('notes.md', 100);
    tracker.updateFileWordCount('notes.md', 60);
    expect(tracker.getSessionDelta('notes.md')).toBe(0);
  });

  it('baseline is fixed at the first update value', () => {
    tracker.updateFileWordCount('notes.md', 100); // baseline = 100
    tracker.updateFileWordCount('notes.md', 200); // current = 200
    tracker.updateFileWordCount('notes.md', 120); // current back down to 120
    expect(tracker.getSessionDelta('notes.md')).toBe(20); // 120 - 100
  });

  it('getTotalSessionWords sums deltas across all tracked files', () => {
    tracker.updateFileWordCount('a.md', 100);
    tracker.updateFileWordCount('a.md', 150); // +50
    tracker.updateFileWordCount('b.md', 200);
    tracker.updateFileWordCount('b.md', 300); // +100
    expect(tracker.getTotalSessionWords()).toBe(150);
  });

  it('getTotalSessionWords returns 0 when no files have been updated', () => {
    expect(tracker.getTotalSessionWords()).toBe(0);
  });
});

describe('StatsTracker local-date handling', () => {
  function localToday(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function makeSession(words: number) {
    return {
      id: 's1',
      // Local noon as a UTC instant: the ISO string's UTC date may differ
      // from the local date, but grouping must land on the local day
      date: new Date(new Date().setHours(12, 0, 0, 0)).toISOString(),
      duration: 25,
      wordsWritten: words,
      startWordCount: 0,
      documents: ['a.md'],
      completed: true,
    };
  }

  it('session stats use the local date', () => {
    const tracker = new StatsTracker(mockPlugin);
    expect(tracker.getSessionStats().date).toBe(localToday());
  });

  it('recordSprint rolls the session day over after local midnight', () => {
    const tracker = new StatsTracker(mockPlugin);
    (tracker as unknown as { sessionStats: { date: string; wordsWritten: number } })
      .sessionStats = { date: '2000-01-01', wordsWritten: 999, sprintsCompleted: 9, totalMinutes: 90, documents: [] } as never;

    tracker.recordSprint(makeSession(50) as never);

    const stats = tracker.getSessionStats();
    expect(stats.date).toBe(localToday());
    expect(stats.wordsWritten).toBe(50); // old day's 999 not carried over
    expect(stats.sprintsCompleted).toBe(1);
  });

  it('getWritingHistory groups a session under its local calendar day', async () => {
    const session = makeSession(120);
    const plugin = {
      app: {},
      settings: { appendToDailyNote: false, sprintHistoryRetention: 30 },
      projectManager: {
        getActiveProject: () => ({ id: 'p1', title: 'P', folderPath: 'Projects/P' }),
        getWritingLog: () => Promise.resolve([session]),
      },
      fmManager: {},
    } as never;
    const tracker = new StatsTracker(plugin);

    const history = await tracker.getWritingHistory(2);
    const todayEntry = history.find(e => e.date === localToday());

    expect(todayEntry?.wordsWritten).toBe(120);
  });

  it('getStreak counts a local-noon session as today', async () => {
    const plugin = {
      app: {},
      settings: { appendToDailyNote: false, sprintHistoryRetention: 30 },
      projectManager: {
        getActiveProject: () => ({ id: 'p1', title: 'P', folderPath: 'Projects/P' }),
        getWritingLog: () => Promise.resolve([makeSession(10)]),
      },
      fmManager: {},
    } as never;
    const tracker = new StatsTracker(plugin);

    expect(await tracker.getStreak()).toBe(1);
  });
});
