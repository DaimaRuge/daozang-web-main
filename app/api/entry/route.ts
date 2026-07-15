import { NextResponse } from 'next/server';
import { getEntryById, getContentById, getAdjacentEntries } from '@/lib/data';

/**
 * 典籍条目查询接口。
 * 说明：阅读页已改为服务端组件直接渲染，本接口保留供外部消费
 * （未来 App 客户端 / 第三方工具），并统一复用 lib/data 的类型化读取逻辑，
 * 消除此前路由内自行读文件与 any 类型的技术债。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const dir = searchParams.get('dir');

  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 });
  }

  const entry = getEntryById(id);
  if (!entry) {
    return NextResponse.json({ entry: null });
  }

  if (dir) {
    const { prev, next } = getAdjacentEntries(id);
    const adj = dir === 'prev' ? prev : next;
    return NextResponse.json({ entry: adj ? { id: adj.id, title: adj.title } : null });
  }

  const content = getContentById(id) || '[无法读取文件内容]';
  return NextResponse.json({ entry, content });
}
