import { App, normalizePath } from 'obsidian';
import { localDateString } from '../src/dates';
import { WritingProject } from '../models/Project';
import { BinderData, BinderItem } from '../models/BinderItem';

export class MagazineArticleTemplate {
  static async apply(app: App, project: WritingProject): Promise<BinderData> {
    const now = localDateString();
    const p = (name: string) => normalizePath(`${project.folderPath}/Chapters/${name}.md`);

    const docs: Array<[string, string]> = [
      [p('Pitch - Query Notes'), MagazineArticleTemplate.notesDoc('Pitch / Query Notes', 'notes', 1, 300, now,
        'Record your pitch angle, target publication, editor contact, and deadline here.',
        { 'target-publication': '', 'editor-contact': '', 'deadline': '' })],
      [p('Headline and Deck'),   MagazineArticleTemplate.standardDoc('Headline & Deck',   'headline', 2, 30,   now, 'Write your working headline and subheadline (deck) here. Headline: punchy, specific. Deck: expands the promise of the headline.')],
      [p('Lede'),               MagazineArticleTemplate.standardDoc('Lede (Opening)',     'section',  3, 150,  now, 'Write your opening paragraph. Anecdote, scene, provocative statement, or surprising fact. Hook the reader immediately.')],
      [p('Nut Graf'),           MagazineArticleTemplate.standardDoc('Nut Graf',           'section',  4, 100,  now, 'Tell the reader what this story is about and why it matters now. Usually 1–2 paragraphs following the lede.')],
      [p('Body'),               MagazineArticleTemplate.standardDoc('Body',               'section',  5, 1500, now, 'Develop the story. Alternate between narrative, quotes, data, and analysis. Use subheadings to organize long sections.')],
      [p('Quotes and Sources'), MagazineArticleTemplate.notesDoc('Quotes & Sources',      'notes',    6, 0,    now, 'Collect key quotes and source attributions here for reference while writing.')],
      [p('Kicker'),             MagazineArticleTemplate.standardDoc('Kicker (Closing)',   'section',  7, 150,  now, 'Write your closing. Return to the opening anecdote, deliver the payoff, or leave the reader with a resonant final thought.')],
      [p('Fact-Check Notes'),   MagazineArticleTemplate.notesDoc('Fact-Check Notes',      'notes',    8, 0,    now, 'List every factual claim that requires verification, with source links or contact info.')],
      [p('Author Bio'),         MagazineArticleTemplate.standardDoc('Author Bio',         'bio',      9, 75,   now, 'Write a third-person author bio of 50–75 words for publication.')],
    ];

    for (const [filePath, content] of docs) {
      await MagazineArticleTemplate.createFile(app, filePath, content);
    }

    const items: BinderItem[] = [
      { id: 'ma-pitch',       title: 'Pitch / Query Notes', filePath: p('Pitch - Query Notes'), type: 'note', order: 1, status: 'draft', wordCountGoal: 300,  includeInExport: false },
      { id: 'ma-headline',    title: 'Headline & Deck',     filePath: p('Headline and Deck'),   type: 'section', order: 2, status: 'draft', wordCountGoal: 30, includeInExport: true },
      { id: 'ma-lede',        title: 'Lede (Opening)',      filePath: p('Lede'),               type: 'section', order: 3, status: 'draft', wordCountGoal: 150,  includeInExport: true },
      { id: 'ma-nut-graf',    title: 'Nut Graf',            filePath: p('Nut Graf'),           type: 'section', order: 4, status: 'draft', wordCountGoal: 100,  includeInExport: true },
      { id: 'ma-body',        title: 'Body',                filePath: p('Body'),               type: 'section', order: 5, status: 'draft', wordCountGoal: 1500, includeInExport: true },
      { id: 'ma-quotes',      title: 'Quotes & Sources',    filePath: p('Quotes and Sources'), type: 'note',    order: 6, status: 'draft',                      includeInExport: false },
      { id: 'ma-kicker',      title: 'Kicker (Closing)',    filePath: p('Kicker'),             type: 'section', order: 7, status: 'draft', wordCountGoal: 150,  includeInExport: true },
      { id: 'ma-fact-check',  title: 'Fact-Check Notes',   filePath: p('Fact-Check Notes'),   type: 'note',    order: 8, status: 'draft',                      includeInExport: false },
      { id: 'ma-author-bio',  title: 'Author Bio',          filePath: p('Author Bio'),         type: 'section', order: 9, status: 'draft', wordCountGoal: 75,   includeInExport: true },
    ];

    return { version: '2.0', projectId: project.id, items };
  }

  private static async createFile(app: App, path: string, content: string): Promise<void> {
    if (!app.vault.getAbstractFileByPath(path)) {
      await app.vault.create(path, content);
    }
  }

  private static hint(text: string): string {
    return `> [!note] Placeholder\n> *${text}*`;
  }

  private static standardDoc(
    title: string,
    type: string,
    order: number,
    goal: number,
    date: string,
    hintText: string,
  ): string {
    const goalLine = goal > 0 ? `\nword-count-goal: ${goal}` : '';
    return `---
title: "${title}"
type: ${type}
order: ${order}
status: draft${goalLine}
word-count: 0
created: ${date}
modified: ${date}
tags: [writing-studio]
---

# ${title}

${MagazineArticleTemplate.hint(hintText)}
`;
  }

  private static notesDoc(
    title: string,
    type: string,
    order: number,
    goal: number,
    date: string,
    hintText: string,
    extraFields: Record<string, string> = {},
  ): string {
    const goalLine = goal > 0 ? `\nword-count-goal: ${goal}` : '';
    const extra = Object.entries(extraFields)
      .map(([k, v]) => `\n${k}: "${v}"`)
      .join('');
    return `---
title: "${title}"
type: ${type}
order: ${order}
status: draft${goalLine}
include-in-export: false
word-count: 0
created: ${date}
modified: ${date}
tags: [writing-studio]${extra}
---

# ${title}

${MagazineArticleTemplate.hint(hintText)}
`;
  }
}
