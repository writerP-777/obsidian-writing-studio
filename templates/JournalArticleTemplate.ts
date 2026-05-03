import { App, normalizePath } from 'obsidian';
import { WritingProject } from '../models/Project';
import { BinderData, BinderItem } from '../models/BinderItem';

export class JournalArticleTemplate {
  static async apply(app: App, project: WritingProject): Promise<BinderData> {
    const now = new Date().toISOString().split('T')[0];
    const p = (name: string) => normalizePath(`${project.folderPath}/Chapters/${name}.md`);

    const docs: Array<[string, string]> = [
      [p('Title Page'),         JournalArticleTemplate.titlePageDoc(project.title, project.author, now)],
      [p('Abstract'),           JournalArticleTemplate.standardDoc('Abstract',          'abstract',   2, 250,  now, 'Write a concise summary of the article in 150–250 words. Include research question, methodology, key findings, and conclusion.')],
      [p('Keywords'),           JournalArticleTemplate.standardDoc('Keywords',           'keywords',   3, 0,    now, 'List 4–6 keywords separated by commas.')],
      [p('Introduction'),       JournalArticleTemplate.standardDoc('Introduction',       'section',    4, 600,  now, 'Introduce the topic, state the research question or thesis, and outline the structure of the article.')],
      [p('Literature Review'),  JournalArticleTemplate.standardDoc('Literature Review',  'section',    5, 1000, now, 'Survey the relevant scholarship. Identify gaps your article addresses.')],
      [p('Methodology'),        JournalArticleTemplate.standardDoc('Methodology',        'section',    6, 600,  now, 'Describe your research method, sources, and analytical approach.')],
      [p('Findings - Analysis'),JournalArticleTemplate.standardDoc('Findings / Analysis','section',    7, 1500, now, 'Present and analyze your findings. Use subheadings as needed.')],
      [p('Discussion'),         JournalArticleTemplate.standardDoc('Discussion',         'section',    8, 800,  now, 'Interpret findings in light of the literature. Address implications and limitations.')],
      [p('Conclusion'),         JournalArticleTemplate.standardDoc('Conclusion',         'section',    9, 400,  now, 'Summarize the argument, restate significance, and suggest future research directions.')],
      [p('References'),         JournalArticleTemplate.standardDoc('References',         'references', 10, 0,   now, 'List all cited works here. Format according to target journal style (APA, MLA, Chicago, etc.).')],
      [p('Appendices'),         JournalArticleTemplate.standardDoc('Appendices',         'appendix',   11, 0,   now, 'Include supplementary materials, data tables, or extended quotations here if needed.')],
    ];

    for (const [filePath, content] of docs) {
      await JournalArticleTemplate.createFile(app, filePath, content);
    }

    const items: BinderItem[] = [
      { id: 'ja-title-page',        title: 'Title Page',          filePath: p('Title Page'),          type: 'section', order: 1,  status: 'draft', wordCountGoal: 500,  includeInExport: true },
      { id: 'ja-abstract',          title: 'Abstract',            filePath: p('Abstract'),            type: 'section', order: 2,  status: 'draft', wordCountGoal: 250,  includeInExport: true },
      { id: 'ja-keywords',          title: 'Keywords',            filePath: p('Keywords'),            type: 'section', order: 3,  status: 'draft',                      includeInExport: true },
      { id: 'ja-introduction',      title: 'Introduction',        filePath: p('Introduction'),        type: 'section', order: 4,  status: 'draft', wordCountGoal: 600,  includeInExport: true },
      { id: 'ja-literature-review', title: 'Literature Review',   filePath: p('Literature Review'),   type: 'section', order: 5,  status: 'draft', wordCountGoal: 1000, includeInExport: true },
      { id: 'ja-methodology',       title: 'Methodology',         filePath: p('Methodology'),         type: 'section', order: 6,  status: 'draft', wordCountGoal: 600,  includeInExport: true },
      { id: 'ja-findings',          title: 'Findings / Analysis', filePath: p('Findings - Analysis'), type: 'section', order: 7,  status: 'draft', wordCountGoal: 1500, includeInExport: true },
      { id: 'ja-discussion',        title: 'Discussion',          filePath: p('Discussion'),          type: 'section', order: 8,  status: 'draft', wordCountGoal: 800,  includeInExport: true },
      { id: 'ja-conclusion',        title: 'Conclusion',          filePath: p('Conclusion'),          type: 'section', order: 9,  status: 'draft', wordCountGoal: 400,  includeInExport: true },
      { id: 'ja-references',        title: 'References',          filePath: p('References'),          type: 'section', order: 10, status: 'draft',                      includeInExport: true },
      { id: 'ja-appendices',        title: 'Appendices',          filePath: p('Appendices'),          type: 'section', order: 11, status: 'draft',                      includeInExport: true },
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

  private static titlePageDoc(title: string, author: string, date: string): string {
    return `---
title: "${title}"
author: "${author}"
institutional-affiliation: ""
submission-date: "${date}"
journal-target: ""
submission-deadline: ""
type: section
order: 1
status: draft
word-count-goal: 500
word-count: 0
created: ${date}
modified: ${date}
tags: [writing-studio]
---

# ${title}

${JournalArticleTemplate.hint('Enter the article title, author name, institutional affiliation, submission date, and target journal name.')}
`;
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

${JournalArticleTemplate.hint(hintText)}
`;
  }
}
