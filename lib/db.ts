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
