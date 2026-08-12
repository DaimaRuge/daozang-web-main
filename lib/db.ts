/**
 * PostgreSQL 数据层（服务端 only）。
 *
 * P1 账号、进度同步、AI 配额、埋点、插图任务、公开 UGC 均落库于此。
 * 从 SQLite 迁来时刻意保持函数名与返回结构不变，只把返回值包成 Promise，
 * 让调用方的改动收敛为「加一个 await」。
 */

import { query, queryOne, execute } from '@/lib/pg';

export interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  created_at: number;
}

/** 生成带前缀的短 ID，沿用 SQLite 时代的格式，历史数据无需转换 */
function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function findUserByEmail(email: string): Promise<DbUser | undefined> {
  // Postgres 无 COLLATE NOCASE，用 lower() 匹配 idx_users_email_lower 函数索引。
  return queryOne<DbUser>('SELECT * FROM users WHERE lower(email) = lower($1)', [email.trim()]);
}

export async function findUserById(id: string): Promise<DbUser | undefined> {
  return queryOne<DbUser>('SELECT * FROM users WHERE id = $1', [id]);
}

export async function createUser(
  email: string,
  passwordHash: string,
  name?: string,
): Promise<DbUser> {
  const id = newId('u');
  const row = await queryOne<DbUser>(
    `INSERT INTO users (id, email, password_hash, name, created_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [id, email.trim().toLowerCase(), passwordHash, name?.trim() || null, Date.now()],
  );
  return row!;
}

export async function upsertReadingProgress(
  userId: string,
  bookId: string,
  data: Record<string, unknown>,
): Promise<void> {
  await execute(
    `INSERT INTO reading_progress (user_id, book_id, data_json, updated_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, book_id) DO UPDATE SET
       data_json = EXCLUDED.data_json,
       updated_at = EXCLUDED.updated_at`,
    [userId, bookId, JSON.stringify(data), Date.now()],
  );
}

export async function getReadingProgress(
  userId: string,
  bookId?: string,
): Promise<Record<string, unknown>[]> {
  if (bookId) {
    const row = await queryOne<{ data_json: string }>(
      'SELECT data_json FROM reading_progress WHERE user_id = $1 AND book_id = $2',
      [userId, bookId],
    );
    return row ? [JSON.parse(row.data_json)] : [];
  }
  const rows = await query<{ data_json: string }>(
    'SELECT data_json FROM reading_progress WHERE user_id = $1 ORDER BY updated_at DESC',
    [userId],
  );
  return rows.map(r => JSON.parse(r.data_json));
}

export async function getAiQuotaCount(quotaKey: string, day: string): Promise<number> {
  const row = await queryOne<{ count: number }>(
    'SELECT count FROM ai_quota WHERE quota_key = $1 AND day = $2',
    [quotaKey, day],
  );
  return row?.count ?? 0;
}

export async function incrementAiQuota(quotaKey: string, day: string): Promise<number> {
  // RETURNING 让「自增 + 读回」一次往返完成，避免并发下读到旧值。
  const row = await queryOne<{ count: number }>(
    `INSERT INTO ai_quota (quota_key, day, count) VALUES ($1, $2, 1)
     ON CONFLICT (quota_key, day) DO UPDATE SET count = ai_quota.count + 1
     RETURNING count`,
    [quotaKey, day],
  );
  return row?.count ?? 0;
}

export interface AnalyticsEventInput {
  event: string;
  userId?: string;
  sessionId?: string;
  bookId?: string;
  platform?: string;
  extra?: Record<string, unknown>;
}

export async function insertAnalyticsEvents(events: AnalyticsEventInput[]): Promise<number> {
  if (events.length === 0) return 0;
  const now = Date.now();
  // 单条 INSERT 多值：埋点是批量上报，逐条往返会把延迟放大到不可接受。
  const values: unknown[] = [];
  const tuples = events.map((e, i) => {
    const base = i * 7;
    values.push(
      e.event,
      e.userId ?? null,
      e.sessionId ?? null,
      e.bookId ?? null,
      e.platform ?? null,
      e.extra ? JSON.stringify(e.extra) : null,
      now,
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
  });
  await execute(
    `INSERT INTO analytics_events
       (event, user_id, session_id, book_id, platform, extra_json, created_at)
     VALUES ${tuples.join(', ')}`,
    values,
  );
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

export async function createIllustrationJob(
  id: string,
  bookId: string,
  blockId: string,
  sourceText: string,
  type = 'scene',
): Promise<IllustrationJob> {
  const now = Date.now();
  const row = await queryOne<IllustrationJob>(
    `INSERT INTO article_illustrations
       (id, book_id, block_id, type, source_text, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7) RETURNING *`,
    [id, bookId, blockId, type, sourceText, now, now],
  );
  return row!;
}

export async function getIllustrationJob(id: string): Promise<IllustrationJob | undefined> {
  return queryOne<IllustrationJob>('SELECT * FROM article_illustrations WHERE id = $1', [id]);
}

export async function findIllustrationByBlock(
  bookId: string,
  blockId: string,
  type = 'scene',
): Promise<IllustrationJob | undefined> {
  return queryOne<IllustrationJob>(
    'SELECT * FROM article_illustrations WHERE book_id = $1 AND block_id = $2 AND type = $3',
    [bookId, blockId, type],
  );
}

export async function updateIllustrationJob(
  id: string,
  patch: Partial<Pick<IllustrationJob, 'status' | 'image_url' | 'error' | 'prompt'>>,
): Promise<void> {
  const fields: string[] = ['updated_at = $1'];
  const values: unknown[] = [Date.now()];
  for (const key of ['status', 'image_url', 'error', 'prompt'] as const) {
    if (patch[key] !== undefined) {
      values.push(patch[key]);
      fields.push(`${key} = $${values.length}`);
    }
  }
  values.push(id);
  await execute(
    `UPDATE article_illustrations SET ${fields.join(', ')} WHERE id = $${values.length}`,
    values,
  );
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

export async function createAnnotation(input: {
  bookId: string;
  blockId: string;
  quote: string;
  charStart?: number | null;
  charEnd?: number | null;
  body: string;
  authorUserId: string;
  authorName?: string | null;
}): Promise<DbAnnotation> {
  const now = Date.now();
  const row = await queryOne<DbAnnotation>(
    `INSERT INTO annotations
       (id, book_id, block_id, quote, char_start, char_end, body,
        author_user_id, author_name, status, report_count, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'approved', 0, $10, $11)
     RETURNING *`,
    [
      newId('an'),
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
    ],
  );
  return row!;
}

/** 拉取一本书的公开旁注（默认仅 approved） */
export async function getAnnotationsByBook(bookId: string): Promise<DbAnnotation[]> {
  return query<DbAnnotation>(
    `SELECT * FROM annotations WHERE book_id = $1 AND status = 'approved' ORDER BY created_at ASC`,
    [bookId],
  );
}

/** 作者删除自己的旁注 */
export async function deleteAnnotation(id: string, authorUserId: string): Promise<boolean> {
  const changed = await execute(
    'DELETE FROM annotations WHERE id = $1 AND author_user_id = $2',
    [id, authorUserId],
  );
  return changed > 0;
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

export async function createComment(input: {
  bookId: string;
  body: string;
  authorUserId: string;
  authorName?: string | null;
  parentId?: string | null;
}): Promise<DbComment> {
  const row = await queryOne<DbComment>(
    `INSERT INTO comments
       (id, book_id, parent_id, body, author_user_id, author_name, status, report_count, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'approved', 0, $7)
     RETURNING *`,
    [
      newId('cm'),
      input.bookId,
      input.parentId ?? null,
      input.body,
      input.authorUserId,
      input.authorName ?? null,
      Date.now(),
    ],
  );
  return row!;
}

export async function getCommentsByBook(bookId: string): Promise<DbComment[]> {
  return query<DbComment>(
    `SELECT * FROM comments WHERE book_id = $1 AND status = 'approved' ORDER BY created_at DESC`,
    [bookId],
  );
}

export async function deleteComment(id: string, authorUserId: string): Promise<boolean> {
  const changed = await execute(
    'DELETE FROM comments WHERE id = $1 AND author_user_id = $2',
    [id, authorUserId],
  );
  return changed > 0;
}

/** 计每用户当日发布数：限流用 */
export async function countUserContributionsToday(authorUserId: string): Promise<number> {
  const since = Date.now() - 86400000;
  const row = await queryOne<{ c: number }>(
    `SELECT
       (SELECT COUNT(*) FROM annotations WHERE author_user_id = $1 AND created_at > $2)
     + (SELECT COUNT(*) FROM comments    WHERE author_user_id = $1 AND created_at > $2) AS c`,
    [authorUserId, since],
  );
  return row?.c ?? 0;
}

// ---------- 举报 ----------

/** 举报内容：累加计数，达阈值自动隐藏待人工复核 */
export async function reportContent(
  kind: 'annotation' | 'comment',
  id: string,
  hideThreshold = 3,
): Promise<boolean> {
  // 表名不能参数化，用白名单映射避免拼接注入。
  const table = kind === 'annotation' ? 'annotations' : 'comments';
  const changed = await execute(
    `UPDATE ${table}
        SET report_count = report_count + 1,
            status = CASE WHEN report_count + 1 >= $1 THEN 'hidden' ELSE status END
      WHERE id = $2`,
    [hideThreshold, id],
  );
  return changed > 0;
}
