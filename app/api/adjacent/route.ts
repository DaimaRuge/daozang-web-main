import { NextResponse } from 'next/server';
import { getAdjacentEntries } from '@/lib/data';

/**
 * 上一篇 / 下一篇查询。
 * 修复：原实现直接读 data/index.json（生产环境该目录不随构建分发），
 * 现统一走 lib/data 的索引读取逻辑（public/data 优先），消除环境差异。
 * 说明：阅读页已改为服务端渲染并直接注入相邻条目，本接口保留用于兼容旧链接。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const dir = searchParams.get('dir');

  if (!id) return NextResponse.json({ entry: null });

  const { prev, next } = getAdjacentEntries(id);
  const adj = dir === 'prev' ? prev : next;

  return NextResponse.json({ entry: adj ? { id: adj.id, title: adj.title } : null });
}
