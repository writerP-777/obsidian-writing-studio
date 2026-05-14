import { App, normalizePath } from 'obsidian';
import { WritingProject } from '../models/Project';
import { BinderData, BinderItem } from '../models/BinderItem';

export class ArticleSeriesTemplate {
  static async apply(app: App, project: WritingProject): Promise<BinderData> {
    const now = new Date().toISOString().split('T')[0];
    const chaptersPath = normalizePath(`${project.folderPath}/Chapters`);

    const seriesMetaFile = normalizePath(`${chaptersPath}/Series Overview.md`);
    const article1File = normalizePath(`${chaptersPath}/Article 1.md`);

    await ArticleSeriesTemplate.createFile(app, seriesMetaFile, ArticleSeriesTemplate.seriesOverviewDoc(project.title, now));
    await ArticleSeriesTemplate.createFile(app, article1File, ArticleSeriesTemplate.article1Doc(project.title, now));

    const items: BinderItem[] = [
      {
        id: 'item-series-overview',
        title: 'Series Overview',
        filePath: seriesMetaFile,
        type: 'note',
        order: 1,
        status: 'draft',
        includeInExport: false,
      },
      {
        id: 'item-article-1',
        title: 'Article 1',
        filePath: article1File,
        type: 'article',
        order: 2,
        status: 'draft',
        wordCountGoal: 1500,
        includeInExport: true,
      },
    ];

    return {
      version: '2.0',
      projectId: project.id,
      items,
    };
  }

  private static async createFile(app: App, path: string, content: string): Promise<void> {
    if (!app.vault.getAbstractFileByPath(path)) {
      await app.vault.create(path, content);
    }
  }

  private static seriesOverviewDoc(title: string, date: string): string {
    return `---
title: "Series Overview"
type: note
order: 1
status: draft
word-count: 0
created: ${date}
modified: ${date}
tags: [writing-studio, series-meta]
---

# ${title} — Series Overview

## Series Description

*Describe the series premise, target audience, and goals here.*

## Article Schedule

| # | Title | Status | Published |
|---|-------|--------|-----------|
| 1 | Article 1 | Draft | — |

## WordPress Settings

- **Site:** *(configure in Settings → WordPress)*
- **Category:** *(set in Project Settings)*
`;
  }

  private static article1Doc(_seriesTitle: string, date: string): string {
    return `---
title: "Article 1"
type: article
order: 1
status: draft
word-count-goal: 1500
word-count: 0
created: ${date}
modified: ${date}
tags: [writing-studio]
---

# Article 1

*Write your first article here.*
`;
  }
}
