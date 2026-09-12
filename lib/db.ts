/**
 * PostgreSQL 数据层（服务端 only）。
 *
 * P1 账号、进度同步、AI 配额、埋点、插图任务、公开 UGC 均落库于此。
 * 从 SQLite 迁来时刻意保持函数名与返回结构不变，只把返回值包成 Promise，
 * 让调用方的改动收敛为「加一个 await」。
 */

import { query, queryOne, execute } from '@/lib/pg';
import { currentRegion, initialUgcStatus } from '@/lib/moderation/policy';

export interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  created_at: number;
  // role/status/region 用 string：auth-role → auth → db，若此处引入 UserRole 会循环依赖。
  role: string;
  status: string;
  region: string;
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

/** 参数用 string 而非 UserRole，避免 db ↔ auth-role 循环依赖；类型收窄在调用方做。 */
export async function updateUserRole(userId: string, role: string): Promise<boolean> {
  const changed = await execute('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
  return changed > 0;
}

export async function updateUserStatus(userId: string, status: string): Promise<boolean> {
  const changed = await execute('UPDATE users SET status = $1 WHERE id = $2', [status, userId]);
  return changed > 0;
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
  status?: string;
}): Promise<DbAnnotation> {
  const now = Date.now();
  const row = await queryOne<DbAnnotation>(
    `INSERT INTO annotations
       (id, book_id, block_id, quote, char_start, char_end, body,
        author_user_id, author_name, status, report_count, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, $11, $12)
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
      input.status ?? initialUgcStatus('text-ugc'),
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
  status?: string;
}): Promise<DbComment> {
  const row = await queryOne<DbComment>(
    `INSERT INTO comments
       (id, book_id, parent_id, body, author_user_id, author_name, status, report_count, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $8)
     RETURNING *`,
    [
      newId('cm'),
      input.bookId,
      input.parentId ?? null,
      input.body,
      input.authorUserId,
      input.authorName ?? null,
      input.status ?? initialUgcStatus('text-ugc'),
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

/** 计每用户当日发布数（旁注+评论+投稿合计）：限流用 */
export async function countUserContributionsToday(authorUserId: string): Promise<number> {
  const since = Date.now() - 86400000;
  try {
    const row = await queryOne<{ c: number }>(
      `SELECT
         (SELECT COUNT(*) FROM annotations WHERE author_user_id = $1 AND created_at > $2)
       + (SELECT COUNT(*) FROM comments    WHERE author_user_id = $1 AND created_at > $2)
       + (SELECT COUNT(*) FROM contributions WHERE user_id = $1 AND created_at > $2)
       + (SELECT COUNT(*) FROM restore_calibrations WHERE author_user_id = $1 AND created_at > $2) AS c`,
      [authorUserId, since],
    );
    return Number(row?.c ?? 0);
  } catch {
    const row = await queryOne<{ c: number }>(
      `SELECT
         (SELECT COUNT(*) FROM annotations WHERE author_user_id = $1 AND created_at > $2)
       + (SELECT COUNT(*) FROM comments    WHERE author_user_id = $1 AND created_at > $2)
       + (SELECT COUNT(*) FROM contributions WHERE user_id = $1 AND created_at > $2) AS c`,
      [authorUserId, since],
    );
    return Number(row?.c ?? 0);
  }
}

// ---------- 举报 ----------

/** 举报内容：累加计数，达阈值自动隐藏待人工复核 */
export async function reportContent(
  kind: 'annotation' | 'comment',
  id: string,
  hideThreshold = 3,
): Promise<{ found: boolean; hidden: boolean }> {
  const table = kind === 'annotation' ? 'annotations' : 'comments';
  const row = await queryOne<{ status: string; report_count: number }>(
    `UPDATE ${table}
        SET report_count = report_count + 1,
            status = CASE WHEN report_count + 1 >= $1 THEN 'hidden' ELSE status END
      WHERE id = $2
      RETURNING status, report_count`,
    [hideThreshold, id],
  );
  if (!row) return { found: false, hidden: false };
  const hidden = row.status === 'hidden';
  // 只在刚跨过阈值时写一条记录，避免后续重复举报把队列刷爆。
  if (row.report_count === hideThreshold) {
    await insertModerationRecord({
      targetType: kind,
      targetId: id,
      policy: 'human-queue',
      reason: `report_count=${row.report_count}`,
    });
  }
  return { found: true, hidden };
}

export type UgcKind = 'annotation' | 'comment' | 'contribution';

export interface ModerationQueueItem {
  kind: UgcKind;
  id: string;
  book_id: string;
  body: string;
  quote: string | null;
  author_user_id: string;
  author_name: string | null;
  status: string;
  report_count: number;
  created_at: number;
}

export async function listModerationQueue(opts: {
  kind?: UgcKind | 'all';
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<ModerationQueueItem[]> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const offset = opts.offset ?? 0;
  const status = opts.status && opts.status !== 'all' ? opts.status : null;
  const kind = opts.kind && opts.kind !== 'all' ? opts.kind : null;

  const statusFilter = status
    ? 'status = $1'
    : `status IN ('hidden', 'pending')`;
  const params: unknown[] = status ? [status] : [];
  const limPh = `$${params.length + 1}`;
  const offPh = `$${params.length + 2}`;
  params.push(limit, offset);

  const contribStatusFilter = status
    ? 'c.status = $1'
    : `c.status IN ('hidden', 'pending')`;

  const annotationSql = `
    SELECT 'annotation'::text AS kind, id, book_id, body, quote,
           author_user_id, author_name, status, report_count, created_at
      FROM annotations WHERE ${statusFilter}`;
  const commentSql = `
    SELECT 'comment'::text AS kind, id, book_id, body, NULL::text AS quote,
           author_user_id, author_name, status, report_count, created_at
      FROM comments WHERE ${statusFilter}`;
  const contributionSql = `
    SELECT 'contribution'::text AS kind, c.id, COALESCE(c.kind, '') AS book_id,
           (c.title || E'\\n来源：' || c.source_note
             || COALESCE(E'\\n' || NULLIF(c.body, ''), '')) AS body,
           c.storage_key AS quote,
           c.user_id AS author_user_id, u.name AS author_name,
           c.status, 0 AS report_count, c.created_at
      FROM contributions c
      LEFT JOIN users u ON u.id = c.user_id
     WHERE ${contribStatusFilter}`;

  let union = `${annotationSql} UNION ALL ${commentSql} UNION ALL ${contributionSql}`;
  if (kind === 'annotation') union = annotationSql;
  if (kind === 'comment') union = commentSql;
  if (kind === 'contribution') union = contributionSql;

  return query<ModerationQueueItem>(
    `${union} ORDER BY created_at DESC LIMIT ${limPh} OFFSET ${offPh}`,
    params,
  );
}

export async function countModerationQueue(): Promise<{ hidden: number; pending: number }> {
  const row = await queryOne<{ hidden: number; pending: number }>(
    `SELECT
       (SELECT COUNT(*) FROM annotations WHERE status = 'hidden')
     + (SELECT COUNT(*) FROM comments WHERE status = 'hidden')
     + (SELECT COUNT(*) FROM contributions WHERE status = 'hidden') AS hidden,
       (SELECT COUNT(*) FROM annotations WHERE status = 'pending')
     + (SELECT COUNT(*) FROM comments WHERE status = 'pending')
     + (SELECT COUNT(*) FROM contributions WHERE status = 'pending') AS pending`,
  );
  return { hidden: Number(row?.hidden ?? 0), pending: Number(row?.pending ?? 0) };
}

export async function setUgcStatus(kind: UgcKind, id: string, status: string): Promise<boolean> {
  const now = Date.now();
  if (kind === 'annotation') {
    const n = await execute(
      `UPDATE annotations SET status = $1, updated_at = $2 WHERE id = $3`,
      [status, now, id],
    );
    return n > 0;
  }
  if (kind === 'contribution') {
    const n = await execute(
      `UPDATE contributions SET status = $1, updated_at = $2 WHERE id = $3`,
      [status, now, id],
    );
    return n > 0;
  }
  const n = await execute(`UPDATE comments SET status = $1 WHERE id = $2`, [status, id]);
  return n > 0;
}

export interface ModerationRecordInput {
  targetType: string;
  targetId: string;
  policy: string;
  humanVerdict?: string | null;
  moderatorUserId?: string | null;
  reason?: string | null;
  aiModel?: string | null;
  aiVerdict?: string | null;
  aiScore?: number | null;
  aiCategories?: string[] | null;
  aiLatencyMs?: number | null;
}

export async function insertModerationRecord(input: ModerationRecordInput): Promise<void> {
  await execute(
    `INSERT INTO moderation_records
       (target_type, target_id, region, policy,
        ai_model, ai_verdict, ai_score, ai_categories, ai_latency_ms,
        human_verdict, moderator_user_id, reason, created_at, decided_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      input.targetType,
      input.targetId,
      currentRegion(),
      input.policy,
      input.aiModel ?? null,
      input.aiVerdict ?? null,
      input.aiScore ?? null,
      input.aiCategories ?? null,
      input.aiLatencyMs ?? null,
      input.humanVerdict ?? null,
      input.moderatorUserId ?? null,
      input.reason ?? null,
      Date.now(),
      input.humanVerdict ? Date.now() : null,
    ],
  );
}

export type ContributionKind = 'image' | 'audio' | 'book';
export type ClaimedLicense = 'public-domain' | 'own-work' | 'licensed' | 'unknown';

export interface DbContribution {
  id: string;
  user_id: string;
  kind: ContributionKind;
  title: string;
  body: string | null;
  source_note: string;
  claimed_license: string;
  storage_key: string | null;
  content_type: string | null;
  region: string;
  status: string;
  created_at: number;
  updated_at: number;
  author_name?: string | null;
}

export async function createContribution(input: {
  userId: string;
  kind: ContributionKind;
  title: string;
  body?: string | null;
  sourceNote: string;
  claimedLicense: ClaimedLicense;
  storageKey?: string | null;
  contentType?: string | null;
  status: string;
}): Promise<DbContribution> {
  const now = Date.now();
  const row = await queryOne<DbContribution>(
    `INSERT INTO contributions
       (id, user_id, kind, title, body, source_note, claimed_license,
        storage_key, content_type, region, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      newId('ct'),
      input.userId,
      input.kind,
      input.title,
      input.body ?? null,
      input.sourceNote,
      input.claimedLicense,
      input.storageKey ?? null,
      input.contentType ?? null,
      currentRegion(),
      input.status,
      now,
      now,
    ],
  );
  return row!;
}

export async function listApprovedContributions(limit = 30): Promise<DbContribution[]> {
  return query<DbContribution>(
    `SELECT c.*, u.name AS author_name
       FROM contributions c
       LEFT JOIN users u ON u.id = c.user_id
      WHERE c.status = 'approved'
      ORDER BY c.created_at DESC
      LIMIT $1`,
    [Math.min(limit, 100)],
  );
}

// ---------- 插图复原校定 ----------

export interface DbRestoreCalibration {
  id: string;
  book_id: string;
  part: string;
  file: string;
  variant: string;
  verdict: string;
  note: string;
  author_user_id: string;
  author_name: string | null;
  ai_action: string | null;
  ai_summary: string | null;
  created_at: number;
  updated_at: number;
}

export interface RestoreCalibrationInput {
  bookId: string;
  part: string;
  file: string;
  variant: string;
  verdict: string;
  note: string;
  authorUserId: string;
  authorName?: string | null;
  aiAction?: string | null;
  aiSummary?: string | null;
}

export async function upsertRestoreCalibration(
  input: RestoreCalibrationInput,
): Promise<DbRestoreCalibration> {
  const now = Date.now();
  const row = await queryOne<DbRestoreCalibration>(
    `INSERT INTO restore_calibrations (
       id, book_id, part, file, variant, verdict, note,
       author_user_id, author_name, ai_action, ai_summary, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
     ON CONFLICT (author_user_id, book_id, file) DO UPDATE SET
       part = EXCLUDED.part,
       variant = EXCLUDED.variant,
       verdict = EXCLUDED.verdict,
       note = EXCLUDED.note,
       author_name = EXCLUDED.author_name,
       ai_action = EXCLUDED.ai_action,
       ai_summary = EXCLUDED.ai_summary,
       updated_at = EXCLUDED.updated_at
     RETURNING *`,
    [
      newId('rc'),
      input.bookId,
      input.part,
      input.file,
      input.variant,
      input.verdict,
      input.note,
      input.authorUserId,
      input.authorName ?? null,
      input.aiAction ?? null,
      input.aiSummary ?? null,
      now,
    ],
  );
  return row!;
}

export async function updateRestoreCalibrationAi(
  id: string,
  aiAction: string,
  aiSummary: string,
): Promise<boolean> {
  const n = await execute(
    `UPDATE restore_calibrations SET ai_action = $1, ai_summary = $2, updated_at = $3 WHERE id = $4`,
    [aiAction, aiSummary, Date.now(), id],
  );
  return n > 0;
}

export async function getRestoreCalibrationByUser(
  authorUserId: string,
  bookId: string,
  file: string,
): Promise<DbRestoreCalibration | undefined> {
  return queryOne<DbRestoreCalibration>(
    `SELECT * FROM restore_calibrations
      WHERE author_user_id = $1 AND book_id = $2 AND file = $3`,
    [authorUserId, bookId, file],
  );
}

export async function listRestoreCalibrations(opts?: {
  bookId?: string;
  verdict?: string;
  limit?: number;
}): Promise<DbRestoreCalibration[]> {
  const limit = Math.min(opts?.limit ?? 50, 200);
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (opts?.bookId) {
    params.push(opts.bookId);
    clauses.push(`book_id = $${params.length}`);
  }
  if (opts?.verdict) {
    params.push(opts.verdict);
    clauses.push(`verdict = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit);
  return query<DbRestoreCalibration>(
    `SELECT * FROM restore_calibrations
      ${where}
      ORDER BY CASE WHEN verdict = 'fail' THEN 0 ELSE 1 END, updated_at DESC
      LIMIT $${params.length}`,
    params,
  );
}

export async function countRestoreCalibrationFails(): Promise<number> {
  const row = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM restore_calibrations WHERE verdict = 'fail'`,
  );
  return Number(row?.c ?? 0);
}
