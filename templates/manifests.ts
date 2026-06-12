import { ProjectType, WritingProject } from '../models/Project';
import { TemplateManifest } from '../src/scaffold';
import { bookManifest } from './BookTemplate';
import { articleSeriesManifest } from './ArticleSeriesTemplate';
import { blogCollectionManifest } from './BlogCollectionTemplate';
import { journalArticleManifest } from './JournalArticleTemplate';
import { magazineArticleManifest } from './MagazineArticleTemplate';

// Every non-blank project type's scaffold, as data. Adding a project type
// means adding a manifest builder here — no new file I/O code.
export const TEMPLATE_MANIFESTS: Partial<Record<ProjectType, (project: WritingProject) => TemplateManifest>> = {
  book: bookManifest,
  series: articleSeriesManifest,
  blog: blogCollectionManifest,
  'journal-article': journalArticleManifest,
  'magazine-article': magazineArticleManifest,
};
