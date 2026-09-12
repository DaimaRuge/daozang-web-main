/**
 * 一次性数据搬迁：SQLite → Postgres。
 *
 * 全部 INSERT 用 ON CONFLICT DO NOTHING，因此脚本可重复执行：
 * 中途失败后直接重跑即可，不会产生重复行。
 * 迁移完成后本脚本仍保留在仓库中，供其他部署实例迁移使用。
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { query, execute, closePool } from '../lib/pg';
import { migrate } from './migrate-pg';

const SQLITE_PATH = process.env.DZ_SQLITE_PATH
  ?? path.join(process.cwd(), 'data', 'daozang.db');

/** 表名 → 列名列表。顺序必须与下面的 INSERT 占位符一致 */
const TABLES: Array<{ name: string; columns: string[]; conflict: string }> = [
  { name: 'users', columns: ['id', 'email', 'password_hash', 'name', 'created_at'], conflict: '(id)' },
  { name: 'reading_progress', columns: ['user_id', 'book_id', 'data_json', 'updated_at'], conflict: '(user_id, book_id)' },
  { name: 'ai_quota', columns: ['quota_key', 'day', 'count'], conflict: '(quota_key, day)' },
  { name: 'article_illustrations', columns: ['id', 'book_id', 'block_id', 'type', 'source_text', 'image_url', 'status', 'error', 'prompt', 'created_at', 'updated_at'], conflict: '(id)' },
  { name: 'annotations', columns: ['id', 'book_id', 'block_id', 'quote', 'char_start', 'char_end', 'body', 'author_user_id', 'author_name', 'status', 'report_count', 'created_at', 'updated_at'], conflict: '(id)' },
  { name: 'comments', columns: ['id', 'book_id', 'parent_id', 'body', 'author_user_id', 'author_name', 'status', 'report_count', 'created_at'], conflict: '(id)' },
  // analytics_events 用自增主键，无天然唯一键，单独处理
];

async function main(): Promise<void> {
  if (!fs.existsSync(SQLITE_PATH)) {
    console.log(`[import] 未找到 ${SQLITE_PATH}，无历史数据需要搬迁，退出`);
    return;
  }

  await migrate();
  const sqlite = new Database(SQLITE_PATH, { readonly: true });

  for (const { name, columns, conflict } of TABLES) {
    const exists = sqlite
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
      .get(name);
    if (!exists) {
      console.log(`[import] ${name}：SQLite 中不存在，跳过`);
      continue;
    }

    const rows = sqlite.prepare(`SELECT ${columns.join(', ')} FROM ${name}`).all() as Record<string, unknown>[];
    let inserted = 0;
    for (const row of rows) {
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
      inserted += await execute(
        `INSERT INTO ${name} (${columns.join(', ')}) VALUES (${placeholders})
         ON CONFLICT ${conflict} DO NOTHING`,
        columns.map(c => row[c] ?? null),
      );
    }
    console.log(`[import] ${name}：读取 ${rows.length} 行，新增 ${inserted} 行`);
  }

  // 埋点事件无唯一键，只在目标表为空时导入，避免重跑造成重复统计。
  const hasEvents = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='analytics_events'`)
    .get();
  if (hasEvents) {
    const countRows = await query<{ c: number }>('SELECT COUNT(*) AS c FROM analytics_events');
    const c = countRows[0]?.c ?? 0;
    if (c > 0) {
      console.log(`[import] analytics_events：目标表已有 ${c} 行，跳过（避免重复统计）`);
    } else {
      const cols = ['event', 'user_id', 'session_id', 'book_id', 'platform', 'extra_json', 'created_at'];
      const eventRows = sqlite.prepare(`SELECT ${cols.join(', ')} FROM analytics_events`).all() as Record<string, unknown>[];
      for (const row of eventRows) {
        await execute(
          `INSERT INTO analytics_events (${cols.join(', ')}) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          cols.map(cn => row[cn] ?? null),
        );
      }
      console.log(`[import] analytics_events：导入 ${eventRows.length} 行`);
    }
  }

  sqlite.close();
}

main()
  .then(() => closePool())
  .catch(async (err) => {
    console.error('[import] 失败：', err);
    await closePool();
    process.exit(1);
  });
