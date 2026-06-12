import { localDateString } from '../src/dates';
import { WritingProject } from '../models/Project';
import { BinderItem } from '../models/BinderItem';
import { ManifestNode, TemplateManifest, templateDoc, placeholderHint } from '../src/scaffold';

interface SectionSpec {
  id: string;
  title: string;
  fileName: string;
  type: BinderItem['type'];
  fmType: string;
  goal?: number;
  exportExcluded?: boolean;
  extraFields?: Record<string, string>;
  hint: string;
}

const SECTIONS: SectionSpec[] = [
  { id: 'ma-pitch', title: 'Pitch / Query Notes', fileName: 'Pitch - Query Notes', type: 'note', fmType: 'notes', goal: 300, exportExcluded: true,
    extraFields: { 'target-publication': '', 'editor-contact': '', 'deadline': '' },
    hint: 'Record your pitch angle, target publication, editor contact, and deadline here.' },
  { id: 'ma-headline', title: 'Headline & Deck', fileName: 'Headline and Deck', type: 'section', fmType: 'headline', goal: 30,
    hint: 'Write your working headline and subheadline (deck) here. Headline: punchy, specific. Deck: expands the promise of the headline.' },
  { id: 'ma-lede', title: 'Lede (Opening)', fileName: 'Lede', type: 'section', fmType: 'section', goal: 150,
    hint: 'Write your opening paragraph. Anecdote, scene, provocative statement, or surprising fact. Hook the reader immediately.' },
  { id: 'ma-nut-graf', title: 'Nut Graf', fileName: 'Nut Graf', type: 'section', fmType: 'section', goal: 100,
    hint: 'Tell the reader what this story is about and why it matters now. Usually 1–2 paragraphs following the lede.' },
  { id: 'ma-body', title: 'Body', fileName: 'Body', type: 'section', fmType: 'section', goal: 1500,
    hint: 'Develop the story. Alternate between narrative, quotes, data, and analysis. Use subheadings to organize long sections.' },
  { id: 'ma-quotes', title: 'Quotes & Sources', fileName: 'Quotes and Sources', type: 'note', fmType: 'notes', exportExcluded: true,
    hint: 'Collect key quotes and source attributions here for reference while writing.' },
  { id: 'ma-kicker', title: 'Kicker (Closing)', fileName: 'Kicker', type: 'section', fmType: 'section', goal: 150,
    hint: 'Write your closing. Return to the opening anecdote, deliver the payoff, or leave the reader with a resonant final thought.' },
  { id: 'ma-fact-check', title: 'Fact-Check Notes', fileName: 'Fact-Check Notes', type: 'note', fmType: 'notes', exportExcluded: true,
    hint: 'List every factual claim that requires verification, with source links or contact info.' },
  { id: 'ma-author-bio', title: 'Author Bio', fileName: 'Author Bio', type: 'section', fmType: 'bio', goal: 75,
    hint: 'Write a third-person author bio of 50–75 words for publication.' },
];

export function magazineArticleManifest(_project: WritingProject): TemplateManifest {
  const date = localDateString();

  const items: ManifestNode[] = SECTIONS.map((s, i) => ({
    id: s.id,
    title: s.title,
    type: s.type,
    fileName: s.fileName,
    wordCountGoal: s.goal,
    includeInExport: !s.exportExcluded,
    content: templateDoc({
      title: s.title, fmType: s.fmType, order: i + 1, goal: s.goal, date,
      exportExcluded: s.exportExcluded,
      extraFields: s.extraFields,
      body: placeholderHint(s.hint),
    }),
  }));

  return { items };
}
