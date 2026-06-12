import { localDateString } from '../src/dates';
import { WritingProject } from '../models/Project';
import { TemplateManifest, templateDoc } from '../src/scaffold';

export function articleSeriesManifest(project: WritingProject): TemplateManifest {
  const date = localDateString();
  return {
    items: [
      {
        id: 'item-series-overview',
        title: 'Series Overview',
        type: 'note',
        fileName: 'Series Overview',
        includeInExport: false,
        content: templateDoc({
          title: 'Series Overview', fmType: 'note', order: 1, date,
          tags: ['writing-studio', 'series-meta'],
          heading: `${project.title} — Series Overview`,
          body: `## Series Description

*Describe the series premise, target audience, and goals here.*

## Article Schedule

| # | Title | Status | Published |
|---|-------|--------|-----------|
| 1 | Article 1 | Draft | — |

## WordPress Settings

- **Site:** *(configure in Settings → WordPress)*
- **Category:** *(set in Project Settings)*`,
        }),
      },
      {
        id: 'item-article-1',
        title: 'Article 1',
        type: 'article',
        fileName: 'Article 1',
        wordCountGoal: 1500,
        content: templateDoc({
          title: 'Article 1', fmType: 'article', order: 1, goal: 1500, date,
          body: '*Write your first article here.*',
        }),
      },
    ],
  };
}
