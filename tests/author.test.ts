/**
 * 题署解析：文件名噪声不得进入阅读界面或图谱人物节点。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { formatAuthor, parseAuthor, splitTitleAndAttribution } from '../lib/author';

test('宋-宋-王慶升 去重为 宋 · 王慶升', () => {
  assert.deepEqual(parseAuthor('宋-宋-王慶升'), { era: '宋', name: '王慶升' });
  assert.equal(formatAuthor('宋-宋-王慶升'), '宋 · 王慶升');
});

test('五-五代-蒲處貫 复原为完整朝代', () => {
  assert.deepEqual(parseAuthor('五-五代-蒲處貫'), { era: '五代', name: '蒲處貫' });
  assert.equal(formatAuthor('南-南朝宋-陸修靜'), '南朝宋 · 陸修靜');
  assert.equal(formatAuthor('南-南齊-顧歡'), '南齊 · 顧歡');
});

test('元-元王玠 剥掉粘在人名上的朝代；唐-唐淳 保留为人名', () => {
  assert.deepEqual(parseAuthor('元-元王玠'), { era: '元', name: '王玠' });
  assert.deepEqual(parseAuthor('唐-唐淳'), { name: '唐淳' });
  assert.equal(formatAuthor('唐-唐淳'), '唐淳');
});

test('类型名「真人」不作为题署人物', () => {
  assert.equal(parseAuthor('晉-晉真人'), null);
  assert.equal(formatAuthor('晉-晉真人'), undefined);
});

test('已格式化字符串再解析保持幂等', () => {
  assert.equal(formatAuthor('宋 · 王慶升'), '宋 · 王慶升');
  assert.equal(formatAuthor(formatAuthor('唐-唐-孫思邈')), '唐 · 孫思邈');
});

test('空值与明显非人名丢弃', () => {
  assert.equal(parseAuthor(undefined), null);
  assert.equal(parseAuthor(''), null);
  assert.equal(parseAuthor('abc-def'), null);
});

test('文件名尾巴：金 不被漏掉，五代 不被切成五', () => {
  assert.deepEqual(
    splitTitleAndAttribution('黃帝陰符經注-金-唐淳'),
    { title: '黃帝陰符經注', author: '金-唐淳' },
  );
  assert.deepEqual(
    splitTitleAndAttribution('某書-五代-蒲處貫'),
    { title: '某書', author: '五代-蒲處貫' },
  );
  assert.deepEqual(
    splitTitleAndAttribution('晉真人語錄-金-晉真人'),
    { title: '晉真人語錄', author: '金-晉真人' },
  );
});

test('文件名无分隔的 元王玠 仍能切开', () => {
  assert.deepEqual(
    splitTitleAndAttribution('黃帝陰符經注夾頌解注-元王玠'),
    { title: '黃帝陰符經注夾頌解注', author: '元-王玠' },
  );
});

test('没有题署的书名原样返回', () => {
  assert.deepEqual(splitTitleAndAttribution('道德真經'), { title: '道德真經' });
});

test('现行 index.json 的题署经清洗后不再带连字符噪声', () => {
  const index = JSON.parse(
    fs.readFileSync(path.resolve('public/data/index.json'), 'utf-8'),
  ) as { entries: Array<{ author?: string }> };
  let shown = 0;
  for (const e of index.entries) {
    const label = formatAuthor(e.author);
    if (!label) continue;
    shown++;
    assert.ok(!label.includes('-'), `仍含连字符：${e.author} → ${label}`);
  }
  assert.ok(shown > 300, `清洗后应保留绝大多数题署，实际 ${shown}`);
});
