import { localDateString } from '../src/dates';
import { WritingProject } from '../models/Project';
import { TemplateManifest, templateDoc } from '../src/scaffold';

export function blogCollectionManifest(_project: WritingProject): TemplateManifest {
  const date = localDateString();
  const year = new Date().getFullYear();
  // The year folder is a real folder (declared below) and the post's
  // fileName carries the path into it — since #233 the filesystem is the
  // binder, so no structural year node exists; a pure-numeric folder name
  // is a plain name and natural-sorts.
  return {
    folders: [String(year)],
    items: [
      {
        id: 'item-first-post',
        title: 'First Post',
        type: 'article',
        fileName: `${year}/${date}-first-post`,
        wordCountGoal: 800,
        content: templateDoc({
          title: 'First Post', fmType: 'article', order: 10, goal: 800, date,
          body: '*Write your first blog post here.*',
        }),
      },
    ],
  };
}
