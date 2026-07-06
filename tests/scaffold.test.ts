import { TemplateScaffolder, templateDoc, ManifestNode } from '../src/scaffold';
import { TEMPLATE_MANIFESTS } from '../templates/manifests';
import { WritingProject } from '../models/Project';
import { InMemoryVaultFiles } from './inMemoryVaultFiles';

function makeProject(): WritingProject {
  return {
    id: 'project-1',
    title: 'My Book',
    type: 'book',
    author: 'Avery',
    created: '2026-06-12',
    modified: '2026-06-12',
    description: '',
    folderPath: 'Projects/My Book',
    goals: {},
  };
}

// Since #233 the filesystem is the binder: scaffolding writes folders and
// documents only — structural nodes become real folders with order markers,
// documents carry binder-* frontmatter, and no _binder.json exists.
describe('TemplateScaffolder', () => {
  it('scaffolds the book template: docs with binder-order, part as a marker folder', async () => {
    const files = new InMemoryVaultFiles();
    await new TemplateScaffolder(files).apply(
      makeProject(), TEMPLATE_MANIFESTS.book!(makeProject()));

    expect(files.files.has('Projects/My Book/Chapters/Front Matter.md')).toBe(true);
    expect(files.folders).toContain('Projects/My Book/Chapters/020~ Part 1');
    expect(files.files.has('Projects/My Book/Chapters/020~ Part 1/Chapter 1.md')).toBe(true);
    expect(files.files.has('Projects/My Book/Chapters/Back Matter.md')).toBe(true);

    // One number line per sibling group: Front (10) < part folder (020~) < Back (30)
    expect(files.files.get('Projects/My Book/Chapters/Front Matter.md')).toContain('binder-order: 10');
    expect(files.files.get('Projects/My Book/Chapters/Back Matter.md')).toContain('binder-order: 30');
    const chapter = files.files.get('Projects/My Book/Chapters/020~ Part 1/Chapter 1.md') ?? '';
    expect(chapter).toContain('binder-order: 10');
    expect(chapter).toContain('word-count-goal: 3000');
  });

  it('never overwrites an existing file with the same name', async () => {
    const files = new InMemoryVaultFiles();
    files.files.set('Projects/My Book/Chapters/Front Matter.md', 'user content');

    await new TemplateScaffolder(files).apply(
      makeProject(), TEMPLATE_MANIFESTS.book!(makeProject()));

    expect(files.files.get('Projects/My Book/Chapters/Front Matter.md')).toBe('user content');
  });

  it('creates manifest folders before files (blog year folder, no structural node)', async () => {
    const files = new InMemoryVaultFiles();
    const year = new Date().getFullYear();

    await new TemplateScaffolder(files).apply(
      makeProject(), TEMPLATE_MANIFESTS.blog!(makeProject()));

    expect(files.folders).toContain(`Projects/My Book/Chapters/${year}`);
    const postPath = [...files.files.keys()].find(p => p.endsWith('-first-post.md'));
    expect(postPath).toMatch(new RegExp(`^Projects/My Book/Chapters/${year}/`));
  });

  it('scaffolds into the project documentFolder when set', async () => {
    const files = new InMemoryVaultFiles();
    const project: WritingProject = { ...makeProject(), type: 'series', documentFolder: 'Articles' };

    await new TemplateScaffolder(files).apply(
      project, TEMPLATE_MANIFESTS.series!(project));

    expect(files.files.has('Projects/My Book/Articles/Series Overview.md')).toBe(true);
    expect(files.files.has('Projects/My Book/Articles/Article 1.md')).toBe(true);
  });

  it('scaffolds into Chapters when documentFolder is absent (legacy projects)', async () => {
    const files = new InMemoryVaultFiles();

    await new TemplateScaffolder(files).apply(
      makeProject(), TEMPLATE_MANIFESTS.book!(makeProject()));

    expect(files.files.has('Projects/My Book/Chapters/Front Matter.md')).toBe(true);
  });
});

describe('template manifests', () => {
  const allTypes = Object.keys(TEMPLATE_MANIFESTS) as Array<keyof typeof TEMPLATE_MANIFESTS>;

  function walk(nodes: ManifestNode[], visit: (n: ManifestNode) => void): void {
    for (const node of nodes) {
      visit(node);
      if (node.children) walk(node.children, visit);
    }
  }

  it.each(allTypes)('%s: every file node has content and ids are unique', (type) => {
    const manifest = TEMPLATE_MANIFESTS[type]!(makeProject());
    const ids = new Set<string>();
    walk(manifest.items, node => {
      expect(ids.has(node.id)).toBe(false);
      ids.add(node.id);
      if (node.fileName) {
        expect(node.content).toBeTruthy();
        expect(node.content).toContain('# ');
        expect(node.content).toMatch(/^---\n/);
      } else {
        expect(['group', 'part']).toContain(node.type);
      }
    });
    expect(ids.size).toBeGreaterThan(0);
  });

  it('journal article keeps the divergent filename for Findings / Analysis', async () => {
    const files = new InMemoryVaultFiles();
    await new TemplateScaffolder(files).apply(
      makeProject(), TEMPLATE_MANIFESTS['journal-article']!(makeProject()));

    expect(files.files.has('Projects/My Book/Chapters/Findings - Analysis.md')).toBe(true);
  });

  it('magazine article excludes notes documents from compile via frontmatter', async () => {
    const files = new InMemoryVaultFiles();
    await new TemplateScaffolder(files).apply(
      makeProject(), TEMPLATE_MANIFESTS['magazine-article']!(makeProject()));

    expect(files.files.get('Projects/My Book/Chapters/Pitch - Query Notes.md')).toContain('binder-compile: false');
  });
});

describe('templateDoc', () => {
  it('emits goal and extra fields only when present, with binder-* keys and no title key', () => {
    const withGoal = templateDoc({ title: 'A', fmType: 'section', order: 10, goal: 500, date: '2026-06-12', body: 'x' });
    const without = templateDoc({ title: 'A', fmType: 'section', order: 10, date: '2026-06-12', body: 'x' });

    expect(withGoal).toContain('word-count-goal: 500');
    expect(without).not.toContain('word-count-goal');
    expect(without).toContain('tags: [writing-studio]');
    expect(without).toContain('binder-order: 10');
    expect(without).toContain('binder-status: draft');
    expect(without).toContain('binder-type: section');
    // The filename is the title (#233) — no frontmatter title key
    expect(without).not.toContain('title:');
  });
});
