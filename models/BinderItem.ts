export type BinderItemType = 'chapter' | 'section' | 'article' | 'note' | 'group' | 'part';
export type DocumentStatus = 'draft' | 'in-progress' | 'complete' | 'published';

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

export const STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: 'Draft',
  'in-progress': 'In Progress',
  complete: 'Complete',
  published: 'Published',
};
