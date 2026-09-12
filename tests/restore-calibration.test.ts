/**
 * 插图复原人工校定：URL、邻居、启发式分类。
 * 运行：npx tsx --test tests/restore-calibration.test.ts
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseDaozangImageUrl } from '../lib/daozang-images';
import {
  calibrateHref,
  classifyCalibrationHeuristic,
  classifyCalibrationWithLlm,
  isSafeImageSegment,
  neighboringRestored,
  parseCalibrationAiPayload,
  pickDefaultVariant,
  variantFile,
} from '../lib/restore-calibration';

describe('parseDaozangImageUrl / calibrateHref', () => {
  test('从阅读块 URL 拆出部名和文件名', () => {
    const hit = parseDaozangImageUrl(
      '/api/daozang-images/%E6%B4%9E%E7%9C%9F%E9%83%A8/CNDZ010208%E5%A4%AA%E4%B8%8A%E7%A7%98%E6%B3%95%E9%8E%AE%E5%AE%85%E9%9D%88%E7%AC%A6image086.jpg',
    );
    assert.equal(hit?.part, '洞真部');
    assert.equal(hit?.file, 'CNDZ010208太上秘法鎮宅靈符image086.jpg');
  });

  test('校定链接带上原扫描文件名', () => {
    const href = calibrateHref(
      '45bee8697b49563d',
      '/api/daozang-images/洞真部/CNDZ010208太上秘法鎮宅靈符image086.jpg',
    );
    assert.equal(
      href,
      '/text/45bee8697b49563d/calibrate?part=%E6%B4%9E%E7%9C%9F%E9%83%A8&file=CNDZ010208%E5%A4%AA%E4%B8%8A%E7%A7%98%E6%B3%95%E9%8E%AE%E5%AE%85%E9%9D%88%E7%AC%A6image086.jpg',
    );
  });

  test('非法路径段拒绝', () => {
    assert.equal(isSafeImageSegment('../x'), false);
    assert.equal(isSafeImageSegment('a/b'), false);
    assert.equal(isSafeImageSegment('洞真部'), true);
  });
});

describe('variant + neighbors', () => {
  test('朱砂文件名由原 jpg stem 生成', () => {
    assert.equal(
      variantFile('CNDZ010208太上秘法鎮宅靈符image086.jpg', 'cinnabar'),
      'CNDZ010208太上秘法鎮宅靈符image086.cinnabar.png',
    );
  });

  test('优先朱砂，没有则墨线', () => {
    assert.equal(pickDefaultVariant({ ink: true, cinnabar: true, restored: true }), 'cinnabar');
    assert.equal(pickDefaultVariant({ ink: true, cinnabar: false, restored: true }, 'cinnabar'), 'ink');
    assert.equal(pickDefaultVariant({ ink: false, cinnabar: false, restored: false }), null);
  });

  test('同书已复原图可前后翻', () => {
    const list = [
      { part: '洞真部', file: 'a.jpg' },
      { part: '洞真部', file: 'b.jpg' },
      { part: '洞真部', file: 'c.jpg' },
    ];
    assert.deepEqual(neighboringRestored(list, 'b.jpg'), {
      prev: { part: '洞真部', file: 'a.jpg' },
      next: { part: '洞真部', file: 'c.jpg' },
    });
    assert.equal(neighboringRestored(list, 'a.jpg').prev, null);
    assert.equal(neighboringRestored(list, 'missing.jpg').next, null);
  });
});

describe('分类', () => {
  test('确认且无备注维持现复原', () => {
    const hit = classifyCalibrationHeuristic('pass', '');
    assert.equal(hit.action, 'keep');
    assert.equal(hit.source, 'heuristic');
  });

  test('不通过提到颜色走重染', () => {
    assert.equal(classifyCalibrationHeuristic('fail', '朱砂偏淡').action, 'retint');
  });

  test('不通过提到抠底走重抠', () => {
    assert.equal(classifyCalibrationHeuristic('fail', '纸色没抠干净').action, 'reknockout');
  });

  test('不通过且无备注默认核对结构', () => {
    assert.equal(classifyCalibrationHeuristic('fail', '').action, 'geometry');
  });

  test('解析 LLM JSON，非法 action 丢弃', () => {
    const ok = parseCalibrationAiPayload({ action: 'retint', summary: '颜色偏冷' });
    assert.equal(ok?.action, 'retint');
    assert.equal(ok?.source, 'llm');
    assert.equal(parseCalibrationAiPayload({ action: 'wipe-original' }), null);
  });

  test('LLM 包装器从自由文本抠 JSON', async () => {
    const hit = await classifyCalibrationWithLlm('fail', '笔画对不上', async () =>
      '好的\n{"action":"geometry","summary":"结构偏移"}\n',
    );
    assert.equal(hit?.action, 'geometry');
    assert.equal(hit?.summary, '结构偏移');
  });
});
