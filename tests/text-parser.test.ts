/**
 * 文本解析器单元测试。
 * 运行方式：npm test（内部使用 tsx --test，无需额外测试框架依赖）。
 * 用例取材于真实道藏文本的典型结构（书名 / 經名按语 / 卷标题 / 品名 / 缩进段落）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseText } from '../lib/text-parser';
import { LOW_CONFIDENCE } from '../lib/content-schema';

const SAMPLE = [
  '三洞珠囊',
  '',
  '經名：三洞珠囊。唐王懸河編。十卷。底本出處：《正統道藏》太平部。',
  '',
  '三洞珠囊卷之一',
  '',
  '救導品',
  '　　《道學傳第四》云：任敦，字尚能，博昌人。永嘉中投雲陽山。',
  '　　又云：杜炅，字子恭，及壯識信精勤，宗事正一。',
].join('\n');

test('首行识别为书名（level 1 heading）', () => {
  const parsed = parseText(SAMPLE, 'test01', '三洞珠囊');
  const first = parsed.blocks[0];
  assert.equal(first.type, 'heading');
  assert.equal(first.level, 1);
  assert.equal(first.content, '三洞珠囊');
  assert.ok(first.confidence >= 0.9, '与索引书名一致时应为高置信度');
});

test('經名行识别为整理者按语，与正文严格区分', () => {
  const parsed = parseText(SAMPLE, 'test01', '三洞珠囊');
  const note = parsed.blocks.find(b => b.type === 'editor-note');
  assert.ok(note);
  assert.match(note!.content, /^經名：/);
});

test('卷标题识别为 level 2 heading', () => {
  const parsed = parseText(SAMPLE, 'test01', '三洞珠囊');
  const vol = parsed.blocks.find(b => b.content === '三洞珠囊卷之一');
  assert.ok(vol);
  assert.equal(vol!.type, 'heading');
  assert.equal(vol!.level, 2);
  assert.ok(vol!.confidence >= 0.9);
});

test('短行品名识别为 subheading（带强后缀时高置信度）', () => {
  const parsed = parseText(SAMPLE, 'test01', '三洞珠囊');
  const sub = parsed.blocks.find(b => b.content === '救導品');
  assert.ok(sub);
  assert.equal(sub!.type, 'subheading');
  assert.ok(sub!.confidence >= LOW_CONFIDENCE, '「品」结尾属强规则');
});

test('全角缩进行识别为正文段落，且缩进被清理但文字不变', () => {
  const parsed = parseText(SAMPLE, 'test01', '三洞珠囊');
  const paras = parsed.blocks.filter(b => b.type === 'paragraph');
  assert.equal(paras.length, 2);
  assert.ok(paras[0].content.startsWith('《道學傳第四》云'));
  assert.ok(!paras[0].content.includes('\u3000'), '展示文本不应残留全角缩进');
});

test('每个块都带原始行号与解析器版本（可追溯性）', () => {
  const parsed = parseText(SAMPLE, 'test01', '三洞珠囊');
  for (const b of parsed.blocks) {
    assert.equal(typeof b.sourceStart, 'number');
    assert.ok(b.sourceEnd >= b.sourceStart);
    assert.match(b.parser, /^rule-v\d+$/);
  }
});

test('目录只包含标题类块，并指向可定位的块 ID', () => {
  const parsed = parseText(SAMPLE, 'test01', '三洞珠囊');
  assert.ok(parsed.toc.length >= 2);
  const blockIds = new Set(parsed.blocks.map(b => b.id));
  for (const item of parsed.toc) {
    assert.ok(blockIds.has(item.blockId));
  }
});

test('空文本不会崩溃', () => {
  const parsed = parseText('', 'empty', '空书');
  assert.equal(parsed.blocks.length, 0);
  assert.equal(parsed.stats.totalBlocks, 0);
});

// ---------- rule-v2 新增规则 ----------

const SAMPLE_V2 = [
  '靈寶領教濟度金書',
  '',
  '卷之一',
  '呪曰',
  '　　天地玄宗，萬炁本根。',
  '頌曰：',
  '　　身有金光，覆映吾身。',
  '又',
  '　　再誦三遍。',
  '武林道士褚伯秀學',
  '靈寶領教濟度金書卷之一竟',
].join('\n');

test('卷终行（…卷之N竟）识别为 original-note，不进目录', () => {
  const parsed = parseText(SAMPLE_V2, 'test02', '靈寶領教濟度金書');
  const end = parsed.blocks.find(b => b.content === '靈寶領教濟度金書卷之一竟');
  assert.ok(end);
  assert.equal(end!.type, 'original-note');
  assert.ok(!parsed.toc.some(t => t.title.endsWith('竟')));
});

test('诵咒引导语（呪曰/頌曰）为 level 4 subheading，且不进目录', () => {
  const parsed = parseText(SAMPLE_V2, 'test02', '靈寶領教濟度金書');
  for (const label of ['呪曰', '頌曰：']) {
    const b = parsed.blocks.find(x => x.content === label);
    assert.ok(b, `应识别 ${label}`);
    assert.equal(b!.type, 'subheading');
    assert.equal(b!.level, 4);
  }
  assert.ok(!parsed.toc.some(t => t.title === '呪曰' || t.title === '頌曰：'));
});

test('单字延续词「又」识别为正文而非标题', () => {
  const parsed = parseText(SAMPLE_V2, 'test02', '靈寶領教濟度金書');
  const b = parsed.blocks.find(x => x.content === '又');
  assert.ok(b);
  assert.equal(b!.type, 'paragraph');
});

test('作者署名行识别为 original-note', () => {
  const parsed = parseText(SAMPLE_V2, 'test02', '靈寶領教濟度金書');
  const b = parsed.blocks.find(x => x.content === '武林道士褚伯秀學');
  assert.ok(b);
  assert.equal(b!.type, 'original-note');
});

// ---------- rule-v3 新增规则（科仪类） ----------

const SAMPLE_V3 = [
  '無上黃籙大齋立成儀',
  '',
  '目錄',
  '宣衛靈咒',
  '　　琳琅振響，十方肅清。',
  '其二',
  '　　天地玄宗，萬炁本根。',
  '各禮師存念如法',
  '　　次請稱職奏請。',
].join('\n');

test('组诗序号「其二」为 level 4 subheading，不进目录', () => {
  const parsed = parseText(SAMPLE_V3, 'test03', '無上黃籙大齋立成儀');
  const b = parsed.blocks.find(x => x.content === '其二');
  assert.ok(b);
  assert.equal(b!.type, 'subheading');
  assert.equal(b!.level, 4);
  assert.ok(!parsed.toc.some(t => t.title === '其二'));
});

test('章节名白名单「目錄」为高置信度 subheading', () => {
  const parsed = parseText(SAMPLE_V3, 'test03', '無上黃籙大齋立成儀');
  const b = parsed.blocks.find(x => x.content === '目錄');
  assert.ok(b);
  assert.equal(b!.type, 'subheading');
  assert.ok(b!.confidence >= 0.9);
});

test('咒名后缀「…咒」为高置信度 subheading', () => {
  const parsed = parseText(SAMPLE_V3, 'test03', '無上黃籙大齋立成儀');
  const b = parsed.blocks.find(x => x.content === '宣衛靈咒');
  assert.ok(b);
  assert.equal(b!.type, 'subheading');
  assert.ok(b!.confidence >= LOW_CONFIDENCE);
});

test('科仪指示语「…如法」识别为 annotation', () => {
  const parsed = parseText(SAMPLE_V3, 'test03', '無上黃籙大齋立成儀');
  const b = parsed.blocks.find(x => x.content === '各禮師存念如法');
  assert.ok(b);
  assert.equal(b!.type, 'annotation');
});
