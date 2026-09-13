/**
 * 原书插图 URL / 对象 key。
 * 运行：npx tsx --test tests/daozang-image-url.test.ts
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  daozangImageUrl,
  daozangObjectKey,
  daozangPublicUrl,
  parseDaozangImageUrl,
} from '../lib/daozang-image-url';

describe('daozangObjectKey / daozangPublicUrl', () => {
  test('桶内 key 不编码，公开 URL 编码部名与文件名', () => {
    assert.equal(daozangObjectKey('洞真部', 'image086.jpg'), 'daozang-images/洞真部/image086.jpg');
    assert.equal(
      daozangPublicUrl('洞真部', 'image086.jpg', 'https://cdn.example.com/'),
      'https://cdn.example.com/daozang-images/%E6%B4%9E%E7%9C%9F%E9%83%A8/image086.jpg',
    );
  });

  test('未配置 CDN 时退回站内 API', () => {
    assert.equal(daozangPublicUrl('洞真部', 'a.jpg', ''), daozangImageUrl('洞真部', 'a.jpg'));
  });
});

describe('parseDaozangImageUrl', () => {
  test('站内 API 与 CDN 都能拆回部名文件名', () => {
    const api = parseDaozangImageUrl(daozangImageUrl('洞真部', 'image086.jpg'));
    assert.deepEqual(api, { part: '洞真部', file: 'image086.jpg' });
    const cdn = parseDaozangImageUrl(
      'https://cdn.example.com/daozang-images/%E6%B4%9E%E7%9C%9F%E9%83%A8/image086.jpg',
    );
    assert.deepEqual(cdn, { part: '洞真部', file: 'image086.jpg' });
  });
});
