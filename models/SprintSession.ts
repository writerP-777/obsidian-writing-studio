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
  ready: boolean; // true = overlay open but user has not yet pressed Start
  startTime: number;
  pausedAt: number;
  totalPausedMs: number;
  durationMinutes: number;
  wordCountGoal?: number;
  // Per-file word counts captured while the sprint runs. Baselines are
  // recorded the first time a file is seen so switching documents mid-sprint
  // cannot compare counts from two different files.
  primaryFile: string | null; // file active when the clock started ('file' scope counts only this)
  baselines: Map<string, number>;
  currents: Map<string, number>;
  projectScope: 'file' | 'project';
}
