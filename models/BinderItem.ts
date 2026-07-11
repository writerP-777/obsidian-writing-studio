export type BinderItemType = 'chapter' | 'section' | 'article' | 'note' | 'group' | 'part';

// The lifecycle states in order — the single source for what counts as a
// valid `binder-status` value; the color table below is keyed off it.
export const DOCUMENT_STATUSES = ['draft', 'in-progress', 'complete', 'published'] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export interface BinderItem {
  id: string;
  title: string;
  filePath: string;
  type: BinderItemType;
  order: number;
  status: DocumentStatus;
  wordCountGoal?: number;
  children?: BinderItem[];
  collapsed?: boolean;
  includeInExport?: boolean;
}

export interface BinderData {
  version: string;
  projectId: string;
  items: BinderItem[];
}

export const STATUS_COLORS: Record<DocumentStatus, string> = {
  draft: '#888888',
  'in-progress': '#f59e0b',
  complete: '#10b981',
  published: '#3b82f6',
};
