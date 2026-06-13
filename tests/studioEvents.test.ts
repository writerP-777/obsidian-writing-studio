import { StudioEvents } from '../src/StudioEvents';

describe('StudioEvents', () => {
  it('delivers mode changes with the new mode', () => {
    const events = new StudioEvents();
    const seen: string[] = [];
    events.onModeChanged(mode => { seen.push(mode); });

    events.announceModeChanged('draft');
    events.announceModeChanged('none');

    expect(seen).toEqual(['draft', 'none']);
  });

  it('delivers focus and typography toggles with their active state', () => {
    const events = new StudioEvents();
    const focus: boolean[] = [];
    const typography: boolean[] = [];
    events.onFocusChanged(a => { focus.push(a); });
    events.onTypographyChanged(a => { typography.push(a); });

    events.announceFocusChanged(true);
    events.announceFocusChanged(false);
    events.announceTypographyChanged(true);

    expect(focus).toEqual([true, false]);
    expect(typography).toEqual([true]);
  });

  it('delivers sprint changes and keeps channels independent', () => {
    const events = new StudioEvents();
    const sprint = jest.fn();
    const mode = jest.fn();
    events.onSprintChanged(sprint);
    events.onModeChanged(mode);

    events.announceSprintChanged();

    expect(sprint).toHaveBeenCalledTimes(1);
    expect(mode).not.toHaveBeenCalled();
  });

  it('stops delivering after offref', () => {
    const events = new StudioEvents();
    const cb = jest.fn();
    const ref = events.onModeChanged(cb);
    events.offref(ref);

    events.announceModeChanged('edit');

    expect(cb).not.toHaveBeenCalled();
  });
});
