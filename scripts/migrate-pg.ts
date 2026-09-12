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

  // 审核留痕只增不改，供申诉复核与合规审计。
  `CREATE TABLE IF NOT EXISTS moderation_records (
    id BIGSERIAL PRIMARY KEY,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    region TEXT NOT NULL,
    policy TEXT NOT NULL,
    ai_model TEXT,
    ai_verdict TEXT,
    ai_score DOUBLE PRECISION,
    ai_categories JSONB,
    ai_latency_ms INTEGER,
    human_verdict TEXT,
    moderator_user_id TEXT REFERENCES users(id),
    reason TEXT,
    created_at BIGINT NOT NULL,
    decided_at BIGINT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_mod_pending
     ON moderation_records(target_type, human_verdict, region)`,

  // 用户投稿：媒体走对象存储 key，不在此建 media_assets（留给 Payload）。
  // 来源说明必填，是版权与合规的最低证据。
  `CREATE TABLE IF NOT EXISTS contributions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT,
    source_note TEXT NOT NULL,
    claimed_license TEXT NOT NULL,
    storage_key TEXT,
    content_type TEXT,
    region TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_contrib_status ON contributions(status, region)`,

  // 缺图候选：扫描写入 JSON，import:illustrations 导入此表。
  `CREATE TABLE IF NOT EXISTS illustration_candidates (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    title TEXT,
    collection TEXT,
    category TEXT,
    slot_label TEXT,
    reader_href TEXT,
    anchor_key TEXT NOT NULL,
    block_id TEXT,
    signal TEXT NOT NULL,
    confidence REAL NOT NULL,
    excerpt TEXT,
    kind TEXT,
    clue TEXT,
    volume_title TEXT,
    volume_block_id TEXT,
    source_start INTEGER,
    source_end INTEGER,
    state TEXT NOT NULL DEFAULT 'open',
    resolved_anchor_id TEXT,
    created_at BIGINT NOT NULL,
    UNIQUE (book_id, anchor_key, signal)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_illust_cand_book
     ON illustration_candidates(book_id, state)`,
  `ALTER TABLE illustration_candidates ADD COLUMN IF NOT EXISTS title TEXT`,
  `ALTER TABLE illustration_candidates ADD COLUMN IF NOT EXISTS collection TEXT`,
  `ALTER TABLE illustration_candidates ADD COLUMN IF NOT EXISTS category TEXT`,
  `ALTER TABLE illustration_candidates ADD COLUMN IF NOT EXISTS slot_label TEXT`,
  `ALTER TABLE illustration_candidates ADD COLUMN IF NOT EXISTS reader_href TEXT`,

  // 读者对原书插图复原（朱砂/墨线）的人工校定。
  `CREATE TABLE IF NOT EXISTS restore_calibrations (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL,
    part TEXT NOT NULL,
    file TEXT NOT NULL,
    variant TEXT NOT NULL DEFAULT 'cinnabar',
    verdict TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    author_name TEXT,
    ai_action TEXT,
    ai_summary TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    UNIQUE (author_user_id, book_id, file)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_restore_cal_book
     ON restore_calibrations(book_id, file, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_restore_cal_verdict
     ON restore_calibrations(verdict, updated_at DESC)`,

  // Payload CMS 表隔离在独立 schema，避免 Drizzle 碰到前台 users。
  `CREATE SCHEMA IF NOT EXISTS payload`,
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
