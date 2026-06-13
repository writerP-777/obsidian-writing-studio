import type WritingStudioPlugin from '../main';

const FONT_STACKS: Record<string, string> = {
  mono: '"iA Writer Mono", "Roboto Mono", "Courier New", monospace',
  serif: '"iA Writer Duo Serif", Georgia, Palatino, serif',
  sans: '"iA Writer Quattro", system-ui, -apple-system, sans-serif',
  'cormorant-garamond': '"Cormorant Garamond", Georgia, "Times New Roman", serif',
  'crimson-text': '"Crimson Text", Georgia, "Times New Roman", serif',
  'eb-garamond': '"EB Garamond", Georgia, "Times New Roman", serif',
  'libre-baskerville': '"Libre Baskerville", Georgia, "Times New Roman", serif',
  'libre-caslon-text': '"Libre Caslon Text", Georgia, "Times New Roman", serif',
  'literata': '"Literata", Georgia, "Times New Roman", serif',
  'lora': '"Lora", Georgia, "Times New Roman", serif',
  'inter': '"Inter", system-ui, -apple-system, sans-serif',
  'lato': '"Lato", system-ui, -apple-system, sans-serif',
  'source-sans-3': '"Source Sans 3", system-ui, -apple-system, sans-serif',
};

export class TypographyMode {
  private plugin: WritingStudioPlugin;
  private active = false;

  constructor(plugin: WritingStudioPlugin) {
    this.plugin = plugin;
  }

  // Session continuity: called when Writing Studio launches (not at plugin
  // load — with the startup toggle off, Obsidian must open without any
  // typography styling applied).
  restorePersisted(): void {
    if (this.plugin.settings.typographyModeActive && this.plugin.settings.persistTypography && !this.active) {
      void this.enable();
    }
  }

  isActive(): boolean {
    return this.active;
  }

  async toggle(): Promise<void> {
    if (this.active) {
      await this.disable();
    } else {
      await this.enable();
    }
  }

  async enable(): Promise<void> {
    this.active = true;
    this.applyCustomProperties();
    activeDocument.body.classList.add('writing-studio-typography');
    this.plugin.studioEvents.announceTypographyChanged(true);
    if (this.plugin.settings.persistTypography) {
      this.plugin.settings.typographyModeActive = true;
      await this.plugin.saveSettings();
    }
  }

  async disable(): Promise<void> {
    this.active = false;
    this.removeCustomProperties();
    activeDocument.body.classList.remove('writing-studio-typography');
    this.plugin.studioEvents.announceTypographyChanged(false);
    if (this.plugin.settings.persistTypography) {
      this.plugin.settings.typographyModeActive = false;
      await this.plugin.saveSettings();
    }
  }

  private applyCustomProperties(): void {
    const settings = this.plugin.settings;
    // Strip characters that would break out of the quoted CSS font name —
    // a stray quote previously invalidated the whole font-family value
    const safeCustom = settings.customFontName.replace(/["'\\;{}():]/g, '').trim();
    const fontStack = settings.typographyFont === 'custom'
      ? (safeCustom ? `"${safeCustom}", system-ui, sans-serif` : 'system-ui, sans-serif')
      : FONT_STACKS[settings.typographyFont] || FONT_STACKS.mono;

    const maxChars = settings.maxLineLength || 65;
    const fontSize = settings.typographyFontSize || 18;
    const lineHeight = settings.lineHeight || 1.7;
    const letterSpacing = settings.letterSpacing || 'normal';
    const halfWidthCh = `${maxChars / 2}ch`;

    activeDocument.documentElement.setCssProps({
      '--ws-typo-font': fontStack,
      '--ws-typo-size': `${fontSize}px`,
      '--ws-typo-lh': String(lineHeight),
      '--ws-typo-ls': letterSpacing,
      '--ws-typo-pad-left': `max(1.5rem, calc(50% - ${halfWidthCh}))`,
      '--ws-typo-pad-right': `max(1.5rem, calc(50% - ${halfWidthCh}))`,
      '--ws-typo-max-width': `${maxChars}ch`,
    });
  }

  private removeCustomProperties(): void {
    const root = activeDocument.documentElement;
    root.style.removeProperty('--ws-typo-font');
    root.style.removeProperty('--ws-typo-size');
    root.style.removeProperty('--ws-typo-lh');
    root.style.removeProperty('--ws-typo-ls');
    root.style.removeProperty('--ws-typo-pad-left');
    root.style.removeProperty('--ws-typo-pad-right');
    root.style.removeProperty('--ws-typo-max-width');
  }

  refreshStyles(): void {
    if (this.active) {
      this.applyCustomProperties();
    }
  }

  destroy(): void {
    // Teardown removes DOM/CSS state only — it must never write settings.
    // Unload runs on every app quit, so calling disable() here would erase
    // the persisted state that "Persist across sessions" exists to keep.
    this.active = false;
    this.removeCustomProperties();
    activeDocument.body.classList.remove('writing-studio-typography');
  }
}
