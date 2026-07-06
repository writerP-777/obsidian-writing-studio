import { App, TFile, normalizePath } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { listManuscriptDocs } from './manuscriptTree';
import { t } from './i18n';
import { localDateString, moment } from './dates';
import { SprintSession } from '../models/SprintSession';

interface DailyStats {
  date: string;
  wordsWritten: number;
  sprintsCompleted: number;
  totalMinutes: number;
  documents: string[];
}

export interface DailyLogEntry {
  date: string;
  wordsWritten: number;
  sprintsCompleted: number;
  totalMinutes: number;
}

export class StatsTracker {
  private plugin: WritingStudioPlugin;
  private app: App;
  private sessionStats: DailyStats;
  private sessionBaselines = new Map<string, number>();
  private sessionCurrents  = new Map<string, number>();
  private cachedTotalWordCount: number | null = null;
  private cachedWordCountProjectId: string | null = null;
  private cachedStreak: { projectId: string; value: number } | null = null;

  constructor(plugin: WritingStudioPlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.sessionStats = this.newDailyStats();
  }

  private newDailyStats(): DailyStats {
    return {
      date: localDateString(),
      wordsWritten: 0,
      sprintsCompleted: 0,
      totalMinutes: 0,
      documents: [],
    };
  }

  recordSprint(session: SprintSession): void {
    // Roll the session stats over when the local day has changed since
    // plugin load — sessions spanning midnight accrued to the old day
    if (this.sessionStats.date !== localDateString()) {
      this.sessionStats = this.newDailyStats();
    }
    this.cachedStreak = null; // a new sprint can extend the streak
    this.sessionStats.wordsWritten += session.wordsWritten;
    this.sessionStats.sprintsCompleted++;
    this.sessionStats.totalMinutes += session.duration;

    for (const doc of session.documents) {
      if (!this.sessionStats.documents.includes(doc)) {
        this.sessionStats.documents.push(doc);
      }
    }

    if (this.plugin.settings.appendToDailyNote) {
      void this.appendToDailyNote(session);
    }
  }

  private async appendToDailyNote(session: SprintSession): Promise<void> {
    const dailyNotePath = this.getDailyNotePath();

    const project = this.plugin.projectManager.getActiveProject();
    const projectName = project?.title || t('statsTracker.unknownProject');
    const docNames = session.documents.map(p => p.split('/').pop()?.replace('.md', '') || p).join(', ');
    const wpm = session.duration > 0 ? Math.round(session.wordsWritten / session.duration) : 0;

    const entry = `
${t('statsTracker.dailyNote.heading')}
- ${t('statsTracker.dailyNote.project')} ${projectName}
- ${t('statsTracker.dailyNote.documents')} ${docNames || t('statsTracker.none')}
- ${t('statsTracker.dailyNote.wordsWritten')} ${session.wordsWritten}
- ${t('statsTracker.dailyNote.sprintsCompleted')} ${t('statsTracker.dailyNote.sprintEntry', { duration: session.duration })}
- ${t('statsTracker.dailyNote.wpm')} ${wpm}
- ${t('statsTracker.dailyNote.sessionTotal')} ${t('statsTracker.dailyNote.sessionTotalValue', { duration: session.duration })}
`;

    const dailyFile = this.app.vault.getAbstractFileByPath(dailyNotePath);

    if (dailyFile instanceof TFile) {
      // Atomic append — read-then-modify could clobber concurrent edits
      await this.app.vault.append(dailyFile, '\n' + entry);
      return;
    }
    try {
      // Documented behavior is "appended to your Daily Note" — create it if
      // it doesn't exist yet. The session is already in _writing-log.json
      // (main.ts logs every sprint), so no JSON fallback is needed here;
      // the old fallback double-logged the session.
      await this.app.vault.create(dailyNotePath, entry);
    } catch {
      // Parent folder missing or path invalid — the JSON log still has it
    }
  }

  private getDailyNotePath(): string {
    // Read folder AND date format from the daily-notes core plugin options,
    // formatting with moment (it ships with Obsidian) — the old hardcoded
    // ISO filename silently missed every non-default daily-note format
    type AppInternal = App & { internalPlugins?: { plugins?: Record<string, { instance?: { options?: { folder?: string; format?: string } } }> } };
    const options = (this.app as AppInternal).internalPlugins?.plugins?.['daily-notes']?.instance?.options;
    const fileName = moment().format(options?.format || 'YYYY-MM-DD');
    const folder = options?.folder || '';
    return normalizePath(folder ? `${folder}/${fileName}.md` : `${fileName}.md`);
  }

  updateFileWordCount(path: string, wordCount: number): void {
    if (!this.sessionBaselines.has(path)) {
      this.sessionBaselines.set(path, wordCount);
    }
    this.sessionCurrents.set(path, wordCount);
  }

  getSessionDelta(path: string): number {
    const baseline = this.sessionBaselines.get(path) ?? 0;
    const current  = this.sessionCurrents.get(path)  ?? baseline;
    return Math.max(0, current - baseline);
  }

  getTotalSessionWords(): number {
    let total = 0;
    for (const [path, current] of this.sessionCurrents) {
      const baseline = this.sessionBaselines.get(path) ?? current;
      total += Math.max(0, current - baseline);
    }
    return total;
  }

  getSessionStats(): DailyStats {
    return { ...this.sessionStats };
  }

  invalidateWordCountCache(): void {
    this.cachedTotalWordCount = null;
  }

  async getTotalWordCount(): Promise<number> {
    const project = this.plugin.projectManager.getActiveProject();
    if (!project) return 0;

    if (this.cachedTotalWordCount !== null && this.cachedWordCountProjectId === project.id) {
      return this.cachedTotalWordCount;
    }

    // The manuscript zone is the project's document set (#233).
    // cachedRead + parallel — these are display-only reads
    const docs = listManuscriptDocs(this.app, project.folderPath);
    const counts = await Promise.all(docs.map(async (file) => {
      const content = await this.app.vault.cachedRead(file);
      return this.plugin.fmManager.countWords(content);
    }));
    const total = counts.reduce((sum, n) => sum + n, 0);

    this.cachedTotalWordCount = total;
    this.cachedWordCountProjectId = project.id;
    return total;
  }

  calculateReadingTime(wordCount: number): string {
    const wpm = 238; // average reading speed
    const minutes = Math.ceil(wordCount / wpm);
    if (minutes < 60) return t('statsTracker.readingTime.minutes', { count: minutes });
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0
      ? t('statsTracker.readingTime.hoursMinutes', { hours, mins })
      : t('statsTracker.readingTime.hours', { hours });
  }

  async getWritingHistory(days: number): Promise<DailyLogEntry[]> {
    const project = this.plugin.projectManager.getActiveProject();
    const byDate = new Map<string, DailyLogEntry>();

    if (project) {
      const log = await this.plugin.projectManager.getWritingLog(project);
      for (const session of log) {
        // session.date is a UTC instant — group by its local calendar day
        const date = localDateString(session.date);
        const existing = byDate.get(date);
        if (existing) {
          existing.wordsWritten += session.wordsWritten;
          existing.sprintsCompleted++;
          existing.totalMinutes += session.duration;
        } else {
          byDate.set(date, {
            date,
            wordsWritten: session.wordsWritten,
            sprintsCompleted: 1,
            totalMinutes: session.duration,
          });
        }
      }
    }

    const result: DailyLogEntry[] = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = localDateString(d);
      result.push(byDate.get(dateStr) ?? {
        date: dateStr,
        wordsWritten: 0,
        sprintsCompleted: 0,
        totalMinutes: 0,
      });
    }
    return result;
  }

  async getStreak(): Promise<number> {
    const project = this.plugin.projectManager.getActiveProject();
    if (!project) return 0;

    // The streak only changes when a sprint is recorded (which invalidates
    // this cache) — don't re-read the writing log from disk on every poll
    if (this.cachedStreak && this.cachedStreak.projectId === project.id) {
      return this.cachedStreak.value;
    }

    const log = await this.plugin.projectManager.getWritingLog(project);
    if (log.length === 0) return 0;

    const dates = new Set(log.map(s => localDateString(s.date)));
    let streak = 0;
    const today = new Date();

    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = localDateString(d);
      if (dates.has(dateStr)) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }

    this.cachedStreak = { projectId: project.id, value: streak };
    return streak;
  }
}
