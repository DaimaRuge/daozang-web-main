/**
 * Postgres 建表与增量迁移。
 *
 * 为什么不用 ORM 的 migration 工具：项目原则是不引入 ORM，
 * 且表数量可控。全部语句写成幂等形式（IF NOT EXISTS / ADD COLUMN IF NOT EXISTS），
 * 因此本脚本可以在每次部署前无条件重跑。
 */

import { execute, closePool } from '../lib/pg';

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT,
    created_at BIGINT NOT NULL
  )`,
  // SQLite 的 COLLATE NOCASE 在 Postgres 无对应写法，
  // 改用函数索引保证邮箱大小写不敏感唯一。
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email))`,

  `CREATE TABLE IF NOT EXISTS reading_progress (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id TEXT NOT NULL,
    data_json TEXT NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (user_id, book_id)
  )`,

  `CREATE TABLE IF NOT EXISTS ai_quota (
    quota_key TEXT NOT NULL,
    day TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (quota_key, day)
  )`,

  `CREATE TABLE IF NOT EXISTS analytics_events (
    id BIGSERIAL PRIMARY KEY,
    event TEXT NOT NULL,
    user_id TEXT,
    session_id TEXT,
    book_id TEXT,
    platform TEXT,
    extra_json TEXT,
    created_at BIGINT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS article_illustrations (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    block_id TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'scene',
    source_text TEXT,
    image_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    prompt TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_illustrations_book_block
     ON article_illustrations(book_id, block_id, type)`,

  `CREATE TABLE IF NOT EXISTS annotations (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    block_id TEXT NOT NULL,
    quote TEXT NOT NULL,
    char_start INTEGER,
    char_end INTEGER,
    body TEXT NOT NULL,
    author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_name TEXT,
    status TEXT NOT NULL DEFAULT 'approved',
    report_count INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_annotations_book ON annotations(book_id, status)`,

  `CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    parent_id TEXT,
    body TEXT NOT NULL,
    author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_name TEXT,
    status TEXT NOT NULL DEFAULT 'approved',
    report_count INTEGER NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_comments_book ON comments(book_id, status)`,

  // 角色与状态：阶段 1 审核台的鉴权基础。
  // region 记录用户注册所在部署，双区上线后用于数据归属判断。
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'reader'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'global'`,
];

export async function migrate(): Promise<void> {
  for (const statement of STATEMENTS) {
    await execute(statement);
  }
}

// 直接执行时跑迁移；被 import 时只导出函数，便于测试复用。
if (process.argv[1] && process.argv[1].includes('migrate-pg')) {
  migrate()
    .then(() => {
      console.log(`[migrate] 完成，共执行 ${STATEMENTS.length} 条语句`);
      return closePool();
    })
    .catch(async (err) => {
      console.error('[migrate] 失败：', err);
      await closePool();
      process.exit(1);
    });
}
