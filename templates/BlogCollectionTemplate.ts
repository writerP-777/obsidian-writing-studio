import { localDateString } from '../src/dates';
import { WritingProject } from '../models/Project';
import { TemplateManifest, templateDoc } from '../src/scaffold';

export function blogCollectionManifest(_project: WritingProject): TemplateManifest {
  const date = localDateString();
  const year = new Date().getFullYear();
  return {
    folders: [String(year)],
    items: [
      {
        id: `item-year-${year}`,
        title: String(year),
        type: 'group',
        includeInExport: false,
        children: [
          {
            id: 'item-first-post',
            title: 'First Post',
            type: 'article',
            fileName: `${year}/${date}-first-post`,
            wordCountGoal: 800,
            content: templateDoc({
              title: 'First Post', fmType: 'article', order: 1, goal: 800, date,
              body: '*Write your first blog post here.*',
            }),
          },
        ],
      },
    ],
  };
}
