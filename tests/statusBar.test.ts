import { StatusBar } from '../src/StatusBar';

interface FakeItem {
  classes: string[];
  textContent: string;
  addClass: (...cls: string[]) => void;
  removeClass: (cls: string) => void;
  addEventListener: jest.Mock;
  setText: (text: string) => void;
}

function makeItem(): FakeItem {
  const item: FakeItem = {
    classes: [],
    textContent: '',
    addClass: (...cls: string[]) => { item.classes.push(...cls); },
    removeClass: (cls: string) => { item.classes = item.classes.filter(c => c !== cls); },
    addEventListener: jest.fn(),
    setText: (text: string) => { item.textContent = text; },
  };
  return item;
}

function makePlugin(items: FakeItem[]) {
  return {
    addStatusBarItem: jest.fn(() => {
      const item = makeItem();
      items.push(item);
      return item;
    }),
    writingModes: { setStatusBar: jest.fn() },
    sprintTimer: { setStatusBar: jest.fn() },
    projectManager: { getActiveProject: jest.fn().mockReturnValue(null) },
    statsTracker: { getTotalWordCount: jest.fn().mockResolvedValue(0) },
  } as never;
}

describe('StatusBar item ordering', () => {
  it('creates the four items in the fixed append-only order', () => {
    const items: FakeItem[] = [];
    const plugin = makePlugin(items);
    const bar = new StatusBar(plugin);
    bar.init(() => {});

    expect(items.map(i => i.classes[0])).toEqual([
      'ws-status-mode',
      'ws-status-wordcount',
      'ws-status-sprint',
      'ws-status-project-goal',
    ]);
  });

  it('hands the mode and sprint items to their owning modules', () => {
    const items: FakeItem[] = [];
    const plugin = makePlugin(items);
    new StatusBar(plugin).init(() => {});

    const p = plugin as { writingModes: { setStatusBar: jest.Mock }; sprintTimer: { setStatusBar: jest.Mock } };
    expect(p.writingModes.setStatusBar).toHaveBeenCalledWith(items[0]);
    expect(p.sprintTimer.setStatusBar).toHaveBeenCalledWith(items[2]);
  });

  it('starts the project goal bar hidden', () => {
    const items: FakeItem[] = [];
    new StatusBar(makePlugin(items)).init(() => {});

    expect(items[3].classes).toContain('ws-hidden');
  });

  it('starts every item hidden until the studio launches (#150)', () => {
    const items: FakeItem[] = [];
    new StatusBar(makePlugin(items)).init(() => {});

    for (const item of items) {
      expect(item.classes).toContain('ws-hidden');
    }
  });

  it('reveal() unhides all but the goal bar, which manages itself', () => {
    const items: FakeItem[] = [];
    const bar = new StatusBar(makePlugin(items));
    bar.init(() => {});

    bar.reveal();

    expect(items[0].classes).not.toContain('ws-hidden');
    expect(items[1].classes).not.toContain('ws-hidden');
    expect(items[2].classes).not.toContain('ws-hidden');
    expect(items[3].classes).toContain('ws-hidden');
  });
});

describe('StatusBar word count display', () => {
  function initBar(items: FakeItem[]): StatusBar {
    const bar = new StatusBar(makePlugin(items));
    bar.init(() => {});
    return bar;
  }

  it('shows the plain count without a goal', () => {
    const items: FakeItem[] = [];
    const bar = initBar(items);

    bar.showWordCount(120, undefined, 0);

    expect(items[1].textContent).toContain('120');
  });

  it('shows count against goal with a positive session delta', () => {
    const items: FakeItem[] = [];
    const bar = initBar(items);

    bar.showWordCount(120, 500, 30);

    expect(items[1].textContent).toContain('120');
    expect(items[1].textContent).toContain('500');
    expect(items[1].textContent).toContain('30');
  });

  it('clears the word count', () => {
    const items: FakeItem[] = [];
    const bar = initBar(items);

    bar.showWordCount(120, undefined, 0);
    bar.clearWordCount();

    expect(items[1].textContent).toBe('');
  });
});
