import { MarkdownView, Notice } from 'obsidian';
import { SprintTimer } from '../src/SprintTimer';
import type { SprintEndReason, SprintSession } from '../models/SprintSession';

// ── A minimal stand-in for the DOM surface the sprint overlay uses ──────────

type ElOptions = { cls?: string; text?: string; title?: string } | string | undefined;

class FakeEl {
  classes = new Set<string>();
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  textContent = '';
  title = '';
  onclick: (() => void) | null = null;
  listeners = new Map<string, ((e: unknown) => void)[]>();
  cssProps: Record<string, string> = {};
  offsetWidth = 200;
  offsetHeight = 100;

  constructor(readonly tag: string, opts?: ElOptions) {
    const o = typeof opts === 'string' ? { cls: opts } : opts ?? {};
    if (o.cls) o.cls.split(' ').forEach(c => this.classes.add(c));
    if (o.text) this.textContent = o.text;
    if (o.title) this.title = o.title;
  }

  private add(child: FakeEl): FakeEl {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  createDiv(opts?: ElOptions): FakeEl { return this.add(new FakeEl('div', opts)); }
  createEl(tag: string, opts?: ElOptions): FakeEl { return this.add(new FakeEl(tag, opts)); }
  appendChild(child: FakeEl): FakeEl { return this.add(child); }
  remove(): void {
    if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this);
    this.parent = null;
  }
  addClass(...cls: string[]): void { cls.forEach(c => this.classes.add(c)); }
  removeClass(...cls: string[]): void { cls.forEach(c => this.classes.delete(c)); }
  hasClass(cls: string): boolean { return this.classes.has(cls); }
  toggleClass(cls: string, on: boolean): void { if (on) this.classes.add(cls); else this.classes.delete(cls); }
  querySelector(selector: string): FakeEl | null {
    const cls = selector.replace(/^\./, '');
    for (const child of this.children) {
      if (child.classes.has(cls)) return child;
      const deep = child.querySelector(selector);
      if (deep) return deep;
    }
    return null;
  }
  addEventListener(type: string, fn: (e: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener(): void { /* not exercised */ }
  setCssProps(props: Record<string, string>): void { Object.assign(this.cssProps, props); }
  getBoundingClientRect(): { left: number; top: number } { return { left: 0, top: 0 }; }
}

const g = globalThis as unknown as Record<string, unknown>;
const notices = (): string[] => (Notice as unknown as { messages: string[] }).messages;

// ── A plugin with one open document whose text the test controls ────────────

function setup() {
  const body = new FakeEl('body');
  g.window = globalThis;
  g.activeDocument = { body, addEventListener: () => {}, removeEventListener: () => {} };
  g.activeWindow = { innerWidth: 1200, innerHeight: 800 };
  g.createDiv = (opts?: ElOptions) => new FakeEl('div', opts);

  const doc = { text: '' };
  const view = Object.assign(new MarkdownView(null as never), {
    file: { path: 'Book/Chapter 1.md' },
    editor: { getValue: () => doc.text },
  });
  const announceSprintChanged = jest.fn();
  const updateToolbarSprintTime = jest.fn();
  const plugin = {
    app: { workspace: { getMostRecentLeaf: () => ({ view }) } },
    settings: { soundNotifications: false },
    fmManager: { countWords: (s: string) => s.split(/\s+/).filter(Boolean).length },
    studioEvents: { announceSprintChanged },
    focusMode: { updateToolbarSprintTime },
    projectManager: { getActiveProject: () => null },
  };

  const timer = new SprintTimer(plugin as never);
  const completed: { session: SprintSession; endedBy: SprintEndReason }[] = [];
  const summaries: SprintSession[] = [];
  timer.setOnComplete((session, endedBy) => { completed.push({ session, endedBy }); });
  timer.setOnViewSummary(session => { summaries.push(session); });

  const overlay = (): FakeEl | undefined => body.children[0];
  const text = (cls: string): string | undefined => overlay()?.querySelector(cls)?.textContent;
  const write = (words: number): void => { doc.text = Array.from({ length: words }, () => 'word').join(' '); };

  return { timer, body, overlay, text, write, completed, summaries, announceSprintChanged, updateToolbarSprintTime };
}

const MIN = 60000;

beforeEach(() => {
  jest.useFakeTimers();
  notices().length = 0;
});

afterEach(() => {
  jest.useRealTimers();
});

describe('a sprint whose time runs out (#451)', () => {
  function runOut() {
    const s = setup();
    s.write(100);
    s.timer.setup(25);
    s.timer.resume();
    s.write(512);
    jest.advanceTimersByTime(25 * MIN);
    return s;
  }

  it('records the session once, as a timeout, at its planned length', () => {
    const s = runOut();
    expect(s.completed).toHaveLength(1);
    expect(s.completed[0].endedBy).toBe('timeout');
    expect(s.completed[0].session.duration).toBe(25);
    expect(s.completed[0].session.wordsWritten).toBe(412);
  });

  it('opens no summary by itself and announces with a notice', () => {
    const s = runOut();
    expect(s.summaries).toHaveLength(0);
    expect(notices()).toContain('Sprint complete! Great work.');
  });

  it('changes the overlay to its finished state, in place', () => {
    const s = runOut();
    expect(s.body.children).toHaveLength(1);
    expect(s.overlay()?.hasClass('ws-sprint-floating--finished')).toBe(true);
    expect(s.text('.ws-sprint-finished')).toBe('Finished');
    expect(s.text('.ws-sprint-wc')).toBe('+412 words · 25 min');
    expect(s.text('.ws-sprint-view')).toBe('View summary');
    expect(s.text('.ws-sprint-close')).toBe('Close');
    expect(s.overlay()?.querySelector('.ws-sprint-time')).toBeNull();
    expect(s.overlay()?.querySelector('.ws-sprint-pause')).toBeNull();
  });

  it('is no longer active, and every indicator is told', () => {
    const s = runOut();
    expect(s.timer.isActive()).toBe(false);
    expect(s.updateToolbarSprintTime).toHaveBeenLastCalledWith(null);
    // setup, start, and the end of the sprint
    expect(s.announceSprintChanged).toHaveBeenCalledTimes(3);
  });

  it('"View summary" hands the session over and dismisses the overlay', () => {
    const s = runOut();
    s.overlay()?.querySelector('.ws-sprint-view')?.onclick?.();
    expect(s.summaries).toEqual([s.completed[0].session]);
    expect(s.body.children).toHaveLength(0);
  });

  it('"Close" dismisses the overlay without a summary', () => {
    const s = runOut();
    s.overlay()?.querySelector('.ws-sprint-close')?.onclick?.();
    expect(s.summaries).toHaveLength(0);
    expect(s.body.children).toHaveLength(0);
  });

  it('a new sprint replaces the finished overlay', () => {
    const s = runOut();
    s.timer.setup(10);
    expect(s.body.children).toHaveLength(1);
    expect(s.overlay()?.hasClass('ws-sprint-floating--finished')).toBe(false);
    expect(s.text('.ws-sprint-time')).toBe('10:00');
  });
});

describe('stopping a sprint', () => {
  it('records the time actually written and asks for the summary', () => {
    const s = setup();
    s.write(100);
    s.timer.setup(25);
    s.timer.resume();
    s.write(160);
    jest.advanceTimersByTime(5 * MIN);
    s.timer.stop();
    expect(s.completed).toHaveLength(1);
    expect(s.completed[0].endedBy).toBe('stopped');
    expect(s.completed[0].session.duration).toBe(5);
    expect(s.completed[0].session.wordsWritten).toBe(60);
    expect(s.body.children).toHaveLength(0);
    expect(s.updateToolbarSprintTime).toHaveBeenLastCalledWith(null);
  });

  it('does not count paused time', () => {
    const s = setup();
    s.timer.setup(25);
    s.timer.resume();
    jest.advanceTimersByTime(4 * MIN);
    s.timer.pause();
    jest.advanceTimersByTime(30 * MIN);
    s.timer.resume();
    jest.advanceTimersByTime(2 * MIN);
    s.timer.stop();
    expect(s.completed[0].session.duration).toBe(6);
  });

  it('records nothing when the sprint was never started', () => {
    const s = setup();
    s.timer.setup(25);
    s.timer.stop();
    expect(s.completed).toHaveLength(0);
    expect(s.body.children).toHaveLength(0);
  });
});

describe('a sprint with no time limit', () => {
  it('counts up and runs until it is stopped', () => {
    const s = setup();
    s.timer.setup(null, 500);
    expect(s.text('.ws-sprint-time')).toBe('00:00');
    s.timer.resume();
    expect(notices()).toContain('Sprint started. Goal: 500 words');
    jest.advanceTimersByTime(180 * MIN);
    expect(s.completed).toHaveLength(0);
    expect(s.timer.isActive()).toBe(true);
    expect(s.text('.ws-sprint-time')).toBe('180:00');
    s.timer.stop();
    expect(s.completed[0].endedBy).toBe('stopped');
    expect(s.completed[0].session.duration).toBe(180);
  });

  it('reports no minutes and the goal while it waits to start', () => {
    const s = setup();
    s.timer.setup(null, 500);
    expect(s.timer.isReady()).toBe(true);
    expect(s.timer.getDurationMinutes()).toBeNull();
    expect(s.timer.getWordCountGoal()).toBe(500);
  });
});

describe('a word count goal', () => {
  it('shows progress against the goal', () => {
    const s = setup();
    s.write(1000);
    s.timer.setup(25, 500);
    s.timer.resume();
    s.write(1312);
    jest.advanceTimersByTime(5000);
    expect(s.text('.ws-sprint-wc')).toBe('312 / 500 words');
    expect(s.overlay()?.querySelector('.ws-sprint-wc')?.hasClass('is-goal-reached')).toBe(false);
  });

  it('announces the goal once and keeps the sprint running', () => {
    const s = setup();
    s.write(1000);
    s.timer.setup(null, 500);
    s.timer.resume();
    s.write(1512);
    jest.advanceTimersByTime(5000);
    s.write(1600);
    jest.advanceTimersByTime(10 * MIN);
    expect(notices().filter(m => m === 'Word goal reached: 500 words.')).toHaveLength(1);
    expect(s.timer.isActive()).toBe(true);
    expect(s.completed).toHaveLength(0);
    expect(s.text('.ws-sprint-wc')).toBe('600 / 500 words');
    expect(s.overlay()?.querySelector('.ws-sprint-wc')?.hasClass('is-goal-reached')).toBe(true);
  });

  it('without a goal the overlay shows the plain count', () => {
    const s = setup();
    s.write(10);
    s.timer.setup(25);
    s.timer.resume();
    s.write(52);
    jest.advanceTimersByTime(5000);
    expect(s.text('.ws-sprint-wc')).toBe('+42 words');
  });
});

describe('overlay buttons leave keyboard focus in the editor', () => {
  const pressOn = (controls: FakeEl | null | undefined): jest.Mock => {
    const preventDefault = jest.fn();
    controls?.listeners.get('mousedown')?.forEach(fn => fn({ preventDefault }));
    return preventDefault;
  };

  it('while the sprint runs', () => {
    const s = setup();
    s.timer.setup(25);
    expect(pressOn(s.overlay()?.querySelector('.ws-sprint-controls'))).toHaveBeenCalledTimes(1);
  });

  it('in the finished state', () => {
    const s = setup();
    s.timer.setup(1);
    s.timer.resume();
    jest.advanceTimersByTime(MIN);
    expect(pressOn(s.overlay()?.querySelector('.ws-sprint-controls'))).toHaveBeenCalledTimes(1);
  });
});
