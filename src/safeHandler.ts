import { Notice } from 'obsidian';
import { t } from './i18n';

// Wraps an async UI handler so a rejected vault operation surfaces as a
// Notice instead of a silent unhandled rejection. Without this, a failed
// rename/move/delete reads as "I clicked and nothing happened".
export function safeHandler<A extends unknown[]>(
  fn: (...args: A) => Promise<void>
): (...args: A) => void {
  return (...args: A) => {
    fn(...args).catch((e: unknown) => {
      console.error('[Writing Studio]', e);
      new Notice(t('main.operationFailed', { error: e instanceof Error ? e.message : String(e) }));
    });
  };
}
