import { App, TFile, normalizePath } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { t } from './i18n';
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

  constructor(plugin: WritingStudioPlugin) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.sessionStats = this.newDailyStats();
  }

  private newDailyStats(): DailyStats {
    return {
      date: new Date().toISOString().split('T')[0],
      wordsWritten: 0,
      sprintsCompleted: 0,
      totalMinutes: 0,
      documents: [],
    };
  }

  recordSprint(session: SprintSession): void {
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
    const today = new Date().toISOString().split('T')[0];
    const dailyNotePath = this.getDailyNotePath(today);

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

    let dailyFile = this.app.vault.getAbstractFileByPath(dailyNotePath);

    if (dailyFile instanceof TFile) {
      const content = await this.app.vault.read(dailyFile);
      await this.app.vault.modify(dailyFile, content + '\n' + entry);
    } else {
      // Fall back to writing-log.json
      const activeProject = this.plugin.projectManager.getActiveProject();
      if (activeProject) {
        await this.plugin.projectManager.logSprintSession(activeProject, session);
      }
    }
  }

  private getDailyNotePath(date: string): string {
    // Try to get daily notes folder from Obsidian daily notes config
    type AppInternal = App & { internalPlugins?: { plugins?: Record<string, { instance?: { options?: { folder?: string } } }> } };
    const dailyNotesPlugin = (this.app as AppInternal).internalPlugins?.plugins?.['daily-notes'];
    const folder = dailyNotesPlugin?.instance?.options?.folder || '';
    // Use the date as-is (ISO format) since we can't easily format with moment here
    const fileName = date;
    if (folder) {
      return normalizePath(`${folder}/${fileName}.md`);
    }
    return normalizePath(`${fileName}.md`);
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

  async getTotalWordCount(): Promise<number> {
    const project = this.plugin.projectManager.getActiveProject();
    if (!project) return 0;

    const binder = await this.plugin.projectManager.loadBinder(project);
    const items = this.plugin.projectManager.flattenBinder(binder.items);
    let total = 0;

    for (const item of items) {
      const file = this.app.vault.getAbstractFileByPath(item.filePath);
      if (file instanceof TFile) {
        const content = await this.app.vault.read(file);
        total += this.plugin.fmManager.countWords(content);
      }
    }

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
        const date = session.date.split('T')[0];
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
      const dateStr = d.toISOString().split('T')[0];
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

    const log = await this.plugin.projectManager.getWritingLog(project);
    if (log.length === 0) return 0;

    const dates = new Set(log.map(s => s.date.split('T')[0]));
    let streak = 0;
    const today = new Date();

    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      if (dates.has(dateStr)) {
        streak++;
      } else if (i > 0) {
        break;
      }
    }

    return streak;
  }
}
