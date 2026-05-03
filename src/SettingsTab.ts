import { App, PluginSettingTab, Setting, Notice, setIcon } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { WordPressSite } from '../models/WordPressSite';

export class WritingStudioSettingsTab extends PluginSettingTab {
  plugin: WritingStudioPlugin;
  private activeTab = 'general';

  constructor(app: App, plugin: WritingStudioPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass('ws-settings');

    // Tab bar
    const tabBar = containerEl.createDiv('ws-settings-tabs');
    const tabs = [
      { id: 'general', label: 'General' },
      { id: 'focus', label: 'Focus Mode' },
      { id: 'typography', label: 'Typography' },
      { id: 'sprint', label: 'Sprint & Goals' },
      { id: 'export', label: 'Export' },
      { id: 'log', label: 'Writing Log' },
      { id: 'wordpress', label: 'WordPress' },
    ];

    const contentEl = containerEl.createDiv('ws-settings-content');

    tabs.forEach(tab => {
      const btn = tabBar.createEl('button', {
        cls: `ws-settings-tab ${this.activeTab === tab.id ? 'is-active' : ''}`,
        text: tab.label,
      });
      btn.onclick = () => {
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
    }
  }

  private renderGeneral(el: HTMLElement): void {
    el.createEl('h3', { text: 'General' });

    new Setting(el)
      .setName('Default project folder')
      .setDesc('Vault path where Writing Projects are stored.')
      .addText(t => t
        .setPlaceholder('Writing Projects')
        .setValue(this.plugin.settings.defaultProjectFolder)
        .onChange(async v => { this.plugin.settings.defaultProjectFolder = v; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName('Author name')
      .setDesc('Used in exports and title pages.')
      .addText(t => t
        .setPlaceholder('Your Name')
        .setValue(this.plugin.settings.authorName)
        .onChange(async v => { this.plugin.settings.authorName = v; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName('Default document type')
      .addDropdown(d => d
        .addOption('chapter', 'Chapter')
        .addOption('section', 'Section')
        .addOption('article', 'Article')
        .addOption('note', 'Note')
        .setValue(this.plugin.settings.defaultDocumentType)
        .onChange(async v => {
          this.plugin.settings.defaultDocumentType = v as any;
          await this.plugin.saveSettings();
        }));

    new Setting(el)
      .setName('Frontmatter auto-update')
      .setDesc('Automatically update word-count and modified date on save.')
      .addToggle(t => t
        .setValue(this.plugin.settings.frontmatterAutoUpdate)
        .onChange(async v => { this.plugin.settings.frontmatterAutoUpdate = v; await this.plugin.saveSettings(); }));
  }

  private renderFocusMode(el: HTMLElement): void {
    el.createEl('h3', { text: 'Focus Mode' });

    new Setting(el)
      .setName('Focus unit')
      .setDesc('Highlight at paragraph or sentence level.')
      .addDropdown(d => d
        .addOption('paragraph', 'Paragraph')
        .addOption('sentence', 'Sentence (line)')
        .setValue(this.plugin.settings.focusUnit)
        .onChange(async v => {
          this.plugin.settings.focusUnit = v as any;
          await this.plugin.saveSettings();
        }));

    new Setting(el)
      .setName('Dim opacity (%)')
      .setDesc('Opacity of non-active text (10–50).')
      .addSlider(s => s
        .setLimits(10, 50, 5)
        .setValue(this.plugin.settings.dimOpacity)
        .setDynamicTooltip()
        .onChange(async v => {
          this.plugin.settings.dimOpacity = v;
          await this.plugin.saveSettings();
          document.documentElement.style.setProperty('--ws-focus-dim-opacity', String(v / 100));
        }));

    new Setting(el)
      .setName('Font size override (px)')
      .setDesc('Leave 0 to use current theme font size.')
      .addText(t => t
        .setValue(String(this.plugin.settings.focusFontSize || 0))
        .onChange(async v => {
          this.plugin.settings.focusFontSize = parseInt(v) || 0;
          await this.plugin.saveSettings();
        }));

    new Setting(el)
      .setName('Auto-hide sidebars')
      .addToggle(t => t
        .setValue(this.plugin.settings.focusAutoHideSidebars)
        .onChange(async v => { this.plugin.settings.focusAutoHideSidebars = v; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName('Typewriter scroll')
      .setDesc('Keep active line centered on screen.')
      .addToggle(t => t
        .setValue(this.plugin.settings.typewriterScroll)
        .onChange(async v => { this.plugin.settings.typewriterScroll = v; await this.plugin.saveSettings(); }));
  }

  private renderTypography(el: HTMLElement): void {
    el.createEl('h3', { text: 'Typography Mode' });

    new Setting(el)
      .setName('Font family')
      .addDropdown(d => {
        const sel = d.selectEl;
        sel.empty();

        const addGroup = (label: string, options: Array<[string, string]>) => {
          const group = document.createElement('optgroup');
          group.label = label;
          options.forEach(([value, display]) => {
            const opt = document.createElement('option');
            opt.value = value;
            opt.textContent = display;
            group.appendChild(opt);
          });
          sel.appendChild(group);
        };

        addGroup('Built-in', [
          ['mono', 'Monospaced (iA Writer Mono)'],
          ['serif', 'Serif (iA Writer Duo Serif)'],
          ['sans', 'Sans-serif (iA Writer Quattro)'],
        ]);
        addGroup('Serif', [
          ['cormorant-garamond', 'Cormorant Garamond'],
          ['crimson-text', 'Crimson Text'],
          ['eb-garamond', 'EB Garamond'],
          ['libre-baskerville', 'Libre Baskerville'],
          ['libre-caslon-text', 'Libre Caslon Text'],
          ['literata', 'Literata'],
          ['lora', 'Lora'],
        ]);
        addGroup('Sans-serif', [
          ['inter', 'Inter'],
          ['lato', 'Lato'],
          ['source-sans-3', 'Source Sans 3'],
        ]);
        addGroup('Custom', [
          ['custom', 'Custom font name…'],
        ]);

        d.setValue(this.plugin.settings.typographyFont);
        d.onChange(async v => {
          this.plugin.settings.typographyFont = v;
          await this.plugin.saveSettings();
          if (this.plugin.typographyMode.isActive()) this.plugin.typographyMode.refreshStyles();
        });
      });

    new Setting(el)
      .setName('Custom font name')
      .setDesc('Font name if "Custom" is selected above.')
      .addText(t => t
        .setPlaceholder('e.g. Merriweather')
        .setValue(this.plugin.settings.customFontName)
        .onChange(async v => { this.plugin.settings.customFontName = v; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName('Max line length (characters)')
      .setDesc('55–80 characters recommended.')
      .addSlider(s => s
        .setLimits(55, 80, 1)
        .setValue(this.plugin.settings.maxLineLength)
        .setDynamicTooltip()
        .onChange(async v => { this.plugin.settings.maxLineLength = v; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName('Font size (px)')
      .addText(t => t
        .setValue(String(this.plugin.settings.typographyFontSize))
        .onChange(async v => {
          this.plugin.settings.typographyFontSize = parseInt(v) || 18;
          await this.plugin.saveSettings();
        }));

    new Setting(el)
      .setName('Line height')
      .setDesc('Default: 1.7')
      .addText(t => t
        .setValue(String(this.plugin.settings.lineHeight))
        .onChange(async v => {
          this.plugin.settings.lineHeight = parseFloat(v) || 1.7;
          await this.plugin.saveSettings();
        }));

    new Setting(el)
      .setName('Letter spacing')
      .setDesc('CSS letter-spacing value (e.g. "normal", "0.02em").')
      .addText(t => t
        .setValue(this.plugin.settings.letterSpacing)
        .onChange(async v => { this.plugin.settings.letterSpacing = v; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName('Persist across sessions')
      .setDesc('Keep typography mode active when Obsidian reopens.')
      .addToggle(t => t
        .setValue(this.plugin.settings.persistTypography)
        .onChange(async v => { this.plugin.settings.persistTypography = v; await this.plugin.saveSettings(); }));
  }

  private renderSprint(el: HTMLElement): void {
    el.createEl('h3', { text: 'Sprint & Goals' });

    new Setting(el)
      .setName('Default sprint duration (minutes)')
      .addText(t => t
        .setValue(String(this.plugin.settings.defaultSprintDuration))
        .onChange(async v => {
          this.plugin.settings.defaultSprintDuration = parseInt(v) || 25;
          await this.plugin.saveSettings();
        }));

    new Setting(el)
      .setName('Default daily word goal')
      .addText(t => t
        .setValue(String(this.plugin.settings.defaultDailyWordGoal))
        .onChange(async v => {
          this.plugin.settings.defaultDailyWordGoal = parseInt(v) || 0;
          await this.plugin.saveSettings();
        }));

    new Setting(el)
      .setName('Sound notifications')
      .setDesc('Play a tone when sprint ends.')
      .addToggle(t => t
        .setValue(this.plugin.settings.soundNotifications)
        .onChange(async v => { this.plugin.settings.soundNotifications = v; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName('Sprint history retention (days)')
      .addText(t => t
        .setValue(String(this.plugin.settings.sprintHistoryRetention))
        .onChange(async v => {
          this.plugin.settings.sprintHistoryRetention = parseInt(v) || 90;
          await this.plugin.saveSettings();
        }));

    new Setting(el)
      .setName('Inline goal banner')
      .setDesc('Show word count goal progress below the title when a document is opened.')
      .addToggle(t => t
        .setValue(this.plugin.settings.inlineGoalBanner)
        .onChange(async v => { this.plugin.settings.inlineGoalBanner = v; await this.plugin.saveSettings(); }));
  }

  private renderExport(el: HTMLElement): void {
    el.createEl('h3', { text: 'Export' });

    new Setting(el)
      .setName('Default export format')
      .addDropdown(d => d
        .addOption('md', 'Markdown (.md)')
        .addOption('html', 'HTML')
        .addOption('pdf', 'PDF')
        .addOption('docx', 'Word (.docx)')
        .addOption('rtf', 'RTF')
        .setValue(this.plugin.settings.defaultExportFormat)
        .onChange(async v => { this.plugin.settings.defaultExportFormat = v as any; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName('Default paper size')
      .addDropdown(d => d
        .addOption('letter', 'Letter (US)')
        .addOption('a4', 'A4')
        .setValue(this.plugin.settings.defaultPaperSize)
        .onChange(async v => { this.plugin.settings.defaultPaperSize = v as any; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName('Export font')
      .addText(t => t
        .setPlaceholder('Georgia')
        .setValue(this.plugin.settings.defaultExportFont)
        .onChange(async v => { this.plugin.settings.defaultExportFont = v; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName('Export font size (pt)')
      .addText(t => t
        .setValue(String(this.plugin.settings.defaultExportFontSize))
        .onChange(async v => {
          this.plugin.settings.defaultExportFontSize = parseInt(v) || 12;
          await this.plugin.saveSettings();
        }));

    new Setting(el)
      .setName('Pandoc path')
      .setDesc('Full path to pandoc binary if not in system PATH.')
      .addText(t => t
        .setPlaceholder('pandoc')
        .setValue(this.plugin.settings.pandocPath)
        .onChange(async v => { this.plugin.settings.pandocPath = v; await this.plugin.saveSettings(); }));

    el.createEl('h4', { text: 'EPUB' });

    new Setting(el)
      .setName('EPUB language')
      .setDesc('BCP 47 language tag (e.g. en, fr, de).')
      .addText(t => t
        .setPlaceholder('en')
        .setValue(this.plugin.settings.epubLanguage)
        .onChange(async v => { this.plugin.settings.epubLanguage = v.trim() || 'en'; await this.plugin.saveSettings(); }));

    new Setting(el)
      .setName('Include cover')
      .setDesc('Generate a text cover page when no cover image is provided.')
      .addToggle(t => t
        .setValue(this.plugin.settings.epubIncludeCover)
        .onChange(async v => { this.plugin.settings.epubIncludeCover = v; await this.plugin.saveSettings(); }));
  }

  private renderLog(el: HTMLElement): void {
    el.createEl('h3', { text: 'Daily Writing Log' });

    new Setting(el)
      .setName('Append to Daily Note')
      .setDesc('Add a writing activity summary to today\'s Daily Note after each sprint.')
      .addToggle(t => t
        .setValue(this.plugin.settings.appendToDailyNote)
        .onChange(async v => { this.plugin.settings.appendToDailyNote = v; await this.plugin.saveSettings(); }));
  }

  private renderWordPress(el: HTMLElement): void {
    el.createEl('h3', { text: 'WordPress Sites' });

    const sites = this.plugin.settings.wordPressSites;

    // Render each site
    for (let i = 0; i < sites.length; i++) {
      this.renderSiteConfig(el, sites[i], i);
    }

    new Setting(el)
      .addButton(b => b
        .setButtonText('+ Add WordPress Site')
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
          this.display();
        }));

    el.createEl('h4', { text: 'Global Settings' });

    new Setting(el)
      .setName('Default wikilink handling')
      .addDropdown(d => d
        .addOption('strip', 'Strip (convert to plain text)')
        .addOption('convert', 'Convert to URL')
        .setValue(this.plugin.settings.wikilinkHandling)
        .onChange(async v => { this.plugin.settings.wikilinkHandling = v as any; await this.plugin.saveSettings(); }));
  }

  private renderSiteConfig(container: HTMLElement, site: WordPressSite, index: number): void {
    const siteEl = container.createDiv('ws-wp-site-config');
    siteEl.createEl('h4', { text: `Site: ${site.nickname || 'Unnamed'}` });

    new Setting(siteEl)
      .setName('Nickname')
      .addText(t => t
        .setValue(site.nickname)
        .onChange(async v => { site.nickname = v; await this.plugin.saveSettings(); }));

    new Setting(siteEl)
      .setName('Site URL')
      .addText(t => t
        .setPlaceholder('https://yourblog.com')
        .setValue(site.url)
        .onChange(async v => { site.url = v; await this.plugin.saveSettings(); }));

    new Setting(siteEl)
      .setName('Username')
      .addText(t => t
        .setValue(site.username)
        .onChange(async v => { site.username = v; await this.plugin.saveSettings(); }));

    new Setting(siteEl)
      .setName('Application Password')
      .setDesc('Generated in WordPress under Users → Profile → Application Passwords.')
      .addText(t => {
        t.inputEl.type = 'password';
        t.setValue(site.appPassword)
          .onChange(async v => { site.appPassword = v; await this.plugin.saveSettings(); });
      });

    new Setting(siteEl)
      .setName('Default post status')
      .addDropdown(d => d
        .addOption('draft', 'Draft')
        .addOption('pending', 'Pending Review')
        .addOption('publish', 'Published')
        .setValue(site.defaultStatus)
        .onChange(async v => { site.defaultStatus = v as any; await this.plugin.saveSettings(); }));

    new Setting(siteEl)
      .setName('Wikilink handling')
      .addDropdown(d => d
        .addOption('strip', 'Strip')
        .addOption('convert', 'Convert to URL')
        .setValue(site.wikilinkHandling)
        .onChange(async v => { site.wikilinkHandling = v as any; await this.plugin.saveSettings(); }));

    const testRow = new Setting(siteEl)
      .setName('Test connection')
      .setDesc('Verify credentials and connectivity.');

    const statusEl = siteEl.createDiv('ws-wp-test-status');

    testRow.addButton(b => b
      .setButtonText('Test Connection')
      .onClick(async () => {
        statusEl.textContent = 'Testing…';
        statusEl.className = 'ws-wp-test-status ws-wp-test-pending';
        const result = await this.plugin.wpClient.testConnection(site);
        statusEl.textContent = result.message;
        statusEl.className = `ws-wp-test-status ${result.success ? 'ws-wp-test-ok' : 'ws-wp-test-err'}`;
      }));

    new Setting(siteEl)
      .addButton(b => b
        .setButtonText('Remove Site')
        .setWarning()
        .onClick(async () => {
          this.plugin.settings.wordPressSites.splice(index, 1);
          await this.plugin.saveSettings();
          this.display();
        }));
  }
}
