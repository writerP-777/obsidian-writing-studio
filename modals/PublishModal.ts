import { App, Modal, Setting, Notice, TFile } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { WordPressSite, WPCategory, WPPostStatus } from '../models/WordPressSite';
import { t } from '../src/i18n';

export class PublishModal extends Modal {
  private plugin: WritingStudioPlugin;
  private filePath: string;
  private selectedSiteId = '';
  private postTitle = '';
  private postStatus: WPPostStatus = 'draft';
  private selectedCategoryIds: number[] = [];
  private tags: string[] = [];
  private excerpt = '';
  private scheduledDate = '';
  private categories: WPCategory[] = [];
  private existingPostId?: number;

  constructor(app: App, plugin: WritingStudioPlugin, filePath: string) {
    super(app);
    this.plugin = plugin;
    this.filePath = filePath;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ws-publish-modal');
    contentEl.createEl('h2', { text: t('publishModal.title') });

    const sites = this.plugin.settings.wordPressSites;
    if (sites.length === 0) {
      contentEl.createEl('p', {
        text: t('publishModal.noSites'),
        cls: 'ws-empty-state',
      });
      contentEl.createEl('button', { text: t('publishModal.close') }).onclick = () => this.close();
      return;
    }

    // Load existing WP meta from frontmatter
    await this.loadExistingMeta();

    // Site selector
    new Setting(contentEl)
      .setName(t('publishModal.siteName'))
      .addDropdown(d => {
        sites.forEach(s => { d.addOption(s.id, s.nickname || s.url); });
        if (this.selectedSiteId) d.setValue(this.selectedSiteId);
        else {
          this.selectedSiteId = sites[0].id;
          d.setValue(this.selectedSiteId);
        }
        d.onChange(v => {
          this.selectedSiteId = v;
          void this.loadCategories().then(() => this.render());
        });
      });

    // Title
    new Setting(contentEl)
      .setName(t('publishModal.postTitleName'))
      .addText(tx => tx
        .setValue(this.postTitle)
        .onChange(v => { this.postTitle = v; }));

    // Status
    new Setting(contentEl)
      .setName(t('publishModal.postStatusName'))
      .addDropdown(d => d
        .addOption('draft', t('publishModal.postStatus.draft'))
        .addOption('pending', t('publishModal.postStatus.pending'))
        .addOption('publish', t('publishModal.postStatus.publish'))
        .setValue(this.postStatus)
        .onChange(v => { this.postStatus = v as WPPostStatus; }));

    // Load categories
    const site = this.getSite();
    if (site) {
      this.categories = await this.plugin.wpClient.getCategories(site);
    }

    // Category selector
    if (this.categories.length > 0) {
      new Setting(contentEl).setName(t('publishModal.categoryName'));

      const catList = contentEl.createDiv('ws-publish-categories');
      for (const cat of this.categories) {
        const label = catList.createEl('label', { cls: 'ws-publish-cat-label' });
        const cb = label.createEl('input', { type: 'checkbox' });
        cb.checked = this.selectedCategoryIds.includes(cat.id);
        cb.onchange = () => {
          if (cb.checked) {
            if (!this.selectedCategoryIds.includes(cat.id)) this.selectedCategoryIds.push(cat.id);
          } else {
            this.selectedCategoryIds = this.selectedCategoryIds.filter(id => id !== cat.id);
          }
        };
        label.createSpan({ text: ` ${cat.name} (${cat.count})` });
      }
    }

    // Tags
    new Setting(contentEl)
      .setName(t('publishModal.tagsName'))
      .setDesc(t('publishModal.tagsDesc'))
      .addText(tx => tx
        .setValue(this.tags.join(', '))
        .onChange(v => { this.tags = v.split(',').map(s => s.trim()).filter(Boolean); }));

    // Excerpt
    new Setting(contentEl)
      .setName(t('publishModal.excerptName'))
      .addTextArea(tx => tx
        .setValue(this.excerpt)
        .onChange(v => { this.excerpt = v; }));

    // Scheduled date
    new Setting(contentEl)
      .setName(t('publishModal.scheduleName'))
      .setDesc(t('publishModal.scheduleDesc'))
      .addText(tx => tx
        .setPlaceholder(t('publishModal.schedulePlaceholder'))
        .setValue(this.scheduledDate)
        .onChange(v => { this.scheduledDate = v; }));

    // Existing post notice
    if (this.existingPostId) {
      const noticeEl = contentEl.createDiv('ws-publish-existing-notice');
      noticeEl.createSpan({ text: t('publishModal.existingNotice', { id: this.existingPostId }) });

      const choiceRow = noticeEl.createDiv('ws-publish-choice');
      const updateBtn = choiceRow.createEl('button', { text: t('publishModal.updatePost'), cls: 'mod-cta' });
      updateBtn.onclick = () => { void this.doPublish(true); };

      const newBtn = choiceRow.createEl('button', { text: t('publishModal.newPost') });
      newBtn.onclick = () => { void this.doPublish(false); };
    }

    // Buttons
    const btnRow = contentEl.createDiv('ws-modal-btn-row');
    if (!this.existingPostId) {
      const publishBtn = btnRow.createEl('button', {
        cls: 'mod-cta',
        text: this.scheduledDate ? t('publishModal.schedule') : t('publishModal.publish'),
      });
      publishBtn.onclick = () => { void this.doPublish(false); };
    }

    const cancelBtn = btnRow.createEl('button', { text: t('publishModal.cancel') });
    cancelBtn.onclick = () => this.close();
  }

  private render(): void {
    void this.onOpen();
  }

  private async loadExistingMeta(): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(this.filePath);
    if (!(file instanceof TFile)) return;

    const content = await this.app.vault.read(file);
    const fm = this.plugin.fmManager.parseFrontmatter(content);

    if (fm) {
      this.postTitle = (fm['title'] as string) || file.basename;
      if (fm['wp-post-id']) this.existingPostId = Number(fm['wp-post-id']);
      if (fm['wp-status']) this.postStatus = fm['wp-status'] as WPPostStatus;
      if (fm['tags'] && Array.isArray(fm['tags'])) {
        this.tags = (fm['tags'] as string[]).filter(tag => tag !== 'writing-studio');
      }
      if (fm['wp-site']) {
        const site = this.plugin.settings.wordPressSites.find(s => s.nickname === fm['wp-site']);
        if (site) this.selectedSiteId = site.id;
      }
    }
  }

  private async loadCategories(): Promise<void> {
    const site = this.getSite();
    if (!site) return;
    this.categories = await this.plugin.wpClient.getCategories(site);
  }

  private getSite(): WordPressSite | undefined {
    return this.plugin.settings.wordPressSites.find(s => s.id === this.selectedSiteId);
  }

  private async doPublish(updateExisting: boolean): Promise<void> {
    const site = this.getSite();
    if (!site) { new Notice(t('publishModal.noSiteSelected')); return; }

    const file = this.app.vault.getAbstractFileByPath(this.filePath);
    if (!(file instanceof TFile)) { new Notice(t('publishModal.fileNotFound')); return; }

    try {
      const rawContent = await this.app.vault.read(file);
      const htmlContent = this.plugin.wpClient.convertMarkdownToHtml(rawContent, site);

      const result = await this.plugin.wpClient.publish(site, {
        title: this.postTitle,
        content: htmlContent,
        status: this.postStatus,
        categoryIds: this.selectedCategoryIds,
        tags: this.tags,
        excerpt: this.excerpt,
        scheduledDate: this.scheduledDate || undefined,
        existingPostId: updateExisting ? this.existingPostId : undefined,
      });

      // Store WP meta in frontmatter
      await this.app.vault.process(file, (data) => {
        return this.plugin.fmManager.setWpMeta(data, {
          wpSite: site.nickname,
          wpPostId: result.postId,
          wpUrl: result.url,
          wpStatus: result.status,
          wpPublished: result.scheduledDate ? undefined : new Date().toISOString().split('T')[0],
          wpScheduled: result.scheduledDate,
        });
      });

      const action = this.scheduledDate ? t('publishModal.scheduled') : t('publishModal.published');
      new Notice(t('publishModal.actionNotice', { action, url: result.url }), 10000);
      this.close();
    } catch (e) {
      new Notice(t('publishModal.publishFailed', { error: e instanceof Error ? e.message : String(e) }));
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
