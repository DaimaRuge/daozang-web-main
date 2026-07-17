'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { musicActions, useMusicPlayer } from '@/lib/use-music-player';
import AuthButton from '@/components/auth/AuthButton';

const navItems = [
  { href: '/', label: '首页' },
  { href: '/catalog', label: '经文目录' },
  { href: '/search', label: '搜索' },
  { href: '/ask', label: '智能问道' },
  { href: '/music', label: '道乐' },
  { href: '/library', label: '我的书房' },
  { href: '/about', label: '关于' },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { state } = useMusicPlayer();

  const toggleBackgroundMusic = () => {
    musicActions.setBackgroundEnabled(!state.backgroundEnabled);
  };

  return (
    <header className="border-b border-[var(--border)]">
      <nav className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-serif tracking-wider text-[var(--accent)] hover:opacity-80 transition-opacity">
          道可道
        </Link>

        <div className="hidden md:flex items-center gap-6 text-sm">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={`transition-colors ${pathname === item.href ? 'text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
            >
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={toggleBackgroundMusic}
            className={`text-xs px-2 py-1 rounded border transition-colors ${
              state.backgroundEnabled
                ? 'border-[var(--accent)] text-[var(--accent)]'
                : 'border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)]'
            }`}
            aria-pressed={state.backgroundEnabled}
            title="切换全局道乐迷你控制条"
          >
            背景道乐
          </button>
          <AuthButton />
        </div>

        <button
          className="md:hidden text-[var(--muted)] p-1"
          onClick={() => setOpen(!open)}
          aria-label="菜单"
          aria-expanded={open}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open
              ? <path d="M18 6 6 18M6 6l12 12" />
              : <><path d="M3 12h18M3 6h18M3 18h18" /></>
            }
          </svg>
        </button>
      </nav>

      {open && (
        <div className="md:hidden border-t border-[var(--border)] bg-[var(--bg)]">
          <div className="px-6 py-3 space-y-1">
            {navItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`block py-2 text-sm transition-colors ${pathname === item.href ? 'text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
              >
                {item.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => {
                toggleBackgroundMusic();
                setOpen(false);
              }}
              className="block w-full text-left py-2 text-sm text-[var(--muted)]"
            >
              背景道乐：{state.backgroundEnabled ? '开' : '关'}
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
