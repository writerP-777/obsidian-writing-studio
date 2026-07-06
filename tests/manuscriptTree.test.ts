import { App, TFile, TFolder } from 'obsidian';
import {
  buildManuscriptTree, listManuscriptDocs, planCompile,
  ManuscriptNode, CompilePlanItem,
} from '../src/manuscriptTree';

// ─── Vault fixture ───────────────────────────────────────────────────────────

interface FixtureWorld {
  app: App;
  root: TFolder;
}

// Builds a mock vault folder tree; frontmatter is keyed by file path.
function makeWorld(fm: Record<string, Record<string, unknown>> = {}): FixtureWorld & {
  folder: (parent: TFolder, name: string) => TFolder;
  doc: (parent: TFolder, name: string) => TFile;
  file: (parent: TFolder, name: string, extension: string) => TFile;
} {
  const byPath = new Map<string, TFile | TFolder>();
  const root = new TFolder('Projects/My Book');
  byPath.set(root.path, root);

  const folder = (parent: TFolder, name: string): TFolder => {
    const f = new TFolder(`${parent.path}/${name}`);
    parent.children.push(f);
    byPath.set(f.path, f);
    return f;
  };
  const file = (parent: TFolder, name: string, extension: string): TFile => {
    const f = new TFile(`${parent.path}/${name}`, extension);
    parent.children.push(f);
    byPath.set(f.path, f);
    return f;
  };
  const doc = (parent: TFolder, name: string): TFile => file(parent, name, 'md');

  const app = {
    vault: { getAbstractFileByPath: (p: string) => byPath.get(p) ?? null },
    metadataCache: {
      getFileCache: (f: TFile) => (fm[f.path] ? { frontmatter: fm[f.path] } : null),
    },
  } as unknown as App;

  return { app, root, folder, doc, file };
}

// ─── buildManuscriptTree ─────────────────────────────────────────────────────

describe('buildManuscriptTree', () => {
  it('orders siblings on the shared number line and nests folders', () => {
    const w = makeWorld({
      'Projects/My Book/Opening.md': { 'binder-order': 15 },
    });
    const part = w.folder(w.root, '020~ Part One');
    w.doc(part, 'Scene.md');
    w.doc(w.root, 'Opening.md');
    w.doc(w.root, 'Zeta.md'); // unordered → after every ordered sibling

    const { nodes } = buildManuscriptTree(w.app, w.root.path);

    expect(nodes.map(n => n.title)).toEqual(['Opening', 'Part One', 'Zeta']);
    const folder = nodes[1];
    expect(folder.kind).toBe('folder');
    expect(folder.kind === 'folder' && folder.children.map(c => c.title)).toEqual(['Scene']);
  });

  it('drops hidden names, non-markdown files, and reserved root folders', () => {
    const w = makeWorld();
    w.doc(w.root, 'One.md');
    w.file(w.root, '_binder.json', 'json');
    w.file(w.root, 'cover.png', 'png');
    w.folder(w.root, 'Research');
    w.folder(w.root, 'Exports');

    const { nodes, docFiles } = buildManuscriptTree(w.app, w.root.path);

    expect(nodes.map(n => n.title)).toEqual(['One']);
    expect(docFiles.map(f => f.path)).toEqual(['Projects/My Book/One.md']);
  });

  it('keeps a nested folder named Research when the walk is rooted inside the zone', () => {
    const w = makeWorld();
    const part = w.folder(w.root, 'Part One');
    const nested = w.folder(part, 'Research');
    w.doc(nested, 'Lore.md');

    const subtree = buildManuscriptTree(w.app, part.path, { excludeReservedAtRoot: false });

    expect(subtree.nodes.map(n => n.title)).toEqual(['Research']);
  });

  it('reads binder-compile: false as compile-excluded but keeps the doc in docFiles', () => {
    const w = makeWorld({
      'Projects/My Book/Cut.md': { 'binder-compile': false },
    });
    w.doc(w.root, 'Cut.md');
    w.doc(w.root, 'Kept.md');

    const { nodes } = buildManuscriptTree(w.app, w.root.path);
    const docs = listManuscriptDocs(w.app, w.root.path);

    expect(nodes.map(n => n.kind === 'doc' && n.compileExcluded)).toEqual([true, false]);
    // The targets dashboard manages goals for excluded documents too
    expect(docs.map(f => f.name)).toEqual(['Cut.md', 'Kept.md']);
  });

  it('returns empty for a path that is not a folder', () => {
    const w = makeWorld();
    expect(buildManuscriptTree(w.app, 'Projects/Nope')).toEqual({ nodes: [], docFiles: [] });
  });
});

// ─── planCompile ─────────────────────────────────────────────────────────────

const doc = (title: string, compileExcluded = false): ManuscriptNode =>
  ({ kind: 'doc', path: `${title}.md`, title, compileExcluded });
const folder = (title: string, children: ManuscriptNode[]): ManuscriptNode =>
  ({ kind: 'folder', title, children });

const render = (items: CompilePlanItem[]): string[] =>
  items.map(i => i.kind === 'heading'
    ? `H${i.level}:${i.title}`
    : `doc:${i.title}@${i.headingLevel === null ? '-' : i.headingLevel}`);

describe('planCompile', () => {
  const nested = [
    doc('Opening'),
    folder('Part One', [
      doc('Chapter 1'),
      folder('Act 2', [doc('Scene')]),
    ]),
  ];

  it('keeps document headings a flat h1 when folder names are off', () => {
    const plan = planCompile(nested, { includeFolderNames: false, includeTitlesAsHeadings: true });
    expect(render(plan)).toEqual(['doc:Opening@1', 'doc:Chapter 1@1', 'doc:Scene@1']);
  });

  it('emits folder headings at folder depth and shifts documents one below', () => {
    const plan = planCompile(nested, { includeFolderNames: true, includeTitlesAsHeadings: true });
    expect(render(plan)).toEqual([
      'doc:Opening@1',       // loose at the root → h1, same as today
      'H1:Part One',
      'doc:Chapter 1@2',
      'H2:Act 2',
      'doc:Scene@3',
    ]);
  });

  it('emits folder headings without document headings when titles are off', () => {
    const plan = planCompile(nested, { includeFolderNames: true, includeTitlesAsHeadings: false });
    expect(render(plan)).toEqual([
      'doc:Opening@-', 'H1:Part One', 'doc:Chapter 1@-', 'H2:Act 2', 'doc:Scene@-',
    ]);
  });

  it('skips compile-excluded documents and headings of folders that contribute nothing', () => {
    const plan = planCompile([
      doc('Kept'),
      folder('All cut', [doc('Cut', true), folder('Empty', [])]),
    ], { includeFolderNames: true, includeTitlesAsHeadings: true });
    expect(render(plan)).toEqual(['doc:Kept@1']);
  });

  it('still emits a folder heading when only a nested descendant compiles', () => {
    const plan = planCompile([
      folder('Part', [doc('Cut', true), folder('Act', [doc('Deep')])]),
    ], { includeFolderNames: true, includeTitlesAsHeadings: true });
    expect(render(plan)).toEqual(['H1:Part', 'H2:Act', 'doc:Deep@3']);
  });

  it('caps heading levels at h6 for deeply nested folders', () => {
    let tree: ManuscriptNode[] = [doc('Deep')];
    for (let i = 8; i >= 1; i--) tree = [folder(`F${i}`, tree)];

    const plan = planCompile(tree, { includeFolderNames: true, includeTitlesAsHeadings: true });

    const levels = plan.filter(i => i.kind === 'heading').map(i => i.kind === 'heading' && i.level);
    expect(levels).toEqual([1, 2, 3, 4, 5, 6, 6, 6]);
    expect(render(plan).pop()).toBe('doc:Deep@6');
  });

  it('is byte-stable for a flat project even with folder names on', () => {
    const flat = [doc('One'), doc('Two')];
    const on = planCompile(flat, { includeFolderNames: true, includeTitlesAsHeadings: true });
    const off = planCompile(flat, { includeFolderNames: false, includeTitlesAsHeadings: true });
    expect(on).toEqual(off);
  });
});
