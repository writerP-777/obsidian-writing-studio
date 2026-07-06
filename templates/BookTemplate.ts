import { localDateString } from '../src/dates';
import { WritingProject } from '../models/Project';
import { TemplateManifest, templateDoc } from '../src/scaffold';

export function bookManifest(_project: WritingProject): TemplateManifest {
  const date = localDateString();
  return {
    items: [
      {
        id: 'item-front-matter',
        title: 'Front Matter',
        type: 'section',
        fileName: 'Front Matter',
        content: templateDoc({
          title: 'Front Matter', fmType: 'section', order: 10, date,
          body: '*Title page, dedication, table of contents, and other front matter goes here.*',
        }),
      },
      {
        id: 'item-part-1',
        title: 'Part 1',
        type: 'part',
        children: [
          {
            id: 'item-chapter-1',
            title: 'Chapter 1',
            type: 'chapter',
            // Physically inside the Part 1 folder since #233, so the name no
            // longer needs to carry the part
            fileName: 'Chapter 1',
            wordCountGoal: 3000,
            content: templateDoc({
              title: 'Chapter 1', fmType: 'chapter', order: 10, goal: 3000, date,
              body: '*Begin your story here.*',
            }),
          },
        ],
      },
      {
        id: 'item-back-matter',
        title: 'Back Matter',
        type: 'section',
        fileName: 'Back Matter',
        content: templateDoc({
          title: 'Back Matter', fmType: 'section', order: 30, date,
          body: '*Acknowledgments, bibliography, author bio, and other back matter goes here.*',
        }),
      },
    ],
  };
}
