import { TemplateScaffolder, templateDoc, ManifestNode } from '../src/scaffold';
import { TEMPLATE_MANIFESTS } from '../templates/manifests';
import { WritingProject } from '../models/Project';
import { BinderItem } from '../models/BinderItem';
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

describe('TemplateScaffolder', () => {
  it('scaffolds the book template: files, tree shape, sibling orders', async () => {
    const files = new InMemoryVaultFiles();
    const binder = await new TemplateScaffolder(files).apply(
      makeProject(), TEMPLATE_MANIFESTS.book!(makeProject()));

    expect(files.files.has('Projects/My Book/Chapters/Front Matter.md')).toBe(true);
    expect(files.files.has('Projects/My Book/Chapters/Part 1 - Chapter 1.md')).toBe(true);
    expect(files.files.has('Projects/My Book/Chapters/Back Matter.md')).toBe(true);

    expect(binder.projectId).toBe('project-1');
    expect(binder.items.map(i => i.order)).toEqual([1, 2, 3]);
    const part = binder.items[1];
    expect(part.type).toBe('part');
    expect(part.filePath).toBe('');
    expect(part.children).toHaveLength(1);
    expect(part.children![0].wordCountGoal).toBe(3000);
    expect(part.children![0].order).toBe(1);
  });

  it('never overwrites an existing file with the same name', async () => {
    const files = new InMemoryVaultFiles();
    files.files.set('Projects/My Book/Chapters/Front Matter.md', 'user content');

    await new TemplateScaffolder(files).apply(
      makeProject(), TEMPLATE_MANIFESTS.book!(makeProject()));

    expect(files.files.get('Projects/My Book/Chapters/Front Matter.md')).toBe('user content');
  });

  it('creates manifest folders before files (blog year folder)', async () => {
    const files = new InMemoryVaultFiles();
    const year = new Date().getFullYear();

    const binder = await new TemplateScaffolder(files).apply(
      makeProject(), TEMPLATE_MANIFESTS.blog!(makeProject()));

    expect(files.folders).toContain(`Projects/My Book/Chapters/${year}`);
    const post = binder.items[0].children![0];
    expect(post.filePath).toMatch(new RegExp(`^Projects/My Book/Chapters/${year}/.*-first-post\\.md$`));
    expect(binder.items[0].includeInExport).toBe(false);
  });

  it('scaffolds into the project documentFolder when set', async () => {
    const files = new InMemoryVaultFiles();
    const project: WritingProject = { ...makeProject(), type: 'series', documentFolder: 'Articles' };

    const binder = await new TemplateScaffolder(files).apply(
      project, TEMPLATE_MANIFESTS.series!(project));

    expect(files.files.has('Projects/My Book/Articles/Series Overview.md')).toBe(true);
    expect(files.files.has('Projects/My Book/Articles/Article 1.md')).toBe(true);
    const paths = binder.items.flatMap(i => [i, ...(i.children ?? [])]).map(i => i.filePath).filter(Boolean);
    expect(paths.every(p => p.startsWith('Projects/My Book/Articles/'))).toBe(true);
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
    const binder = await new TemplateScaffolder(files).apply(
      makeProject(), TEMPLATE_MANIFESTS['journal-article']!(makeProject()));

    const flat: BinderItem[] = [];
    const collect = (items: BinderItem[]) => { for (const i of items) { flat.push(i); if (i.children) collect(i.children); } };
    collect(binder.items);
    const findings = flat.find(i => i.id === 'ja-findings');
    expect(findings?.title).toBe('Findings / Analysis');
    expect(findings?.filePath).toBe('Projects/My Book/Chapters/Findings - Analysis.md');
    expect(files.files.has('Projects/My Book/Chapters/Findings - Analysis.md')).toBe(true);
  });

  it('magazine article excludes notes documents from export in binder and frontmatter', async () => {
    const files = new InMemoryVaultFiles();
    const binder = await new TemplateScaffolder(files).apply(
      makeProject(), TEMPLATE_MANIFESTS['magazine-article']!(makeProject()));

    const pitch = binder.items.find(i => i.id === 'ma-pitch');
    expect(pitch?.includeInExport).toBe(false);
    expect(files.files.get('Projects/My Book/Chapters/Pitch - Query Notes.md')).toContain('include-in-export: false');
  });
});

describe('templateDoc', () => {
  it('emits goal and extra fields only when present', () => {
    const withGoal = templateDoc({ title: 'A', fmType: 'section', order: 1, goal: 500, date: '2026-06-12', body: 'x' });
    const without = templateDoc({ title: 'A', fmType: 'section', order: 1, date: '2026-06-12', body: 'x' });

    expect(withGoal).toContain('word-count-goal: 500');
    expect(without).not.toContain('word-count-goal');
    expect(without).toContain('tags: [writing-studio]');
  });
});
