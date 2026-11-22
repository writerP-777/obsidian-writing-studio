import { formatSprintClock, goalJustReached, recordedSprintMinutes } from '../src/SprintTimer';

const MIN = 60000;

describe('recordedSprintMinutes', () => {
  it('records the planned length when the time limit ran out', () => {
    expect(recordedSprintMinutes(25, 25 * MIN, true)).toBe(25);
  });

  it('records the time actually written when a timed sprint is stopped early', () => {
    expect(recordedSprintMinutes(25, 5 * MIN, false)).toBe(5);
  });

  it('records the time actually written for a sprint with no time limit', () => {
    expect(recordedSprintMinutes(null, 42 * MIN, false)).toBe(42);
  });

  it('rounds to the nearest minute', () => {
    expect(recordedSprintMinutes(25, 5 * MIN + 29000, false)).toBe(5);
    expect(recordedSprintMinutes(25, 5 * MIN + 31000, false)).toBe(6);
  });

  it('never records less than one minute', () => {
    expect(recordedSprintMinutes(25, 10000, false)).toBe(1);
    expect(recordedSprintMinutes(null, 0, false)).toBe(1);
  });
});

describe('formatSprintClock — with a time limit (counts down)', () => {
  it('shows the full duration before any time has passed', () => {
    expect(formatSprintClock(25, 0)).toBe('25:00');
  });

  it('rounds the remaining time up, so the last second reads 00:01', () => {
    expect(formatSprintClock(25, 25 * MIN - 400)).toBe('00:01');
    expect(formatSprintClock(25, 6 * MIN + 18000)).toBe('18:42');
  });

  it('stops at 00:00 once the limit has passed', () => {
    expect(formatSprintClock(10, 11 * MIN)).toBe('00:00');
  });
});

describe('formatSprintClock — no time limit (counts up)', () => {
  it('starts at 00:00', () => {
    expect(formatSprintClock(null, 0)).toBe('00:00');
  });

  it('shows the time written so far, rounded down', () => {
    expect(formatSprintClock(null, 12 * MIN + 34900)).toBe('12:34');
  });

  it('keeps counting past an hour', () => {
    expect(formatSprintClock(null, 125 * MIN + 7000)).toBe('125:07');
  });
});

describe('goalJustReached', () => {
  it('is false while the words are short of the goal', () => {
    expect(goalJustReached(500, 499, false)).toBe(false);
  });

  it('is true the first time the words reach or pass the goal', () => {
    expect(goalJustReached(500, 500, false)).toBe(true);
    expect(goalJustReached(500, 512, false)).toBe(true);
  });

  it('is false once the goal has been announced', () => {
    expect(goalJustReached(500, 600, true)).toBe(false);
  });

  it('is false when the sprint has no goal', () => {
    expect(goalJustReached(undefined, 600, false)).toBe(false);
    expect(goalJustReached(0, 600, false)).toBe(false);
  });
});
