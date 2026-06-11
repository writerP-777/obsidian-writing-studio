import { BinderItem } from '../models/BinderItem';

export interface BinderFilterResult {
  /** Items to render: matches, their ancestors, and their descendants. */
  visible: Set<string>;
  /** Ancestors of matches — rendered expanded even when collapsed. */
  expanded: Set<string>;
}

// Filters the binder data model rather than rendered rows — children of
// collapsed groups are never rendered, so a DOM-based filter could not
// find them.
export function computeBinderFilter(items: BinderItem[], query: string): BinderFilterResult {
  const q = query.toLowerCase();
  const visible = new Set<string>();
  const expanded = new Set<string>();

  const markDescendants = (item: BinderItem): void => {
    for (const child of item.children ?? []) {
      visible.add(child.id);
      markDescendants(child);
    }
  };

  const walk = (item: BinderItem): boolean => {
    const selfMatch = item.title.toLowerCase().includes(q);
    let childMatch = false;
    for (const child of item.children ?? []) {
      if (walk(child)) childMatch = true;
    }
    if (selfMatch) {
      visible.add(item.id);
      markDescendants(item);
    }
    if (childMatch) {
      visible.add(item.id);
      expanded.add(item.id);
    }
    return selfMatch || childMatch;
  };

  for (const item of items) walk(item);
  return { visible, expanded };
}
