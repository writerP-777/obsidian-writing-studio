export type ProjectType = 'book' | 'series' | 'blog' | 'blank' | 'journal-article' | 'magazine-article';

// The document types a new/added document can default to (matches the
// global defaultDocumentType setting and addDocumentToBinder's type param).
export type DefaultDocumentType = 'chapter' | 'section' | 'article' | 'note';

// Each non-blank project type declares the document type that documents added
// after scaffolding should default to, mirroring its template's dominant type.
// `blank` is intentionally absent — it has no template, so it falls back to the
// global setting. See resolveDefaultDocumentType.
const PROJECT_TYPE_DEFAULT_DOC_TYPE: Partial<Record<ProjectType, DefaultDocumentType>> = {
  book: 'chapter',
  series: 'article',
  blog: 'article',
  'journal-article': 'section',
  'magazine-article': 'section',
};

// The project type's declared default document type wins; the global default is
// the fallback, used only for `blank` projects (and any future typeless project).
export function resolveDefaultDocumentType(
  projectType: ProjectType,
  globalDefault: DefaultDocumentType,
): DefaultDocumentType {
  return PROJECT_TYPE_DEFAULT_DOC_TYPE[projectType] ?? globalDefault;
}

// Each project type declares the folder that holds its documents. Applied to
// new projects only — existing projects predate the documentFolder field and
// must keep resolving to 'Chapters' (see resolveDocumentFolder), because
// their files physically live there.
const PROJECT_TYPE_DOCUMENT_FOLDER: Record<ProjectType, string> = {
  book: 'Chapters',
  series: 'Articles',
  blog: 'Posts',
  'journal-article': 'Sections',
  'magazine-article': 'Sections',
  blank: 'Documents',
};

export function defaultDocumentFolder(projectType: ProjectType): string {
  return PROJECT_TYPE_DOCUMENT_FOLDER[projectType];
}

// Absent field → 'Chapters'. Never fall back to the project type's default
// here — that would repoint existing binders at folders that don't exist.
export function resolveDocumentFolder(project: Pick<WritingProject, 'documentFolder'>): string {
  return project.documentFolder ?? 'Chapters';
}

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
  // Name of the folder holding the project's documents. Absent on projects
  // created before the field existed — resolveDocumentFolder falls back to
  // 'Chapters' for those.
  documentFolder?: string;
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
