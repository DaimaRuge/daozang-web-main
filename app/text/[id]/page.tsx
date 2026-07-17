import { Suspense } from 'react';
import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getEntryById, getContentById, getAdjacentEntries } from '@/lib/data';
import { parseText } from '@/lib/text-parser';
import { applyOverrides } from '@/lib/parser-overrides';
import { injectRitualIllustrations } from '@/lib/ritual-illustrations';
import Reader from '@/components/reader/Reader';

/**
 * 阅读页（服务端组件）。
 *
 * 为什么从客户端组件改为服务端组件：
 * 1. SEO —— 正文必须在服务端渲染进 HTML，此前客户端 fetch 的方案
 *    搜索引擎抓不到任何经文内容；
 * 2. 结构化 —— 原始文本在服务端经 parseText 转为结构化块后注入阅读器，
 *    客户端不再感知原始 txt 的解析细节；
 * 3. 性能 —— 相邻篇目在服务端一并注入，省去两次客户端 API 往返。
 * 交互能力（设置/进度/划词/笔记）全部收敛在客户端的 Reader 组件中。
 */

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const entry = getEntryById(id);
  if (!entry) return { title: '未找到经文' };
  const description = `《${entry.title}》在线阅读。${entry.collection} · ${entry.category}${entry.author ? ` · ${entry.author}` : ''}。${entry.preview.slice(0, 100)}`;
  return {
    title: entry.title,
    description,
    openGraph: { title: entry.title, description, type: 'article' },
  };
}

export default async function TextPage({ params }: PageProps) {
  const { id } = await params;
  const entry = getEntryById(id);
  if (!entry) notFound();

  const content = getContentById(id);
  // 规则解析 → 人工校正 → 科仪示意图注入（均在服务端完成，正文 SSR 可读）
  const parsed = injectRitualIllustrations(
    applyOverrides(parseText(content, id, entry.title)),
  );
  const { prev, next } = getAdjacentEntries(id);

  return (
    <Suspense fallback={<p className="text-sm text-[var(--muted)] py-12 text-center">加载阅读器…</p>}>
      <Reader
        key={id}
        entry={entry}
        parsed={parsed}
        prev={prev ? { id: prev.id, title: prev.title } : null}
        next={next ? { id: next.id, title: next.title } : null}
      />
    </Suspense>
  );
}
