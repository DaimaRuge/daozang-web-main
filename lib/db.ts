/**
 * SQLite 数据层（服务端 only）。
 *
 * P1 账号、进度同步、AI 配额、埋点、插图任务均落库于此。
 * 公益项目先用单文件 SQLite，部署时可换 Postgres（接口保持不变）。
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = process.env.DATABASE_URL?.startsWith('file:')
  ? process.env.DATABASE_URL.slice(5)
  : path.join(DB_DIR, 'daozang.db');

let db: Database.Database | null = null;

function migrate(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      name TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reading_progress (
      user_id TEXT NOT NULL,
      book_id TEXT NOT NULL,
      data_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, book_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_quota (
      quota_key TEXT NOT NULL,
      day TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (quota_key, day)
    );

    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event TEXT NOT NULL,
      user_id TEXT,
      session_id TEXT,
      book_id TEXT,
      platform TEXT,
      extra_json TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS article_illustrations (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'scene',
      source_text TEXT,
      image_url TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      prompt TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_illustrations_book_block
      ON article_illustrations(book_id, block_id, type);

    -- 公开旁注：读者主动「公开分享」的划词笔记，锚定到具体内容块。
    -- 私有笔记仍只存浏览器 localStorage，不入此表。
    CREATE TABLE IF NOT EXISTS annotations (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      block_id TEXT NOT NULL,
      quote TEXT NOT NULL,
      char_start INTEGER,
      char_end INTEGER,
      body TEXT NOT NULL,
      author_user_id TEXT NOT NULL,
      author_name TEXT,
      status TEXT NOT NULL DEFAULT 'approved',
      report_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_annotations_book ON annotations(book_id, status);

    -- 全文评论：篇级讨论，parent_id 预留将来盖楼
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      parent_id TEXT,
      body TEXT NOT NULL,
      author_user_id TEXT NOT NULL,
      author_name TEXT,
      status TEXT NOT NULL DEFAULT 'approved',
      report_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_comments_book ON comments(book_id, status);
  `);
}

/** 获取 SQLite 连接（单例，首次调用时建表） */
export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

export interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  created_at: number;
}

export function findUserByEmail(email: string): DbUser | undefined {
  return getDb()
    .prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE')
    .get(email.trim().toLowerCase()) as DbUser | undefined;
}

export function findUserById(id: string): DbUser | undefined {
  return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as DbUser | undefined;
}

export function createUser(email: string, passwordHash: string, name?: string): DbUser {
  const id = `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  getDb()
    .prepare('INSERT INTO users (id, email, password_hash, name, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, email.trim().toLowerCase(), passwordHash, name?.trim() || null, now);
  return findUserById(id)!;
}

export function upsertReadingProgress(userId: string, bookId: string, data: Record<string, unknown>): void {
  const now = Date.now();
  getDb()
    .prepare(`
      INSERT INTO reading_progress (user_id, book_id, data_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, book_id) DO UPDATE SET
        data_json = excluded.data_json,
        updated_at = excluded.updated_at
    `)
    .run(userId, bookId, JSON.stringify(data), now);
}

export function getReadingProgress(userId: string, bookId?: string): Record<string, unknown>[] {
  if (bookId) {
    const row = getDb()
      .prepare('SELECT data_json FROM reading_progress WHERE user_id = ? AND book_id = ?')
      .get(userId, bookId) as { data_json: string } | undefined;
    return row ? [JSON.parse(row.data_json)] : [];
  }
  const rows = getDb()
    .prepare('SELECT data_json FROM reading_progress WHERE user_id = ? ORDER BY updated_at DESC')
    .all(userId) as { data_json: string }[];
  return rows.map(r => JSON.parse(r.data_json));
}

export function getAiQuotaCount(quotaKey: string, day: string): number {
  const row = getDb()
    .prepare('SELECT count FROM ai_quota WHERE quota_key = ? AND day = ?')
    .get(quotaKey, day) as { count: number } | undefined;
  return row?.count ?? 0;
}

export function incrementAiQuota(quotaKey: string, day: string): number {
  getDb()
    .prepare(`
      INSERT INTO ai_quota (quota_key, day, count) VALUES (?, ?, 1)
      ON CONFLICT(quota_key, day) DO UPDATE SET count = count + 1
    `)
    .run(quotaKey, day);
  return getAiQuotaCount(quotaKey, day);
}

export function insertAnalyticsEvents(
  events: Array<{
    event: string;
    userId?: string;
    sessionId?: string;
    bookId?: string;
    platform?: string;
    extra?: Record<string, unknown>;
  }>,
): number {
  const stmt = getDb().prepare(`
    INSERT INTO analytics_events (event, user_id, session_id, book_id, platform, extra_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const now = Date.now();
  const insertMany = getDb().transaction((items: typeof events) => {
    for (const e of items) {
      stmt.run(
        e.event,
        e.userId ?? null,
        e.sessionId ?? null,
        e.bookId ?? null,
        e.platform ?? null,
        e.extra ? JSON.stringify(e.extra) : null,
        now,
      );
    }
  });
  insertMany(events);
  return events.length;
}

export interface IllustrationJob {
  id: string;
  book_id: string;
  block_id: string;
  type: string;
  source_text: string | null;
  image_url: string | null;
  status: string;
  error: string | null;
  prompt: string | null;
  created_at: number;
  updated_at: number;
}

export function createIllustrationJob(
  id: string,
  bookId: string,
  blockId: string,
  sourceText: string,
  type = 'scene',
): IllustrationJob {
  const now = Date.now();
  getDb()
    .prepare(`
      INSERT INTO article_illustrations
        (id, book_id, block_id, type, source_text, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
    `)
    .run(id, bookId, blockId, type, sourceText, now, now);
  return getIllustrationJob(id)!;
}

export function getIllustrationJob(id: string): IllustrationJob | undefined {
  return getDb().prepare('SELECT * FROM article_illustrations WHERE id = ?').get(id) as
    | IllustrationJob
    | undefined;
}

export function findIllustrationByBlock(
  bookId: string,
  blockId: string,
  type = 'scene',
): IllustrationJob | undefined {
  return getDb()
    .prepare('SELECT * FROM article_illustrations WHERE book_id = ? AND block_id = ? AND type = ?')
    .get(bookId, blockId, type) as IllustrationJob | undefined;
}

export function updateIllustrationJob(
  id: string,
  patch: Partial<Pick<IllustrationJob, 'status' | 'image_url' | 'error' | 'prompt'>>,
): void {
  const fields: string[] = ['updated_at = ?'];
  const values: unknown[] = [Date.now()];
  if (patch.status !== undefined) {
    fields.push('status = ?');
    values.push(patch.status);
  }
  if (patch.image_url !== undefined) {
    fields.push('image_url = ?');
    values.push(patch.image_url);
  }
  if (patch.error !== undefined) {
    fields.push('error = ?');
    values.push(patch.error);
  }
  if (patch.prompt !== undefined) {
    fields.push('prompt = ?');
    values.push(patch.prompt);
  }
  values.push(id);
  getDb().prepare(`UPDATE article_illustrations SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

// ---------- 公开旁注 ----------

export interface DbAnnotation {
  id: string;
  book_id: string;
  block_id: string;
  quote: string;
  char_start: number | null;
  char_end: number | null;
  body: string;
  author_user_id: string;
  author_name: string | null;
  status: string;
  report_count: number;
  created_at: number;
  updated_at: number;
}

export function createAnnotation(input: {
  bookId: string;
  blockId: string;
  quote: string;
  charStart?: number | null;
  charEnd?: number | null;
  body: string;
  authorUserId: string;
  authorName?: string | null;
}): DbAnnotation {
  const id = `an_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  getDb()
    .prepare(`
      INSERT INTO annotations
        (id, book_id, block_id, quote, char_start, char_end, body,
         author_user_id, author_name, status, report_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', 0, ?, ?)
    `)
    .run(
      id,
      input.bookId,
      input.blockId,
      input.quote,
      input.charStart ?? null,
      input.charEnd ?? null,
      input.body,
      input.authorUserId,
      input.authorName ?? null,
      now,
      now,
    );
  return getDb().prepare('SELECT * FROM annotations WHERE id = ?').get(id) as DbAnnotation;
}

/** 拉取一本书的公开旁注（默认仅 approved） */
export function getAnnotationsByBook(bookId: string): DbAnnotation[] {
  return getDb()
    .prepare(`SELECT * FROM annotations WHERE book_id = ? AND status = 'approved' ORDER BY created_at ASC`)
    .all(bookId) as DbAnnotation[];
}

/** 作者删除自己的旁注 */
export function deleteAnnotation(id: string, authorUserId: string): boolean {
  const res = getDb()
    .prepare('DELETE FROM annotations WHERE id = ? AND author_user_id = ?')
    .run(id, authorUserId);
  return res.changes > 0;
}

// ---------- 全文评论 ----------

export interface DbComment {
  id: string;
  book_id: string;
  parent_id: string | null;
  body: string;
  author_user_id: string;
  author_name: string | null;
  status: string;
  report_count: number;
  created_at: number;
}

export function createComment(input: {
  bookId: string;
  body: string;
  authorUserId: string;
  authorName?: string | null;
  parentId?: string | null;
}): DbComment {
  const id = `cm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();
  getDb()
    .prepare(`
      INSERT INTO comments
        (id, book_id, parent_id, body, author_user_id, author_name, status, report_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'approved', 0, ?)
    `)
    .run(id, input.bookId, input.parentId ?? null, input.body, input.authorUserId, input.authorName ?? null, now);
  return getDb().prepare('SELECT * FROM comments WHERE id = ?').get(id) as DbComment;
}

export function getCommentsByBook(bookId: string): DbComment[] {
  return getDb()
    .prepare(`SELECT * FROM comments WHERE book_id = ? AND status = 'approved' ORDER BY created_at DESC`)
    .all(bookId) as DbComment[];
}

export function deleteComment(id: string, authorUserId: string): boolean {
  const res = getDb()
    .prepare('DELETE FROM comments WHERE id = ? AND author_user_id = ?')
    .run(id, authorUserId);
  return res.changes > 0;
}

/** 计每用户当日发布数：限流用 */
export function countUserContributionsToday(authorUserId: string): number {
  const since = Date.now() - 86400000;
  const a = getDb()
    .prepare('SELECT COUNT(*) AS c FROM annotations WHERE author_user_id = ? AND created_at > ?')
    .get(authorUserId, since) as { c: number };
  const c = getDb()
    .prepare('SELECT COUNT(*) AS c FROM comments WHERE author_user_id = ? AND created_at > ?')
    .get(authorUserId, since) as { c: number };
  return a.c + c.c;
}

// ---------- 举报 ----------

/** 举报内容：累加计数，达阈值自动隐藏待人工复核 */
export function reportContent(kind: 'annotation' | 'comment', id: string, hideThreshold = 3): boolean {
  const table = kind === 'annotation' ? 'annotations' : 'comments';
  const res = getDb()
    .prepare(`UPDATE ${table} SET report_count = report_count + 1,
              status = CASE WHEN report_count + 1 >= ? THEN 'hidden' ELSE status END
              WHERE id = ?`)
    .run(hideThreshold, id);
  return res.changes > 0;
}
