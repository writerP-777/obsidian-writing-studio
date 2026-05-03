export type WritingModeType = 'draft' | 'edit' | 'review' | 'none';

export interface WritingModeConfig {
  focusMode: boolean;
  typographyMode: boolean;
  binderOpen: boolean;
  sidebarsVisible: boolean;
  forceReadingView: boolean;
}

export const WRITING_MODE_CONFIGS: Record<WritingModeType, WritingModeConfig> = {
  draft: {
    focusMode: true,
    typographyMode: true,
    binderOpen: false,
    sidebarsVisible: false,
    forceReadingView: false,
  },
  edit: {
    focusMode: false,
    typographyMode: false,
    binderOpen: true,
    sidebarsVisible: true,
    forceReadingView: false,
  },
  review: {
    focusMode: false,
    typographyMode: false,
    binderOpen: false,
    sidebarsVisible: false,
    forceReadingView: true,
  },
  none: {
    focusMode: false,
    typographyMode: false,
    binderOpen: false,
    sidebarsVisible: true,
    forceReadingView: false,
  },
};
