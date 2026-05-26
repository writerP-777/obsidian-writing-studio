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
