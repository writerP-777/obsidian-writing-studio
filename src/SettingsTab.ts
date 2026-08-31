import { App, Component, MarkdownRenderer, PluginSettingTab, SettingPage } from 'obsidian';
import type { Setting, SettingDefinitionItem, SettingDefinitionPage } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { WordPressSite, WPPostStatus } from '../models/WordPressSite';
import { HELP_CONTENT } from './HelpContent';
import { t } from './i18n';

// Synthetic control key for WordPress site fields: sites live in an array, not
// on flat settings keys, so getControlValue/setControlValue route these by id.
// appPassword is absent deliberately — it renders imperatively (password input).
const WP_SITE_KEY = /^wpSite\.(.+)\.(nickname|url|username|defaultStatus|wikilinkHandling)$/;

// Imperative sub-page for the help tab: markdown content rendered through a
// Component whose lifetime must end when the page is hidden.
class HelpSettingPage extends SettingPage {
  private component: Component | null = null;

  constructor(private readonly appRef: App) {
    super();
    this.title = t('settings.tab.help');
  }

  display(): void {
    this.containerEl.empty();
    this.containerEl.addClass('ws-help-content');
    void this.renderContent();
  }

  private async renderContent(): Promise<void> {
    this.component?.unload();
    this.component = new Component();
    this.component.load();
    await MarkdownRenderer.render(this.appRef, HELP_CONTENT, this.containerEl, '', this.component);
    const supportDiv = this.containerEl.createDiv({ cls: 'ws-support-footer' });
    supportDiv.createEl('a', {
      href: 'https://buymeacoffee.com/writerp777',
      attr: { target: '_blank', rel: 'noopener noreferrer' }
    }).createEl('img', {
      attr: {
        src: 'https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&slug=writerp777&button_colour=c9a84c&font_colour=000000&font_family=Georgia&outline_colour=000000&coffee_colour=ffffff',
        alt: t('settings.wordpress.buyMeACoffee'),
        height: '40'
      }
    });
  }

  hide(): void {
    this.component?.unload();
    this.component = null;
    super.hide();
  }
}

export class WritingStudioSettingsTab extends PluginSettingTab {
  plugin: WritingStudioPlugin;

  constructor(app: App, plugin: WritingStudioPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      ...this.generalItems(),
      this.focusPage(),
      this.typographyPage(),
      this.sprintPage(),
      this.exportPage(),
      this.logPage(),
      this.wordPressPage(),
      {
        type: 'page',
        name: t('settings.tab.help'),
        page: () => new HelpSettingPage(this.app),
      },
    ];
  }

  getControlValue(key: string): unknown {
    const m = key.match(WP_SITE_KEY);
    if (m) {
      const site = this.plugin.settings.wordPressSites.find(s => s.id === m[1]);
      if (!site) return undefined;
      switch (m[2]) {
        case 'nickname': return site.nickname;
        case 'url': return site.url;
        case 'username': return site.username;
        case 'defaultStatus': return site.defaultStatus;
        case 'wikilinkHandling': return site.wikilinkHandling;
      }
    }
    // Keys come from our own definitions, all of which name real settings
    // properties (locked by tests) — indexed access needs the record view.
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const m = key.match(WP_SITE_KEY);
    if (m) {
      const site = this.plugin.settings.wordPressSites.find(s => s.id === m[1]);
      if (!site) return;
      switch (m[2]) {
        case 'nickname': site.nickname = String(value); break;
        case 'url': site.url = String(value); break;
        case 'username': site.username = String(value); break;
        case 'defaultStatus': site.defaultStatus = value as WPPostStatus; break;
        case 'wikilinkHandling': site.wikilinkHandling = value as 'strip' | 'convert'; break;
      }
      await this.plugin.saveSettings();
      return;
    }
    // An empty epub language would produce invalid epub metadata downstream
    if (key === 'epubLanguage') value = String(value).trim() || 'en';
    (this.plugin.settings as unknown as Record<string, unknown>)[key] = value;
    await this.plugin.saveSettings();
    switch (key) {
      case 'dimOpacity': this.plugin.focusMode.applyDimOpacity(); break;
      case 'focusFontSize': this.plugin.focusMode.applyFontSize(); break;
      case 'typographyFont':
        if (this.plugin.typographyMode.isActive()) this.plugin.typographyMode.refreshStyles();
        break;
    }
  }

  // Validators return an inline error message; the framework rejects the value
  private integerRange(min: number, max: number, zeroClears = false) {
    return (value: number): string | undefined => {
      const inRange = Number.isInteger(value) && value >= min && value <= max;
      if (inRange || (zeroClears && value === 0)) return undefined;
      return t(
        zeroClears ? 'settings.validation.integerRangeOrZero' : 'settings.validation.integerRange',
        { min, max },
      );
    };
  }

  private generalItems(): SettingDefinitionItem[] {
    return [
      {
        name: t('settings.general.openOnStartup'),
        desc: t('settings.general.openOnStartupDesc'),
        control: { type: 'toggle', key: 'openOnStartup' },
      },
      {
        name: t('settings.general.defaultProjectFolder'),
        desc: t('settings.general.defaultProjectFolderDesc'),
        control: {
          type: 'folder',
          key: 'defaultProjectFolder',
          placeholder: t('settings.general.defaultProjectFolderPlaceholder'),
        },
      },
      {
        name: t('settings.general.authorName'),
        desc: t('settings.general.authorNameDesc'),
        control: {
          type: 'text',
          key: 'authorName',
          placeholder: t('settings.general.authorNamePlaceholder'),
        },
      },
      {
        name: t('settings.general.defaultDocumentType'),
        desc: t('settings.general.defaultDocumentTypeDesc'),
        control: {
          type: 'dropdown',
          key: 'defaultDocumentType',
          options: {
            chapter: t('settings.general.docType.chapter'),
            section: t('settings.general.docType.section'),
            article: t('settings.general.docType.article'),
            note: t('settings.general.docType.note'),
          },
        },
      },
      {
        name: t('settings.general.frontmatterAutoUpdate'),
        desc: t('settings.general.frontmatterAutoUpdateDesc'),
        control: { type: 'toggle', key: 'frontmatterAutoUpdate' },
      },
    ];
  }

  private focusPage(): SettingDefinitionItem {
    return {
      type: 'page',
      name: t('settings.tab.focus'),
      items: [
        {
          name: t('settings.focus.focusUnit'),
          desc: t('settings.focus.focusUnitDesc'),
          control: {
            type: 'dropdown',
            key: 'focusUnit',
            options: {
              paragraph: t('settings.focus.paragraph'),
              sentence: t('settings.focus.sentence'),
            },
          },
        },
        {
          name: t('settings.focus.dimOpacity'),
          desc: t('settings.focus.dimOpacityDesc'),
          control: { type: 'slider', key: 'dimOpacity', min: 10, max: 50, step: 5 },
        },
        {
          name: t('settings.focus.fontSizeOverride'),
          desc: t('settings.focus.fontSizeOverrideDesc'),
          control: {
            type: 'number',
            key: 'focusFontSize',
            validate: this.integerRange(8, 72, true),
          },
        },
        {
          name: t('settings.focus.autoHideSidebars'),
          control: { type: 'toggle', key: 'focusAutoHideSidebars' },
        },
        {
          name: t('settings.focus.typewriterScroll'),
          desc: t('settings.focus.typewriterScrollDesc'),
          control: { type: 'toggle', key: 'typewriterScroll' },
        },
      ],
    };
  }

  private typographyPage(): SettingDefinitionItem {
    return {
      type: 'page',
      name: t('settings.tab.typography'),
      items: [
        {
          name: t('settings.typography.fontFamily'),
          control: {
            type: 'dropdown',
            key: 'typographyFont',
            options: {
              'mono': t('settings.typography.font.mono'),
              'serif': t('settings.typography.font.serif'),
              'sans': t('settings.typography.font.sans'),
              'cormorant-garamond': t('settings.typography.font.cormorant-garamond'),
              'crimson-text': t('settings.typography.font.crimson-text'),
              'eb-garamond': t('settings.typography.font.eb-garamond'),
              'libre-baskerville': t('settings.typography.font.libre-baskerville'),
              'libre-caslon-text': t('settings.typography.font.libre-caslon-text'),
              'literata': t('settings.typography.font.literata'),
              'lora': t('settings.typography.font.lora'),
              'inter': t('settings.typography.font.inter'),
              'lato': t('settings.typography.font.lato'),
              'source-sans-3': t('settings.typography.font.source-sans-3'),
              'custom': t('settings.typography.font.custom'),
            },
          },
        },
        {
          name: t('settings.typography.customFontName'),
          desc: t('settings.typography.customFontNameDesc'),
          control: {
            type: 'text',
            key: 'customFontName',
            placeholder: t('settings.typography.customFontNamePlaceholder'),
          },
        },
        {
          name: t('settings.typography.maxLineLength'),
          desc: t('settings.typography.maxLineLengthDesc'),
          control: { type: 'slider', key: 'maxLineLength', min: 55, max: 80, step: 1 },
        },
        {
          name: t('settings.typography.fontSize'),
          control: {
            type: 'number',
            key: 'typographyFontSize',
            validate: this.integerRange(8, 72),
          },
        },
        {
          name: t('settings.typography.lineHeight'),
          desc: t('settings.typography.lineHeightDesc'),
          control: { type: 'number', key: 'lineHeight', step: 'any', defaultValue: 1.7 },
        },
        {
          name: t('settings.typography.letterSpacing'),
          desc: t('settings.typography.letterSpacingDesc'),
          control: { type: 'text', key: 'letterSpacing' },
        },
        {
          name: t('settings.typography.persistAcrossSessions'),
          desc: t('settings.typography.persistAcrossSessionsDesc'),
          control: { type: 'toggle', key: 'persistTypography' },
        },
      ],
    };
  }

  private sprintPage(): SettingDefinitionItem {
    return {
      type: 'page',
      name: t('settings.tab.sprint'),
      items: [
        {
          name: t('settings.sprint.defaultDuration'),
          control: {
            type: 'number',
            key: 'defaultSprintDuration',
            validate: this.integerRange(1, 600),
          },
        },
        {
          name: t('settings.sprint.defaultDailyGoal'),
          control: {
            type: 'number',
            key: 'defaultDailyWordGoal',
            validate: this.integerRange(0, 1000000),
          },
        },
        {
          name: t('settings.sprint.soundNotifications'),
          desc: t('settings.sprint.soundNotificationsDesc'),
          control: { type: 'toggle', key: 'soundNotifications' },
        },
        {
          name: t('settings.sprint.historyRetention'),
          control: {
            type: 'number',
            key: 'sprintHistoryRetention',
            validate: this.integerRange(1, 3650),
          },
        },
        {
          name: t('settings.sprint.inlineGoalBanner'),
          desc: t('settings.sprint.inlineGoalBannerDesc'),
          control: { type: 'toggle', key: 'inlineGoalBanner' },
        },
      ],
    };
  }

  private exportPage(): SettingDefinitionItem {
    return {
      type: 'page',
      name: t('settings.tab.export'),
      items: [
        {
          name: t('settings.export.defaultFormat'),
          control: {
            type: 'dropdown',
            key: 'defaultExportFormat',
            options: {
              md: t('settings.export.format.md'),
              html: t('settings.export.format.html'),
              manuscript: t('exportModal.format.manuscript'),
              epub: t('exportModal.format.epub'),
              pdf: t('settings.export.format.pdf'),
              docx: t('settings.export.format.docx'),
              rtf: t('settings.export.format.rtf'),
            },
          },
        },
        {
          name: t('settings.export.defaultPaperSize'),
          control: {
            type: 'dropdown',
            key: 'defaultPaperSize',
            options: {
              letter: t('settings.export.paperSize.letter'),
              a4: t('settings.export.paperSize.a4'),
            },
          },
        },
        {
          name: t('settings.export.exportFont'),
          control: { type: 'text', key: 'defaultExportFont', placeholder: 'Georgia' },
        },
        {
          name: t('settings.export.exportFontSize'),
          control: {
            type: 'number',
            key: 'defaultExportFontSize',
            validate: this.integerRange(6, 72),
          },
        },
        {
          name: t('settings.export.pandocPath'),
          desc: t('settings.export.pandocPathDesc'),
          control: { type: 'text', key: 'pandocPath', placeholder: 'Pandoc' },
        },
        {
          name: t('settings.export.pdfEngine'),
          desc: t('settings.export.pdfEngineDesc'),
          control: {
            type: 'dropdown',
            key: 'pdfEngine',
            options: {
              auto: t('settings.export.pdfEngineAuto'),
              xelatex: 'xelatex',
              lualatex: 'lualatex',
              pdflatex: 'pdflatex',
              wkhtmltopdf: 'wkhtmltopdf',
            },
          },
        },
        {
          name: t('settings.export.pdfEnginePath'),
          desc: t('settings.export.pdfEnginePathDesc'),
          control: { type: 'text', key: 'pdfEnginePath' },
        },
        {
          type: 'group',
          heading: t('settings.export.epubHeading'),
          items: [
            {
              name: t('settings.export.epubLanguage'),
              desc: t('settings.export.epubLanguageDesc'),
              control: { type: 'text', key: 'epubLanguage', placeholder: 'en' },
            },
            {
              name: t('settings.export.includeCover'),
              desc: t('settings.export.includeCoverDesc'),
              control: { type: 'toggle', key: 'epubIncludeCover' },
            },
          ],
        },
      ],
    };
  }

  private logPage(): SettingDefinitionItem {
    return {
      type: 'page',
      name: t('settings.tab.log'),
      items: [
        {
          name: t('settings.log.appendToDailyNote'),
          desc: t('settings.log.appendToDailyNoteDesc'),
          control: { type: 'toggle', key: 'appendToDailyNote' },
        },
      ],
    };
  }

  private wordPressPage(): SettingDefinitionItem {
    return {
      type: 'page',
      name: t('settings.tab.wordpress'),
      items: [
        {
          type: 'list',
          heading: t('settings.wordpress.sitesHeading'),
          emptyState: t('settings.wordpress.noSites'),
          items: this.plugin.settings.wordPressSites.map(site => this.wordPressSitePage(site)),
          addItem: {
            name: t('settings.wordpress.addSite'),
            action: () => { void this.addWordPressSite(); },
          },
          onDelete: (index: number) => { void this.deleteWordPressSite(index); },
        },
        {
          type: 'group',
          heading: t('settings.wordpress.wikilinksHeading'),
          items: [
            {
              name: t('settings.wordpress.defaultWikilinkHandling'),
              control: {
                type: 'dropdown',
                key: 'wikilinkHandling',
                options: {
                  strip: t('settings.wordpress.wikilinkStrip'),
                  convert: t('settings.wordpress.wikilinkConvert'),
                },
              },
            },
          ],
        },
      ],
    };
  }

  private wordPressSitePage(site: WordPressSite): SettingDefinitionPage {
    return {
      type: 'page',
      name: site.nickname || t('settings.wordpress.siteUnnamed'),
      displayValue: () => site.url,
      items: [
        {
          name: t('settings.wordpress.nickname'),
          control: { type: 'text', key: `wpSite.${site.id}.nickname` },
        },
        {
          name: t('settings.wordpress.siteUrl'),
          control: { type: 'text', key: `wpSite.${site.id}.url`, placeholder: 'https://example.com' },
        },
        {
          name: t('settings.wordpress.username'),
          control: { type: 'text', key: `wpSite.${site.id}.username` },
        },
        {
          // A masked input has no declarative control type; render keeps the
          // password out of the DOM as plain text
          name: t('settings.wordpress.appPassword'),
          desc: t('settings.wordpress.appPasswordDesc'),
          render: (setting: Setting) => {
            setting.addText(text => {
              text.inputEl.type = 'password';
              text.setValue(site.appPassword).onChange(async v => {
                site.appPassword = v;
                await this.plugin.saveSettings();
              });
            });
          },
        },
        {
          name: t('settings.wordpress.defaultPostStatus'),
          control: {
            type: 'dropdown',
            key: `wpSite.${site.id}.defaultStatus`,
            options: {
              draft: t('settings.wordpress.postStatus.draft'),
              pending: t('settings.wordpress.postStatus.pending'),
              publish: t('settings.wordpress.postStatus.publish'),
            },
          },
        },
        {
          name: t('settings.wordpress.wikilinkHandling'),
          control: {
            type: 'dropdown',
            key: `wpSite.${site.id}.wikilinkHandling`,
            options: {
              strip: t('settings.wordpress.wikilinkHandlingStrip'),
              convert: t('settings.wordpress.wikilinkHandlingConvert'),
            },
          },
        },
        {
          name: t('settings.wordpress.testConnection'),
          desc: t('settings.wordpress.testConnectionDesc'),
          render: (setting: Setting) => {
            const statusEl = setting.descEl.createDiv('ws-wp-test-status');
            setting.addButton(b => b
              .setButtonText(t('settings.wordpress.testConnection'))
              .onClick(async () => {
                statusEl.textContent = t('settings.wordpress.testing');
                statusEl.className = 'ws-wp-test-status ws-wp-test-pending';
                const result = await this.plugin.wpClient.testConnection(site);
                statusEl.textContent = result.message;
                statusEl.className = `ws-wp-test-status ${result.success ? 'ws-wp-test-ok' : 'ws-wp-test-err'}`;
              }));
          },
        },
      ],
    };
  }

  private async addWordPressSite(): Promise<void> {
    this.plugin.settings.wordPressSites.push({
      id: `site-${Date.now()}`,
      nickname: t('settings.wordpress.newSiteName'),
      url: '',
      username: '',
      appPassword: '',
      defaultStatus: 'draft',
      wikilinkHandling: 'strip',
    });
    await this.plugin.saveSettings();
    this.update();
  }

  private async deleteWordPressSite(index: number): Promise<void> {
    this.plugin.settings.wordPressSites.splice(index, 1);
    await this.plugin.saveSettings();
    this.update();
  }
}
