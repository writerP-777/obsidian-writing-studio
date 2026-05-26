import { ProjectManager } from '../src/ProjectManager';
import { BinderItem } from '../models/BinderItem';

const mockPlugin = {
  app: {},
  settings: { defaultProjectFolder: 'Projects', authorName: '' },
} as never;

function makeItem(id: string, children?: BinderItem[]): BinderItem {
  return {
    id,
    title: `Item ${id}`,
    filePath: `Projects/test/${id}.md`,
    type: 'chapter',
    order: 1,
    status: 'draft',
    includeInExport: true,
    children,
  };
}

describe('ProjectManager.findItem', () => {
  let pm: ProjectManager;
  beforeEach(() => { pm = new ProjectManager(mockPlugin); });

  it('finds a top-level item by id', () => {
    const items = [makeItem('a'), makeItem('b'), makeItem('c')];
    expect(pm.findItem(items, 'b')?.id).toBe('b');
  });

  it('finds a nested item by id', () => {
    const items = [makeItem('parent', [makeItem('child')])];
    expect(pm.findItem(items, 'child')?.id).toBe('child');
  });

  it('finds a deeply nested item', () => {
    const items = [makeItem('a', [makeItem('b', [makeItem('c')])])];
    expect(pm.findItem(items, 'c')?.id).toBe('c');
  });

  it('returns null when the id does not exist', () => {
    const items = [makeItem('a'), makeItem('b')];
    expect(pm.findItem(items, 'z')).toBeNull();
  });

  it('returns null for an empty list', () => {
    expect(pm.findItem([], 'a')).toBeNull();
  });
});

describe('ProjectManager.flattenBinder', () => {
  let pm: ProjectManager;
  beforeEach(() => { pm = new ProjectManager(mockPlugin); });

  it('returns an empty array for empty input', () => {
    expect(pm.flattenBinder([])).toEqual([]);
  });

  it('returns a flat list unchanged', () => {
    const items = [makeItem('a'), makeItem('b')];
    expect(pm.flattenBinder(items).map(i => i.id)).toEqual(['a', 'b']);
  });

  it('flattens one level of children depth-first', () => {
    const items = [
      makeItem('parent', [makeItem('child1'), makeItem('child2')]),
      makeItem('sibling'),
    ];
    expect(pm.flattenBinder(items).map(i => i.id)).toEqual([
      'parent', 'child1', 'child2', 'sibling',
    ]);
  });

  it('flattens multiple levels of nesting', () => {
    const items = [makeItem('a', [makeItem('b', [makeItem('c')])])];
    expect(pm.flattenBinder(items).map(i => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the original items array', () => {
    const items = [makeItem('a'), makeItem('b')];
    const copy = [...items];
    pm.flattenBinder(items);
    expect(items).toEqual(copy);
  });
});
