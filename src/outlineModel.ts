import type { ManuscriptNode } from './manuscriptTree';
import type { DocumentStatus } from '../models/BinderItem';

// The outline as data: the manuscript tree flattened into table rows with
// the per-section metadata nonfiction writers plan with — synopsis, status,
// words against goal — and folder rows carrying subtree totals. Pure, so
// row building, collapse, filtering, totals, and the copied outline text are
// all unit-tested without a vault; OutlineView only renders what this
// returns.

export interface OutlineRow {
  kind: 'doc' | 'folder';
  path: string;
  title: string;
  /** Nesting depth from the project root; top-level rows are 0. */
  depth: number;
  /** The folder row this row sits under, or null at the top level. */
  parentPath: string | null;
  /** Documents only; folders never carry a synopsis. */
  synopsis: string | null;
  status: DocumentStatus | null;
  compileExcluded: boolean;
  /** A document's own count, or a folder's subtree total. */
  words: number;
  /** A document's own goal, or the sum of its subtree's goals; null when none. */
  goal: number | null;
  /** Folders only: whether any row sits under this one. */
  hasChildren: boolean;
}

export type StatusFilter = DocumentStatus | 'all';

// Flattens the tree depth-first in binder order. `wordsFor` supplies each
// document's count (the caller reads files); folder totals are summed here
// so every surface agrees on what a part "weighs".
export function buildOutlineRows(
  nodes: ManuscriptNode[],
  wordsFor: (path: string) => number,
): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const walk = (children: ManuscriptNode[], depth: number, parentPath: string | null): { words: number; goal: number | null } => {
    let words = 0;
    let goal: number | null = null;
    for (const node of children) {
      if (node.kind === 'doc') {
        const w = wordsFor(node.path);
        rows.push({
          kind: 'doc',
          path: node.path,
          title: node.title,
          depth,
          parentPath,
          synopsis: node.synopsis,
          status: node.status,
          compileExcluded: node.compileExcluded,
          words: w,
          goal: node.goal,
          hasChildren: false,
        });
        words += w;
        if (node.goal !== null) goal = (goal ?? 0) + node.goal;
      } else {
        const row: OutlineRow = {
          kind: 'folder',
          path: node.path,
          title: node.title,
          depth,
          parentPath,
          synopsis: null,
          status: null,
          compileExcluded: false,
          words: 0,
          goal: null,
          hasChildren: node.children.length > 0,
        };
        rows.push(row);
        const sub = walk(node.children, depth + 1, node.path);
        row.words = sub.words;
        row.goal = sub.goal;
        words += sub.words;
        if (sub.goal !== null) goal = (goal ?? 0) + sub.goal;
      }
    }
    return { words, goal };
  };
  walk(nodes, 0, null);
  return rows;
}

// Rows under a collapsed folder — at any depth — are hidden; the folder row
// itself stays so it can be reopened.
export function visibleRows(rows: OutlineRow[], collapsed: ReadonlySet<string>): OutlineRow[] {
  const hidden = new Set<string>();
  return rows.filter(row => {
    if (row.parentPath !== null && (collapsed.has(row.parentPath) || hidden.has(row.parentPath))) {
      if (row.kind === 'folder') hidden.add(row.path);
      return false;
    }
    return true;
  });
}

// A status filter keeps the matching documents and every folder that still
// has a matching document somewhere beneath it, so structure never vanishes
// out from under a filtered list.
export function filterRowsByStatus(rows: OutlineRow[], status: StatusFilter): OutlineRow[] {
  if (status === 'all') return rows;
  const keep = new Set<string>();
  const byPath = new Map(rows.map(r => [r.path, r] as const));
  for (const row of rows) {
    if (row.kind !== 'doc' || row.status !== status) continue;
    keep.add(row.path);
    let parent = row.parentPath;
    while (parent !== null && !keep.has(parent)) {
      keep.add(parent);
      parent = byPath.get(parent)?.parentPath ?? null;
    }
  }
  return rows.filter(r => keep.has(r.path));
}

export interface OutlineTotals {
  docCount: number;
  words: number;
  goal: number | null;
  /** Whole-number percent of goal reached, capped at 100; null without a goal. */
  pct: number | null;
  /** Documents with no synopsis — the nudge the footer shows. */
  missingSynopsis: number;
}

export function outlineTotals(rows: OutlineRow[]): OutlineTotals {
  const docs = rows.filter(r => r.kind === 'doc');
  const words = docs.reduce((n, r) => n + r.words, 0);
  const goals = docs.filter(r => r.goal !== null);
  const goal = goals.length ? goals.reduce((n, r) => n + (r.goal ?? 0), 0) : null;
  return {
    docCount: docs.length,
    words,
    goal,
    pct: goal !== null && goal > 0 ? progressPercent(words, goal) : null,
    missingSynopsis: docs.filter(r => r.synopsis === null).length,
  };
}

export function progressPercent(words: number, goal: number): number {
  if (goal <= 0) return 0;
  return Math.min(100, Math.round((words / goal) * 100));
}

// The outline as a nested list — the annotated table of contents a book
// proposal asks for. Titles only where there is no synopsis, so a half-done
// outline still pastes cleanly.
export function outlineToMarkdown(nodes: ManuscriptNode[]): string {
  const lines: string[] = [];
  const walk = (children: ManuscriptNode[], depth: number): void => {
    const indent = '  '.repeat(depth);
    for (const node of children) {
      if (node.kind === 'doc') {
        lines.push(node.synopsis ? `${indent}- ${node.title} — ${node.synopsis}` : `${indent}- ${node.title}`);
      } else {
        lines.push(`${indent}- ${node.title}`);
        walk(node.children, depth + 1);
      }
    }
  };
  walk(nodes, 0);
  return lines.join('\n');
}
