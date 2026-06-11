import { App, Component, MarkdownRenderer, PluginSettingTab, Setting } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { WordPressSite, WPPostStatus } from '../models/WordPressSite';
import { HELP_CONTENT } from './HelpContent';
import { t } from './i18n';

export class WritingStudioSettingsTab extends PluginSettingTab {
  plugin: WritingStudioPlugin;
  private activeTab = 'general';
  private helpComponent: Component | null = null;

  constructor(app: App, plugin: WritingStudioPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  // The help tab's MarkdownRenderer component must be unloaded whenever its
  // DOM is emptied (tab switch) or the dialog closes — display() alone left
  // it loaded indefinitely.
  private unloadHelpComponent(): void {
    if (this.helpComponent) {
      this.helpComponent.unload();
      this.helpComponent = null;
    }
  }

  hide(): void {
    this.unloadHelpComponent();
    super.hide();
  }

  display(): void {
    this.unloadHelpComponent();
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('ws-settings');

    // Tab bar
    const tabBar = containerEl.createDiv('ws-settings-tabs');
    const tabs = [
      { id: 'general', label: t('settings.tab.general') },
      { id: 'focus', label: t('settings.tab.focus') },
      { id: 'typography', label: t('settings.tab.typography') },
      { id: 'sprint', label: t('settings.tab.sprint') },
      { id: 'export', label: t('settings.tab.export') },
      { id: 'log', label: t('settings.tab.log') },
      { id: 'wordpress', label: t('settings.tab.wordpress') },
      { id: 'help', label: t('settings.tab.help') },
    ];

    const contentEl = containerEl.createDiv('ws-settings-content');

    tabs.forEach(tab => {
      const btn = tabBar.createEl('button', {
        cls: `ws-settings-tab ${this.activeTab === tab.id ? 'is-active' : ''}`,
        text: tab.label,
      });
      btn.onclick = () => {
        this.unloadHelpComponent();
        this.activeTab = tab.id;
        tabBar.querySelectorAll('.ws-settings-tab').forEach(b => b.removeClass('is-active'));
        btn.addClass('is-active');
        contentEl.empty();
        this.renderTab(tab.id, contentEl);
      };
    });

    this.renderTab(this.activeTab, contentEl);
  }

  private renderTab(tab: string, el: HTMLElement): void {
    switch (tab) {
      case 'general': this.renderGeneral(el); break;
      case 'focus': this.renderFocusMode(el); break;
      case 'typography': this.renderTypography(el); break;
      case 'sprint': this.renderSprint(el); break;
      case 'export': this.renderExport(el); break;
      case 'log': this.renderLog(el); break;
      case 'wordpress': this.renderWordPress(el); break;
      case 'help': void this.renderHelp(el); break;
    }
  }

  private renderGeneral(el: HTMLElement): void {

    new Setting(el)
      .setName(t('settings.general.openOnStartup'))
      .setDesc(t('settings.general.openOnStartupDesc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.openOnStartup)
        .onChange(async v => { this.plugin.settings.openOnStartup = v; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName(t('settings.general.defaultProjectFolder'))
      .setDesc(t('settings.general.defaultProjectFolderDesc'))
      .addText(text => text
        .setPlaceholder(t('settings.general.defaultProjectFolderPlaceholder'))
        .setValue(this.plugin.settings.defaultProjectFolder)
        .onChange(async v => { this.plugin.settings.defaultProjectFolder = v; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName(t('settings.general.authorName'))
      .setDesc(t('settings.general.authorNameDesc'))
      .addText(text => text
        .setPlaceholder(t('settings.general.authorNamePlaceholder'))
        .setValue(this.plugin.settings.authorName)
        .onChange(async v => { this.plugin.settings.authorName = v; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName(t('settings.general.defaultDocumentType'))
      .addDropdown(d => d
        .addOption('chapter', t('settings.general.docType.chapter'))
        .addOption('section', t('settings.general.docType.section'))
        .addOption('article', t('settings.general.docType.article'))
        .addOption('note', t('settings.general.docType.note'))
        .setValue(this.plugin.settings.defaultDocumentType)
        .onChange(async v => {
          this.plugin.settings.defaultDocumentType = v as 'chapter' | 'section' | 'article' | 'note';
          await this.plugin.saveSettings();
        }));

    new Setting(el)
      .setName(t('settings.general.frontmatterAutoUpdate'))
      .setDesc(t('settings.general.frontmatterAutoUpdateDesc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.frontmatterAutoUpdate)
        .onChange(async v => { this.plugin.settings.frontmatterAutoUpdate = v; await this.plugin.saveSettings(); }));
  }

  private renderFocusMode(el: HTMLElement): void {
    new Setting(el).setName(t('settings.focus.heading')).setHeading();

    new Setting(el)
      .setName(t('settings.focus.focusUnit'))
      .setDesc(t('settings.focus.focusUnitDesc'))
      .addDropdown(d => d
        .addOption('paragraph', t('settings.focus.paragraph'))
        .addOption('sentence', t('settings.focus.sentence'))
        .setValue(this.plugin.settings.focusUnit)
        .onChange(async v => {
          this.plugin.settings.focusUnit = v as 'paragraph' | 'sentence';
          await this.plugin.saveSettings();
        }));

    new Setting(el)
      .setName(t('settings.focus.dimOpacity'))
      .setDesc(t('settings.focus.dimOpacityDesc'))
      .addSlider(s => s
        .setLimits(10, 50, 5)
        .setValue(this.plugin.settings.dimOpacity)
        .setDynamicTooltip()
        .onChange(async v => {
          this.plugin.settings.dimOpacity = v;
          await this.plugin.saveSettings();
          this.plugin.focusMode.applyDimOpacity();
        }));

    new Setting(el)
      .setName(t('settings.focus.fontSizeOverride'))
      .setDesc(t('settings.focus.fontSizeOverrideDesc'))
      .addText(text => text
        .setValue(String(this.plugin.settings.focusFontSize || 0))
        .onChange(async v => {
          this.plugin.settings.focusFontSize = parseInt(v) || 0;
          await this.plugin.saveSettings();
          this.plugin.focusMode.applyFontSize();
        }));

    new Setting(el)
      .setName(t('settings.focus.autoHideSidebars'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.focusAutoHideSidebars)
        .onChange(async v => { this.plugin.settings.focusAutoHideSidebars = v; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName(t('settings.focus.typewriterScroll'))
      .setDesc(t('settings.focus.typewriterScrollDesc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.typewriterScroll)
        .onChange(async v => { this.plugin.settings.typewriterScroll = v; await this.plugin.saveSettings(); }));
  }

  private renderTypography(el: HTMLElement): void {
    new Setting(el).setName(t('settings.typography.heading')).setHeading();

    new Setting(el)
      .setName(t('settings.typography.fontFamily'))
      .addDropdown(d => {
        d.addOption('mono', t('settings.typography.font.mono'));
        d.addOption('serif', t('settings.typography.font.serif'));
        d.addOption('sans', t('settings.typography.font.sans'));
        d.addOption('cormorant-garamond', t('settings.typography.font.cormorant-garamond'));
        d.addOption('crimson-text', t('settings.typography.font.crimson-text'));
        d.addOption('eb-garamond', t('settings.typography.font.eb-garamond'));
        d.addOption('libre-baskerville', t('settings.typography.font.libre-baskerville'));
        d.addOption('libre-caslon-text', t('settings.typography.font.libre-caslon-text'));
        d.addOption('literata', t('settings.typography.font.literata'));
        d.addOption('lora', t('settings.typography.font.lora'));
        d.addOption('inter', t('settings.typography.font.inter'));
        d.addOption('lato', t('settings.typography.font.lato'));
        d.addOption('source-sans-3', t('settings.typography.font.source-sans-3'));
        d.addOption('custom', t('settings.typography.font.custom'));
        d.setValue(this.plugin.settings.typographyFont);
        d.onChange(async v => {
          this.plugin.settings.typographyFont = v;
          await this.plugin.saveSettings();
          if (this.plugin.typographyMode.isActive()) this.plugin.typographyMode.refreshStyles();
        });
      });

    new Setting(el)
      .setName(t('settings.typography.customFontName'))
      .setDesc(t('settings.typography.customFontNameDesc'))
      .addText(text => text
        .setPlaceholder(t('settings.typography.customFontNamePlaceholder'))
        .setValue(this.plugin.settings.customFontName)
        .onChange(async v => { this.plugin.settings.customFontName = v; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName(t('settings.typography.maxLineLength'))
      .setDesc(t('settings.typography.maxLineLengthDesc'))
      .addSlider(s => s
        .setLimits(55, 80, 1)
        .setValue(this.plugin.settings.maxLineLength)
        .setDynamicTooltip()
        .onChange(async v => { this.plugin.settings.maxLineLength = v; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName(t('settings.typography.fontSize'))
      .addText(text => text
        .setValue(String(this.plugin.settings.typographyFontSize))
        .onChange(async v => {
          this.plugin.settings.typographyFontSize = parseInt(v) || 18;
          await this.plugin.saveSettings();
        }));

    new Setting(el)
      .setName(t('settings.typography.lineHeight'))
      .setDesc(t('settings.typography.lineHeightDesc'))
      .addText(text => text
        .setValue(String(this.plugin.settings.lineHeight))
        .onChange(async v => {
          this.plugin.settings.lineHeight = parseFloat(v) || 1.7;
          await this.plugin.saveSettings();
        }));

    new Setting(el)
      .setName(t('settings.typography.letterSpacing'))
      .setDesc(t('settings.typography.letterSpacingDesc'))
      .addText(text => text
        .setValue(this.plugin.settings.letterSpacing)
        .onChange(async v => { this.plugin.settings.letterSpacing = v; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName(t('settings.typography.persistAcrossSessions'))
      .setDesc(t('settings.typography.persistAcrossSessionsDesc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.persistTypography)
        .onChange(async v => { this.plugin.settings.persistTypography = v; await this.plugin.saveSettings(); }));
  }

  private renderSprint(el: HTMLElement): void {
    new Setting(el).setName(t('settings.sprint.heading')).setHeading();

    new Setting(el)
      .setName(t('settings.sprint.defaultDuration'))
      .addText(text => text
        .setValue(String(this.plugin.settings.defaultSprintDuration))
        .onChange(async v => {
          this.plugin.settings.defaultSprintDuration = parseInt(v) || 25;
          await this.plugin.saveSettings();
        }));

    new Setting(el)
      .setName(t('settings.sprint.defaultDailyGoal'))
      .addText(text => text
        .setValue(String(this.plugin.settings.defaultDailyWordGoal))
        .onChange(async v => {
          this.plugin.settings.defaultDailyWordGoal = parseInt(v) || 0;
          await this.plugin.saveSettings();
        }));

    new Setting(el)
      .setName(t('settings.sprint.soundNotifications'))
      .setDesc(t('settings.sprint.soundNotificationsDesc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.soundNotifications)
        .onChange(async v => { this.plugin.settings.soundNotifications = v; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName(t('settings.sprint.historyRetention'))
      .addText(text => text
        .setValue(String(this.plugin.settings.sprintHistoryRetention))
        .onChange(async v => {
          this.plugin.settings.sprintHistoryRetention = parseInt(v) || 90;
          await this.plugin.saveSettings();
        }));

    new Setting(el)
      .setName(t('settings.sprint.inlineGoalBanner'))
      .setDesc(t('settings.sprint.inlineGoalBannerDesc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.inlineGoalBanner)
        .onChange(async v => { this.plugin.settings.inlineGoalBanner = v; await this.plugin.saveSettings(); }));
  }

  private renderExport(el: HTMLElement): void {
    new Setting(el).setName(t('settings.export.heading')).setHeading();

    new Setting(el)
      .setName(t('settings.export.defaultFormat'))
      .addDropdown(d => d
        .addOption('md', t('settings.export.format.md'))
        .addOption('html', t('settings.export.format.html'))
        .addOption('pdf', t('settings.export.format.pdf'))
        .addOption('docx', t('settings.export.format.docx'))
        .addOption('rtf', t('settings.export.format.rtf'))
        .setValue(this.plugin.settings.defaultExportFormat)
        .onChange(async v => { this.plugin.settings.defaultExportFormat = v as 'pdf' | 'docx' | 'rtf' | 'md' | 'html'; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName(t('settings.export.defaultPaperSize'))
      .addDropdown(d => d
        .addOption('letter', t('settings.export.paperSize.letter'))
        .addOption('a4', t('settings.export.paperSize.a4'))
        .setValue(this.plugin.settings.defaultPaperSize)
        .onChange(async v => { this.plugin.settings.defaultPaperSize = v as 'letter' | 'a4'; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName(t('settings.export.exportFont'))
      .addText(text => text
        .setPlaceholder('Georgia')
        .setValue(this.plugin.settings.defaultExportFont)
        .onChange(async v => { this.plugin.settings.defaultExportFont = v; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName(t('settings.export.exportFontSize'))
      .addText(text => text
        .setValue(String(this.plugin.settings.defaultExportFontSize))
        .onChange(async v => {
          this.plugin.settings.defaultExportFontSize = parseInt(v) || 12;
          await this.plugin.saveSettings();
        }));

    new Setting(el)
      .setName(t('settings.export.pandocPath'))
      .setDesc(t('settings.export.pandocPathDesc'))
      .addText(text => text
        .setPlaceholder('Pandoc')
        .setValue(this.plugin.settings.pandocPath)
        .onChange(async v => { this.plugin.settings.pandocPath = v; await this.plugin.saveSettings(); }));

    new Setting(el).setName(t('settings.export.epubHeading')).setHeading();

    new Setting(el)
      .setName(t('settings.export.epubLanguage'))
      .setDesc(t('settings.export.epubLanguageDesc'))
      .addText(text => text
        .setPlaceholder('en')
        .setValue(this.plugin.settings.epubLanguage)
        .onChange(async v => { this.plugin.settings.epubLanguage = v.trim() || 'en'; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName(t('settings.export.includeCover'))
      .setDesc(t('settings.export.includeCoverDesc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.epubIncludeCover)
        .onChange(async v => { this.plugin.settings.epubIncludeCover = v; await this.plugin.saveSettings(); }));
  }

  private renderLog(el: HTMLElement): void {
    new Setting(el).setName(t('settings.log.heading')).setHeading();

    new Setting(el)
      .setName(t('settings.log.appendToDailyNote'))
      .setDesc(t('settings.log.appendToDailyNoteDesc'))
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.appendToDailyNote)
        .onChange(async v => { this.plugin.settings.appendToDailyNote = v; await this.plugin.saveSettings(); }));
  }

  private renderWordPress(el: HTMLElement): void {
    new Setting(el).setName(t('settings.wordpress.sitesHeading')).setHeading();

    const sites = this.plugin.settings.wordPressSites;

    // Render each site
    for (let i = 0; i < sites.length; i++) {
      this.renderSiteConfig(el, sites[i], i);
    }

    new Setting(el)
      .addButton(b => b
        .setButtonText(t('settings.wordpress.addSite'))
        .onClick(async () => {
          this.plugin.settings.wordPressSites.push({
            id: `site-${Date.now()}`,
            nickname: 'New Site',
            url: '',
            username: '',
            appPassword: '',
            defaultStatus: 'draft',
            wikilinkHandling: 'strip',
          });
          await this.plugin.saveSettings();
          const contentEl = this.containerEl.querySelector('.ws-settings-content');
          if (contentEl instanceof HTMLElement) { contentEl.empty(); this.renderWordPress(contentEl); }
        }));

    new Setting(el).setName(t('settings.wordpress.wikilinksHeading')).setHeading();

    new Setting(el)
      .setName(t('settings.wordpress.defaultWikilinkHandling'))
      .addDropdown(d => d
        .addOption('strip', t('settings.wordpress.wikilinkStrip'))
        .addOption('convert', t('settings.wordpress.wikilinkConvert'))
        .setValue(this.plugin.settings.wikilinkHandling)
        .onChange(async v => { this.plugin.settings.wikilinkHandling = v as 'strip' | 'convert'; await this.plugin.saveSettings(); }));
  }

  private renderSiteConfig(container: HTMLElement, site: WordPressSite, index: number): void {
    const siteEl = container.createDiv('ws-wp-site-config');
    const heading = t('settings.wordpress.siteHeading', { nickname: site.nickname || t('settings.wordpress.siteUnnamed') });
    new Setting(siteEl).setName(heading).setHeading();

    new Setting(siteEl)
      .setName(t('settings.wordpress.nickname'))
      .addText(text => text
        .setValue(site.nickname)
        .onChange(async v => { site.nickname = v; await this.plugin.saveSettings(); }));

    new Setting(siteEl)
      .setName(t('settings.wordpress.siteUrl'))
      .addText(text => text
        .setPlaceholder('https://example.com')
        .setValue(site.url)
        .onChange(async v => { site.url = v; await this.plugin.saveSettings(); }));

    new Setting(siteEl)
      .setName(t('settings.wordpress.username'))
      .addText(text => text
        .setValue(site.username)
        .onChange(async v => { site.username = v; await this.plugin.saveSettings(); }));

    new Setting(siteEl)
      .setName(t('settings.wordpress.appPassword'))
      .setDesc(t('settings.wordpress.appPasswordDesc'))
      .addText(text => {
        text.inputEl.type = 'password';
        text.setValue(site.appPassword)
          .onChange(async v => { site.appPassword = v; await this.plugin.saveSettings(); });
      });

    new Setting(siteEl)
      .setName(t('settings.wordpress.defaultPostStatus'))
      .addDropdown(d => d
        .addOption('draft', t('settings.wordpress.postStatus.draft'))
        .addOption('pending', t('settings.wordpress.postStatus.pending'))
        .addOption('publish', t('settings.wordpress.postStatus.publish'))
        .setValue(site.defaultStatus)
        .onChange(async v => { site.defaultStatus = v as WPPostStatus; await this.plugin.saveSettings(); }));

    new Setting(siteEl)
      .setName(t('settings.wordpress.wikilinkHandling'))
      .addDropdown(d => d
        .addOption('strip', t('settings.wordpress.wikilinkHandlingStrip'))
        .addOption('convert', t('settings.wordpress.wikilinkHandlingConvert'))
        .setValue(site.wikilinkHandling)
        .onChange(async v => { site.wikilinkHandling = v as 'strip' | 'convert'; await this.plugin.saveSettings(); }));

    const testRow = new Setting(siteEl)
      .setName(t('settings.wordpress.testConnection'))
      .setDesc(t('settings.wordpress.testConnectionDesc'));

    const statusEl = siteEl.createDiv('ws-wp-test-status');

    testRow.addButton(b => b
      .setButtonText(t('settings.wordpress.testConnection'))
      .onClick(async () => {
        statusEl.textContent = t('settings.wordpress.testing');
        statusEl.className = 'ws-wp-test-status ws-wp-test-pending';
        const result = await this.plugin.wpClient.testConnection(site);
        statusEl.textContent = result.message;
        statusEl.className = `ws-wp-test-status ${result.success ? 'ws-wp-test-ok' : 'ws-wp-test-err'}`;
      }));

    new Setting(siteEl)
      .addButton(b => {
        b.setButtonText(t('settings.wordpress.removeSite'));
        b.buttonEl.addClass('mod-warning');
        b.onClick(async () => {
          this.plugin.settings.wordPressSites.splice(index, 1);
          await this.plugin.saveSettings();
          const contentEl = this.containerEl.querySelector('.ws-settings-content');
          if (contentEl instanceof HTMLElement) { contentEl.empty(); this.renderWordPress(contentEl); }
        });
      });
  }

  private async renderHelp(el: HTMLElement): Promise<void> {
    this.helpComponent = new Component();
    this.helpComponent.load();
    el.addClass('ws-help-content');
    await MarkdownRenderer.render(this.app, HELP_CONTENT, el, '', this.helpComponent);
    const supportDiv = el.createDiv({ cls: 'ws-support-footer' });
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
}
