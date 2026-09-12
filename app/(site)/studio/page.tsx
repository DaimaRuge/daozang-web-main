import Link from 'next/link';
import { countModerationQueue, countRestoreCalibrationFails } from '@/lib/db';
import { currentRegion } from '@/lib/moderation/policy';
import { loadTinySkipCatalog } from '@/lib/daozang-tiny-skips';

export const dynamic = 'force-dynamic';

export default async function StudioHomePage() {
  const counts = await countModerationQueue();
  const region = currentRegion();
  let failCalibrations = 0;
  try {
    failCalibrations = await countRestoreCalibrationFails();
  } catch {
    failCalibrations = 0;
  }
  const tinySkipCount = loadTinySkipCatalog()?.stats.tiny ?? 0;

  return (
    <div className="animate-fade-in space-y-8">
      <header>
        <p className="text-xs text-[var(--muted)] tracking-widest">STUDIO</p>
        <h1 className="text-2xl font-serif tracking-wider mt-1">运营后台</h1>
        <p className="text-sm text-[var(--muted)] mt-2">
          当前部署区域 <span className="text-[var(--text)]">{region}</span>
          。旁注、评论与来稿投稿在此处理。媒体库与栏目走另一套 CMS 登录。
        </p>
      </header>

      <section className="grid grid-cols-2 gap-4">
        <div className="border border-[var(--border)] rounded-lg p-4 bg-[var(--card)]">
          <p className="text-xs text-[var(--muted)]">待审</p>
          <p className="text-3xl font-serif mt-1">{counts.pending}</p>
        </div>
        <div className="border border-[var(--border)] rounded-lg p-4 bg-[var(--card)]">
          <p className="text-xs text-[var(--muted)]">已隐藏（含举报）</p>
          <p className="text-3xl font-serif mt-1">{counts.hidden}</p>
        </div>
      </section>

      <Link
        href="/studio/moderation"
        className="inline-block text-sm px-4 py-2 rounded-lg border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white transition-colors"
      >
        打开审核队列
      </Link>
      <Link
        href="/studio/illustrations"
        className="inline-block text-sm px-4 py-2 ml-3 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
      >
        缺图候选
      </Link>
      <Link
        href="/studio/calibrations"
        className="inline-block text-sm px-4 py-2 ml-3 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
      >
        插图校定{failCalibrations > 0 ? `（${failCalibrations}）` : ''}
      </Link>
      <Link
        href="/studio/tiny-skips"
        className="inline-block text-sm px-4 py-2 ml-3 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
      >
        细条跳过{tinySkipCount > 0 ? `（${tinySkipCount}）` : ''}
      </Link>
      <Link
        href="/admin"
        className="inline-block text-sm px-4 py-2 ml-3 rounded-lg border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
      >
        打开 CMS
      </Link>
    </div>
  );
}
