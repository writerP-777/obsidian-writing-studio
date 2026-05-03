export type WPPostStatus = 'draft' | 'pending' | 'publish';

export interface WordPressSite {
  id: string;
  nickname: string;
  url: string;
  username: string;
  appPassword: string;
  defaultStatus: WPPostStatus;
  defaultCategory?: string;
  defaultCategoryId?: number;
  defaultTags?: string[];
  wikilinkHandling: 'strip' | 'convert';
}

export interface WPCategory {
  id: number;
  name: string;
  slug: string;
  count: number;
}

export interface WPPublishResult {
  postId: number;
  url: string;
  status: WPPostStatus;
  scheduledDate?: string;
}

export interface WPPostMeta {
  wpSite: string;
  wpPostId: number;
  wpUrl: string;
  wpStatus: WPPostStatus;
  wpPublished?: string;
  wpScheduled?: string;
}
