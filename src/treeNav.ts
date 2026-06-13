// Pure keyboard-navigation decisions for a flattened tree of visible rows
// (depth-first, respecting collapse state and search filtering). The binder
// view maps these actions onto DOM focus and binder mutations.

export interface TreeRow {
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
}

export type TreeNavAction =
  | 'next'
  | 'prev'
  | 'expand'
  | 'collapse'
  | 'to-parent'
  | 'activate'
  | 'menu'
  | 'rename'
  | null;

export function treeNavAction(key: string, row: TreeRow | null): TreeNavAction {
  switch (key) {
    case 'ArrowDown':
      return 'next';
    case 'ArrowUp':
      return 'prev';
    case 'ArrowRight':
      // Standard tree pattern: closed group opens, open group moves to its
      // first child (the next visible row), leaves do nothing.
      if (!row?.hasChildren) return null;
      return row.isExpanded ? 'next' : 'expand';
    case 'ArrowLeft':
      if (row?.hasChildren && row.isExpanded) return 'collapse';
      return 'to-parent';
    case 'Enter':
      return 'activate';
    case 'ContextMenu':
      return 'menu';
    case 'F2':
      return row ? 'rename' : null;
    default:
      return null;
  }
}

// Index of the nearest row above `from` with a smaller depth, or -1.
export function parentIndex(rows: TreeRow[], from: number): number {
  if (from < 0 || from >= rows.length) return -1;
  const depth = rows[from].depth;
  for (let i = from - 1; i >= 0; i--) {
    if (rows[i].depth < depth) return i;
  }
  return -1;
}
