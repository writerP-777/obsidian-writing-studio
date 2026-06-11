import { Notice, requestUrl } from 'obsidian';
import { markdownToHtml } from './markdown';
import { WordPressSite, WPCategory, WPPublishResult, WPPostStatus } from '../models/WordPressSite';
import { t } from './i18n';

interface WPApiUser { name: string }
interface WPApiSite { name?: string }
interface WPApiError { message?: string }
interface WPApiPost { id: number; link: string; status: string }
interface WPApiCategory { id: number; name: string; slug: string; count: number }
interface WPApiTag { name: string; id: number }

export interface PublishOptions {
  title: string;
  content: string;
  status: WPPostStatus;
  categoryIds?: number[];
  tags?: string[];
  excerpt?: string;
  featuredMediaId?: number;
  scheduledDate?: string;
  existingPostId?: number;
}

export class WordPressClient {
  private authHeaders(site: WordPressSite): Record<string, string> {
    // Buffer.from handles non-ASCII chars; btoa() would throw on them
    const credentials = `${site.username}:${site.appPassword}`;
    const encoded = Buffer.from(credentials).toString('base64');
    return {
      'Authorization': `Basic ${encoded}`,
      'Content-Type': 'application/json',
    };
  }

  private apiUrl(site: WordPressSite, endpoint: string): string {
    const base = site.url.replace(/\/$/, '');
    return `${base}/wp-json/wp/v2/${endpoint}`;
  }

  async testConnection(site: WordPressSite): Promise<{ success: boolean; siteName?: string; message: string }> {
    try {
      const resp = await requestUrl({
        url: this.apiUrl(site, 'users/me'),
        method: 'GET',
        headers: this.authHeaders(site),
        throw: false,
      });

      if (resp.status === 401) {
        return { success: false, message: t('wpClient.authFailed') };
      }
      if (resp.status < 200 || resp.status >= 300) {
        return { success: false, message: t('wpClient.httpError', { status: resp.status }) };
      }

      const data = resp.json as WPApiUser;

      let siteName = site.url;
      try {
        const siteResp = await requestUrl({
          url: `${site.url.replace(/\/$/, '')}/wp-json/`,
          method: 'GET',
          headers: this.authHeaders(site),
          throw: false,
        });
        if (siteResp.status === 200) siteName = (siteResp.json as WPApiSite).name ?? site.url;
      } catch { /* non-critical */ }

      return {
        success: true,
        siteName,
        message: t('wpClient.connectedAs', { user: data.name, site: siteName }),
      };
    } catch (e) {
      return {
        success: false,
        message: t('wpClient.networkError', { error: e instanceof Error ? e.message : String(e) }),
      };
    }
  }

  async getCategories(site: WordPressSite): Promise<WPCategory[]> {
    try {
      // WP caps per_page at 100 — page until a short page arrives so sites
      // with more categories are no longer silently truncated
      const all: WPCategory[] = [];
      for (let page = 1; page <= 20; page++) {
        const resp = await requestUrl({
          url: this.apiUrl(site, `categories?per_page=100&page=${page}`),
          method: 'GET',
          headers: this.authHeaders(site),
          throw: false,
        });
        if (resp.status < 200 || resp.status >= 300) {
          // Requesting one page past the end returns 400 — not an error here
          if (page > 1) break;
          throw new Error(`HTTP ${resp.status}`);
        }
        const batch = (resp.json as WPApiCategory[]).map(c => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          count: c.count,
        }));
        all.push(...batch);
        if (batch.length < 100) break;
      }
      return all;
    } catch (e) {
      new Notice(t('wpClient.fetchCategoriesFailed', { error: e instanceof Error ? e.message : String(e) }));
      return [];
    }
  }

  async publish(site: WordPressSite, opts: PublishOptions): Promise<WPPublishResult> {
    const body: Record<string, unknown> = {
      title: opts.title,
      content: opts.content,
      status: opts.scheduledDate ? 'future' : opts.status,
      excerpt: opts.excerpt || '',
    };

    if (opts.categoryIds?.length) body.categories = opts.categoryIds;
    if (opts.tags?.length) {
      const tagIds = await this.ensureTags(site, opts.tags);
      body.tags = tagIds;
    }
    if (opts.featuredMediaId) body.featured_media = opts.featuredMediaId;
    if (opts.scheduledDate) body.date = opts.scheduledDate;

    const url = opts.existingPostId
      ? this.apiUrl(site, `posts/${opts.existingPostId}`)
      : this.apiUrl(site, 'posts');

    const resp = await requestUrl({
      url,
      method: opts.existingPostId ? 'PUT' : 'POST',
      headers: this.authHeaders(site),
      body: JSON.stringify(body),
      throw: false,
    });

    if (resp.status < 200 || resp.status >= 300) {
      const errData = resp.json as WPApiError | null;
      throw new Error(errData?.message ?? `HTTP ${resp.status}`);
    }

    const data = resp.json as WPApiPost;
    return {
      postId: data.id,
      url: data.link,
      status: data.status as WPPostStatus,
      scheduledDate: opts.scheduledDate,
    };
  }

  private async ensureTags(site: WordPressSite, tagNames: string[]): Promise<number[]> {
    const ids: number[] = [];
    const skipped: string[] = [];

    for (const name of tagNames) {
      try {
        const searchResp = await requestUrl({
          url: this.apiUrl(site, `tags?search=${encodeURIComponent(name)}`),
          method: 'GET',
          headers: this.authHeaders(site),
          throw: false,
        });
        if (searchResp.status === 200) {
          const tags = searchResp.json as WPApiTag[];
          const match = tags.find(t => t.name.toLowerCase() === name.toLowerCase());
          if (match) { ids.push(match.id); continue; }
        }

        const createResp = await requestUrl({
          url: this.apiUrl(site, 'tags'),
          method: 'POST',
          headers: this.authHeaders(site),
          body: JSON.stringify({ name }),
          throw: false,
        });
        if (createResp.status >= 200 && createResp.status < 300) {
          ids.push((createResp.json as WPApiTag).id);
        } else {
          skipped.push(name);
        }
      } catch {
        skipped.push(name);
      }
    }

    if (skipped.length > 0) {
      // The post still publishes — but tell the user which tags didn't make it
      new Notice(t('wpClient.tagsSkipped', { tags: skipped.join(', ') }));
    }

    return ids;
  }

  convertMarkdownToHtml(markdown: string, site: WordPressSite): string {
    let md = markdown;

    // Strip frontmatter (CRLF-tolerant)
    md = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');

    // Resolve wikilinks at the markdown level, then let the shared converter
    // handle them — the old converter mangled lists and code blocks
    if (site.wikilinkHandling === 'strip') {
      md = md.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (_: string, link: string, alias: string | undefined) => alias ? alias.slice(1) : link);
    } else {
      md = md.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (_: string, link: string, alias: string | undefined) => {
        const text = alias ? alias.slice(1) : link;
        const slug = link.toLowerCase().replace(/\s+/g, '-');
        return `[${text}](${slug})`;
      });
    }

    return markdownToHtml(md);
  }
}
