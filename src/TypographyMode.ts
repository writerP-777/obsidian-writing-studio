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
    if (plugin.settings.typographyModeActive && plugin.settings.persistTypography) {
      this.enable();
    }
  }

  isActive(): boolean {
    return this.active;
  }

  toggle(): void {
    if (this.active) {
      this.disable();
    } else {
      this.enable();
    }
  }

  enable(): void {
    this.active = true;
    this.applyCustomProperties();
    document.body.classList.add('writing-studio-typography');
    if (this.plugin.settings.persistTypography) {
      this.plugin.settings.typographyModeActive = true;
      void this.plugin.saveSettings();
    }
  }

  disable(): void {
    this.active = false;
    this.removeCustomProperties();
    document.body.classList.remove('writing-studio-typography');
    if (this.plugin.settings.persistTypography) {
      this.plugin.settings.typographyModeActive = false;
      void this.plugin.saveSettings();
    }
  }

  private applyCustomProperties(): void {
    const settings = this.plugin.settings;
    const fontStack = settings.typographyFont === 'custom'
      ? `"${settings.customFontName}", system-ui, sans-serif`
      : FONT_STACKS[settings.typographyFont] || FONT_STACKS.mono;

    const maxChars = settings.maxLineLength || 65;
    const fontSize = settings.typographyFontSize || 18;
    const lineHeight = settings.lineHeight || 1.7;
    const letterSpacing = settings.letterSpacing || 'normal';
    const halfWidthCh = `${maxChars / 2}ch`;

    const root = document.documentElement;
    root.style.setProperty('--ws-typo-font', fontStack);
    root.style.setProperty('--ws-typo-size', `${fontSize}px`);
    root.style.setProperty('--ws-typo-lh', String(lineHeight));
    root.style.setProperty('--ws-typo-ls', letterSpacing);
    root.style.setProperty('--ws-typo-pad-left', `max(1.5rem, calc(50% - ${halfWidthCh}))`);
    root.style.setProperty('--ws-typo-pad-right', `max(1.5rem, calc(50% - ${halfWidthCh}))`);
    root.style.setProperty('--ws-typo-max-width', `${maxChars}ch`);
  }

  private removeCustomProperties(): void {
    const root = document.documentElement;
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
    this.disable();
  }
}
