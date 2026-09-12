import Link from 'next/link';
import { listRestoreCalibrations, countRestoreCalibrationFails } from '@/lib/db';
import { calibrationActionLabel, isCalibrationAction } from '@/lib/restore-calibration';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ verdict?: string; bookId?: string }>;
}

export default async function StudioCalibrationsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const verdict = sp.verdict === 'pass' || sp.verdict === 'fail' ? sp.verdict : undefined;
  let items: Awaited<ReturnType<typeof listRestoreCalibrations>> = [];
  let failCount = 0;
  try {
    items = await listRestoreCalibrations({
      bookId: sp.bookId || undefined,
      verdict,
      limit: 80,
    });
    failCount = await countRestoreCalibrationFails();
  } catch {
    items = [];
  }

  return (
    <div className="animate-fade-in space-y-6">
      <header>
        <p className="text-xs text-[var(--muted)]">
          <Link href="/studio" className="hover:text-[var(--accent)]">
            运营后台
          </Link>
          <span className="mx-2">/</span>
          插图校定
        </p>
        <h1 className="text-2xl font-serif tracking-wider mt-1">插图校定</h1>
        <p className="text-sm text-[var(--muted)] mt-2">
          读者对照原扫描与高清复原后的评价。不通过优先列出；AI 只分类备注，不会覆盖原图。
          当前不通过 {failCount} 条。
        </p>
      </header>

      <p className="flex flex-wrap gap-3 text-sm">
        <Link
          href="/studio/calibrations"
          className={!verdict ? 'text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--text)]'}
        >
          全部
        </Link>
        <Link
          href="/studio/calibrations?verdict=fail"
          className={verdict === 'fail' ? 'text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--text)]'}
        >
          不通过
        </Link>
        <Link
          href="/studio/calibrations?verdict=pass"
          className={verdict === 'pass' ? 'text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--text)]'}
        >
          确认
        </Link>
      </p>

      {items.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">还没有校定记录。</p>
      ) : (
        <ul className="space-y-3">
          {items.map(item => {
            const action = isCalibrationAction(item.ai_action) ? item.ai_action : null;
            const href = `/text/${item.book_id}/calibrate?part=${encodeURIComponent(item.part)}&file=${encodeURIComponent(item.file)}`;
            return (
              <li key={item.id} className="border border-[var(--border)] rounded-lg p-4 bg-[var(--card)] space-y-1">
                <p className="text-sm">
                  <span className={item.verdict === 'fail' ? 'text-[var(--cinnabar)]' : 'text-[var(--accent)]'}>
                    {item.verdict === 'fail' ? '不通过' : '确认'}
                  </span>
                  <span className="text-[var(--muted)] mx-2">·</span>
                  <span className="font-mono text-xs break-all">{item.file}</span>
                </p>
                {item.note && <p className="text-sm whitespace-pre-wrap">{item.note}</p>}
                <p className="text-xs text-[var(--muted)]">
                  {item.author_name || '匿名道友'}
                  {action ? ` · 建议：${calibrationActionLabel(action)}` : ''}
                  {item.ai_summary ? ` · ${item.ai_summary}` : ''}
                </p>
                <Link href={href} className="text-xs text-[var(--accent)] hover:underline">
                  打开并排对照
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
