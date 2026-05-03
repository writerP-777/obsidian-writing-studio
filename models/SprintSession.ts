export interface SprintSession {
  id: string;
  date: string;
  duration: number;
  wordsWritten: number;
  startWordCount: number;
  wordCountGoal?: number;
  projectId?: string;
  documents: string[];
  note?: string;
  completed: boolean;
}

export interface SprintState {
  active: boolean;
  paused: boolean;
  startTime: number;
  pausedAt: number;
  totalPausedMs: number;
  durationMinutes: number;
  wordCountGoal?: number;
  startWordCount: number;
  projectScope: 'file' | 'project';
}
