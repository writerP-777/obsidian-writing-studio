import { computePace, isIsoDate, normalizeWritingDays, isDefaultWritingDays, writingDaysLeft, DEFAULT_WRITING_DAYS } from '../src/pacing';

// 2026-11-06 is a Friday; 2026-12-15 is a Tuesday; 2026-10-22 is a Thursday.
describe('writingDaysLeft', () => {
  it('counts Monday to Friday from today through the deadline inclusive', () => {
    // Fri 6 Nov → Tue 15 Dec: Fri + 5 full weeks (25) + Mon, Tue = 28
    expect(writingDaysLeft('2026-11-06', '2026-12-15')).toBe(28);
  });

  it('matches the approved mock: 39 writing days from Thu 22 Oct to Tue 15 Dec', () => {
    expect(writingDaysLeft('2026-10-22', '2026-12-15')).toBe(39);
  });

  it('skips today when today is not a writing day', () => {
    // Sat 7 Nov → Mon 9 Nov: only Monday
    expect(writingDaysLeft('2026-11-07', '2026-11-09')).toBe(1);
  });

  it('always counts the deadline day even when it is not a writing day', () => {
    // Fri 6 Nov → Sat 7 Nov: Friday plus the deadline Saturday
    expect(writingDaysLeft('2026-11-06', '2026-11-07')).toBe(2);
    // Sat 7 Nov → Sat 7 Nov: deadline today, not a writing day, still one day
    expect(writingDaysLeft('2026-11-07', '2026-11-07')).toBe(1);
  });

  it('is 1 when the deadline is today', () => {
    expect(writingDaysLeft('2026-11-06', '2026-11-06')).toBe(1);
  });

  it('is 0 once the deadline has passed or a date is malformed', () => {
    expect(writingDaysLeft('2026-11-06', '2026-11-05')).toBe(0);
    expect(writingDaysLeft('2026-11-06', 'soon')).toBe(0);
  });

  it('honours custom writing days', () => {
    // Fri 6 Nov → Sun 15 Nov, writing Sat+Sun: Sat 7, Sun 8, Sat 14, Sun 15 = 4
    expect(writingDaysLeft('2026-11-06', '2026-11-15', [0, 6])).toBe(4);
    // Every day: 10 calendar days
    expect(writingDaysLeft('2026-11-06', '2026-11-15', [0, 1, 2, 3, 4, 5, 6])).toBe(10);
  });

  it('agrees with a day-by-day count over a long span', () => {
    const days = [1, 3, 5];
    let expected = 0;
    const start = Date.UTC(2026, 0, 1);
    const end = Date.UTC(2029, 5, 30);
    for (let t = start; t <= end; t += 86_400_000) {
      const wd = new Date(t).getUTCDay();
      if (days.includes(wd) || t === end) expected++;
    }
    expect(writingDaysLeft('2026-01-01', '2029-06-30', days)).toBe(expected);
  });
});

describe('normalizeWritingDays', () => {
  it('falls back to Monday–Friday for anything unusable', () => {
    expect(normalizeWritingDays(undefined)).toEqual([...DEFAULT_WRITING_DAYS]);
    expect(normalizeWritingDays([])).toEqual([...DEFAULT_WRITING_DAYS]);
    expect(normalizeWritingDays(['mon', 9, -1, 2.5])).toEqual([...DEFAULT_WRITING_DAYS]);
  });

  it('sorts and dedupes', () => {
    expect(normalizeWritingDays([6, 0, 6, 2])).toEqual([0, 2, 6]);
  });

  it('recognises the default in any order', () => {
    expect(isDefaultWritingDays([5, 4, 3, 2, 1])).toBe(true);
    expect(isDefaultWritingDays([1, 2, 3, 4, 5, 6])).toBe(false);
  });
});

describe('isIsoDate', () => {
  it('accepts real calendar dates only', () => {
    expect(isIsoDate('2026-12-15')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('15/12/2026')).toBe(false);
    expect(isIsoDate(20261215)).toBe(false);
  });
});

describe('computePace', () => {
  const today = '2026-10-22';
  const deadline = '2026-12-15';

  it('reproduces the approved mock: 1,734 words a day', () => {
    expect(computePace({ goal: 80_000, total: 12_400, deadline, today }))
      .toEqual({ kind: 'pace', wordsLeft: 67_600, daysLeft: 39, perDay: 1734 });
  });

  it('rounds the daily figure up so the goal is always reachable', () => {
    const p = computePace({ goal: 101, total: 0, deadline: '2026-10-23', today });
    expect(p).toEqual({ kind: 'pace', wordsLeft: 101, daysLeft: 2, perDay: 51 });
  });

  it('is a countdown when there is no goal', () => {
    expect(computePace({ goal: 0, total: 500, deadline, today })).toEqual({ kind: 'countdown', daysLeft: 39 });
  });

  it('reports the goal reached with the days to spare', () => {
    expect(computePace({ goal: 1000, total: 1000, deadline, today })).toEqual({ kind: 'reached', daysLeft: 39 });
    expect(computePace({ goal: 1000, total: 2500, deadline: '2026-10-01', today })).toEqual({ kind: 'reached', daysLeft: 0 });
  });

  it('reports an overdue deadline with the words still to go', () => {
    expect(computePace({ goal: 10_000, total: 5_700, deadline: '2026-10-01', today })).toEqual({ kind: 'overdue', wordsLeft: 4300 });
    expect(computePace({ goal: 0, total: 5_700, deadline: '2026-10-01', today })).toEqual({ kind: 'overdue', wordsLeft: 0 });
  });

  it('uses the whole remainder when the deadline is today', () => {
    expect(computePace({ goal: 1000, total: 400, deadline: today, today })).toEqual({ kind: 'pace', wordsLeft: 600, daysLeft: 1, perDay: 600 });
  });

  it('returns null for an unusable deadline instead of guessing', () => {
    expect(computePace({ goal: 1000, total: 0, deadline: 'next month', today })).toBeNull();
    expect(computePace({ goal: 1000, total: 0, deadline, today: '' })).toBeNull();
  });
});
