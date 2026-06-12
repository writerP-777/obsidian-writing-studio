import { localDateString } from '../src/dates';
import { WritingProject } from '../models/Project';
import { ManifestNode, TemplateManifest, templateDoc, placeholderHint } from '../src/scaffold';

interface SectionSpec {
  id: string;
  title: string;
  fileName?: string; // defaults to title
  fmType: string;
  goal?: number;
  hint: string;
}

const SECTIONS: SectionSpec[] = [
  { id: 'ja-abstract', title: 'Abstract', fmType: 'abstract', goal: 250,
    hint: 'Write a concise summary of the article in 150–250 words. Include research question, methodology, key findings, and conclusion.' },
  { id: 'ja-keywords', title: 'Keywords', fmType: 'keywords',
    hint: 'List 4–6 keywords separated by commas.' },
  { id: 'ja-introduction', title: 'Introduction', fmType: 'section', goal: 600,
    hint: 'Introduce the topic, state the research question or thesis, and outline the structure of the article.' },
  { id: 'ja-literature-review', title: 'Literature Review', fmType: 'section', goal: 1000,
    hint: 'Survey the relevant scholarship. Identify gaps your article addresses.' },
  { id: 'ja-methodology', title: 'Methodology', fmType: 'section', goal: 600,
    hint: 'Describe your research method, sources, and analytical approach.' },
  { id: 'ja-findings', title: 'Findings / Analysis', fileName: 'Findings - Analysis', fmType: 'section', goal: 1500,
    hint: 'Present and analyze your findings. Use subheadings as needed.' },
  { id: 'ja-discussion', title: 'Discussion', fmType: 'section', goal: 800,
    hint: 'Interpret findings in light of the literature. Address implications and limitations.' },
  { id: 'ja-conclusion', title: 'Conclusion', fmType: 'section', goal: 400,
    hint: 'Summarize the argument, restate significance, and suggest future research directions.' },
  { id: 'ja-references', title: 'References', fmType: 'references',
    hint: 'List all cited works here. Format according to target journal style (APA, MLA, Chicago, etc.).' },
  { id: 'ja-appendices', title: 'Appendices', fmType: 'appendix',
    hint: 'Include supplementary materials, data tables, or extended quotations here if needed.' },
];

export function journalArticleManifest(project: WritingProject): TemplateManifest {
  const date = localDateString();

  const titlePage: ManifestNode = {
    id: 'ja-title-page',
    title: 'Title Page',
    type: 'section',
    fileName: 'Title Page',
    wordCountGoal: 500,
    content: templateDoc({
      title: project.title, fmType: 'section', order: 1, goal: 500, date,
      extraFields: {
        author: project.author,
        'institutional-affiliation': '',
        'submission-date': date,
        'journal-target': '',
        'submission-deadline': '',
      },
      body: placeholderHint('Enter the article title, author name, institutional affiliation, submission date, and target journal name.'),
    }),
  };

  const sections: ManifestNode[] = SECTIONS.map((s, i) => ({
    id: s.id,
    title: s.title,
    type: 'section',
    fileName: s.fileName ?? s.title,
    wordCountGoal: s.goal,
    content: templateDoc({
      title: s.title, fmType: s.fmType, order: i + 2, goal: s.goal, date,
      body: placeholderHint(s.hint),
    }),
  }));

  return { items: [titlePage, ...sections] };
}
