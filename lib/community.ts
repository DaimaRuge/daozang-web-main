/**
 * 社区内容（公开旁注 + 全文评论）的客户端读写层。
 *
 * 与 user-data.ts 的分工：user-data 管「私有本地」数据；本文件管「公开共享、
 * 落库到服务端」的内容。私有笔记默认只走 user-data，勾选「公开分享」时才
 * 额外调用这里的 shareAnnotation 把它公开。
 */

export interface PublicAnnotation {
  id: string;
  blockId: string;
  quote: string;
  charStart: number | null;
  charEnd: number | null;
  body: string;
  authorName: string;
  authorUserId: string;
  createdAt: number;
}

export interface PublicComment {
  id: string;
  parentId: string | null;
  body: string;
  authorName: string;
  authorUserId: string;
  createdAt: number;
}

async function jsonOrThrow(res: Response): Promise<Record<string, unknown>> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : `请求失败（${res.status}）`);
  }
  return data;
}

// ---------- 旁注 ----------

export async function fetchAnnotations(bookId: string): Promise<PublicAnnotation[]> {
  const res = await fetch(`/api/annotations?bookId=${encodeURIComponent(bookId)}`);
  const data = await jsonOrThrow(res);
  return (data.annotations as PublicAnnotation[]) ?? [];
}

export async function shareAnnotation(input: {
  bookId: string;
  blockId: string;
  quote: string;
  body: string;
  charStart?: number | null;
  charEnd?: number | null;
}): Promise<PublicAnnotation> {
  const res = await fetch('/api/annotations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await jsonOrThrow(res);
  return data.annotation as PublicAnnotation;
}

export async function deleteAnnotation(id: string): Promise<void> {
  await jsonOrThrow(await fetch(`/api/annotations?id=${encodeURIComponent(id)}`, { method: 'DELETE' }));
}

// ---------- 评论 ----------

export async function fetchComments(bookId: string): Promise<PublicComment[]> {
  const res = await fetch(`/api/comments?bookId=${encodeURIComponent(bookId)}`);
  const data = await jsonOrThrow(res);
  return (data.comments as PublicComment[]) ?? [];
}

export async function postComment(bookId: string, body: string): Promise<PublicComment> {
  const res = await fetch('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bookId, body }),
  });
  const data = await jsonOrThrow(res);
  return data.comment as PublicComment;
}

export async function deleteComment(id: string): Promise<void> {
  await jsonOrThrow(await fetch(`/api/comments?id=${encodeURIComponent(id)}`, { method: 'DELETE' }));
}

// ---------- 举报 ----------

export async function reportContent(kind: 'annotation' | 'comment', id: string): Promise<void> {
  await jsonOrThrow(
    await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, id }),
    }),
  );
}

/** 相对时间：列表展示用（避免 SSR/locale 差异，仅客户端调用） */
export function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}
