import { computeBinderFilter } from '../src/binderFilter';
import { BinderItem } from '../models/BinderItem';

function makeItem(id: string, title: string, children?: BinderItem[], collapsed = false): BinderItem {
  return {
    id,
    title,
    filePath: `Projects/test/${id}.md`,
    type: children ? 'group' : 'chapter',
    order: 1,
    status: 'draft',
    includeInExport: true,
    children,
    collapsed,
  };
}

describe('computeBinderFilter', () => {
  it('finds matches inside collapsed groups and expands their ancestors', () => {
    const items = [
      makeItem('g1', 'Part one', [makeItem('c1', 'The dragon scene')], true),
      makeItem('c2', 'Epilogue'),
    ];
    const { visible, expanded } = computeBinderFilter(items, 'dragon');
    expect(visible.has('c1')).toBe(true);
    expect(visible.has('g1')).toBe(true);
    expect(expanded.has('g1')).toBe(true);
    expect(visible.has('c2')).toBe(false);
  });

  it('expands the full ancestor chain for deep matches', () => {
    const items = [
      makeItem('g1', 'Book', [makeItem('g2', 'Part', [makeItem('c1', 'Target chapter')], true)], true),
    ];
    const { visible, expanded } = computeBinderFilter(items, 'target');
    expect(visible.has('c1')).toBe(true);
    expect(expanded.has('g1')).toBe(true);
    expect(expanded.has('g2')).toBe(true);
  });

  it('shows descendants of a matching group', () => {
    const items = [
      makeItem('g1', 'Research', [makeItem('c1', 'Notes'), makeItem('c2', 'Links')]),
    ];
    const { visible } = computeBinderFilter(items, 'research');
    expect(visible.has('g1')).toBe(true);
    expect(visible.has('c1')).toBe(true);
    expect(visible.has('c2')).toBe(true);
  });

  it('is case-insensitive', () => {
    const items = [makeItem('c1', 'The Dragon')];
    expect(computeBinderFilter(items, 'DRAGON').visible.has('c1')).toBe(true);
  });

  it('returns empty sets when nothing matches', () => {
    const items = [makeItem('c1', 'Alpha'), makeItem('g1', 'Group', [makeItem('c2', 'Beta')])];
    const { visible, expanded } = computeBinderFilter(items, 'zzz');
    expect(visible.size).toBe(0);
    expect(expanded.size).toBe(0);
  });

  it('does not mark non-matching ancestors as expanded when only a sibling matches', () => {
    const items = [
      makeItem('g1', 'Group', [makeItem('c1', 'Inside')]),
      makeItem('c2', 'Match me'),
    ];
    const { visible, expanded } = computeBinderFilter(items, 'match');
    expect(visible.has('c2')).toBe(true);
    expect(visible.has('g1')).toBe(false);
    expect(expanded.has('g1')).toBe(false);
  });
});
