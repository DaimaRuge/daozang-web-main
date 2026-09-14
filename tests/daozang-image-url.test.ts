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
  restoredStem,
} from '../lib/daozang-image-url';
import { classifyRequestedFile } from '../lib/daozang-images';
import { webCinnabarFile } from '../lib/daozang-web-images';

describe('daozangObjectKey / daozangPublicUrl', () => {
  test('桶内 key 不编码，公开 URL 编码部名与文件名', () => {
    assert.equal(daozangObjectKey('洞真部', 'image086.jpg'), 'daozang-images/洞真部/image086.jpg');
    assert.equal(
      daozangPublicUrl('洞真部', 'image086.jpg', 'https://cdn.example.com/'),
      'https://cdn.example.com/daozang-images/%E6%B4%9E%E7%9C%9F%E9%83%A8/image086.jpg',
    );
  });

  test('未配置 CDN 时退回站内静态路径', () => {
    assert.equal(daozangPublicUrl('洞真部', 'a.jpg', ''), daozangImageUrl('洞真部', 'a.jpg'));
    assert.equal(daozangImageUrl('洞真部', 'a.jpg'), '/daozang-images/%E6%B4%9E%E7%9C%9F%E9%83%A8/a.jpg');
    assert.equal(daozangImageUrl('洞真部', 'a.cinnabar.webp'), '/daozang-images/%E6%B4%9E%E7%9C%9F%E9%83%A8/a.cinnabar.webp');
    assert.equal(daozangImageUrl('洞真部', 'a.ink.png'), '/api/daozang-images/%E6%B4%9E%E7%9C%9F%E9%83%A8/a.ink.png');
  });
});

describe('网页压缩文件名', () => {
  test('cinnabar.webp 与 png 复原得到同一 stem', () => {
    assert.equal(restoredStem('image086.cinnabar.webp'), 'image086');
    assert.equal(restoredStem('image086.cinnabar.png'), 'image086');
    assert.equal(webCinnabarFile('image086.jpg'), 'image086.cinnabar.webp');
    assert.equal(classifyRequestedFile('image086.cinnabar.webp'), 'cinnabar');
    assert.equal(classifyRequestedFile('image086.jpg'), 'scan');
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
