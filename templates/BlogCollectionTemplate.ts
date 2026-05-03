import { App, normalizePath } from 'obsidian';
import { WritingProject } from '../models/Project';
import { BinderData, BinderItem } from '../models/BinderItem';

export class BlogCollectionTemplate {
  static async apply(app: App, project: WritingProject): Promise<BinderData> {
    const now = new Date().toISOString().split('T')[0];
    const chaptersPath = normalizePath(`${project.folderPath}/Chapters`);
    const year = new Date().getFullYear();

    await BlogCollectionTemplate.createFolder(app, normalizePath(`${chaptersPath}/${year}`));

    const firstPostFile = normalizePath(`${chaptersPath}/${year}/${now}-first-post.md`);
    await BlogCollectionTemplate.createFile(app, firstPostFile, BlogCollectionTemplate.firstPostDoc(now));

    const items: BinderItem[] = [
      {
        id: `item-year-${year}`,
        title: String(year),
        filePath: '',
        type: 'group',
        order: 1,
        status: 'draft',
        includeInExport: false,
        children: [
          {
            id: 'item-first-post',
            title: 'First Post',
            filePath: firstPostFile,
            type: 'article',
            order: 1,
            status: 'draft',
            wordCountGoal: 800,
            includeInExport: true,
          },
        ],
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

  private static async createFolder(app: App, path: string): Promise<void> {
    if (!app.vault.getAbstractFileByPath(path)) {
      await app.vault.createFolder(path);
    }
  }

  private static firstPostDoc(date: string): string {
    return `---
title: "First Post"
type: article
order: 1
status: draft
word-count-goal: 800
word-count: 0
created: ${date}
modified: ${date}
tags: [writing-studio]
---

# First Post

*Write your first blog post here.*
`;
  }
}
