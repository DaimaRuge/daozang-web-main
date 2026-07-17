'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';

export default function AuthButton() {
  const { data: session, status } = useSession();

  if (status === 'loading') {
    return <span className="text-xs text-[var(--muted)]">…</span>;
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--muted)] max-w-[100px] truncate hidden lg:inline">
          {session.user.name || session.user.email}
        </span>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: '/' })}
          className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]"
        >
          退出
        </button>
      </div>
    );
  }

  return (
    <Link
      href="/login"
      className="text-xs px-2 py-1 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--accent)]"
    >
      登录
    </Link>
  );
}
