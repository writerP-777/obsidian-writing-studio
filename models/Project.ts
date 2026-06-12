export type ProjectType = 'book' | 'series' | 'blog' | 'blank' | 'journal-article' | 'magazine-article';

export interface ProjectGoals {
  totalWordCount?: number;
}

export interface WritingProject {
  id: string;
  title: string;
  type: ProjectType;
  author: string;
  created: string;
  modified: string;
  description: string;
  folderPath: string;
  goals: ProjectGoals;
  wordPressSite?: string;
  wordPressCategory?: string;
  wordPressTag?: string;
}

export const DEFAULT_PROJECT: Omit<WritingProject, 'id' | 'title' | 'folderPath' | 'created' | 'modified'> = {
  type: 'blank',
  author: '',
  description: '',
  goals: {},
};
