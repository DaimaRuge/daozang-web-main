/**
 * 用户数据层：阅读进度、最近阅读、收藏、笔记、阅读设置与行为事件。
 *
 * 为什么单独拆一层而不是写在页面组件里：
 * 1. 当前尚无用户系统，先以 localStorage 实现，但数据模型按「未来可同步到服务端」
 *    设计（每条记录带 id / 时间戳），登录体系接入后只需替换本文件的存取实现，
 *    页面组件与阅读器完全不用改；
 * 2. Agent 需要读取「用户读过什么、收藏了什么、记了什么笔记」作为上下文，
 *    统一从这里取数，避免 Agent 直接触碰存储细节；
 * 3. 行为事件（UserEvent）集中定义、集中上报，禁止在页面里散乱埋点。
 *
 * 隐私原则：所有数据仅存于用户本地；trackEvent 当前不向任何服务端发送数据，
 * 未来接入分析服务时必须提供关闭开关与数据导出/删除接口。
 */

// ---------- 数据模型 ----------

/** 阅读进度：按典籍维度记录，支持「返回上次阅读位置」 */
export interface ReadingProgress {
  bookId: string;
  bookTitle: string;
  category: string;
  /** 最近可见的内容块 ID，用于精确定位 */
  blockId?: string;
  /** 页面滚动百分比 0~1，作为 blockId 缺失时的降级定位 */
  scrollProgress: number;
  updatedAt: number;
}

/** 收藏：对象可以是整部典籍，也可以是某个段落（带 blockId 与摘录） */
export interface Bookmark {
  id: string;
  bookId: string;
  bookTitle: string;
  blockId?: string;
  /** 收藏段落时的原文摘录（只读展示，不可编辑，保护原文） */
  excerpt?: string;
  createdAt: number;
}

/** 笔记：必须与原文位置关联，且用户笔记与原文摘录分字段存储、互不覆盖 */
export interface Note {
  id: string;
  bookId: string;
  bookTitle: string;
  blockId?: string;
  /** 所引原文片段（不可变） */
  sourceText: string;
  /** 用户自己的笔记内容 */
  noteText: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  /** 可见范围预留：当前仅本地私有 */
  visibility: 'private';
}

/** 阅读器设置：全部本地保存，未来登录用户可同步 */
export interface ReaderSettings {
  /** 正文字号（px） */
  fontSize: number;
  /** 行高倍数 */
  lineHeight: number;
  /** 内容宽度档位 */
  width: 'narrow' | 'normal' | 'wide';
  /** 阅读主题：paper=日间宣纸，sepia=护眼，night=夜间 */
  theme: 'paper' | 'sepia' | 'night';
  /** 是否显示整理者按语与低置信度标记 */
  showEditorNotes: boolean;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  fontSize: 18,
  lineHeight: 2,
  width: 'normal',
  theme: 'paper',
  showEditorNotes: true,
};

/** 规范化的用户行为事件枚举 —— 新增埋点必须先在此登记 */
export type UserEvent =
  | 'page_view'
  | 'book_open'
  | 'chapter_open'
  | 'reading_progress'
  | 'text_select'
  | 'bookmark_create'
  | 'note_create'
  | 'search'
  | 'ai_question'
  | 'ai_explanation'
  | 'share'
  | 'recommendation_click';

// ---------- 存储实现（localStorage，SSR 安全） ----------

const KEYS = {
  progress: 'dz.reading-progress.v1',
  bookmarks: 'dz.bookmarks.v1',
  notes: 'dz.notes.v1',
  settings: 'dz.reader-settings.v1',
} as const;

/** SSR / 隐私模式下 localStorage 不可用时静默降级，不影响阅读主流程 */
function readStore<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStore(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 存储满 / 被禁用时放弃写入，阅读功能不受影响
  }
}

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------- 阅读进度 ----------

export function saveProgress(p: Omit<ReadingProgress, 'updatedAt'>): void {
  const all = readStore<Record<string, ReadingProgress>>(KEYS.progress, {});
  all[p.bookId] = { ...p, updatedAt: Date.now() };
  writeStore(KEYS.progress, all);
}

export function getProgress(bookId: string): ReadingProgress | undefined {
  return readStore<Record<string, ReadingProgress>>(KEYS.progress, {})[bookId];
}

/** 最近阅读列表：按更新时间倒序，供首页「继续阅读」与我的书房使用 */
export function getRecentReading(limit = 10): ReadingProgress[] {
  const all = readStore<Record<string, ReadingProgress>>(KEYS.progress, {});
  return Object.values(all)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit);
}

// ---------- 收藏 ----------

export function getBookmarks(): Bookmark[] {
  return readStore<Bookmark[]>(KEYS.bookmarks, []);
}

export function addBookmark(b: Omit<Bookmark, 'id' | 'createdAt'>): Bookmark {
  const bookmark: Bookmark = { ...b, id: genId(), createdAt: Date.now() };
  writeStore(KEYS.bookmarks, [bookmark, ...getBookmarks()]);
  trackEvent('bookmark_create', { bookId: b.bookId });
  return bookmark;
}

export function removeBookmark(id: string): void {
  writeStore(KEYS.bookmarks, getBookmarks().filter(b => b.id !== id));
}

// ---------- 笔记 ----------

export function getNotes(): Note[] {
  return readStore<Note[]>(KEYS.notes, []);
}

export function addNote(n: Omit<Note, 'id' | 'createdAt' | 'updatedAt' | 'visibility'>): Note {
  const note: Note = {
    ...n,
    id: genId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    visibility: 'private',
  };
  writeStore(KEYS.notes, [note, ...getNotes()]);
  trackEvent('note_create', { bookId: n.bookId });
  return note;
}

export function removeNote(id: string): void {
  writeStore(KEYS.notes, getNotes().filter(n => n.id !== id));
}

// ---------- 阅读器设置 ----------

export function getReaderSettings(): ReaderSettings {
  return { ...DEFAULT_READER_SETTINGS, ...readStore<Partial<ReaderSettings>>(KEYS.settings, {}) };
}

export function saveReaderSettings(s: ReaderSettings): void {
  writeStore(KEYS.settings, s);
}

// ---------- 行为事件 ----------

/**
 * 统一事件入口。当前仅在开发环境打印，不做任何上报；
 * 未来接入分析服务时在此处统一实现（含用户偏好开关），页面代码无需改动。
 */
export function trackEvent(event: UserEvent, payload?: Record<string, unknown>): void {
  if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
    console.debug('[dz-event]', event, payload ?? {});
  }
}
