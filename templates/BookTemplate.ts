import { App, normalizePath } from 'obsidian';
import { localDateString } from '../src/dates';
import { WritingProject } from '../models/Project';
import { BinderData, BinderItem } from '../models/BinderItem';

export class BookTemplate {
  static async apply(app: App, project: WritingProject): Promise<BinderData> {
    const now = localDateString();
    const chaptersPath = normalizePath(`${project.folderPath}/Chapters`);

    const frontMatterFile = normalizePath(`${chaptersPath}/Front Matter.md`);
    const chapter1File = normalizePath(`${chaptersPath}/Part 1 - Chapter 1.md`);
    const backMatterFile = normalizePath(`${chaptersPath}/Back Matter.md`);

    await BookTemplate.createFile(app, frontMatterFile, BookTemplate.frontMatterDoc(now));
    await BookTemplate.createFile(app, chapter1File, BookTemplate.chapter1Doc(project.title, now));
    await BookTemplate.createFile(app, backMatterFile, BookTemplate.backMatterDoc(now));

    const items: BinderItem[] = [
      {
        id: 'item-front-matter',
        title: 'Front Matter',
        filePath: frontMatterFile,
        type: 'section',
        order: 1,
        status: 'draft',
        includeInExport: true,
      },
      {
        id: 'item-part-1',
        title: 'Part 1',
        filePath: '',
        type: 'part',
        order: 2,
        status: 'draft',
        includeInExport: true,
        children: [
          {
            id: 'item-chapter-1',
            title: 'Chapter 1',
            filePath: chapter1File,
            type: 'chapter',
            order: 1,
            status: 'draft',
            wordCountGoal: 3000,
            includeInExport: true,
          },
        ],
      },
      {
        id: 'item-back-matter',
        title: 'Back Matter',
        filePath: backMatterFile,
        type: 'section',
        order: 3,
        status: 'draft',
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

  private static frontMatterDoc(date: string): string {
    return `---
title: "Front Matter"
type: section
order: 1
status: draft
word-count: 0
created: ${date}
modified: ${date}
tags: [writing-studio]
---

# Front Matter

*Title page, dedication, table of contents, and other front matter goes here.*
`;
  }

  private static chapter1Doc(_projectTitle: string, date: string): string {
    return `---
title: "Chapter 1"
type: chapter
order: 1
status: draft
word-count-goal: 3000
word-count: 0
created: ${date}
modified: ${date}
tags: [writing-studio]
---

# Chapter 1

*Begin your story here.*
`;
  }

  private static backMatterDoc(date: string): string {
    return `---
title: "Back Matter"
type: section
order: 3
status: draft
word-count: 0
created: ${date}
modified: ${date}
tags: [writing-studio]
---

# Back Matter

*Acknowledgments, bibliography, author bio, and other back matter goes here.*
`;
  }
}
