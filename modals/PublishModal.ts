import { App, Modal, Setting, Notice, TFile } from 'obsidian';
import type WritingStudioPlugin from '../main';
import { WordPressSite, WPCategory, WPPostStatus } from '../models/WordPressSite';

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
    contentEl.createEl('h2', { text: 'Publish to WordPress' });

    const sites = this.plugin.settings.wordPressSites;
    if (sites.length === 0) {
      contentEl.createEl('p', {
        text: 'No WordPress sites configured. Add a site in settings → WordPress.',
        cls: 'ws-empty-state',
      });
      contentEl.createEl('button', { text: 'Close' }).onclick = () => this.close();
      return;
    }

    // Load existing WP meta from frontmatter
    await this.loadExistingMeta();

    // Site selector
    new Setting(contentEl)
      .setName('WordPress site')
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
      .setName('Post title')
      .addText(t => t
        .setValue(this.postTitle)
        .onChange(v => { this.postTitle = v; }));

    // Status
    new Setting(contentEl)
      .setName('Post status')
      .addDropdown(d => d
        .addOption('draft', 'Draft')
        .addOption('pending', 'Pending review')
        .addOption('publish', 'Published')
        .setValue(this.postStatus)
        .onChange(v => { this.postStatus = v as WPPostStatus; }));

    // Load categories
    const site = this.getSite();
    if (site) {
      this.categories = await this.plugin.wpClient.getCategories(site);
    }

    // Category selector
    if (this.categories.length > 0) {
      new Setting(contentEl).setName('Category');

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
      .setName('Tags')
      .setDesc('Comma-separated.')
      .addText(t => t
        .setValue(this.tags.join(', '))
        .onChange(v => { this.tags = v.split(',').map(s => s.trim()).filter(Boolean); }));

    // Excerpt
    new Setting(contentEl)
      .setName('Excerpt (optional)')
      .addTextArea(t => t
        .setValue(this.excerpt)
        .onChange(v => { this.excerpt = v; }));

    // Scheduled date
    new Setting(contentEl)
      .setName('Schedule publication (optional)')
      .setDesc('Leave empty to publish immediately.')
      .addText(t => t
        .setPlaceholder('yyyy-mm-ddThh:mm:ss')
        .setValue(this.scheduledDate)
        .onChange(v => { this.scheduledDate = v; }));

    // Existing post notice
    if (this.existingPostId) {
      const noticeEl = contentEl.createDiv('ws-publish-existing-notice');
      noticeEl.createSpan({ text: `⚠ This document was previously published (Post ID: ${this.existingPostId}).` });

      const choiceRow = noticeEl.createDiv('ws-publish-choice');
      const updateBtn = choiceRow.createEl('button', { text: 'Update existing post', cls: 'mod-cta' });
      updateBtn.onclick = () => { void this.doPublish(true); };

      const newBtn = choiceRow.createEl('button', { text: 'Create new post' });
      newBtn.onclick = () => { void this.doPublish(false); };
    }

    // Buttons
    const btnRow = contentEl.createDiv('ws-modal-btn-row');
    if (!this.existingPostId) {
      const publishBtn = btnRow.createEl('button', {
        cls: 'mod-cta',
        text: this.scheduledDate ? 'Schedule' : 'Publish',
      });
      publishBtn.onclick = () => { void this.doPublish(false); };
    }

    const cancelBtn = btnRow.createEl('button', { text: 'Cancel' });
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
        this.tags = (fm['tags'] as string[]).filter(t => t !== 'writing-studio');
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
    if (!site) { new Notice('No site selected.'); return; }

    const file = this.app.vault.getAbstractFileByPath(this.filePath);
    if (!(file instanceof TFile)) { new Notice('File not found.'); return; }

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

      const action = this.scheduledDate ? 'Scheduled' : 'Published';
      new Notice(`${action}! View post: ${result.url}`, 10000);
      this.close();
    } catch (e) {
      new Notice(`Publish failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
