import { App, TFile, normalizePath } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { SprintSession } from '../models/SprintSession';

interface DailyStats {
  date: string;
  wordsWritten: number;
  sprintsCompleted: number;
  totalMinutes: number;
  documents: string[];
}

export class StatsTracker {
  private plugin: WritingStudioPlugin;
  private app: App;
  private sessionStats: DailyStats;

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
      this.appendToDailyNote(session);
    }
  }

  private async appendToDailyNote(session: SprintSession): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const dailyNotePath = this.getDailyNotePath(today);

    const project = this.plugin.projectManager.getActiveProject();
    const projectName = project?.title || 'Unknown Project';
    const docNames = session.documents.map(p => p.split('/').pop()?.replace('.md', '') || p).join(', ');
    const wpm = session.duration > 0 ? Math.round(session.wordsWritten / session.duration) : 0;

    const entry = `
## ✍️ Writing Activity
- **Project:** ${projectName}
- **Documents:** ${docNames || 'None'}
- **Words Written:** ${session.wordsWritten}
- **Sprints Completed:** 1 (${session.duration} min)
- **Words per Minute:** ${wpm}
- **Session Total:** ${session.duration} minutes
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
    const dailyNotesPlugin = (this.app as any).internalPlugins?.plugins?.['daily-notes'];
    const folder = dailyNotesPlugin?.instance?.options?.folder || '';
    // Use the date as-is (ISO format) since we can't easily format with moment here
    const fileName = date;
    if (folder) {
      return normalizePath(`${folder}/${fileName}.md`);
    }
    return normalizePath(`${fileName}.md`);
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
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
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
