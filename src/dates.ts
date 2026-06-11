import { moment as obsidianMoment } from 'obsidian';

// Obsidian's d.ts declares moment via `import * as Moment`, which drops the
// call signature under our tsconfig. Retype just the surface we use.
type MomentFn = (input?: Date | string) => { format(fmt: string): string };
const momentUntyped: unknown = obsidianMoment;
export const moment = momentUntyped as MomentFn;

// Local calendar date for "today" logic. Never use toISOString().split('T')[0]
// for this: it returns the UTC date, which shifts evening writing onto
// tomorrow for every user west of UTC (streaks, Today card, daily notes).
export function localDateString(date?: Date | string): string {
  return moment(date).format('YYYY-MM-DD');
}
