import { NextResponse } from 'next/server';
import {
  expandNode,
  graphForWork,
  graphViewForQuery,
  isGraphAvailable,
} from '@/lib/graph/query';

/**
 * 知识图谱查询接口。
 *
 * 为什么页面已经能服务端直读、还要留这个接口：
 * 1. 未来 Android / iOS 客户端与 PWA 需要同一份关系数据，
 *    页面渲染逻辑不能成为唯一出口（与 /api/entry、/api/adjacent 的定位一致）；
 * 2. Agent 工具与前端展开动作走同一份视图结构，避免两处维护。
 *
 * 参数三选一：id（节点 id）/ bookId（典籍）/ q（关键词，未命中实体时走回退链路）。
 */
export async function GET(request: Request) {
  if (!isGraphAvailable()) {
    return NextResponse.json({ error: '图谱数据尚未构建，请运行 npm run build-graph' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const bookId = searchParams.get('bookId');
  const q = searchParams.get('q');

  // 入参一律不信任：限制长度，避免异常长字符串触发全文检索的高成本路径
  const view = id
    ? expandNode(id.slice(0, 120))
    : bookId
      ? graphForWork(bookId.slice(0, 64))
      : q
        ? graphViewForQuery(q.slice(0, 40))
        : null;

  if (!view) {
    return NextResponse.json({ error: '未找到对应的图谱节点' }, { status: 404 });
  }

  return NextResponse.json({ view });
}
