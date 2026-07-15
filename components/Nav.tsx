'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * 全局导航。
 * 信息架构对应用户的五类核心诉求：浏览（经文目录）、查找（搜索）、
 * 提问（智能问道）、延续（我的书房：最近阅读/收藏/笔记）、了解（关于）。
 * 智能问道页在 AI 未配置时展示诚实的「尚未开通」状态，故入口常驻。
 */
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

  return (
    <header className="border-b border-[var(--border)]">
      <nav className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-serif tracking-wider text-[var(--accent)] hover:opacity-80 transition-opacity">
          道可道
        </Link>

        {/* 桌面端导航 */}
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
        </div>

        {/* 移动端汉堡按钮 */}
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

      {/* 移动端抽屉菜单 */}
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
          </div>
        </div>
      )}
    </header>
  );
}
