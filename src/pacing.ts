// Deadline pacing: how many words a day the writer needs to finish on time.
// Pure — every date here is a local calendar date as a YYYY-MM-DD string,
// never a Date at the seam, so the UTC-shift bug (see dates.ts) cannot
// creep in. The caller passes "today" from localDateString().

// Monday to Friday in getDay() numbering (0 = Sunday).
export const DEFAULT_WRITING_DAYS: readonly number[] = [1, 2, 3, 4, 5];

export type Pace =
  // A deadline with no word goal: just the days left.
  | { kind: 'countdown'; daysLeft: number }
  // Goal and deadline, words still to write, time still to write them.
  | { kind: 'pace'; wordsLeft: number; daysLeft: number; perDay: number }
  // The goal is met; daysLeft is the writing days to spare (0 once past due).
  | { kind: 'reached'; daysLeft: number }
  // The deadline has passed with words still to go (0 when there is no goal).
  | { kind: 'overdue'; wordsLeft: number };

export interface PaceInput {
  goal: number;
  total: number;
  deadline: string;
  writingDays?: readonly number[];
  today: string;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

// Sorted, unique, 0..6. Anything unusable (absent, empty, malformed) is the
// default, so a hand-edited _project.json never produces "0 days left".
export function normalizeWritingDays(days: unknown): number[] {
  if (!Array.isArray(days)) return [...DEFAULT_WRITING_DAYS];
  const set = new Set<number>();
  for (const d of days) {
    if (typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6) set.add(d);
  }
  return set.size === 0 ? [...DEFAULT_WRITING_DAYS] : [...set].sort((a, b) => a - b);
}

export function isDefaultWritingDays(days: readonly number[]): boolean {
  const n = normalizeWritingDays(days);
  return n.length === DEFAULT_WRITING_DAYS.length && n.every((d, i) => d === DEFAULT_WRITING_DAYS[i]);
}

function dayNumber(iso: string): number {
  const m = ISO_DATE.exec(iso);
  if (!m) return NaN;
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000);
}

function weekday(dayNum: number): number {
  // Day 0 (1970-01-01) was a Thursday.
  return (((dayNum + 4) % 7) + 7) % 7;
}

// Writing days from today through the deadline, both inclusive. Today counts
// when it is a writing day; the deadline day always counts, because the
// writer can still hand in on it. Past deadline → 0.
export function writingDaysLeft(today: string, deadline: string, writingDays: readonly number[] = DEFAULT_WRITING_DAYS): number {
  const start = dayNumber(today);
  const end = dayNumber(deadline);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
  const days = normalizeWritingDays(writingDays);
  const span = end - start + 1;
  const fullWeeks = Math.floor(span / 7);
  let count = fullWeeks * days.length;
  for (let d = start + fullWeeks * 7; d <= end; d++) {
    if (days.includes(weekday(d))) count++;
  }
  if (!days.includes(weekday(end))) count++;
  return count;
}

export function computePace(input: PaceInput): Pace | null {
  if (!isIsoDate(input.deadline) || !isIsoDate(input.today)) return null;
  const goal = Math.max(0, Math.floor(input.goal));
  const wordsLeft = Math.max(0, goal - Math.max(0, Math.floor(input.total)));
  const daysLeft = writingDaysLeft(input.today, input.deadline, input.writingDays);
  const past = dayNumber(input.deadline) < dayNumber(input.today);
  if (goal <= 0) {
    return past ? { kind: 'overdue', wordsLeft: 0 } : { kind: 'countdown', daysLeft };
  }
  if (wordsLeft === 0) return { kind: 'reached', daysLeft };
  if (past) return { kind: 'overdue', wordsLeft };
  return { kind: 'pace', wordsLeft, daysLeft, perDay: Math.ceil(wordsLeft / daysLeft) };
}
