# 阶段 0 · 后台地基 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让生产环境的账号、进度、UGC、配额数据真正持久化，媒体资产迁出 Git，并把 Next 升到 Payload CMS 要求的版本——为后续 CMS 与审核台扫清全部阻塞项。

**Architecture:** 数据层从单文件 SQLite 换成 PostgreSQL，`lib/db.ts` 的函数名与语义保持不变、仅由同步改为异步；媒体从 `public/` 迁到 S3 兼容对象存储（Cloudflare R2），代码里保留 `/audio/xx.mp3` 这类站内路径写法，由 `mediaUrl()` 在运行时决定走 CDN 还是本地回退。典籍原文仍是 Git 里的静态 JSON，不受本阶段影响。

**Tech Stack:** Next.js 16.2.6+、React 19、TypeScript、`pg`（node-postgres，无 ORM）、`@aws-sdk/client-s3`（对 R2 走 S3 兼容协议）、Node 内置 test runner（经 tsx 执行）

## Global Constraints

- 典籍原文 `public/data/content/*.json` 与 `data/daozang-text/` 不得被本计划修改。
- 不引入 ORM、状态管理库、UI 组件库。数据访问继续用手写 SQL。
- `lib/db.ts` 对外导出的函数名、参数名、返回结构保持不变，仅返回值包一层 `Promise`。
- 新增与修改的代码必须有中文注释，注释解释「为什么」而非「做什么」。
- Next.js 目标版本 **≥ 16.2.6**（Payload CMS 3 的最低要求，同时修复已知 CVE）。
- 对象存储环境变量前缀统一为 `DZ_S3_*`；客户端可见的媒体域名用 `NEXT_PUBLIC_MEDIA_BASE_URL`。
- 密钥只存服务端环境变量，禁止出现在客户端包里（`NEXT_PUBLIC_MEDIA_BASE_URL` 是公开 CDN 域名，不是密钥）。
- 每个任务结束都必须能 `npm run build` 通过且 `npm test` 全绿。

## 前置：本地测试数据库

Task 3 起需要一个真实 Postgres 跑集成测试。任选其一：

```bash
# 方式 A：Docker（推荐）
docker run -d --name dz-test-pg \
  -e POSTGRES_PASSWORD=dz -e POSTGRES_DB=daozang_test \
  -p 55432:5432 postgres:17-alpine

# 方式 B：任意云端 Postgres（Neon 免费分支等），直接拿连接串
```

测试连接串通过 `DZ_TEST_DATABASE_URL` 提供：

```bash
# PowerShell
$env:DZ_TEST_DATABASE_URL = "postgres://postgres:dz@localhost:55432/daozang_test"
```

未设置时数据库集成测试会自动跳过（其余单测照常运行），便于没有 Docker 的协作者参与。

---

## File Structure

| 文件 | 责任 | 变更 |
|---|---|---|
| `lib/pg.ts` | Postgres 连接池与查询原语（`query` / `queryOne` / `execute`） | 新建 |
| `lib/db.ts` | 业务数据访问函数（异步化，SQL 改 Postgres 方言） | 重写实现，签名加 `Promise` |
| `scripts/migrate-pg.ts` | 建表与增量迁移，幂等可重复执行 | 新建 |
| `scripts/import-sqlite.ts` | 一次性把旧 SQLite 数据搬到 Postgres | 新建 |
| `lib/auth-role.ts` | 角色常量与 `requireRole` 服务端守卫 | 新建 |
| `lib/storage.ts` | 对象存储上传/删除/预签名 + storageKey 构造 | 新建 |
| `lib/media-url.ts` | 站内媒体路径 → CDN 地址解析（客户端可用） | 新建 |
| `scripts/upload-media.ts` | 存量 `public/audio`、`public/images` 批量上传 | 新建 |
| `tests/db.test.ts` | 数据层集成测试 | 新建 |
| `tests/storage.test.ts` | storageKey 与 mediaUrl 纯函数单测 | 新建 |
| `auth.ts` | session 带出 `role` | 修改 |
| 9 处调用点 | 改为 `await` | 修改 |

---

## Task 1: 升级 Next.js 到 16.2.6

Payload CMS 3 要求 Next ≥ 16.2.6，当前为 16.2.2。先单独升级并确认现有功能不回归，避免后续问题混在一起难以定位。

**Files:**
- Modify: `package.json`（`next`、`eslint-config-next` 版本）

**Interfaces:**
- Consumes: 无
- Produces: 无新增导出。仅保证 `next@>=16.2.6` 可用，供 Task 6 之后接入 Payload。

- [ ] **Step 1: 记录升级前的基线**

```powershell
npm test
npm run build
```

预期：测试全绿，构建成功。把结果记下来作为对比基线。如果基线本身就失败，先停下来报告，不要带着已有故障做升级。

- [ ] **Step 2: 升级依赖**

```powershell
npm install next@^16.2.6 eslint-config-next@^16.2.6
```

- [ ] **Step 3: 确认安装到的版本满足下限**

```powershell
npm ls next
```

预期输出包含 `next@16.2.6` 或更高版本。若解析到 16.2.2，改用精确版本 `npm install next@16.2.6`。

- [ ] **Step 4: 跑测试与构建**

```powershell
npm test
npm run lint
npm run build
```

预期：与 Step 1 的基线一致，全部通过。

- [ ] **Step 5: 手工冒烟**

```powershell
npm run dev
```

打开 http://localhost:3000 ，依次确认：首页可加载、点进任意典籍阅读页正文渲染正常、`/music` 播放器可播放、`/search` 能搜到结果。

- [ ] **Step 6: 提交**

```powershell
git add package.json package-lock.json
git commit -m "chore: 升级 Next.js 到 16.2.6（Payload CMS 前置要求 + 修复已知 CVE）"
```

---

## Task 2: Postgres 连接层与建表脚本

先把连接与 schema 立起来，`lib/db.ts` 暂不动，保证这一步可以独立验证。

**Files:**
- Create: `lib/pg.ts`
- Create: `scripts/migrate-pg.ts`
- Modify: `package.json`（新增依赖与 `migrate` 脚本）
- Modify: `.env.example`

**Interfaces:**
- Consumes: 无
- Produces:
  - `getPool(): Pool`
  - `query<T>(text: string, params?: unknown[]): Promise<T[]>`
  - `queryOne<T>(text: string, params?: unknown[]): Promise<T | undefined>`
  - `execute(text: string, params?: unknown[]): Promise<number>` — 返回受影响行数
  - `closePool(): Promise<void>` — 仅测试与脚本使用，让进程能正常退出

- [ ] **Step 1: 安装依赖**

```powershell
npm install pg
npm install -D @types/pg
```

- [ ] **Step 2: 写连接层 `lib/pg.ts`**

```ts
/**
 * PostgreSQL 连接原语（服务端 only）。
 *
 * 为什么是模块级单例池：serverless 实例会复用同一个 Node 进程，
 * 每请求新建 TCP 连接会迅速耗尽云端 Postgres 的连接配额；
 * max 压到 5 是因为线上会有多个并发实例，单实例占用必须克制
 * （生产应配合 Neon/Supabase 的 pooled 连接串一起使用）。
 */

import pg from 'pg';
import type { Pool } from 'pg';

// pg 默认把 int8(BIGINT) 解析成字符串以避免精度丢失。
// 本项目的 BIGINT 只有毫秒时间戳与 COUNT 结果，均远小于 2^53，
// 转成 Number 才能让上层的 created_at: number 等类型保持与 SQLite 时代一致。
pg.types.setTypeParser(pg.types.builtins.INT8, (value: string) => Number(value));

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL 未配置：需要 PostgreSQL 连接串');
  }
  pool = new pg.Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}

/** 查询多行 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

/** 查询首行，无结果返回 undefined */
export async function queryOne<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await query<T>(text, params);
  return rows[0];
}

/** 执行写操作，返回受影响行数 */
export async function execute(text: string, params: unknown[] = []): Promise<number> {
  const result = await getPool().query(text, params);
  return result.rowCount ?? 0;
}

/**
 * 关闭连接池。仅供测试与一次性脚本调用——
 * 不关池的话 node:test 与 tsx 脚本会因为句柄未释放而挂住不退出。
 */
export async function closePool(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
}
```

- [ ] **Step 3: 写建表脚本 `scripts/migrate-pg.ts`**

SQLite 到 Postgres 的方言差异集中在这里：`INTEGER` 时间戳改 `BIGINT`、`AUTOINCREMENT` 改 `BIGSERIAL`、
`COLLATE NOCASE` 改为 `lower(email)` 唯一索引。

```ts
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
```

- [ ] **Step 4: 加 npm 脚本**

在 `package.json` 的 `scripts` 中新增（放在 `build-index` 之后）：

```json
"migrate": "tsx scripts/migrate-pg.ts"
```

- [ ] **Step 5: 对着本地测试库跑一次迁移**

```powershell
$env:DATABASE_URL = "postgres://postgres:dz@localhost:55432/daozang_test"
npm run migrate
```

预期输出：`[migrate] 完成，共执行 11 条语句`，且进程正常退出。

- [ ] **Step 6: 验证幂等**

```powershell
npm run migrate
```

预期：同样成功，无报错（证明可以在每次部署前无条件重跑）。

- [ ] **Step 7: 确认表已建成**

```powershell
npx tsx -e "import('./lib/pg').then(async m => { const r = await m.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`); console.log(r.map(x => x.tablename).join(', ')); await m.closePool(); })"
```

预期输出：`ai_quota, analytics_events, annotations, article_illustrations, comments, reading_progress, users`

- [ ] **Step 8: 更新 `.env.example`**

追加：

```bash
# PostgreSQL 连接串（生产必填；建议使用 Neon/Supabase 的 pooled 连接串）
DATABASE_URL=postgres://user:password@host/dbname

# 本地跑数据库集成测试用；未设置时 tests/db.test.ts 自动跳过
DZ_TEST_DATABASE_URL=postgres://postgres:dz@localhost:55432/daozang_test
```

- [ ] **Step 9: 提交**

```powershell
git add lib/pg.ts scripts/migrate-pg.ts package.json package-lock.json .env.example
git commit -m "feat: 新增 Postgres 连接层与幂等建表脚本"
```

---

## Task 3: `lib/db.ts` 迁移到 Postgres 并异步化

这是本阶段的核心改动。`better-sqlite3` 是同步 API，Postgres 客户端是异步的，所以 25 个导出函数全部要加 `async`，9 处调用点全部要加 `await`。二者必须同一个任务完成，否则 TypeScript 编译不通过。

**Files:**
- Create: `tests/db.test.ts`
- Modify: `lib/db.ts`（全文重写实现）
- Modify: `auth.ts:43`
- Modify: `lib/agent/quota.ts:72`、`lib/agent/quota.ts:86`
- Modify: `lib/illustrations-service.ts:96,105,110,120,126,137,144`
- Modify: `app/api/annotations/route.ts`、`app/api/comments/route.ts`、`app/api/report/route.ts`、`app/api/progress/route.ts`、`app/api/events/route.ts`、`app/api/auth/register/route.ts`
- Modify: `app/api/illustrations/route.ts`（`getIllustrationStatus` 变异步后的调用点）

**Interfaces:**
- Consumes: `query` / `queryOne` / `execute` / `closePool`（Task 2）
- Produces: `lib/db.ts` 全部导出函数签名不变但返回 Promise，供后续任务与现有调用点使用：
  - `findUserByEmail(email: string): Promise<DbUser | undefined>`
  - `findUserById(id: string): Promise<DbUser | undefined>`
  - `createUser(email: string, passwordHash: string, name?: string): Promise<DbUser>`
  - `upsertReadingProgress(userId: string, bookId: string, data: Record<string, unknown>): Promise<void>`
  - `getReadingProgress(userId: string, bookId?: string): Promise<Record<string, unknown>[]>`
  - `getAiQuotaCount(quotaKey: string, day: string): Promise<number>`
  - `incrementAiQuota(quotaKey: string, day: string): Promise<number>`
  - `insertAnalyticsEvents(events: AnalyticsEventInput[]): Promise<number>`
  - `createIllustrationJob(id, bookId, blockId, sourceText, type?): Promise<IllustrationJob>`
  - `getIllustrationJob(id: string): Promise<IllustrationJob | undefined>`
  - `findIllustrationByBlock(bookId, blockId, type?): Promise<IllustrationJob | undefined>`
  - `updateIllustrationJob(id, patch): Promise<void>`
  - `createAnnotation(input): Promise<DbAnnotation>`
  - `getAnnotationsByBook(bookId: string): Promise<DbAnnotation[]>`
  - `deleteAnnotation(id: string, authorUserId: string): Promise<boolean>`
  - `createComment(input): Promise<DbComment>`
  - `getCommentsByBook(bookId: string): Promise<DbComment[]>`
  - `deleteComment(id: string, authorUserId: string): Promise<boolean>`
  - `countUserContributionsToday(authorUserId: string): Promise<number>`
  - `reportContent(kind: 'annotation' | 'comment', id: string, hideThreshold?: number): Promise<boolean>`
  - 类型 `DbUser` / `DbAnnotation` / `DbComment` / `IllustrationJob` 字段不变
  - 移除 `getDb()`（SQLite 专属，不再导出）

- [ ] **Step 1: 写失败的测试 `tests/db.test.ts`**

```ts
/**
 * 数据层集成测试。
 *
 * 为什么打真实 Postgres 而不是 mock：这一层的价值全在 SQL 本身
 * （ON CONFLICT、lower(email) 唯一索引、举报阈值的 CASE 表达式），
 * mock 掉数据库等于把要测的东西测没了。
 * 未提供 DZ_TEST_DATABASE_URL 时整组跳过，不阻塞没有 Docker 的协作者。
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { closePool, execute } from '../lib/pg';
import { migrate } from '../scripts/migrate-pg';
import * as db from '../lib/db';

const TEST_URL = process.env.DZ_TEST_DATABASE_URL;
// ESM 的 import 会被提升到最前，所以这行赋值发生在模块加载之后；
// 但连接池是首次 query 时才按 DATABASE_URL 懒创建的，
// 那时赋值早已完成，因此顺序安全。
if (TEST_URL) process.env.DATABASE_URL = TEST_URL;

const skip = TEST_URL ? false : '未设置 DZ_TEST_DATABASE_URL，跳过数据库集成测试';

describe('数据层（Postgres）', { skip }, () => {
  const email = `test_${Date.now()}@daozang.local`;
  let userId = '';

  before(async () => {
    await migrate();
  });

  after(async () => {
    // 清掉本次测试造出来的数据，保证可重复运行。
    if (userId) await execute('DELETE FROM users WHERE id = $1', [userId]);
    await execute("DELETE FROM ai_quota WHERE quota_key LIKE 'test:%'");
    await closePool();
  });

  test('创建用户后可按邮箱查回，且大小写不敏感', async () => {
    const created = await db.createUser(email, 'hash_placeholder', '测试用户');
    userId = created.id;
    assert.equal(created.email, email.toLowerCase());

    const found = await db.findUserByEmail(email.toUpperCase());
    assert.ok(found, '大写邮箱应能查到同一用户');
    assert.equal(found.id, userId);
  });

  test('阅读进度 upsert 覆盖旧值而不是插入重复行', async () => {
    await db.upsertReadingProgress(userId, 'book_a', { scrollProgress: 0.1 });
    await db.upsertReadingProgress(userId, 'book_a', { scrollProgress: 0.9 });

    const rows = await db.getReadingProgress(userId, 'book_a');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].scrollProgress, 0.9);
  });

  test('AI 配额按 key+day 累加', async () => {
    const key = `test:${Date.now()}`;
    const day = '2026-08-10';
    assert.equal(await db.getAiQuotaCount(key, day), 0);
    assert.equal(await db.incrementAiQuota(key, day), 1);
    assert.equal(await db.incrementAiQuota(key, day), 2);
    assert.equal(await db.getAiQuotaCount(key, day), 2);
  });

  test('旁注创建后可按书查到，作者可删除', async () => {
    const created = await db.createAnnotation({
      bookId: 'book_a',
      blockId: 'book_a-3',
      quote: '道可道',
      body: '测试旁注',
      authorUserId: userId,
      authorName: '测试用户',
    });
    assert.equal(created.status, 'approved');
    assert.equal(created.report_count, 0);

    const list = await db.getAnnotationsByBook('book_a');
    assert.ok(list.some(a => a.id === created.id));

    // 非作者不得删除
    assert.equal(await db.deleteAnnotation(created.id, 'someone_else'), false);
    assert.equal(await db.deleteAnnotation(created.id, userId), true);
  });

  test('举报累计到阈值后自动隐藏', async () => {
    const comment = await db.createComment({
      bookId: 'book_a',
      body: '测试评论',
      authorUserId: userId,
    });

    await db.reportContent('comment', comment.id, 3);
    await db.reportContent('comment', comment.id, 3);
    let visible = await db.getCommentsByBook('book_a');
    assert.ok(visible.some(c => c.id === comment.id), '两次举报时仍应可见');

    await db.reportContent('comment', comment.id, 3);
    visible = await db.getCommentsByBook('book_a');
    assert.equal(visible.some(c => c.id === comment.id), false, '第三次举报后应隐藏');
  });

  test('当日投稿计数合并旁注与评论', async () => {
    const count = await db.countUserContributionsToday(userId);
    assert.ok(count >= 1, `应至少统计到刚创建的评论，实际 ${count}`);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
$env:DZ_TEST_DATABASE_URL = "postgres://postgres:dz@localhost:55432/daozang_test"
npx tsx --test tests/db.test.ts
```

预期：失败。此时 `lib/db.ts` 还是同步的 SQLite 实现，`await db.createUser(...)` 会因为返回值不是 Promise 而在断言处报错，或因 `better-sqlite3` 找不到 `data/daozang.db` 中的 Postgres 表而抛错。

- [ ] **Step 3: 重写 `lib/db.ts`**

保持原文件的分节注释结构与导出顺序，逐段替换实现。占位符从 `?` 改为 `$1, $2, ...`。

```ts
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
```

- [ ] **Step 4: 跑数据层测试确认通过**

```powershell
npx tsx --test tests/db.test.ts
```

预期：6 个测试全部通过。

- [ ] **Step 5: 用类型检查找出所有调用点**

```powershell
npx tsc --noEmit
```

预期：报出一批错误，集中在下列 9 个文件。把它们当作待办清单：

```
auth.ts
lib/agent/quota.ts
lib/illustrations-service.ts
app/api/annotations/route.ts
app/api/comments/route.ts
app/api/report/route.ts
app/api/progress/route.ts
app/api/events/route.ts
app/api/auth/register/route.ts
```

- [ ] **Step 6: 修 `auth.ts`**

`authorize` 已是 async，只需加 await：

```ts
        const user = await findUserByEmail(email);
        if (!user) return null;
```

- [ ] **Step 7: 修 `lib/agent/quota.ts`**

`checkAiQuota` 与 `consumeAiQuota` 已是 async：

```ts
  const used = await getAiQuotaCount(key, todayKey());
```

```ts
  const used = await incrementAiQuota(key, todayKey());
```

- [ ] **Step 8: 修 `lib/illustrations-service.ts`**

除了给 7 处调用加 `await`，还要把同步导出的 `getIllustrationStatus` 改成异步：

```ts
export async function getIllustrationStatus(jobId: string) {
  const job = await getIllustrationJob(jobId);
  // 以下原有逻辑保持不变
```

`runIllustrationJob` 内部的 `updateIllustrationJob` 调用同样加 `await`；
`void runIllustrationJob(...)` 的 fire-and-forget 写法保留，其 `.catch` 回调改为 async 并 await 内部的 `updateIllustrationJob`。

- [ ] **Step 9: 修 7 个 API 路由**

全部是 `export async function GET/POST/DELETE`，加 `await` 即可。逐个文件与对应函数：

| 文件 | 需要加 await 的调用 |
|---|---|
| `app/api/auth/register/route.ts` | `findUserByEmail`、`createUser` |
| `app/api/progress/route.ts` | `upsertReadingProgress`、`getReadingProgress` |
| `app/api/events/route.ts` | `insertAnalyticsEvents` |
| `app/api/annotations/route.ts` | `getAnnotationsByBook`、`createAnnotation`、`deleteAnnotation`、`countUserContributionsToday` |
| `app/api/comments/route.ts` | `getCommentsByBook`、`createComment`、`deleteComment`、`countUserContributionsToday` |
| `app/api/report/route.ts` | `reportContent` |
| `app/api/illustrations/route.ts` | `getIllustrationStatus`（Step 8 刚改成异步） |

典型改法，以 `app/api/annotations/route.ts` 的限流判断为例：

```ts
// 原：
    if (countUserContributionsToday(userId) >= UGC_LIMITS.dailyPerUser) {
// 改：
    if ((await countUserContributionsToday(userId)) >= UGC_LIMITS.dailyPerUser) {
```

以及返回列表处：

```ts
// 原：
    return Response.json({ annotations: getAnnotationsByBook(bookId) });
// 改：
    return Response.json({ annotations: await getAnnotationsByBook(bookId) });
```

改完后 `npx tsc --noEmit` 应当零错误——把它当作这一步的完成判据，不要靠肉眼逐行核对。

- [ ] **Step 10: 类型检查与构建**

```powershell
npx tsc --noEmit
npm run lint
npm run build
```

预期：全部通过，无 TypeScript 错误。

- [ ] **Step 11: 全量测试**

```powershell
npm test
```

预期：解析器、检索、校正层、分页、脚注等原有测试仍全绿，加上新的数据层测试。

- [ ] **Step 12: 提交**

```powershell
git add lib/db.ts tests/db.test.ts auth.ts lib/agent/quota.ts lib/illustrations-service.ts app/api
git commit -m "feat: 数据层从 SQLite 迁移到 Postgres 并异步化"
```

---

## Task 4: 旧 SQLite 数据搬迁

本地开发库与任何已有部署里的数据需要搬过去。搬完后 `better-sqlite3` 降级为 devDependency，仅本脚本使用。

**Files:**
- Create: `scripts/import-sqlite.ts`
- Modify: `package.json`（`better-sqlite3` 移到 devDependencies）
- Modify: `next.config.ts`（移除 `serverExternalPackages`）

**Interfaces:**
- Consumes: `query` / `execute` / `closePool`（Task 2）、`migrate`（Task 2）
- Produces: `npm run import-sqlite` 命令。无代码导出。

- [ ] **Step 1: 写搬迁脚本 `scripts/import-sqlite.ts`**

```ts
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
    const rows = await query<{ c: number }>('SELECT COUNT(*) AS c FROM analytics_events');
    const c = rows[0]?.c ?? 0;
    if (c > 0) {
      console.log(`[import] analytics_events：目标表已有 ${c} 行，跳过（避免重复统计）`);
    } else {
      const cols = ['event', 'user_id', 'session_id', 'book_id', 'platform', 'extra_json', 'created_at'];
      const rows = sqlite.prepare(`SELECT ${cols.join(', ')} FROM analytics_events`).all() as Record<string, unknown>[];
      for (const row of rows) {
        await execute(
          `INSERT INTO analytics_events (${cols.join(', ')}) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          cols.map(cn => row[cn] ?? null),
        );
      }
      console.log(`[import] analytics_events：导入 ${rows.length} 行`);
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
```

- [ ] **Step 2: 加 npm 脚本**

在 `package.json` 的 `scripts` 中新增：

```json
"import-sqlite": "tsx scripts/import-sqlite.ts"
```

- [ ] **Step 3: 对本地库跑一次搬迁**

```powershell
$env:DATABASE_URL = "postgres://postgres:dz@localhost:55432/daozang_test"
npm run import-sqlite
```

预期：逐表打印读取与新增行数。若本地从未产生过数据，输出「未找到 …/daozang.db，无历史数据需要搬迁」也是通过。

- [ ] **Step 4: 验证重跑幂等**

```powershell
npm run import-sqlite
```

预期：各表「新增 0 行」，`analytics_events` 打印「目标表已有 N 行，跳过」。

- [ ] **Step 5: 把 better-sqlite3 降为 devDependency**

```powershell
npm uninstall better-sqlite3
npm install -D better-sqlite3
```

`@types/better-sqlite3` 本就在 devDependencies，无需变动。

- [ ] **Step 6: 清理 `next.config.ts`**

运行时不再依赖 better-sqlite3，移除该配置项：

```ts
const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    '*': ['./data/daozang-text/**', './data/daozang-text-utf8/**', './data/daozang-text-new/**', './data/daozang-text-orig/**'],
  },
};
```

- [ ] **Step 7: 构建与测试**

```powershell
npm run build
npm test
```

预期：全部通过。构建产物中不应再打包原生模块 better-sqlite3。

- [ ] **Step 8: 提交**

```powershell
git add scripts/import-sqlite.ts package.json package-lock.json next.config.ts
git commit -m "feat: 新增 SQLite 到 Postgres 的一次性搬迁脚本，运行时移除 better-sqlite3"
```

---

## Task 5: 用户角色与服务端权限守卫

为阶段 1 的审核台准备鉴权基础。本任务只加能力，不加界面。

**Files:**
- Create: `lib/auth-role.ts`
- Modify: `scripts/migrate-pg.ts`（追加 ALTER 语句）
- Modify: `lib/db.ts`（`DbUser` 增加字段，新增 `updateUserRole` / `updateUserStatus`）
- Modify: `auth.ts`（session 带出 role）
- Modify: `tests/db.test.ts`（补角色相关断言）

**Interfaces:**
- Consumes: `query` / `queryOne` / `execute`（Task 2）、`auth`（`auth.ts`）
- Produces:
  - `type UserRole = 'reader' | 'contributor' | 'moderator' | 'editor' | 'admin'`
  - `ROLE_LEVEL: Record<UserRole, number>`
  - `hasRole(actual: UserRole, required: UserRole): boolean`
  - `requireRole(required: UserRole): Promise<{ userId: string; role: UserRole }>` — 不满足时 throw
  - `db.updateUserRole(userId: string, role: string): Promise<boolean>`
  - `db.updateUserStatus(userId: string, status: string): Promise<boolean>`
    （这两个参数刻意用 `string` 而非 `UserRole`：`lib/auth-role.ts` 依赖 `auth.ts`，
    而 `auth.ts` 依赖 `lib/db.ts`，若 db 反过来引入 `UserRole` 会形成循环依赖。
    类型收窄在调用方 `/api/studio/users` 做。）
  - `DbUser` 新增 `role: string`、`status: string`、`region: string`
  - `Session['user']` 新增 `role: UserRole`

- [ ] **Step 1: 写失败的测试**

在 `tests/db.test.ts` 的 describe 块内追加：

```ts
  test('新用户默认角色为 reader，可被提升为 moderator', async () => {
    const created = await db.findUserById(userId);
    assert.ok(created);
    assert.equal(created.role, 'reader');
    assert.equal(created.status, 'active');

    assert.equal(await db.updateUserRole(userId, 'moderator'), true);
    const updated = await db.findUserById(userId);
    assert.equal(updated?.role, 'moderator');
  });

  test('可以封禁用户', async () => {
    assert.equal(await db.updateUserStatus(userId, 'banned'), true);
    assert.equal((await db.findUserById(userId))?.status, 'banned');
    // 复原，避免影响同一 describe 内其他断言
    await db.updateUserStatus(userId, 'active');
  });
```

- [ ] **Step 2: 跑测试确认失败**

```powershell
npx tsx --test tests/db.test.ts
```

预期：失败，提示 `db.updateUserRole is not a function`。

- [ ] **Step 3: 在迁移脚本追加列**

在 `scripts/migrate-pg.ts` 的 `STATEMENTS` 数组末尾追加：

```ts
  // 角色与状态：阶段 1 审核台的鉴权基础。
  // region 记录用户注册所在部署，双区上线后用于数据归属判断。
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'reader'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'global'`,
```

- [ ] **Step 4: 跑迁移**

```powershell
npm run migrate
```

预期：成功，且可重复执行（`ADD COLUMN IF NOT EXISTS` 幂等）。

- [ ] **Step 5: 写 `lib/auth-role.ts`**

```ts
/**
 * 角色模型与服务端权限守卫。
 *
 * 为什么用等级数字而不是权限位图：当前角色是严格递进的
 * （admin ⊃ editor ⊃ moderator ⊃ contributor ⊃ reader），
 * 等级比较足够表达，且比权限矩阵少一个需要同步维护的真相来源。
 * 将来若出现交叉权限，再升级为矩阵。
 */

import { auth } from '@/auth';

export type UserRole = 'reader' | 'contributor' | 'moderator' | 'editor' | 'admin';

export const ROLE_LEVEL: Record<UserRole, number> = {
  reader: 0,
  contributor: 1,
  moderator: 2,
  editor: 3,
  admin: 4,
};

export function hasRole(actual: UserRole, required: UserRole): boolean {
  return ROLE_LEVEL[actual] >= ROLE_LEVEL[required];
}

/** 权限不足时抛出的错误，路由层据此返回 401/403 */
export class AuthzError extends Error {
  constructor(readonly statusCode: 401 | 403, message: string) {
    super(message);
    this.name = 'AuthzError';
  }
}

/**
 * 服务端守卫：校验当前会话满足最低角色要求。
 * 后台页面与 /api/studio/* 统一从这里取身份，避免每个路由各写一遍判断。
 */
export async function requireRole(required: UserRole): Promise<{ userId: string; role: UserRole }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new AuthzError(401, '未登录');

  const role = (session.user.role ?? 'reader') as UserRole;
  if (!hasRole(role, required)) {
    throw new AuthzError(403, `需要 ${required} 及以上权限`);
  }
  return { userId, role };
}
```

- [ ] **Step 6: 在 `lib/db.ts` 扩展用户字段与更新函数**

`DbUser` 接口追加三个字段：

```ts
export interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  name: string | null;
  created_at: number;
  role: string;
  status: string;
  region: string;
}
```

在 `createUser` 之后追加：

```ts
export async function updateUserRole(userId: string, role: string): Promise<boolean> {
  const changed = await execute('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
  return changed > 0;
}

export async function updateUserStatus(userId: string, status: string): Promise<boolean> {
  const changed = await execute('UPDATE users SET status = $1 WHERE id = $2', [status, userId]);
  return changed > 0;
}
```

- [ ] **Step 7: 让 session 带出 role**

修改 `auth.ts`。先扩展类型声明：

```ts
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      role: string;
    };
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    id?: string;
    role?: string;
  }
}
```

`authorize` 返回值带上 role：

```ts
        return { id: user.id, email: user.email, name: user.name, role: user.role };
```

回调同步写入：

```ts
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // 角色随 JWT 走，避免每次请求都查库；
        // 改角色后需要用户重新登录才生效，运营场景可接受。
        token.role = (user as { role?: string }).role ?? 'reader';
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) ?? 'reader';
      }
      return session;
    },
  },
```

由于 `authorize` 返回的对象带了自定义字段，还需在 `auth.ts` 顶部的模块声明中扩展 `User`：

```ts
declare module 'next-auth' {
  interface User {
    role?: string;
  }
}
```

- [ ] **Step 8: 跑测试确认通过**

```powershell
npx tsx --test tests/db.test.ts
```

预期：包含新增的两个角色测试在内，全部通过。

- [ ] **Step 9: 类型检查与构建**

```powershell
npx tsc --noEmit
npm run build
```

预期：通过。

- [ ] **Step 10: 提交**

```powershell
git add lib/auth-role.ts lib/db.ts auth.ts scripts/migrate-pg.ts tests/db.test.ts
git commit -m "feat: 新增用户角色与服务端权限守卫"
```

---

## Task 6: 对象存储层

**决策：使用 Cloudflare R2，走 S3 兼容协议。** 理由有两条——出网流量免费，对一个要长期分发数百 MB 音频的公益项目影响很大；且 Payload 的 `@payloadcms/storage-s3` 适配器后续可以直接复用同一个桶。如果改用 Vercel Blob，只需替换 `lib/storage.ts` 的实现，上层接口不变。

**Files:**
- Create: `lib/storage.ts`
- Create: `lib/media-url.ts`
- Create: `tests/storage.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: 无
- Produces:
  - `buildStorageKey(kind: MediaKind, filename: string, at?: Date): string` — 纯函数
  - `type MediaKind = 'audio' | 'image' | 'video'`
  - `uploadObject(key: string, body: Buffer | Uint8Array, contentType: string): Promise<string>` — 返回公开 URL
  - `deleteObject(key: string): Promise<void>`
  - `createUploadUrl(key: string, contentType: string, expiresInSeconds?: number): Promise<string>`
  - `publicUrl(key: string): string`
  - `resolveMediaUrl(assetPath: string, base: string): string`（`lib/media-url.ts`，纯函数，供测试与服务端复用）
  - `mediaUrl(assetPath: string): string`（`lib/media-url.ts`，读 `NEXT_PUBLIC_MEDIA_BASE_URL`，客户端可用）

- [ ] **Step 1: 安装依赖**

```powershell
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

- [ ] **Step 2: 写失败的测试 `tests/storage.test.ts`**

```ts
/**
 * 存储层纯函数单测。
 *
 * 只测 key 构造与 URL 解析——这两处一旦出错会导致大批资产 404，
 * 且不需要网络即可覆盖。真正的上传走 scripts/upload-media.ts 手工验证。
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { buildStorageKey } from '../lib/storage';
import { resolveMediaUrl } from '../lib/media-url';

describe('buildStorageKey', () => {
  test('按类型与年月分目录，保留扩展名', () => {
    const key = buildStorageKey('audio', 'wuxing-jin.mp3', new Date('2026-08-10T00:00:00Z'));
    assert.match(key, /^audio\/2026\/08\/wuxing-jin-[a-z0-9]{8}\.mp3$/);
  });

  test('同名文件两次调用产生不同 key，避免互相覆盖', () => {
    const a = buildStorageKey('image', 'cover.jpg');
    const b = buildStorageKey('image', 'cover.jpg');
    assert.notEqual(a, b);
  });

  test('清洗掉路径分隔符与空格，防止穿目录', () => {
    const key = buildStorageKey('image', '../evil dir/pic name.png');
    assert.equal(key.includes('..'), false);
    assert.equal(key.includes(' '), false);
    assert.match(key, /\.png$/);
  });
});

// resolveMediaUrl 把 base 作为参数而非直接读环境变量，
// 正是为了让这三个用例不必摆弄 process.env 就能覆盖全部分支。
describe('resolveMediaUrl', () => {
  test('未配置 CDN 域名时原样返回站内路径', () => {
    assert.equal(resolveMediaUrl('/audio/wuxing-jin.mp3', ''), '/audio/wuxing-jin.mp3');
  });

  test('配置了 CDN 域名时拼接为绝对地址，并去掉重复斜杠', () => {
    assert.equal(
      resolveMediaUrl('/audio/wuxing-jin.mp3', 'https://media.daozang.org/'),
      'https://media.daozang.org/audio/wuxing-jin.mp3',
    );
  });

  test('站内路径缺少前导斜杠时补齐', () => {
    assert.equal(
      resolveMediaUrl('audio/wuxing-jin.mp3', 'https://media.daozang.org'),
      'https://media.daozang.org/audio/wuxing-jin.mp3',
    );
  });

  test('已经是绝对地址时不做处理', () => {
    assert.equal(
      resolveMediaUrl('https://cdn.example.com/a.mp3', 'https://media.daozang.org'),
      'https://cdn.example.com/a.mp3',
    );
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

```powershell
npx tsx --test tests/storage.test.ts
```

预期：失败，`Cannot find module '../lib/storage'`。

- [ ] **Step 4: 写 `lib/storage.ts`**

```ts
/**
 * 对象存储访问层（服务端 only）。
 *
 * 走 S3 兼容协议对接 Cloudflare R2：出网免费，适合长期分发大量音频；
 * 同一个桶后续可直接被 Payload 的 S3 存储适配器复用。
 * 若改用 Vercel Blob，只需替换本文件实现，上层接口不变。
 */

import crypto from 'crypto';
import path from 'path';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export type MediaKind = 'audio' | 'image' | 'video';

/**
 * 构造对象 key。
 *
 * 按「类型/年/月」分目录是为了让桶在资产上万后仍可浏览；
 * 追加随机后缀是因为运营会重复上传同名文件（如多次导出的 cover.jpg），
 * 直接用原名会静默覆盖已在线的资产。
 */
export function buildStorageKey(kind: MediaKind, filename: string, at: Date = new Date()): string {
  const ext = path.extname(filename).toLowerCase();
  const base = path
    .basename(filename, ext)
    .replace(/[^\w\u4e00-\u9fa5-]+/g, '-')   // 路径分隔符、空格等一律折成连字符
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'asset';
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, '0');
  const suffix = crypto.randomBytes(4).toString('hex');
  return `${kind}/${year}/${month}/${base}-${suffix}${ext}`;
}

function getClient(): S3Client {
  const endpoint = process.env.DZ_S3_ENDPOINT;
  const accessKeyId = process.env.DZ_S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.DZ_S3_SECRET_ACCESS_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('对象存储未配置：需要 DZ_S3_ENDPOINT / DZ_S3_ACCESS_KEY_ID / DZ_S3_SECRET_ACCESS_KEY');
  }
  return new S3Client({
    region: process.env.DZ_S3_REGION ?? 'auto',  // R2 固定用 auto
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucket(): string {
  const bucket = process.env.DZ_S3_BUCKET;
  if (!bucket) throw new Error('对象存储未配置：缺少 DZ_S3_BUCKET');
  return bucket;
}

/** 拼公开访问地址（桶前面挂 CDN 域名） */
export function publicUrl(key: string): string {
  const base = (process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? '').replace(/\/+$/, '');
  if (!base) throw new Error('对象存储未配置：缺少 NEXT_PUBLIC_MEDIA_BASE_URL');
  return `${base}/${key}`;
}

/** 服务端直接上传，返回公开地址。适合脚本与小文件 */
export async function uploadObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<string> {
  await getClient().send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: body,
    ContentType: contentType,
    // 媒体资产内容不可变（key 带随机后缀），可长期强缓存
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return publicUrl(key);
}

export async function deleteObject(key: string): Promise<void> {
  await getClient().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
}

/**
 * 生成预签名上传地址，供浏览器直传。
 * 后台上传大体积音视频必须走这条路：让文件经过 serverless 函数中转
 * 会撞上请求体大小与执行时长限制。
 */
export async function createUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 900,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
}
```

- [ ] **Step 5: 写 `lib/media-url.ts`**

```ts
/**
 * 站内媒体路径 → 实际访问地址。
 *
 * 媒体已迁出 Git 存入对象存储，但代码里仍以 /audio/xx.mp3 这类站内路径书写：
 * 一是改动面小，二是未配置 CDN 时能自动回退到 public/ 下的本地文件，
 * 让没有存储凭据的协作者也能把项目跑起来。
 * 本文件会被客户端组件引用，因此只能读 NEXT_PUBLIC_ 前缀的变量。
 */

/** 可测试的纯函数版本，base 由调用方注入 */
export function resolveMediaUrl(assetPath: string, base: string): string {
  if (/^https?:\/\//i.test(assetPath)) return assetPath;
  const trimmedBase = base.replace(/\/+$/, '');
  if (!trimmedBase) return assetPath;
  const suffix = assetPath.startsWith('/') ? assetPath : `/${assetPath}`;
  return `${trimmedBase}${suffix}`;
}

export function mediaUrl(assetPath: string): string {
  return resolveMediaUrl(assetPath, process.env.NEXT_PUBLIC_MEDIA_BASE_URL ?? '');
}
```

- [ ] **Step 6: 跑测试确认通过**

```powershell
npx tsx --test tests/storage.test.ts
```

预期：7 个测试全部通过（`buildStorageKey` 3 个 + `resolveMediaUrl` 4 个）。

- [ ] **Step 7: 更新 `.env.example`**

追加：

```bash
# 对象存储（Cloudflare R2，S3 兼容）
DZ_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
DZ_S3_BUCKET=daozang-media
DZ_S3_ACCESS_KEY_ID=
DZ_S3_SECRET_ACCESS_KEY=
DZ_S3_REGION=auto

# 媒体公开访问域名（客户端可见，非密钥）。留空时回退到 public/ 本地文件
NEXT_PUBLIC_MEDIA_BASE_URL=
```

- [ ] **Step 8: 提交**

```powershell
git add lib/storage.ts lib/media-url.ts tests/storage.test.ts .env.example package.json package-lock.json
git commit -m "feat: 新增对象存储访问层与媒体地址解析"
```

---

## Task 7: 存量媒体上传与前台引用切换

**Files:**
- Create: `scripts/upload-media.ts`
- Modify: `lib/use-music-player.ts:90,176`（`audio.src` 赋值处）
- Modify: `app/music/MusicPlayer.tsx:75`（曲目配图）
- Modify: `app/music/page.tsx:34`（《道德经》朗读音频）
- Modify: `components/reader/BlockRenderer.tsx:160`（科仪示意图）
- Modify: `next.config.ts`（`images.remotePatterns` 放行 CDN 域名）
- Modify: `package.json`

**注意**：`components/music/GlobalMusicBar.tsx` 不需要改——它只调用 `musicActions`，
真正设置 `audio.src` 的是 `lib/use-music-player.ts`。

**Interfaces:**
- Consumes: `uploadObject`、`publicUrl`（Task 6）、`mediaUrl`（Task 6）
- Produces: `npm run upload-media` 命令。无代码导出。

**关键约定**：上传时**保持原有站内路径作为 key**（如 `public/audio/wuxing-jin.mp3` → key `audio/wuxing-jin.mp3`），不使用 `buildStorageKey`。这样 `mediaUrl('/audio/wuxing-jin.mp3')` 拼出来就是正确地址，全部现有引用无需逐条改写。`buildStorageKey` 留给后台**新增**上传使用。

- [ ] **Step 1: 写上传脚本 `scripts/upload-media.ts`**

```ts
/**
 * 存量媒体批量上传到对象存储。
 *
 * 刻意保持 public/ 下的相对路径作为对象 key：
 * 代码里成百上千处 '/audio/xxx.mp3' 的写法因此完全不用改，
 * 只要 mediaUrl() 前缀上 CDN 域名就能命中。
 * 幂等：已存在同 key 的对象会被同内容覆盖，重跑安全。
 */

import fs from 'fs';
import path from 'path';
import { uploadObject } from '../lib/storage';

const ROOTS = ['audio', 'images'];

const MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

async function main(): Promise<void> {
  const publicDir = path.join(process.cwd(), 'public');
  let count = 0;
  let bytes = 0;

  for (const root of ROOTS) {
    const dir = path.join(publicDir, root);
    if (!fs.existsSync(dir)) {
      console.log(`[upload] ${root}/ 不存在，跳过`);
      continue;
    }
    for (const file of walk(dir)) {
      const ext = path.extname(file).toLowerCase();
      const contentType = MIME[ext];
      if (!contentType) {
        console.warn(`[upload] 跳过未知类型：${file}`);
        continue;
      }
      // key 就是去掉 public/ 前缀的站内路径，Windows 反斜杠统一成正斜杠
      const key = path.relative(publicDir, file).split(path.sep).join('/');
      const body = fs.readFileSync(file);
      await uploadObject(key, body, contentType);
      count += 1;
      bytes += body.byteLength;
      console.log(`[upload] ${key}  ${(body.byteLength / 1024).toFixed(0)} KB`);
    }
  }

  console.log(`[upload] 完成：${count} 个文件，共 ${(bytes / 1024 / 1024).toFixed(1)} MB`);
}

main().catch(err => {
  console.error('[upload] 失败：', err);
  process.exit(1);
});
```

- [ ] **Step 2: 加 npm 脚本**

```json
"upload-media": "tsx scripts/upload-media.ts"
```

- [ ] **Step 3: 创建 R2 桶并配置公开访问**

在 Cloudflare 控制台创建桶 `daozang-media`，绑定一个自定义域名（如 `media.daozang.org`）作为公开访问入口，
生成 S3 API 令牌。把四个 `DZ_S3_*` 与 `NEXT_PUBLIC_MEDIA_BASE_URL` 写进本地 `.env.local`。

- [ ] **Step 4: 执行上传**

```powershell
npm run upload-media
```

预期：逐个文件打印，末尾输出约 `125 个文件，共 287.9 MB`（53 个音频 273.1 MB + 72 个图片 14.8 MB）。

- [ ] **Step 5: 抽查一个文件可公开访问**

```powershell
curl.exe -I "$env:NEXT_PUBLIC_MEDIA_BASE_URL/audio/wuxing-jin.mp3"
```

预期：`HTTP/2 200`，`content-type: audio/mpeg`，`cache-control: public, max-age=31536000, immutable`。

- [ ] **Step 6: 放行 CDN 域名给 next/image**

`next/image` 默认拒绝未登记的远程域名，不加这一步曲目配图会直接报错。修改 `next.config.ts`：

```ts
/// <reference types="node" />
import type { NextConfig } from 'next';

// 媒体走对象存储 CDN，next/image 需要显式登记该域名才肯优化远程图片。
// 未配置时（本地回退模式）留空数组，走 public/ 本地文件，无需登记。
const mediaHost = process.env.NEXT_PUBLIC_MEDIA_BASE_URL;

const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    '*': ['./data/daozang-text/**', './data/daozang-text-utf8/**', './data/daozang-text-new/**', './data/daozang-text-orig/**'],
  },
  images: {
    remotePatterns: mediaHost
      ? [{ protocol: 'https', hostname: new URL(mediaHost).hostname }]
      : [],
  },
};

export default nextConfig;
```

- [ ] **Step 7: 前台引用改走 `mediaUrl()`**

四处，逐个改。`lib/use-music-player.ts` 第 90 行与第 176 行：

```ts
import { mediaUrl } from '@/lib/media-url';

// 第 90 行附近，原：audio.src = track.audio;
        audio.src = mediaUrl(track.audio);

// 第 176 行附近，原：audio.src = track.audio;
    audio.src = mediaUrl(track.audio);
```

第 89 行的 `audio.src.endsWith(track.audio)` **保持不变**：`track.audio` 是 `/audio/xx.mp3`，
加上 CDN 前缀后仍以它结尾，判等逻辑依然成立。

`app/music/MusicPlayer.tsx` 第 75 行：

```tsx
                  src={mediaUrl(track.image)}
```

`app/music/page.tsx` 第 34 行：

```tsx
          <audio controls preload="none" src={mediaUrl('/audio/daodejing-01.mp3')} className="w-full h-10" />
```

`components/reader/BlockRenderer.tsx` 第 160 行（科仪示意图）：

```tsx
                    src={mediaUrl(block.content)}
```

以下**不要改**，它们指向仍然版本化的站点静态图（`public/images/site/`、`public/images/hero.jpg`、
分类头图），不在迁移范围内：`app/page.tsx`、`app/search/page.tsx`、`app/ask/page.tsx`、
`components/catalog/CategoryNav.tsx`、`components/catalog/CategoryHero.tsx`、`app/music/page.tsx:19`。

`lib/music-catalog.ts` 里的路径字符串同样**不要改**——它们是站内相对路径，由 `mediaUrl()` 在渲染时解析。

- [ ] **Step 8: 本地验证两种模式**

```powershell
# 模式一：走 CDN
npm run dev
```

打开 `/music`，确认播放正常，浏览器网络面板显示音频请求指向 CDN 域名。

```powershell
# 模式二：回退本地
$env:NEXT_PUBLIC_MEDIA_BASE_URL = ""
npm run dev
```

再次打开 `/music`，确认仍能播放，请求指向 `localhost:3000/audio/...`。

- [ ] **Step 9: 构建与测试**

```powershell
npm run build
npm test
```

预期：通过。

- [ ] **Step 10: 提交**

```powershell
git add scripts/upload-media.ts package.json next.config.ts lib/use-music-player.ts app/music components/reader/BlockRenderer.tsx
git commit -m "feat: 存量媒体上传对象存储，前台引用改走 mediaUrl 解析"
```

---

## Task 8: 媒体移出 Git 版本控制

**范围说明**：本任务只停止追踪新提交中的媒体文件（止血）。历史 commit 中的 273 MB 对象仍在 Git 对象库里，
彻底瘦身需要 `git filter-repo` 重写历史、所有 commit hash 变更，**不在阶段 0 范围内**，需单独排期与团队协调。

**Files:**
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`

**Interfaces:**
- Consumes: 无
- Produces: 无

- [ ] **Step 1: 确认 Task 7 的上传已完成且线上可访问**

```powershell
curl.exe -I "$env:NEXT_PUBLIC_MEDIA_BASE_URL/audio/wuxing-jin.mp3"
curl.exe -I "$env:NEXT_PUBLIC_MEDIA_BASE_URL/images/music/wuxing-jin.jpg"
```

两条都必须返回 200。**这一步不通过就不要继续**——删掉本地文件后没有备份路径。

- [ ] **Step 2: 追加 `.gitignore` 规则**

```gitignore
# 媒体资产存对象存储，不进版本库（见 docs/BACKEND-CMS-ARCHITECTURE.md §10）
/public/audio/
/public/images/music/
/public/images/gen/
/public/images/ritual/
```

保留 `public/images` 下的站点图标、OG 图等小体积静态资源继续版本化。执行前先确认这些目录之外没有必须版本化的文件：

```powershell
Get-ChildItem public/images -Directory | Select-Object Name
```

- [ ] **Step 3: 从索引中移除但保留本地文件**

```powershell
git rm -r --cached public/audio public/images/music public/images/gen public/images/ritual
```

`--cached` 确保本地文件还在，开发时无 CDN 也能回退访问。

- [ ] **Step 4: 确认工作区状态符合预期**

```powershell
git status --short
```

预期：大量 `D` 开头的删除记录（仅索引层面），且 `git status` 不再把这些文件列为未跟踪（已被 .gitignore 覆盖）。
本地磁盘上文件仍在：

```powershell
Get-ChildItem public/audio -File | Measure-Object
```

预期：仍为 53 个文件。

- [ ] **Step 5: 更新 README 的本地开发说明**

在「本地开发」小节的 `npm install` 之后追加：

```markdown
# 媒体资产（道乐音频、配图）存放在对象存储，不在仓库中。
# 配置 NEXT_PUBLIC_MEDIA_BASE_URL 后自动从 CDN 读取；
# 留空则回退读取 public/ 下的本地文件（需自行放置）。
```

在「技术栈」小节补一行：

```markdown
- **PostgreSQL**（账号 / 进度 / UGC / 配额）+ **Cloudflare R2**（媒体资产）
```

- [ ] **Step 6: 更新 `docs/ARCHITECTURE.md` 技术栈表**

把「数据」一行改为：

```markdown
| 数据 | 典籍：静态 JSON（构建期生成）；用户与运营数据：PostgreSQL；媒体资产：Cloudflare R2 |
```

并在「模块边界」的 `lib/` 列表中补三行：

```text
  pg.ts                 Postgres 连接池与查询原语
  storage.ts            对象存储访问层（S3 兼容 / R2）
  auth-role.ts          角色模型与服务端权限守卫
```

- [ ] **Step 7: 构建确认无引用断裂**

```powershell
npm run build
npm test
```

预期：通过。

- [ ] **Step 8: 提交**

```powershell
git add .gitignore README.md docs/ARCHITECTURE.md
git commit -m "chore: 媒体资产移出版本控制，文档同步更新"
```

- [ ] **Step 9: 确认仓库新增提交不再携带媒体**

```powershell
git count-objects -vH
```

记录 `size-pack` 数值。它此刻仍约为 404 MiB（历史对象未清理），但后续提交不会再增长。把这个数字写进阶段 0 的收尾报告，作为将来做历史重写时的对比基线。

---

## 阶段 0 验收清单

全部任务完成后，逐条确认：

- [ ] `npm ls next` 显示 ≥ 16.2.6
- [ ] 生产环境配置 `DATABASE_URL` 后，注册 → 登录 → 阅读 → 同步进度 → 发布旁注 → 举报，重新部署后数据仍在
- [ ] `npm run migrate` 可在部署前无条件重跑
- [ ] `npm test` 全绿（含数据层与存储层新增测试）
- [ ] `/music` 音频从 CDN 域名加载，播放正常
- [ ] 清空 `NEXT_PUBLIC_MEDIA_BASE_URL` 后仍可用本地文件跑起来
- [ ] 新提交的 `git status` 不再出现媒体文件
- [ ] `.env.example` 覆盖全部新增变量

## 遗留事项（不属于阶段 0）

| 事项 | 去向 |
|---|---|
| Git 历史中 273 MB 音频对象 | 单独排期 `git filter-repo` |
| `lib/illustrations-service.ts` 仍把 AI 生成图写到本地 `public/images/gen/` | 该目录在本阶段被 gitignore，但写本地盘在 Vercel 上本就不持久（PRD 已标记 PARTIAL）。改为经 `uploadObject` 落对象存储，放阶段 2 与 `media_assets` 一起做 |
| 审核台与 AI 审核管线 | 阶段 1 |
| Payload CMS 接入 | 阶段 2 |
| 改角色需重新登录才生效 | 若成为痛点，阶段 1 改为 session 回调查库 |
| `analytics_events` 无归档策略 | 埋点量上来后再评估分区或定期归档 |
