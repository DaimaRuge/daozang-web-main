import test from 'node:test';
import assert from 'node:assert/strict';
import { paginateBlocks, findPageForBlockId } from '../lib/book-pagination.ts';
import { ContentBlock } from '../lib/content-schema.ts';

function block(id: string, type: ContentBlock['type'], content: string, level?: number): ContentBlock {
  return {
    id,
    type,
    content,
    level,
    sourceStart: 0,
    sourceEnd: 0,
    confidence: 1,
    parser: 'test',
  };
}

test('paginateBlocks splits long text and findPageForBlockId locates chapter', () => {
  const blocks = [
    block('b0', 'heading', 'Title', 1),
    block('b1', 'paragraph', 'a'.repeat(800)),
    block('b2', 'paragraph', 'b'.repeat(800)),
    block('b3', 'subheading', 'Chapter', 3),
    block('b4', 'paragraph', 'c'.repeat(400)),
  ];
  const pages = paginateBlocks(blocks);
  assert.ok(pages.length > 1);
  assert.ok(findPageForBlockId(pages, blocks, 'b3') > 0);
});
