// Move-plan execution through the view's real executor (#268). planMove is
// unit-tested as a pure planner; these tests feed its actual output through
// FilesystemBinderView.executeMove against an in-memory vault, locking the
// two #228 guarantees that had no execution-level coverage: every rename
// goes through fileManager.renameFile (one atomic op per move — links heal,
// a folder carries its subtree), and a failure stops the plan without
// leaving the failed operation half-applied.

import { Notice, WorkspaceLeaf } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { FilesystemBinderView } from '../src/FilesystemBinderView';
import { planMove, MoveEntry, MoveOp } from '../src/binderMove';
import { FakeVaultApp } from './fakeVaultApp';

const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1);

const doc = (path: string, binderOrder: number | null = null): MoveEntry => ({
  path,
  name: basename(path),
  isFolder: false,
  extension: 'md',
  binderOrder,
});

const folder = (path: string, binderOrder: number | null = null): MoveEntry => ({
  path,
  name: basename(path),
  isFolder: true,
  binderOrder,
});

function makeView(fake: FakeVaultApp): FilesystemBinderView {
  const leaf = { app: fake.app() } as unknown as WorkspaceLeaf;
  return new FilesystemBinderView(leaf, {} as unknown as WritingStudioPlugin);
}

async function execute(view: FilesystemBinderView, ops: MoveOp[]): Promise<void> {
  await view['executeMove'](ops);
}

beforeEach(() => {
  Notice.messages = [];
});

describe('executeMove runs a real planMove plan against the vault', () => {
  it('moves a document in one rename and writes its order at the post-move path', async () => {
    const fake = new FakeVaultApp();
    fake.file('P/010~ Part/A.md', { 'binder-order': 10 });
    fake.file('P/C.md');
    const view = makeView(fake);

    const ops = planMove(doc('P/C.md'), 'P/010~ Part', [doc('P/010~ Part/A.md', 10)], 'end', true);
    await execute(view, ops);

    expect(fake.byPath.has('P/C.md')).toBe(false);
    expect(fake.frontmatterAt('P/010~ Part/C.md')).toEqual({ 'binder-order': 20 });
    expect(fake.renameLog).toEqual(['P/C.md -> P/010~ Part/C.md']);
    expect(Notice.messages).toEqual([]);
  });

  it('moves a folder with its new marker as ONE rename that carries the subtree', async () => {
    const fake = new FakeVaultApp();
    fake.file('P/005~ Part/Ch 1.md');
    fake.file('P/Book/A.md', { 'binder-order': 10 });
    const view = makeView(fake);

    const ops = planMove(folder('P/005~ Part', 5), 'P/Book', [doc('P/Book/A.md', 10)], 'end', true);
    await execute(view, ops);

    // One atomic fileManager.renameFile — move and prefix folded, links heal,
    // no intermediate location ever existed for the document inside.
    expect(fake.renameLog).toEqual(['P/005~ Part -> P/Book/020~ Part']);
    expect(fake.byPath.has('P/Book/020~ Part/Ch 1.md')).toBe(true);
    expect(fake.byPath.has('P/005~ Part')).toBe(false);
    expect(Notice.messages).toEqual([]);
  });

  it('executes a materialization plan across documents and folders', async () => {
    const fake = new FakeVaultApp();
    fake.file('P/Book/A.md');
    fake.file('P/Book/Part/Ch 1.md');
    fake.file('P/D.md');
    const view = makeView(fake);

    // Unordered destination group: the drop materializes the whole group.
    const ops = planMove(doc('P/D.md'), 'P/Book', [doc('P/Book/A.md'), folder('P/Book/Part')], 'end', true);
    await execute(view, ops);

    expect(fake.frontmatterAt('P/Book/D.md')).toEqual({ 'binder-order': 30 });
    expect(fake.frontmatterAt('P/Book/A.md')).toEqual({ 'binder-order': 10 });
    expect(fake.byPath.has('P/Book/020~ Part')).toBe(true);
    expect(fake.byPath.has('P/Book/020~ Part/Ch 1.md')).toBe(true);
    expect(fake.renameLog).toEqual([
      'P/D.md -> P/Book/D.md',
      'P/Book/Part -> P/Book/020~ Part',
    ]);
    expect(Notice.messages).toEqual([]);
  });
});

describe('executeMove failure semantics', () => {
  it('a rename that throws stops the plan — nothing after it runs, the source stays put', async () => {
    const fake = new FakeVaultApp();
    fake.file('P/Book/A.md');
    fake.file('P/Book/Part/Ch 1.md');
    fake.file('P/D.md');
    fake.file('P/Book/D.md'); // occupies the first op's destination
    const view = makeView(fake);

    const ops = planMove(doc('P/D.md'), 'P/Book', [doc('P/Book/A.md'), folder('P/Book/Part')], 'end', true);
    await execute(view, ops);

    // The failed rename applied nothing: the source is exactly where it was.
    expect(fake.byPath.has('P/D.md')).toBe(true);
    expect(fake.frontmatterAt('P/D.md')).toEqual({});
    // Everything after the failure never ran.
    expect(fake.frontmatterAt('P/Book/A.md')).toEqual({});
    expect(fake.byPath.has('P/Book/Part')).toBe(true);
    expect(fake.byPath.has('P/Book/020~ Part')).toBe(false);
    // One notice names the failure.
    expect(Notice.messages).toHaveLength(1);
    expect(Notice.messages[0]).toContain('EEXIST');
  });

  it('a late failure keeps the earlier atomic operations — nothing is half-moved', async () => {
    const fake = new FakeVaultApp();
    fake.file('P/Book/A.md');
    fake.file('P/Book/Part/Ch 1.md');
    fake.file('P/D.md');
    fake.folder('P/Book/020~ Part'); // occupies the last op's destination
    const view = makeView(fake);

    const ops = planMove(doc('P/D.md'), 'P/Book', [doc('P/Book/A.md'), folder('P/Book/Part')], 'end', true);
    await execute(view, ops);

    // Ops before the failure landed whole.
    expect(fake.frontmatterAt('P/Book/D.md')).toEqual({ 'binder-order': 30 });
    expect(fake.frontmatterAt('P/Book/A.md')).toEqual({ 'binder-order': 10 });
    // The failed folder rename applied nothing: subtree intact at the source.
    expect(fake.byPath.has('P/Book/Part/Ch 1.md')).toBe(true);
    expect(fake.byPath.has('P/Book/020~ Part/Ch 1.md')).toBe(false);
    expect(Notice.messages).toHaveLength(1);
  });

  it('a file missing at execution time is skipped and the rest of the plan continues', async () => {
    const fake = new FakeVaultApp();
    fake.file('P/Book/A.md');
    fake.file('P/Book/Part/Ch 1.md');
    fake.file('P/D.md');
    const view = makeView(fake);

    const ops = planMove(doc('P/D.md'), 'P/Book', [doc('P/Book/A.md'), folder('P/Book/Part')], 'end', true);
    // A.md vanishes between plan and execution (external delete).
    fake.byPath.delete('P/Book/A.md');
    await execute(view, ops);

    expect(fake.frontmatterAt('P/Book/D.md')).toEqual({ 'binder-order': 30 });
    expect(fake.byPath.has('P/Book/020~ Part')).toBe(true);
    expect(Notice.messages).toEqual([]);
  });
});
