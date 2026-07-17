import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/Nav';
import MusicProvider from '@/components/music/MusicProvider';
import AuthProvider from '@/components/auth/AuthProvider';

export const metadata: Metadata = {
  title: {
    default: '道可道 · 道藏经文藏书阁',
    template: '%s | 道可道',
  },
  description: '道藏经文在线阅读平台，收录正统道藏、续道藏共计1500余部经典，提供分类浏览、全文搜索、经文阅读等功能。仅供学术研究用途。',
  keywords: ['道藏', '道教', '道藏经文', '正统道藏', '续道藏', '道家经典', '学术研究'],
  openGraph: {
    title: '道可道 · 道藏经文藏书阁',
    description: '道藏经文在线阅读平台，收录正统道藏、续道藏共计1500余部经典。',
    type: 'website',
    locale: 'zh_CN',
    siteName: '道可道',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        <MusicProvider>
          <AuthProvider>
          <Nav />
          <main className="max-w-4xl mx-auto px-6 py-8 pb-20">
            {children}
          </main>
          <footer className="border-t border-[var(--border)] mt-16 mb-14">
          <div className="max-w-4xl mx-auto px-6 py-8 text-center text-sm text-[var(--muted)] space-y-2">
            <p>道可道 · 道藏经文藏书阁</p>
            <p className="text-xs">本站所有文本仅供学术研究用途，不作任何商业用途。文本版权归原作者及相关机构所有。</p>
            <div className="flex justify-center gap-4 text-xs pt-2">
              <a href="https://github.com/DaimaRuge/daozang-text" target="_blank" rel="noopener noreferrer" className="hover:text-[var(--accent)] transition-colors">数据来源</a>
              <a href="/about" className="hover:text-[var(--accent)] transition-colors">关于本站</a>
            </div>
          </div>
        </footer>
          </AuthProvider>
        </MusicProvider>
      </body>
    </html>
  );
}
