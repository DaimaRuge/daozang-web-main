import Link from 'next/link';
import QueueClient from './QueueClient';

export const dynamic = 'force-dynamic';

export default function StudioModerationPage() {
  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <p className="text-xs text-[var(--muted)]">
          <Link href="/studio" className="hover:text-[var(--accent)]">运营后台</Link>
          <span className="mx-2">/</span>
          审核队列
        </p>
        <h1 className="text-2xl font-serif tracking-wider mt-1">审核队列</h1>
        <p className="text-sm text-[var(--muted)] mt-2">
          处理被举报隐藏、尚未公开的旁注、评论与投稿。通过后重新对读者可见；驳回保持隐藏。
        </p>
      </header>
      <QueueClient />
    </div>
  );
}
