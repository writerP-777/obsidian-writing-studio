import { Notice, requestUrl } from 'obsidian';
import { WordPressSite, WPCategory, WPPublishResult, WPPostStatus } from '../models/WordPressSite';

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
        return { success: false, message: 'Authentication failed. Check username and application password.' };
      }
      if (resp.status < 200 || resp.status >= 300) {
        return { success: false, message: `HTTP ${resp.status}` };
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
        message: `Connected as "${data.name}" to "${siteName}"`,
      };
    } catch (e) {
      return {
        success: false,
        message: `Network error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  async getCategories(site: WordPressSite): Promise<WPCategory[]> {
    try {
      const resp = await requestUrl({
        url: this.apiUrl(site, 'categories?per_page=100'),
        method: 'GET',
        headers: this.authHeaders(site),
        throw: false,
      });
      if (resp.status < 200 || resp.status >= 300) throw new Error(`HTTP ${resp.status}`);
      return (resp.json as WPApiCategory[]).map(c => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        count: c.count,
      }));
    } catch (e) {
      new Notice(`Failed to fetch categories: ${e instanceof Error ? e.message : String(e)}`);
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
        }
      } catch { /* skip this tag */ }
    }

    return ids;
  }

  convertMarkdownToHtml(markdown: string, site: WordPressSite): string {
    let html = markdown;

    // Strip frontmatter
    html = html.replace(/^---\n[\s\S]*?\n---\n?/, '');

    // Handle wikilinks
    if (site.wikilinkHandling === 'strip') {
      html = html.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (_: string, link: string, alias: string | undefined) => alias ? alias.slice(1) : link);
    } else {
      html = html.replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (_: string, link: string, alias: string | undefined) => {
        const text = alias ? alias.slice(1) : link;
        const slug = link.toLowerCase().replace(/\s+/g, '-');
        return `<a href="${slug}">${text}</a>`;
      });
    }

    // Basic Markdown → HTML conversion
    html = html
      .replace(/^#{6}\s(.+)$/gm, '<h6>$1</h6>')
      .replace(/^#{5}\s(.+)$/gm, '<h5>$1</h5>')
      .replace(/^#{4}\s(.+)$/gm, '<h4>$1</h4>')
      .replace(/^#{3}\s(.+)$/gm, '<h3>$1</h3>')
      .replace(/^#{2}\s(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#{1}\s(.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/^---$/gm, '<hr>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(?!<[h1-6]|<p|<ul|<ol|<hr|<blockquote)(.+)$/gm, '$1');

    html = '<p>' + html + '</p>';
    html = html.replace(/<p><\/p>/g, '');

    return html;
  }
}
