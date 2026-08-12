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
