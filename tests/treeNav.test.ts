import { treeNavAction, parentIndex, TreeRow } from '../src/treeNav';

const leaf = (depth = 0): TreeRow => ({ depth, hasChildren: false, isExpanded: false });
const group = (depth: number, isExpanded: boolean): TreeRow => ({ depth, hasChildren: true, isExpanded });

describe('treeNavAction', () => {
  it('moves with the vertical arrows regardless of row kind', () => {
    expect(treeNavAction('ArrowDown', leaf())).toBe('next');
    expect(treeNavAction('ArrowUp', group(0, true))).toBe('prev');
    expect(treeNavAction('ArrowDown', null)).toBe('next');
  });

  it('ArrowRight opens a closed group, descends into an open one, ignores leaves', () => {
    expect(treeNavAction('ArrowRight', group(0, false))).toBe('expand');
    expect(treeNavAction('ArrowRight', group(0, true))).toBe('next');
    expect(treeNavAction('ArrowRight', leaf())).toBeNull();
    expect(treeNavAction('ArrowRight', null)).toBeNull();
  });

  it('ArrowLeft closes an open group, otherwise climbs to the parent', () => {
    expect(treeNavAction('ArrowLeft', group(0, true))).toBe('collapse');
    expect(treeNavAction('ArrowLeft', group(0, false))).toBe('to-parent');
    expect(treeNavAction('ArrowLeft', leaf(2))).toBe('to-parent');
  });

  it('Enter activates and the menu key opens the context menu', () => {
    expect(treeNavAction('Enter', leaf())).toBe('activate');
    expect(treeNavAction('ContextMenu', leaf())).toBe('menu');
  });

  it('F2 renames the focused row, does nothing with no focus', () => {
    expect(treeNavAction('F2', leaf())).toBe('rename');
    expect(treeNavAction('F2', group(0, true))).toBe('rename');
    expect(treeNavAction('F2', null)).toBeNull();
  });

  it('ignores unrelated keys', () => {
    expect(treeNavAction('a', leaf())).toBeNull();
    expect(treeNavAction('Tab', leaf())).toBeNull();
  });
});

describe('parentIndex', () => {
  // Shape: root(0), part(0) > chapter(1) > scene(2), section(0)
  const rows: TreeRow[] = [leaf(0), group(0, true), group(1, true), leaf(2), leaf(0)];

  it('finds the nearest shallower row above', () => {
    expect(parentIndex(rows, 3)).toBe(2); // scene -> chapter
    expect(parentIndex(rows, 2)).toBe(1); // chapter -> part
  });

  it('returns -1 for top-level rows and invalid indexes', () => {
    expect(parentIndex(rows, 0)).toBe(-1);
    expect(parentIndex(rows, 4)).toBe(-1);
    expect(parentIndex(rows, -1)).toBe(-1);
    expect(parentIndex(rows, 99)).toBe(-1);
  });
});
