import { Events, EventRef } from 'obsidian';
import type { WritingModeType } from '../models/WritingMode';

// Announces writing-environment state changes (mode, focus, typography,
// sprint) so every surface — binder control strip, launcher, status bar —
// stays in sync no matter where a change originates. Same subscribe pattern
// as the ProjectManager project-state events: returned refs work with
// Component.registerEvent for automatic cleanup.
export class StudioEvents extends Events {
  onModeChanged(cb: (mode: WritingModeType) => void): EventRef {
    return this.on('mode-changed', (...data: unknown[]) => {
      cb(data[0] as WritingModeType);
    });
  }

  onFocusChanged(cb: (active: boolean) => void): EventRef {
    return this.on('focus-changed', (...data: unknown[]) => {
      cb(data[0] as boolean);
    });
  }

  onTypographyChanged(cb: (active: boolean) => void): EventRef {
    return this.on('typography-changed', (...data: unknown[]) => {
      cb(data[0] as boolean);
    });
  }

  onSprintChanged(cb: () => void): EventRef {
    return this.on('sprint-changed', () => {
      cb();
    });
  }

  announceModeChanged(mode: WritingModeType): void {
    this.trigger('mode-changed', mode);
  }

  announceFocusChanged(active: boolean): void {
    this.trigger('focus-changed', active);
  }

  announceTypographyChanged(active: boolean): void {
    this.trigger('typography-changed', active);
  }

  announceSprintChanged(): void {
    this.trigger('sprint-changed');
  }
}
