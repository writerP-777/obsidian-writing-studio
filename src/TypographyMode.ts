import type WritingStudioPlugin from '../main';

const STYLE_ID = 'writing-studio-typography';

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
    this.injectStyles();
    document.body.classList.add('writing-studio-typography');
    if (this.plugin.settings.persistTypography) {
      this.plugin.settings.typographyModeActive = true;
      this.plugin.saveSettings();
    }
  }

  disable(): void {
    this.active = false;
    this.removeStyles();
    document.body.classList.remove('writing-studio-typography');
    if (this.plugin.settings.persistTypography) {
      this.plugin.settings.typographyModeActive = false;
      this.plugin.saveSettings();
    }
  }

  private injectStyles(): void {
    this.removeStyles();
    const settings = this.plugin.settings;
    const fontStack = settings.typographyFont === 'custom'
      ? `"${settings.customFontName}", system-ui, sans-serif`
      : FONT_STACKS[settings.typographyFont] || FONT_STACKS.mono;

    const maxChars = settings.maxLineLength || 65;
    const fontSize = settings.typographyFontSize || 18;
    const lineHeight = settings.lineHeight || 1.7;
    const letterSpacing = settings.letterSpacing || 'normal';

    const maxWidthCh = `${maxChars}ch`;
    // Half the column width — used to calculate centering padding on each side
    const halfWidthCh = `${maxChars / 2}ch`;

    const css = `
/* ── Typography Mode: Writing Studio ─────────────────────────── */

/* Font + spacing on the editor and its content element */
.writing-studio-typography .cm-editor,
.writing-studio-typography .cm-content {
  font-family: ${fontStack} !important;
  font-size: ${fontSize}px !important;
  line-height: ${lineHeight} !important;
  letter-spacing: ${letterSpacing} !important;
}

/* Center the text column in the source editor.
 *
 * IMPORTANT: do NOT set width/padding on .cm-contentContainer.
 * CodeMirror measures that element's inner width to compute line
 * wrapping; padding there collapses the measured area to near-zero,
 * producing one-character-per-line layout.
 *
 * The correct approach: pad the *scroller* horizontally.
 * CM6 sizes .cm-contentContainer to fill the padded space, so it
 * always sees the intended column width. calc(50% - halfWidth)
 * centers a ${maxChars}-character column; max() ensures a minimum
 * 1.5rem gutter when the pane is narrower than the target width.
 */
.writing-studio-typography .markdown-source-view .cm-scroller {
  padding-left:  max(1.5rem, calc(50% - ${halfWidthCh})) !important;
  padding-right: max(1.5rem, calc(50% - ${halfWidthCh})) !important;
  box-sizing: border-box !important;
}

/* Reading view */
.writing-studio-typography .markdown-reading-view .markdown-preview-section {
  font-family: ${fontStack} !important;
  font-size: ${fontSize}px !important;
  line-height: ${lineHeight} !important;
  letter-spacing: ${letterSpacing} !important;
  max-width: ${maxWidthCh} !important;
  margin: 0 auto !important;
  padding: 2rem 1rem !important;
  box-sizing: border-box !important;
}
`;

    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = css;
    document.head.appendChild(el);
  }

  private removeStyles(): void {
    const existing = document.getElementById(STYLE_ID);
    if (existing) existing.remove();
  }

  refreshStyles(): void {
    if (this.active) {
      this.injectStyles();
    }
  }

  destroy(): void {
    this.disable();
  }
}
