import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { initialUgcStatus, resolvePolicy } from '../lib/moderation/policy';
import { evaluateHardRules } from '../lib/moderation/rules';
import { decideUgcStatus } from '../lib/moderation/pipeline';
import { extractJsonObject, parseReviewPayload, reviewUgcText } from '../lib/moderation/review';

describe('审核策略矩阵', () => {
  test('海外：文本与媒体快审，图书人工终审', () => {
    assert.equal(resolvePolicy('text-ugc', 'global'), 'ai-fast');
    assert.equal(resolvePolicy('media', 'global'), 'ai-fast');
    assert.equal(resolvePolicy('book', 'global'), 'ai-then-human');
  });

  test('大陆：文本/图书先发后审，媒体投稿制', () => {
    assert.equal(resolvePolicy('text-ugc', 'cn'), 'ai-gate');
    assert.equal(resolvePolicy('media', 'cn'), 'human-queue');
    assert.equal(resolvePolicy('book', 'cn'), 'ai-gate');
  });

  test('human-queue 与 ai-then-human 入库为 pending，其余先发', () => {
    const prev = process.env.DZ_REGION;
    process.env.DZ_REGION = 'cn';
    assert.equal(initialUgcStatus('media'), 'pending');
    assert.equal(initialUgcStatus('text-ugc'), 'approved');
    process.env.DZ_REGION = 'global';
    assert.equal(initialUgcStatus('book'), 'pending');
    assert.equal(initialUgcStatus('text-ugc'), 'approved');
    if (prev === undefined) delete process.env.DZ_REGION;
    else process.env.DZ_REGION = prev;
  });
});

describe('硬规则前置', () => {
  test('空文本拒绝', () => {
    assert.equal(evaluateHardRules('   ').reject, true);
  });

  test('正常文言通过', () => {
    assert.equal(evaluateHardRules('道可道，非常道。').reject, false);
  });

  test('过多链接拒绝', () => {
    const spam = '看 http://a.com http://b.com http://c.com http://d.com';
    const v = evaluateHardRules(spam);
    assert.equal(v.reject, true);
    if (v.reject) assert.equal(v.reason, 'too-many-urls');
  });

  test('超长重复字符拒绝', () => {
    const v = evaluateHardRules('啊'.repeat(20));
    assert.equal(v.reject, true);
  });
});

describe('LLM 初审结论落地', () => {
  test('ai-fast：allow 公开，flag/block 隐藏', () => {
    assert.equal(decideUgcStatus('ai-fast', 'allow'), 'approved');
    assert.equal(decideUgcStatus('ai-fast', 'flag'), 'hidden');
    assert.equal(decideUgcStatus('ai-fast', 'block'), 'hidden');
  });

  test('ai-then-human：即使 allow 也待人工，拒绝则隐藏', () => {
    assert.equal(decideUgcStatus('ai-then-human', 'allow'), 'pending');
    assert.equal(decideUgcStatus('ai-then-human', 'block'), 'hidden');
  });

  test('human-queue：allow/flag 待人工，block 直接隐藏', () => {
    assert.equal(decideUgcStatus('human-queue', 'allow'), 'pending');
    assert.equal(decideUgcStatus('human-queue', 'flag'), 'pending');
    assert.equal(decideUgcStatus('human-queue', 'block'), 'hidden');
  });

  test('解析失败不得当成 allow', () => {
    assert.equal(parseReviewPayload({ hello: 1 }), null);
    assert.equal(parseReviewPayload({ verdict: 'allow', score: 0.1, categories: [], reason: 'ok' })?.verdict, 'allow');
    const extracted = extractJsonObject('前言 {"verdict":"block","score":0.9,"categories":["spam"],"reason":"广告"} 后记');
    assert.equal(parseReviewPayload(extracted)?.verdict, 'block');
  });

  test('注入 runner 时 block 原样返回，异常降级为 flag', async () => {
    const blocked = await reviewUgcText({ text: '买药加微信' }, async () => ({
      verdict: 'block',
      score: 0.95,
      categories: ['ads'],
      reason: '广告',
      model: 'stub',
      latencyMs: 1,
    }));
    assert.equal(blocked?.verdict, 'block');

    const failed = await reviewUgcText({ text: '道可道' }, async () => {
      throw new Error('upstream down');
    });
    assert.equal(failed?.verdict, 'flag');
    assert.equal(failed?.parseFailed, true);
  });
});
